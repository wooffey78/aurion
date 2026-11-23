// 15.4.50 (suggestion B3) — Fiabilité de paiement par client : statistiques déterministes
// calculées depuis l'historique réel des encaissements de l'entreprise (aucune estimation
// inventée). Le score est une comparaison de seuils documentée, jamais une prédiction : il
// décrit le passé du client, il ne garantit rien. Utilisé par la fiche client, l'écran de
// devis (encart « délai moyen constaté ») et pour adapter la cadence des relances.
import type { SqlExecutor } from './sql-executor.js';

export interface PaymentObservation {
  /** Montant TTC de la facture en euros. */
  totalTtc: number;
  /** Date d'émission (ISO). */
  issuedAt: string;
  /** Date d'échéance prévue (ISO). */
  dueAt: string | null;
  /** Date du règlement COMPLET (ISO) — null si non réglé à ce jour. */
  settledAt: string | null;
}

export interface PaymentReliability {
  /** Nombre de factures entièrement réglées observées. */
  settledCount: number;
  /** Nombre de factures non réglées à ce jour. */
  unsettledCount: number;
  /** Délai moyen de paiement en jours (arrondi 1 décimale), null si aucune facture réglée. */
  averageDelayDays: number | null;
  /** Délai médian (plus robuste aux extrêmes), null si aucune facture réglée. */
  medianDelayDays: number | null;
  /** Proportion (0-1) de factures réglées en retard sur l'échéance. */
  lateRate: number | null;
  /** Score 0-100 : 100 = toujours à l'heure ; barème documenté ci-dessous. */
  score: number | null;
  /** Bande affichée à l'utilisateur : jamais un jugement, une description du passé. */
  band: 'fiable' | 'correct' | 'retards-frequents' | 'retards-systematiques' | 'inconnu';
  /** Raison lisible du score (composantes), conforme à l'exigence d'explicabilité. */
  reasons: string[];
}

const diffDays = (from: string, to: string): number =>
  Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000));

/**
 * Calcule la fiabilité de paiement d'un client. Fonction PURE — testée sans base.
 * Barème du score (documenté, déterministe) :
 *   − 40 points soustraits proportionnellement au taux de retard (0 à −40) ;
 *   − jusqu'à −30 points selon l'excès moyen au-delà de l'échéance (1 j → −5, ≥ 15 j → −30) ;
 *   − jusqu'à −15 points si des factures restent non réglées au-delà de l'échéance ;
 *   − +10 points de stabilité si le délai moyen est ≤ 5 jours.
 */
export function computePaymentReliability(observations: PaymentObservation[]): PaymentReliability {
  const settled = observations.filter(o => o.settledAt);
  const unsettled = observations.filter(o => !o.settledAt);
  const reasons: string[] = [];
  if (settled.length === 0) {
    return { settledCount: 0, unsettledCount: unsettled.length, averageDelayDays: null, medianDelayDays: null, lateRate: null, score: null, band: 'inconnu', reasons: ['Aucune facture entièrement réglée : la fiabilité est inconnue, jamais supposée.'] };
  }
  const delays = settled.map(o => diffDays(o.issuedAt, String(o.settledAt))).sort((a, b) => a - b);
  const average = delays.reduce((s, d) => s + d, 0) / delays.length;
  const median = delays.length % 2 ? delays[(delays.length - 1) / 2] : (delays[delays.length / 2 - 1] + delays[delays.length / 2]) / 2;
  const lateDelays = settled
    .filter(o => o.dueAt && diffDays(String(o.dueAt), String(o.settledAt)) > 0)
    .map(o => diffDays(String(o.dueAt), String(o.settledAt)));
  const lateRate = lateDelays.length / settled.length;
  const overdueUnsettled = unsettled.filter(o => o.dueAt && new Date(String(o.dueAt)).getTime() < Date.now()).length;

  let score = 100;
  const latePenalty = Math.round(40 * lateRate);
  score -= latePenalty;
  reasons.push(`${lateDelays.length} facture(s) réglée(s) en retard sur ${settled.length} : −${latePenalty} points.`);
  const avgLateExcess = lateDelays.length ? lateDelays.reduce((s, d) => s + d, 0) / lateDelays.length : 0;
  const excessPenalty = Math.min(30, Math.round(avgLateExcess / 15 * 30 + (avgLateExcess > 0 ? 5 : 0)));
  if (excessPenalty > 0) {
    score -= excessPenalty;
    reasons.push(`Retard moyen de ${Math.round(avgLateExcess)} jour(s) après échéance : −${excessPenalty} points.`);
  }
  if (overdueUnsettled > 0) {
    const unsettledPenalty = Math.min(15, overdueUnsettled * 5);
    score -= unsettledPenalty;
    reasons.push(`${overdueUnsettled} facture(s) en cours au-delà de l'échéance : −${unsettledPenalty} points.`);
  }
  if (average <= 5) {
    score += 10;
    reasons.push(`Délai moyen de ${Math.round(average)} jour(s) : +10 points de stabilité.`);
  } else {
    reasons.push(`Délai moyen constaté : ${Math.round(average)} jour(s).`);
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const band = score >= 85 ? 'fiable' : score >= 65 ? 'correct' : score >= 40 ? 'retards-frequents' : 'retards-systematiques';
  return {
    settledCount: settled.length,
    unsettledCount: unsettled.length,
    averageDelayDays: Math.round(average * 10) / 10,
    medianDelayDays: Math.round(median * 10) / 10,
    lateRate: Math.round(lateRate * 100) / 100,
    score,
    band,
    reasons,
  };
}

/** Délai moyen constaté pour un client (wrapper base — observations depuis quotes+payments). */
export async function clientReliability(exec: SqlExecutor, organizationId: string, clientId: string): Promise<PaymentReliability> {
  const rows = (await exec.query(
    `select q.total_ttc as "totalTtc", q.created_at as "issuedAt", q.due_at as "dueAt",
            (select max(p.paid_at) from invoice_payments p where p.organization_id=q.organization_id and p.quote_id=q.id) as "lastPaidAt",
            (select coalesce(sum(p.amount),0) from invoice_payments p where p.organization_id=q.organization_id and p.quote_id=q.id) as "paidTotal"
     from quotes q
     where q.organization_id=$1 and q.client_id=$2 and q.document_type='invoice' and q.sent_at is not null
     order by q.created_at desc limit 50`,
    [organizationId, clientId],
  )).rows;
  const observations: PaymentObservation[] = rows.map((r: any) => {
    const total = Number(r.totalTtc || 0);
    const paid = Number(r.paidTotal || 0);
    return {
      totalTtc: total,
      issuedAt: new Date(r.issuedAt).toISOString(),
      dueAt: r.dueAt ? new Date(r.dueAt).toISOString() : null,
      settledAt: paid >= total - 0.009 && r.lastPaidAt ? new Date(r.lastPaidAt).toISOString() : null,
    };
  });
  return computePaymentReliability(observations);
}
