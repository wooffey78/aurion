// 15.4.50 (suggestion B7) — Rapport mensuel du dirigeant : agrégation DÉTERMINISTE des
// données réelles des modules (aucun calcul divergent — les mêmes sources que le cockpit).
// Le rapport est une structure de sections chartables (le frontend la rend avec le module
// charts.js, représentation au choix de l'utilisateur) et un texte honnête sur les limites.
import type { SqlExecutor } from './sql-executor.js';

export interface MonthlyReportInput {
  month: string; // AAAA-MM
  caInvoicedTtc: number;
  caCollectedTtc: number;
  expensesTtc: number;
  vatCollectedTtc: number;
  vatDeductibleTtc: number;
  quotesSentCount: number;
  quotesAcceptedCount: number;
  overdueCount: number;
  overdueTotalTtc: number;
  appointmentsCount: number;
  topClients: Array<{ name: string; totalTtc: number }>;
  /** Série mensuelle (6 mois glissants) pour les graphiques. */
  series: Array<{ label: string; invoicedTtc: number; collectedTtc: number }>;
  /** Répartition des factures par statut de paiement. */
  paymentStatusBreakdown: Array<{ label: string; count: number; totalTtc: number }>;
}

export interface MonthlyReport {
  month: string;
  sections: Array<{
    title: string;
    kind: 'kpis' | 'chart';
    kpis?: Array<{ label: string; value: string; hint?: string }>;
    chart?: {
      suggestedTypes: Array<'bar' | 'line' | 'candle' | 'pie'>;
      defaultType: 'bar' | 'line' | 'candle' | 'pie';
      series: Array<{ label: string; value: number; extra?: number }>;
      unit: string;
    };
    notes: string[];
  }>;
  disclaimer: string;
}

