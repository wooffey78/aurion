// Bloc 5 — matrice e-reporting : classification des transactions et données de paiement,
// construction et validation du flux. Module PUR (aucun accès base/stockage) : la logique
// réglementaire est testable isolément, comme les validateurs UBL/CII du bloc 4.
//
// Doctrine officielle vérifiée le 14 novembre 2026 (impots.gouv.fr ; BOFiP ACTU-2026-00145
// du 30 septembre 2026) :
//   - Deux composantes : données de TRANSACTION et données de PAIEMENT.
//   - Périmètre de transaction notamment : ventes/prestations en relation avec un
//     NON-ASSUJETTI (B2C) dues de TVA française ; opérations B2B avec un assujetti NON
//     établi en France lorsque la TVA française est due.
//   - Notamment exclues : opérations exonérées de TVA (exportations, livraisons
//     intracommunautaires, art. 261 à 261 E du CGI dispensées de facturation), importations
//     de biens, contrats défense/sécurité ; et, pour l'e-reporting de transaction, le B2B
//     domestique (assujetti établi en France) qui relève de l'ÉMISSION électronique (bloc 4).
//   - Données de paiement : date de collecte, montant collecté (par taux de TVA), numéro de
//     facture lorsque la TVA devient exigible au paiement (services, acomptes).
//   - Périodicité : mensuelle ou trimestrielle selon le régime de TVA de l'entreprise.
//
// Garanties : AUCUNE inférence à partir du seul type de document — la catégorie d'acheteur
// et l'exonération sont des DÉCLARATIONS utilisateur. Toute donnée manquante est un écart
// explicite (jamais de valeur inventée). Le B2B domestique est exclu avec motif (émission).

// ------------------------------------------------------------------ types de la matrice

export const BUYER_CATEGORIES = ['assujetti_fr', 'assujetti_etranger', 'non_assujetti'] as const;
export type BuyerCategory = (typeof BUYER_CATEGORIES)[number];

export const TRANSACTION_CATEGORIES = ['LB', 'PS', 'LBPS'] as const;
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

export const PERIODICITIES = ['monthly', 'quarterly'] as const;
export type Periodicity = (typeof PERIODICITIES)[number];

/** Écart bloquant signalé par la matrice (donnée déclarative manquante ou incohérente). */
export type EreportingGap = {
  quoteId: string;
  invoiceNumber: string | null;
  code: 'BUYER_CATEGORY_MISSING' | 'BUYER_CATEGORY_INCOHERENT' | 'BUYER_VAT_NUMBER_MISSING'
      | 'EXEMPT_REASON_MISSING' | 'OPERATION_CATEGORY_MISSING' | 'TRANSACTION_DATE_MISSING';
  message: string;
};

/** Résultat de classification d'une facture de la période. */
export type Classification =
  | { kind: 'in_scope'; reason: 'b2c_domestic' | 'b2b_international'; gaps: EreportingGap[] }
  | { kind: 'excluded'; reason: 'einvoicing_b2b_domestic' | 'exempt_declared' | 'vat_not_billed'; gaps: EreportingGap[] };

/** Facture aplatie pour la matrice (projection SQL côté orchestration — aucun accès BD ici). */
export type MatrixInvoice = {
  id: string;
  number: string | null;
  transactionDate: Date | string | null;
  operationCategory: string | null;
  vatRate: number;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
  exemptDeclared: boolean;
  exemptReason: string | null;
  clientName: string | null;
  clientBuyerCategory: string | null;
  clientCountryCode: string | null;
  clientVatNumber: string | null;
};

/** Paiement aplati pour la matrice (projection SQL côté orchestration). */
export type MatrixPayment = {
  quoteId: string;
  amount: number;
  paidAt: Date | string;
  method: string | null;
};

// ------------------------------------------------------------------ classification

/** TVA effectivement facturée : taux et base strictement positifs. Une facture sans TVA
 *  facturée (franchise en base, taux 0) n'est pas « redevable de TVA française » : elle
 *  n'entre pas dans l'e-reporting de transaction (exclusion documentée, jamais devinée :
 *  l'utilisateur peut déclarer explicitement une exonération avec motif si le cas le requiert). */
