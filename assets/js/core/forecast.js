// Projection indicative du nombre de factures : ce scénario ne remplace pas la comptabilité réelle.
export const DEFAULT_FORECAST_ASSUMPTIONS = Object.freeze({
  potentialClientsPerMonth: 0,
  averageTicketTtc: 0,
  averageTicketHt: 0,
  variableCostPerRepair: 0,
  fixedMonthlyCosts: 0,
  reservePercent: 0,
});

const number = (value, max) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : 0;
};

export function normalizeForecastAssumptions(value = {}) {
  return {
    potentialClientsPerMonth: Math.round(number(value.potentialClientsPerMonth, 10000) * 10) / 10,
    averageTicketTtc: number(value.averageTicketTtc, 1000000),
    averageTicketHt: number(value.averageTicketHt, 1000000),
    variableCostPerRepair: number(value.variableCostPerRepair, 1000000),
    fixedMonthlyCosts: number(value.fixedMonthlyCosts, 10000000),
    reservePercent: number(value.reservePercent, 100),
  };
}


/** Hypothèses calculées à partir des documents récents et des taux de l'activité sélectionnée.
 * Aucun paramètre n'est demandé à l'utilisateur. Les charges fixes restent à zéro tant qu'Aurion
 * ne dispose pas d'écritures récurrentes structurées pour cette activité : on n'invente pas de coût. */
export function deriveAutomaticForecastAssumptions(documents = [], activity = {}, now = new Date()) {
  const startSixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const startTwelveMonths = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const excludedStatuses = new Set(['canceled', 'cancelled', 'annulé', 'annule', 'void', 'deleted']);
  const recent = (Array.isArray(documents) ? documents : []).map(document => {
    const date = new Date(document?.created_at || document?.createdAt || document?.updated_at || '');
    return { document, date };
  }).filter(({ document, date }) => {
    const status = String(document?.status || '').trim().toLowerCase();
    return Number.isFinite(date.getTime()) && date <= now && date >= startTwelveMonths
      && !excludedStatuses.has(status);
  });
  // Même fenêtre de six mois pour le volume, le ticket et les coûts : ne pas diviser
  // un volume semestriel par un ticket calculé sur douze mois.
  const recentWindow = recent.filter(({ date }) => date >= startSixMonths);
  const invoices = recentWindow.filter(({ document }) => document?.document_type === 'invoice');
  const recentInvoices = invoices;
  const quoteSamples = recentWindow.filter(({ document }) => document?.document_type === 'quote');
  const sample = invoices.length ? invoices : quoteSamples;

  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const positiveNumber = value => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const ticketValues = sample.map(({ document }) => positiveNumber(document.total_ttc)).filter(value => value > 0);
  const ticketHtValues = sample.map(({ document }) => {
    const snapshotBaseHt = positiveNumber(document?.calculation_snapshot?.result?.baseRevenueHt);
    if (snapshotBaseHt > 0) return snapshotBaseHt;
    const explicitHt = positiveNumber(document.total_ht);
    const billedMileageHt = document.mileage_mode === 'client_price' ? positiveNumber(document.mileage_total) : 0;
    if (explicitHt > 0) return Math.max(0, explicitHt - billedMileageHt);
    const ttc = positiveNumber(document.total_ttc);
    const vatRate = positiveNumber(document.vat_rate);
    return ttc > 0 ? Math.max(0, ttc / (1 + vatRate / 100) - billedMileageHt) : 0;
  }).filter(value => value > 0);
  const directCost = document => {
    const parts = positiveNumber(document.part_cost);
    const shipping = positiveNumber(document.shipping_cost);
    const labor = positiveNumber(document.labor_internal_cost_ht);
    const mileage = document.mileage_mode === 'margin'
      ? (positiveNumber(document.mileage_internal_rate) > 0
        ? positiveNumber(document.mileage_km) * positiveNumber(document.mileage_internal_rate)
        : positiveNumber(document.mileage_total))
      : 0;
    const purchaseVatRate = document.purchase_vat_mode === 'exempt'
      ? 0
      : positiveNumber(document.purchase_vat_rate ?? document.vat_rate ?? activity.vat_rate ?? 0);
    return parts + shipping + labor + mileage + (parts + shipping) * purchaseVatRate / 100;
  };
  const costValues = sample.map(({ document }) => directCost(document));
  const configuredContributions = Array.isArray(activity.contributions)
    ? activity.contributions.filter(item => item && item.rate !== null && item.rate !== undefined
      && String(item.basis || 'ca_ht').toLowerCase() === 'ca_ht')
    : [];
  let reservePercent = 0;
  let reserveSource = 'Aucun taux de cotisations disponible : provision à 0 %.';
  if (configuredContributions.length) {
    reservePercent = configuredContributions.reduce((sum, item) => sum + positiveNumber(item.rate), 0);
    reserveSource = 'Somme des taux de cotisations configurés pour cette activité.';
  } else {
    const rawActivityRate = activity.urssaf_rate ?? activity.urssafRate;
    if (rawActivityRate !== null && rawActivityRate !== undefined && rawActivityRate !== '') {
      reservePercent = positiveNumber(rawActivityRate);
      reserveSource = 'Taux de cotisations configuré pour cette activité.';
    } else {
      const historicalRates = sample.map(({ document }) => {
        if (Array.isArray(document.contribution_snapshot) && document.contribution_snapshot.length) {
          return document.contribution_snapshot
            .filter(item => item && String(item.basis || 'ca_ht').toLowerCase() === 'ca_ht')
            .reduce((sum, item) => sum + positiveNumber(item.rate), 0);
        }
        if (document.urssaf_rate !== null && document.urssaf_rate !== undefined) return positiveNumber(document.urssaf_rate);
        return null;
      }).filter(value => value !== null);
      if (historicalRates.length) {
        reservePercent = average(historicalRates);
        reserveSource = 'Taux moyens enregistrés dans les documents récents.';
      }
    }
  }
  // 15.4.62 — le prévisionnel PREND LES DEVIS EN COMPTE : le volume mensuel retient les
  // factures récentes ET les devis récents (document_type='quote' non annulé), sinon une
  // activité qui devisse sans encore facturer restait à 0 facture/mois.
  const projectedCount = recentInvoices.length + quoteSamples.length;
  const normalized = normalizeForecastAssumptions({
    potentialClientsPerMonth: projectedCount / 6,
    averageTicketTtc: average(ticketValues),
    averageTicketHt: average(ticketHtValues),
    variableCostPerRepair: average(costValues),
    fixedMonthlyCosts: 0,
    reservePercent,
  });
  const fromInvoices = invoices.length > 0;
  return {
    ...normalized,
    metadata: {
      recentInvoiceCount: recentInvoices.length,
      sampleCount: sample.length,
      sampleSource: fromInvoices ? 'factures récentes' : (quoteSamples.length ? 'devis récents (aucune facture récente)' : 'aucun document récent'),
      volumeNote: projectedCount
        ? (recentInvoices.length ? 'Moyenne des factures' : 'Moyenne des devis') + (recentInvoices.length && quoteSamples.length ? ' et devis' : '') + ' créés sur les 6 derniers mois.'
        : 'Aucun document récent : Aurion retient 0 facture par mois faute d’historique.',
      ticketNote: ticketValues.length
        ? 'Ticket moyen calculé à partir des ' + (fromInvoices ? 'factures' : 'devis récents') + ' disponibles.'
        : 'Aucun montant de document récent exploitable.',
      ticketHtNote: ticketHtValues.length
        ? 'Moyenne de la base HT retenue pour la provision, hors déplacement refacturé au client.'
        : 'Aucune base HT exploitable : la provision reste à 0 € tant que les documents ne contiennent pas de base HT.',
      costNote: costValues.length
        ? 'Coût direct moyen d’après les coûts enregistrés sur ces documents.'
        : 'Aucun document récent permettant d’estimer les coûts directs.',
      fixedCostsNote: 'Aucune charge fixe récurrente structurée n’est enregistrée pour cette activité : 0 € retenu plutôt qu’un montant inventé.',
      reserveNote: reserveSource,
    },
  };
}

