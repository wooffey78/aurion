import { query } from '../db.js';

/** Vue complète d'un client : coordonnées, historique commercial, rendez-vous, appareils / dossiers. */
export async function clientSummary(orgId: string, id: string) {
  const c = (await query('select id,name,email,phone,address,intervention_address,estimated_minutes,activity_id,created_at from clients where id=$1 and organization_id=$2', [id, orgId])).rows[0];
  if (!c) return null;
  const docs = (await query(`select id,number,document_type,status,payment_status,intervention,total_ttc,created_at,sent_at from quotes where client_id=$1 and organization_id=$2 order by created_at desc limit 200`, [id, orgId])).rows;
  const appointments = (await query(`select id,title,starts_at,ends_at,status from appointments where client_id=$1 and organization_id=$2 order by starts_at desc limit 30`, [id, orgId])).rows;
  const devices = (await query(`select id,type,brand,model,imei,serial_number from devices where client_id=$1 and organization_id=$2 order by created_at desc limit 30`, [id, orgId])).rows;
  const invoices = docs.filter((d: any) => d.document_type === 'invoice'), quotes = docs.filter((d: any) => d.document_type !== 'invoice');
  const lastBilling = (await query(`select invoice_address_source from quotes where client_id=$1 and organization_id=$2 and invoice_address_source is not null order by updated_at desc limit 1`, [id, orgId])).rows[0]?.invoice_address_source || null;
  const tm=(await query(`select coalesce(sum(duration_seconds),0)+coalesce(sum(extract(epoch from(now()-started_at))) filter(where ended_at is null),0) actual_seconds from client_time_sessions where client_id=$1 and organization_id=$2`,[id,orgId])).rows[0];
  const estimatedMinutes=Number(c?.estimated_minutes||0), actualMinutes=Number(tm?.actual_seconds||0)/60;
  const sum = (a: any[]) => a.reduce((t, d) => t + Number(d.total_ttc || 0), 0);
  return {
    client: {...c,last_invoice_address_source:lastBilling}, documents: docs, appointments, devices,
    stats: { invoiceCount: invoices.length, quoteCount: quotes.length, invoicedTtc: sum(invoices.filter((d:any)=>d.payment_status==='paid')), pendingQuotesTtc: sum(quotes), appointmentCount: appointments.length, lastActivity: docs[0]?.created_at || appointments[0]?.starts_at || c.created_at, estimatedMinutes, actualMinutes, savedMinutes: Math.max(0,estimatedMinutes-actualMinutes) },
  };
}
