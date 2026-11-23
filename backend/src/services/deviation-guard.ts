// 15.4.50 (suggestion B6) — Garde-fou de dérive devis → facture.
// Comparaison déterministe des rubriques du devis accepté et de la facture préparée : si
// l'écart dépasse le seuil configurable, une justification TRACÉE est exigée avant émission.
// Aucun blocage automatique arbitraire : l'entrepreneur peut toujours émettre en motivant
// (règle prompt 13 : toute action sensible reste une décision humaine expliquée).
export interface DeviationRubric {
  /** Libellé de rubrique comparé sans casse ni accents (moteur commun de normalisation). */
  label: string;
  amountHt: number;
}

export interface DeviationResult {
  deviationPct: number;
  quoteTotalHt: number;
  invoiceTotalHt: number;
  addedRubrics: string[];
  removedRubrics: string[];
  level: 'none' | 'minor' | 'notable' | 'major';
  requiresJustification: boolean;
  reasons: string[];
}

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Compare devis et facture. Fonction PURE — testée sans base. L'écart est le max de :
 * l'écart de total HT et l'écart par rubrique appariée (même libellé normalisé) — le max
 * est le plus protecteur : une compensation hausse/baisse ne masque pas une dérive locale.
 */
export function detectDeviation(quote: DeviationRubric[], invoice: DeviationRubric[], thresholdPct = 10): DeviationResult {
  const quoteTotal = Math.round((quote.reduce((s, r) => s + Number(r.amountHt || 0), 0) + Number.EPSILON) * 100) / 100;
  const invoiceTotal = Math.round((invoice.reduce((s, r) => s + Number(r.amountHt || 0), 0) + Number.EPSILON) * 100) / 100;
  const reasons: string[] = [];
  const quoteBy = new Map(quote.map(r => [norm(r.label), Number(r.amountHt || 0)]));
  const invoiceBy = new Map(invoice.map(r => [norm(r.label), Number(r.amountHt || 0)]));
  const added = invoice.filter(r => !quoteBy.has(norm(r.label)) && Number(r.amountHt || 0) > 0).map(r => r.label);
  const removed = quote.filter(r => !invoiceBy.has(norm(r.label)) && Number(r.amountHt || 0) > 0).map(r => r.label);
  if (added.length) reasons.push(`Rubriques présentes en facture mais absentes du devis accepté : ${added.slice(0, 5).join(', ')}.`);
  if (removed.length) reasons.push(`Rubriques du devis accepté absentes de la facture : ${removed.slice(0, 5).join(', ')}.`);

  let worstPct = 0;
  for (const [key, qAmount] of quoteBy) {
    if (!invoiceBy.has(key)) continue;
    const iAmount = invoiceBy.get(key)!;
    if (qAmount > 0) {
      const pct = Math.abs(iAmount - qAmount) / qAmount * 100;
      if (pct > worstPct) { worstPct = pct; if (pct > thresholdPct) reasons.push(`Rubrique « ${quote.find(r => norm(r.label) === key)?.label ?? key} » : ${Number(qAmount).toFixed(2)} € HT au devis, ${Number(iAmount).toFixed(2)} € HT en facture (+${pct.toFixed(0)} %).`); }
    }
  }
  if (quoteTotal > 0) {
    const totalPct = Math.abs(invoiceTotal - quoteTotal) / quoteTotal * 100;
    if (totalPct > worstPct && totalPct > thresholdPct) reasons.unshift(`Écart de total HT : ${quoteTotal.toFixed(2)} € au devis contre ${invoiceTotal.toFixed(2)} € en facture (${totalPct > 0 ? '+' : ''}${totalPct.toFixed(0)} %).`);
    worstPct = Math.max(worstPct, totalPct);
  }
  const level = worstPct <= thresholdPct ? 'none' : worstPct <= 2 * thresholdPct ? 'minor' : worstPct <= 4 * thresholdPct ? 'notable' : 'major';
  return {
    deviationPct: Math.round(worstPct * 10) / 10,
    quoteTotalHt: quoteTotal,
    invoiceTotalHt: invoiceTotal,
    addedRubrics: added,
    removedRubrics: removed,
    level,
    requiresJustification: level !== 'none',
    reasons,
  };
}