function vatBilled(invoice: MatrixInvoice): boolean {
  return Number(invoice.vatRate) > 0 && Number(invoice.totalVat) > 0;
}

/**
 * Classe une facture selon la matrice e-reporting. Ne retourne JAMAIS une valeur inventée :
 * les données déclaratives manquantes remontent en `gaps` et la préparation refuse.
 */
export function classifyInvoice(invoice: MatrixInvoice): Classification {
  const gaps: EreportingGap[] = [];
  const ref = invoice.number || invoice.id.slice(0, 8);

  // Exonération déclarée explicitement par l'utilisateur (export, LIC, art. 261-261 E…).
  if (invoice.exemptDeclared) {
    if (!invoice.exemptReason || !invoice.exemptReason.trim()) {
      gaps.push({ quoteId: invoice.id, invoiceNumber: invoice.number, code: 'EXEMPT_REASON_MISSING', message: `Facture ${ref} : le motif d'exonération déclaré est obligatoire (export, livraison intracommunautaire, article 261 à 261 E du CGI…).` });
    }
    return { kind: 'excluded', reason: 'exempt_declared', gaps };
  }

  // TVA non facturée (franchise en base, taux 0) : hors e-reporting de transaction.
  if (!vatBilled(invoice)) {
    return { kind: 'excluded', reason: 'vat_not_billed', gaps };
  }

  // Catégorie d'acheteur : DÉCLARATION utilisateur, jamais déduite du nom ni du SIRET.
  const buyerCategory = (invoice.clientBuyerCategory || '').trim();
  if (!buyerCategory) {
    gaps.push({ quoteId: invoice.id, invoiceNumber: invoice.number, code: 'BUYER_CATEGORY_MISSING', message: `Facture ${ref} : la catégorie d'acheteur du client est obligatoire (assujetti établi en France, assujetti non établi en France, non-assujetti) pour déterminer l'appartenance à l'e-reporting.` });
    return { kind: 'in_scope', reason: 'b2c_domestic', gaps };
  }
  if (!BUYER_CATEGORIES.includes(buyerCategory as BuyerCategory)) {
    gaps.push({ quoteId: invoice.id, invoiceNumber: invoice.number, code: 'BUYER_CATEGORY_INCOHERENT', message: `Facture ${ref} : catégorie d'acheteur inconnue (${buyerCategory}).` });
    return { kind: 'in_scope', reason: 'b2c_domestic', gaps };
  }

  if (buyerCategory === 'assujetti_fr') {
    // B2B domestique : émission électronique (bloc 4) via la PA, PAS e-reporting.
    return { kind: 'excluded', reason: 'einvoicing_b2b_domestic', gaps };
  }

  if (buyerCategory === 'assujetti_etranger') {
    // B2B international : dans le périmètre lorsque la TVA française est due.
    const gapsB2b: EreportingGap[] = [];
    if (!invoice.clientVatNumber || !invoice.clientVatNumber.trim()) {
      gapsB2b.push({ quoteId: invoice.id, invoiceNumber: invoice.number, code: 'BUYER_VAT_NUMBER_MISSING', message: `Facture ${ref} : le numéro de TVA intracommunautaire (ou identifiant fiscal étranger) du client assujetti non établi en France est requis pour la déclaration.` });
    }
    return { kind: 'in_scope', reason: 'b2b_international', gaps: gapsB2b };
  }

  // Non-assujetti (B2C) : dans le périmètre lorsque la TVA française est due.
  return { kind: 'in_scope', reason: 'b2c_domestic', gaps };
}

// ------------------------------------------------------------------ construction du flux

export type MatrixTransactionLine = {
  sourceKind: 'transaction';
  quoteId: string;
  invoiceNumber: string;
  transactionDate: string;
  transactionCategory: TransactionCategory | null;
  buyerName: string;
  buyerCategory: BuyerCategory;
  buyerCountry: string | null;
  buyerVatNumber: string | null;
  vatRate: number;
  amountHt: number;
  amountVat: number;
  amountTtc: number;
  inclusionReason: 'b2c_domestic_transaction' | 'b2b_international_transaction';
};

