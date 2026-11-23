// 15.4.50 (suggestion B4) — Historique de prix des matériaux et alertes de variation.
// Uniquement les achats réels de l'entreprise (aucun scraping, aucune source externe) :
// chaque prix constaté est horodaté (migration 116) ; la tendance est une comparaison de
// dates/prix explicite. Au-delà du seuil, une PROPOSITION de recotation est préparée via le
// moteur de calcul 03 (version des paramètres conservée) — jamais appliquée automatiquement.
export interface PricePoint { observedAt: string; unitCostCents: number }

export interface PriceTrend {
  count: number;
  firstPriceCents: number | null;
  lastPriceCents: number | null;
  variationPct: number | null;
  maxPriceCents: number | null;
  minPriceCents: number | null;
  alert: boolean;
  reason: string;
}

/**
 * Analyse la tendance d'un article. Fonction PURE — testée sans base.
 * La variation compare la MÊME fenêtre : premier et dernier point de la série ordonnée.
 * `alertThresholdPct` > 0 requis (défaut produit : 10 %).
 */
export function analyzePriceTrend(points: PricePoint[], alertThresholdPct = 10): PriceTrend {
  const sorted = [...points]
    .filter(p => Number.isFinite(p.unitCostCents) && p.unitCostCents >= 0)
    .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  if (sorted.length === 0) {
    return { count: 0, firstPriceCents: null, lastPriceCents: null, variationPct: null, maxPriceCents: null, minPriceCents: null, alert: false, reason: 'Aucun prix observé : aucune tendance inventée.' };
  }
  const first = sorted[0], last = sorted[sorted.length - 1];
  const prices = sorted.map(p => p.unitCostCents);
  const variationPct = sorted.length >= 2 && first.unitCostCents > 0
    ? Math.round((last.unitCostCents - first.unitCostCents) / first.unitCostCents * 1000) / 10
    : null;
  const alert = variationPct != null && alertThresholdPct > 0 && variationPct >= alertThresholdPct;
  const reason = alert
    ? `Prix constaté en hausse de ${variationPct}% sur la période (de ${(first.unitCostCents / 100).toFixed(2)} € à ${(last.unitCostCents / 100).toFixed(2)} €) : recotation du prix plancher proposée, à confirmer.`
    : variationPct == null
      ? `${sorted.length} prix constaté(s) : période trop courte pour une tendance.`
      : `Variation ${variationPct >= 0 ? '+' : ''}${variationPct}% sur ${sorted.length} observations : sous le seuil d'alerte (${alertThresholdPct}%).`;
  return {
    count: sorted.length,
    firstPriceCents: first.unitCostCents,
    lastPriceCents: last.unitCostCents,
    variationPct,
    maxPriceCents: Math.max(...prices),
    minPriceCents: Math.min(...prices),
    alert,
    reason,
  };
}