export function calculateForecast(value = {}) {
  const assumptions = normalizeForecastAssumptions(value);
  const repairsPerMonth = assumptions.potentialClientsPerMonth;
  const monthlyEntries = repairsPerMonth * assumptions.averageTicketTtc;
  const monthlyVariableCosts = repairsPerMonth * assumptions.variableCostPerRepair;
  // Les cotisations configurées par Aurion ont pour base le chiffre d'affaires HT.
  const monthlyEntriesHt = repairsPerMonth * assumptions.averageTicketHt;
  const monthlyReserve = monthlyEntriesHt * assumptions.reservePercent / 100;
  const monthlyOutputs = monthlyVariableCosts + assumptions.fixedMonthlyCosts + monthlyReserve;
  return {
    assumptions,
    periods: [1, 3, 6, 12].map(months => ({
      months, repairs: repairsPerMonth * months,
      entries: monthlyEntries * months,
      // 15.4.63 — projection HT par horizon : le « Détail » affiche les valeurs du scénario
      // (volume × ticket HT) au lieu des compteurs backend, souvent vides sans paiements.
      entriesHt: monthlyEntriesHt * months,
      variableCosts: monthlyVariableCosts * months,
      fixedCosts: assumptions.fixedMonthlyCosts * months,
      reserve: monthlyReserve * months,
      outputs: monthlyOutputs * months,
      net: (monthlyEntries - monthlyOutputs) * months,
    })),
  };
}