export type MatrixPaymentLine = {
  sourceKind: 'payment';
  quoteId: string;
  invoiceNumber: string;
  transactionCategory: TransactionCategory | null;
  buyerName: string;
  buyerCategory: BuyerCategory;
  buyerCountry: string | null;
  buyerVatNumber: string | null;
  vatRate: number;
  amountHt: number;
  amountVat: number;
  amountTtc: number;
  paymentDate: string;
  paymentAmount: number;
  paymentMethod: string | null;
  inclusionReason: 'b2c_domestic_payment' | 'b2b_international_payment';
};

export type MatrixLine = MatrixTransactionLine | MatrixPaymentLine;

const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const isoDate = (value: Date | string | null): string | null => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

/** Construction d'une ligne de TRANSACTION figée (données identiques à l'émission). */
export function buildTransactionLine(invoice: MatrixInvoice, reason: 'b2c_domestic' | 'b2b_international'): MatrixTransactionLine {
  return {
    sourceKind: 'transaction',
    quoteId: invoice.id,
    invoiceNumber: String(invoice.number || ''),
    transactionDate: isoDate(invoice.transactionDate) || '',
    transactionCategory: (invoice.operationCategory as TransactionCategory | null) || null,
    buyerName: String(invoice.clientName || ''),
    buyerCategory: invoice.clientBuyerCategory as BuyerCategory,
    buyerCountry: invoice.clientCountryCode ? String(invoice.clientCountryCode) : null,
    buyerVatNumber: invoice.clientVatNumber ? String(invoice.clientVatNumber) : null,
    vatRate: round2(Number(invoice.vatRate)),
    amountHt: round2(Number(invoice.totalHt)),
    amountVat: round2(Number(invoice.totalVat)),
    amountTtc: round2(Number(invoice.totalTtc)),
    inclusionReason: reason === 'b2b_international' ? 'b2b_international_transaction' : 'b2c_domestic_transaction',
  };
}

/** Construction d'une ligne de PAIEMENT (données de paiement dues : date de collecte, montant
 *  collecté, numéro de facture — TVA exigible à l'encaissement pour les services/acomptes). */
export function buildPaymentLine(
  invoice: MatrixInvoice,
  payment: MatrixPayment,
  reason: 'b2c_domestic' | 'b2b_international',
): MatrixPaymentLine {
  return {
    sourceKind: 'payment',
    quoteId: invoice.id,
    invoiceNumber: String(invoice.number || ''),
    transactionCategory: (invoice.operationCategory as TransactionCategory | null) || null,
    buyerName: String(invoice.clientName || ''),
    buyerCategory: invoice.clientBuyerCategory as BuyerCategory,
    buyerCountry: invoice.clientCountryCode ? String(invoice.clientCountryCode) : null,
    buyerVatNumber: invoice.clientVatNumber ? String(invoice.clientVatNumber) : null,
    vatRate: round2(Number(invoice.vatRate)),
    amountHt: round2(Number(invoice.totalHt)),
    amountVat: round2(Number(invoice.totalVat)),
    amountTtc: round2(Number(invoice.totalTtc)),
    paymentDate: isoDate(payment.paidAt) || '',
    paymentAmount: round2(Number(payment.amount)),
    paymentMethod: payment.method ? String(payment.method) : null,
    inclusionReason: reason === 'b2b_international' ? 'b2b_international_payment' : 'b2c_domestic_payment',
  };
}

// ------------------------------------------------------------------ flux structuré et validation

export type EreportingPayload = {
  schema: 'aurion.ereporting/1';
  kind: 'initial' | 'correction';
  correctsDeclarationId: string | null;
  period: { start: string; end: string };
  periodicity: Periodicity;
  emitter: { name: string; siren: string | null; siret: string | null; address: string | null };
  generatedAt: string;
  transactionCount: number;
  paymentCount: number;
  totals: { ht: number; vat: number; ttc: number; payments: number };
  lines: MatrixLine[];
  /** Rapport d'écarts du flux : écarts détectés ET corrigés par rapport à la déclaration corrigée. */
  gapReport: EreportingGap[];
  /** Factures de la période HORS périmètre, avec motif documenté (transparence : rien n'est
   *  omis en silence — B2B domestique => émission bloc 4, exonération déclarée, TVA non facturée). */
  excluded: Array<{ quoteId: string; invoiceNumber: string | null; reason: string }>;
  /** Références des lignes corrigées (correction uniquement), pour la traçabilité PA. */
  corrections: Array<{ correctedDeclarationId: string; correctedTransmissionId: string | null; lineCount: number }>;
};