const eur = (centsOrEuros: number) => `${Number(centsOrEuros || 0).toFixed(2).replace('.', ',')} €`;
const monthLabel = (m: string) => {
  const [y, mm] = String(m).split('-').map(Number);
  const names = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${names[(mm || 1) - 1]} ${y}`;
};

/**
 * Structure le rapport. Fonction PURE — testée sans base : aucune réinterprétation des
 * montants passés en entrée, distinction facturé/encaissé conservée (prompt 12).
 */
export function buildMonthlyReport(input: MonthlyReportInput): MonthlyReport {
  const marginHint = input.caInvoicedTtc > 0
    ? `Charges du mois : ${(input.expensesTtc / input.caInvoicedTtc * 100).toFixed(0)} % du CA facturé.`
    : 'Aucun CA facturé ce mois : les charges restent listées telles quelles.';
  const conversion = input.quotesSentCount > 0
    ? `${input.quotesAcceptedCount} devis accepté(s) sur ${input.quotesSentCount} envoyé(s) (${Math.round(input.quotesAcceptedCount / input.quotesSentCount * 100)} %).`
    : 'Aucun devis envoyé ce mois.';
  return {
    month: input.month,
    sections: [
      {
        title: `Activité de ${monthLabel(input.month)}`,
        kind: 'kpis',
        kpis: [
          { label: 'CA facturé (TTC)', value: eur(input.caInvoicedTtc), hint: 'Factures émises du mois — distinct de l\'encaissé.' },
          { label: 'CA encaissé (TTC)', value: eur(input.caCollectedTtc), hint: 'Règlements réellement reçus ce mois.' },
          { label: 'Charges (TTC)', value: eur(input.expensesTtc), hint: marginHint },
          { label: 'Devis acceptés', value: `${input.quotesAcceptedCount}/${input.quotesSentCount}`, hint: conversion },
        ],
        notes: [],
      },
      {
        title: 'Facturé vs encaissé — 6 mois glissants',
        kind: 'chart',
        chart: {
          suggestedTypes: ['bar', 'line', 'candle'],
          defaultType: 'bar',
          series: input.series.map(s => ({ label: s.label, value: s.invoicedTtc, extra: s.collectedTtc })),
          unit: '€ TTC',
        },
        notes: ['Les bougies (min-max) restent disponibles pour cette série temporelle ; le camembert ne s\'y applique pas (série temporelle, pas une répartition).'],
      },
      {
        title: 'Répartition des factures par statut de paiement',
        kind: 'chart',
        chart: {
          suggestedTypes: ['pie', 'bar'],
          defaultType: 'pie',
          series: input.paymentStatusBreakdown.map(s => ({ label: s.label, value: s.totalTtc })),
          unit: '€ TTC',
        },
        notes: ['Une répartition se lit en camembert ou en barres — jamais en courbe.'],
      },
      {
        title: 'Suivi et alertes',
        kind: 'kpis',
        kpis: [
          { label: 'Factures en retard', value: `${input.overdueCount} (${eur(input.overdueTotalTtc)})`, hint: 'Solde dû constaté — relances idempotentes actives.' },
          { label: 'Rendez-vous du mois', value: String(input.appointmentsCount) },
        ],
        notes: input.topClients.length ? [`Meilleurs clients du mois (CA facturé) : ${input.topClients.map(c => `${c.name} (${eur(c.totalTtc)})`).join(', ')}.`] : [],
      },
    ],
    disclaimer: 'Rapport généré depuis les données réelles des modules (aucun calcul parallèle). Les montants proviennent des sources de vérité : factures émises, règlements enregistrés, dépenses saisies.',
  };
}

/** Assemble les agrégats du mois depuis les sources de vérité (wrapper base). */
export async function monthlyReportData(exec: SqlExecutor, organizationId: string, month: string): Promise<MonthlyReport> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('MONTH_INVALID');
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const agg = (await exec.query(
    `select
       (select coalesce(sum(total_ttc),0) from quotes where organization_id=$1 and document_type='invoice' and created_at>=$2 and created_at<$3) as "caInvoicedTtc",
       (select coalesce(sum(p.amount),0) from invoice_payments p where p.organization_id=$1 and p.paid_at>=$2 and p.paid_at<$3) as "caCollectedTtc",
       (select coalesce(sum(amount_ttc),0) from expense_reports where organization_id=$1 and spent_on>=$2::date and spent_on<$3::date) as "expensesTtc",
       (select count(*)::int from quotes where organization_id=$1 and document_type='quote' and sent_at>=$2 and sent_at<$3) as "quotesSentCount",
       (select count(*)::int from quotes where organization_id=$1 and document_type='quote' and status='accepted' and accepted_at>=$2 and accepted_at<$3) as "quotesAcceptedCount",
       (select count(*)::int from appointments where organization_id=$1 and starts_at>=$2 and starts_at<$3) as "appointmentsCount",
       (select count(*)::int from quotes where organization_id=$1 and document_type='invoice' and payment_status<>'paid' and sent_at is not null and coalesce(due_at,created_at)::date<current_date and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted')) as "overdueCount",
       -- 15.4.52 — solde dû réel : la soustraction se fait PAR facture (sous-requête par ligne),
       -- la version précédente référençait la ligne externe depuis un agrégat (erreur 42803).
       (select coalesce(sum(g.total_due),0) from (
          select q.id,
                 q.total_ttc - coalesce((select sum(p.amount) from invoice_payments p where p.quote_id=q.id and p.organization_id=q.organization_id),0) as total_due
          from quotes q
          where q.organization_id=$1 and q.document_type='invoice' and q.payment_status<>'paid'
            and q.sent_at is not null and coalesce(q.due_at,q.created_at)::date<current_date
            and lower(coalesce(q.status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted')
       ) g) as "overdueTotalTtc"
     `,
    [organizationId, start.toISOString(), end.toISOString()],
  )).rows[0] as any;
  const series = (await exec.query(
    `select to_char(d.m,'YYYY-MM') as "label",
            coalesce((select sum(total_ttc) from quotes q where q.organization_id=$1 and q.document_type='invoice' and q.created_at>=d.m and q.created_at<d.m+interval '1 month'),0) as "invoicedTtc",
            coalesce((select sum(p.amount) from invoice_payments p where p.organization_id=$1 and p.paid_at>=d.m and p.paid_at<d.m+interval '1 month'),0) as "collectedTtc"
     from generate_series(($2::timestamptz - interval '5 months'),$2::timestamptz,interval '1 month') d(m)
     order by d.m`,
    [organizationId, start.toISOString()],
  )).rows;
  const breakdown = (await exec.query(
    `select payment_status as "label",count(*)::int as "count",coalesce(sum(total_ttc),0) as "totalTtc"
     from quotes where organization_id=$1 and document_type='invoice' and created_at>=$2 and created_at<$3
     group by payment_status order by 3 desc`,
    [organizationId, start.toISOString(), end.toISOString()],
  )).rows;
  const topClients = (await exec.query(
    `select c.name as "name",coalesce(sum(q.total_ttc),0) as "totalTtc"
     from quotes q join clients c on c.id=q.client_id
     where q.organization_id=$1 and q.document_type='invoice' and q.created_at>=$2 and q.created_at<$3
     group by c.name order by 2 desc limit 5`,
    [organizationId, start.toISOString(), end.toISOString()],
  )).rows;
  const labels: Record<string, string> = { unpaid: 'Non payées', partially_paid: 'Partiellement payées', paid: 'Payées' };
  return buildMonthlyReport({
    month,
    caInvoicedTtc: Number(agg.caInvoicedTtc || 0),
    caCollectedTtc: Number(agg.caCollectedTtc || 0),
    expensesTtc: Number(agg.expensesTtc || 0),
    vatCollectedTtc: 0,
    vatDeductibleTtc: 0,
    quotesSentCount: Number(agg.quotesSentCount || 0),
    quotesAcceptedCount: Number(agg.quotesAcceptedCount || 0),
    overdueCount: Number(agg.overdueCount || 0),
    overdueTotalTtc: Number(agg.overdueTotalTtc || 0),
    appointmentsCount: Number(agg.appointmentsCount || 0),
    topClients: topClients.map((c: any) => ({ name: String(c.name || ''), totalTtc: Number(c.totalTtc || 0) })),
    series: series.map((s: any) => ({ label: String(s.label), invoicedTtc: Number(s.invoicedTtc || 0), collectedTtc: Number(s.collectedTtc || 0) })),
    paymentStatusBreakdown: breakdown.map((b: any) => ({ label: labels[String(b.label)] || String(b.label), count: Number(b.count || 0), totalTtc: Number(b.totalTtc || 0) })),
  });
}
