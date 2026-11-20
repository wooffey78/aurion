import { query } from '../db.js';

/** Vue complète d'un client : coordonnées, historique commercial, rendez-vous, appareils / dossiers. */
export async function clientSummary(orgId: string, id: string) {
  const c = (await query('select id,name,email,phone,address,intervention_address,estimated_minutes,activity_id,created_at from clients where id=$1 and organization_id=$2', [id, orgId])).rows[0];
  if (!c) return null;
  const [docsResult,appointmentsResult,summaryResult,appointmentCountResult] = await Promise.all([
    query(`select id,number,document_type,status,payment_status,amount_paid,total_ttc,intervention,created_at,sent_at from quotes where client_id=$1 and organization_id=$2 order by created_at desc limit 200`, [id, orgId]),
    query(`select id,title,starts_at,ends_at,status from appointments where client_id=$1 and organization_id=$2 order by starts_at desc limit 30`, [id, orgId]),
    query(`select
      count(*) filter(where document_type='invoice' and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted'))::int invoice_count,
      coalesce(sum(total_ttc) filter(where document_type='invoice' and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted')),0)::numeric issued_ttc,
      coalesce(sum(case when document_type='invoice' and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted') then
        case when payment_status='paid' then total_ttc else coalesce(amount_paid,0) end else 0 end),0)::numeric paid_ttc,
      coalesce(sum(case when document_type='invoice' and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted') then greatest(0,total_ttc-case when payment_status='paid' then total_ttc else coalesce(amount_paid,0) end) else 0 end),0)::numeric remaining_ttc,
      count(*) filter(where document_type<>'invoice' and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted','rejected','refused'))::int quote_count,
      coalesce(sum(total_ttc) filter(where document_type<>'invoice' and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted','rejected','refused')),0)::numeric pending_quotes_ttc
      from quotes where client_id=$1 and organization_id=$2`, [id, orgId]),
    query(`select count(*)::int n from appointments where client_id=$1 and organization_id=$2 and starts_at>=now() and status not in ('canceled','cancelled','deleted','completed')`, [id, orgId]),
  ]);
  const docs=docsResult.rows, appointments=appointmentsResult.rows, summary=summaryResult.rows[0]||{}, appointmentCount=Number(appointmentCountResult.rows[0]?.n||0);
  const devices = (await query(`select id,type,brand,model,imei,serial_number from devices where client_id=$1 and organization_id=$2 order by created_at desc limit 30`, [id, orgId])).rows;
  const invoices = docs.filter((d: any) => d.document_type === 'invoice'), quotes = docs.filter((d: any) => d.document_type !== 'invoice');
  const lastBilling = (await query(`select invoice_address_source from quotes where client_id=$1 and organization_id=$2 and invoice_address_source is not null order by updated_at desc limit 1`, [id, orgId])).rows[0]?.invoice_address_source || null;
  const tm=(await query(`select coalesce(sum(manual_minutes),0) manual_minutes,coalesce(sum(duration_seconds),0) actual_seconds,count(*)::int completed_sessions
    from client_time_sessions where client_id=$1 and organization_id=$2 and status='completed' and ended_at is not null`,[id,orgId])).rows[0];
  // La comparaison ne porte que sur les sessions réellement terminées, pas sur un temps estimé
  // de fiche client qui n'a jamais été chronométré.
  const estimatedMinutes=Number(tm?.manual_minutes||0), actualMinutes=Number(tm?.actual_seconds||0)/60;
  return {
    client: {...c,last_invoice_address_source:lastBilling}, documents: docs, appointments, devices,
    stats: { invoiceCount:Number(summary.invoice_count||0), quoteCount:Number(summary.quote_count||0), invoicedTtc:Number(summary.issued_ttc||0), paidTtc:Number(summary.paid_ttc||0), remainingTtc:Number(summary.remaining_ttc||0), pendingQuotesTtc:Number(summary.pending_quotes_ttc||0), appointmentCount, lastActivity: docs[0]?.created_at || appointments[0]?.starts_at || c.created_at, estimatedMinutes, actualMinutes, savedMinutes: Math.max(0,estimatedMinutes-actualMinutes) },
  };
}