/**
 * Construit le flux structuré de la déclaration. Déterministe : mêmes données => mêmes octets
 * (à generatedAt près, fixé par l'appelant au moment du scellement).
 */
export function buildEreportingPayload(input: {
  kind: 'initial' | 'correction';
  correctsDeclarationId: string | null;
  periodStart: string;
  periodEnd: string;
  periodicity: Periodicity;
  emitter: { name: string; siren: string | null; siret: string | null; address: string | null };
  generatedAt: Date | string;
  transactionLines: MatrixTransactionLine[];
  paymentLines: MatrixPaymentLine[];
  gapReport: EreportingGap[];
  excluded: EreportingPayload['excluded'];
  corrections: EreportingPayload['corrections'];
}): EreportingPayload {
  const transactionCount = input.transactionLines.length;
  const paymentCount = input.paymentLines.length;
  const totals = {
    ht: round2(input.transactionLines.reduce((sum, line) => sum + line.amountHt, 0)),
    vat: round2(input.transactionLines.reduce((sum, line) => sum + line.amountVat, 0)),
    ttc: round2(input.transactionLines.reduce((sum, line) => sum + line.amountTtc, 0)),
    payments: round2(input.paymentLines.reduce((sum, line) => sum + line.paymentAmount, 0)),
  };
  return {
    schema: 'aurion.ereporting/1',
    kind: input.kind,
    correctsDeclarationId: input.correctsDeclarationId,
    period: { start: input.periodStart, end: input.periodEnd },
    periodicity: input.periodicity,
    emitter: input.emitter,
    generatedAt: new Date(input.generatedAt).toISOString(),
    transactionCount,
    paymentCount,
    totals,
    lines: [...input.transactionLines, ...input.paymentLines],
    gapReport: input.gapReport,
    excluded: input.excluded,
    corrections: input.corrections,
  };
}

const PERIOD_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const VAT_NUMBER = /^[A-Za-z0-9]{4,32}$/;
const LINE_SOURCE = new Set(['transaction', 'payment']);
const LINE_REASON = new Set([
  'b2c_domestic_transaction', 'b2b_international_transaction',
  'b2c_domestic_payment', 'b2b_international_payment',
]);
const PAYMENT_METHODS = new Set(['transfer', 'card', 'cash', 'cheque', 'crypto', 'other']);

/**
 * Valide le flux avant scellement : structure, cohérence arithmétique (Σ lignes = totaux),
 * périodicité, champs obligatoires par type de ligne. Aucune validation de « conformité
 * réglementaire PA » n'est prétendue : le format définitif dépend de la PA retenue
 * (contrat generic documenté — PLATEFORME-AGREEE.md § 10).
 */
export function validateEreportingPayload(payload: EreportingPayload): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const push = (message: string) => issues.push(message);

  if (payload?.schema !== 'aurion.ereporting/1') push('Schéma du flux invalide.');
  if (payload?.kind !== 'initial' && payload?.kind !== 'correction') push('Type de déclaration invalide.');
  if (payload?.kind === 'correction' && !payload?.correctsDeclarationId) push('Une déclaration de correction doit référencer la déclaration corrigée.');
  if (!payload?.period?.start || !PERIOD_ISO_DATE.test(payload.period.start)) push('Début de période invalide.');
  if (!payload?.period?.end || !PERIOD_ISO_DATE.test(payload.period.end)) push('Fin de période invalide.');
  if (payload?.period?.start && payload?.period?.end && payload.period.end < payload.period.start) push('La fin de période précède le début.');
  if (!PERIODICITIES.includes(payload?.periodicity as Periodicity)) push('Périodicité invalide (mensuelle ou trimestrielle).');
  if (!payload?.emitter?.name || !String(payload.emitter.name).trim()) push('L’émetteur doit être identifié.');

  const transactionLines = (payload?.lines || []).filter(line => line.sourceKind === 'transaction');
  const paymentLines = (payload?.lines || []).filter(line => line.sourceKind === 'payment');

  for (const line of payload?.lines || []) {
    const ref = line.invoiceNumber || line.quoteId?.slice(0, 8) || 'ligne';
    if (!LINE_SOURCE.has(line.sourceKind)) push(`${ref} : type de ligne inconnu.`);
    if (!LINE_REASON.has(line.inclusionReason)) push(`${ref} : motif d'inclusion inconnu.`);
    if (!BUYER_CATEGORIES.includes(line.buyerCategory as BuyerCategory)) push(`${ref} : catégorie d'acheteur invalide.`);
    if (!line.buyerName || !String(line.buyerName).trim()) push(`${ref} : le nom de l'acheteur est requis.`);
    if (line.buyerCountry != null && !COUNTRY_CODE.test(String(line.buyerCountry))) push(`${ref} : code pays invalide (ISO 3166-1 alpha-2 attendu).`);
    if (line.buyerVatNumber != null && String(line.buyerVatNumber).trim() && !VAT_NUMBER.test(String(line.buyerVatNumber).trim())) push(`${ref} : numéro de TVA/identifiant fiscal étranger invalide.`);
    if (line.sourceKind === 'transaction') {
      if (!line.invoiceNumber || !String(line.invoiceNumber).trim()) push(`${ref} : le numéro de facture est requis.`);
      if (!line.transactionDate || !PERIOD_ISO_DATE.test(String(line.transactionDate))) push(`${ref} : la date de la transaction est requise.`);
      if (line.transactionCategory != null && !TRANSACTION_CATEGORIES.includes(line.transactionCategory as TransactionCategory)) push(`${ref} : catégorie d'opération invalide (LB/PS/LBPS).`);
      if (!(Number(line.amountTtc) > 0)) push(`${ref} : le montant TTC doit être strictement positif.`);
      if (Math.abs(round2(Number(line.amountHt) + Number(line.amountVat)) - round2(Number(line.amountTtc))) > 0.01) {
        push(`${ref} : incohérence arithmétique (HT + TVA ≠ TTC).`);
      }
      const periodOk = payload?.period && String(line.transactionDate) >= payload.period.start && String(line.transactionDate) <= payload.period.end;
      if (!periodOk) push(`${ref} : la date de transaction est hors période déclarée.`);
    } else {
      if (!line.invoiceNumber || !String(line.invoiceNumber).trim()) push(`${ref} : le numéro de facture est requis (données de paiement).`);
      if (!line.paymentDate || !PERIOD_ISO_DATE.test(String(line.paymentDate))) push(`${ref} : la date de collecte du paiement est requise.`);
      if (!(Number(line.paymentAmount) > 0)) push(`${ref} : le montant collecté doit être strictement positif.`);
      if (line.paymentMethod != null && !PAYMENT_METHODS.has(String(line.paymentMethod))) push(`${ref} : moyen de paiement inconnu.`);
      const periodOk = payload?.period && String(line.paymentDate) >= payload.period.start && String(line.paymentDate) <= payload.period.end;
      if (!periodOk) push(`${ref} : la date de collecte est hors période déclarée.`);
    }
  }

  if (payload?.transactionCount !== transactionLines.length) push('Le nombre de transactions annoncé ne correspond pas aux lignes.');
  if (payload?.paymentCount !== paymentLines.length) push('Le nombre de paiements annoncé ne correspond pas aux lignes.');
  if (payload?.totals && Math.abs(round2(transactionLines.reduce((s, l) => s + Number(l.amountHt), 0)) - Number(payload.totals.ht)) > 0.01) push('Total HT incohérent avec les lignes.');
  if (payload?.totals && Math.abs(round2(transactionLines.reduce((s, l) => s + Number(l.amountVat), 0)) - Number(payload.totals.vat)) > 0.01) push('Total TVA incohérent avec les lignes.');
  if (payload?.totals && Math.abs(round2(transactionLines.reduce((s, l) => s + Number(l.amountTtc), 0)) - Number(payload.totals.ttc)) > 0.01) push('Total TTC incohérent avec les lignes.');
  if (payload?.totals && Math.abs(round2(paymentLines.reduce((s, l) => s + Number(l.paymentAmount), 0)) - Number(payload.totals.payments)) > 0.01) push('Total des paiements incohérent avec les lignes.');

  return issues.length ? { ok: false, issues } : { ok: true };
}
