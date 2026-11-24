// 15.4.63 — Boîte d'envoi e-mail : la facturation reste validée même sans messagerie
// configurée ; l'e-mail passe en file d'attente (statut honnête côté interface, entrée dans le
// journal de bord) et part automatiquement dès que la messagerie est de nouveau opérationnelle.
import { query } from '../db.js';
import { sendOrgMail, mailConfigured } from './mail.js';
import { renderDocument } from './document-renderer.js';
import { readPrivateObject } from './storage.js';
import { signatureForEmail, emailBodyHtml } from './signature.js';

export async function queueOutboxEmail(org: string, quoteId: string, docType: 'quote' | 'invoice', recipient: string, subject: string, message: string, lastError: string | null = null) {
  const existing = (await query(`select id from email_outbox where organization_id=$1 and quote_id=$2 and doc_type=$3 and status='pending' order by created_at desc limit 1`, [org, quoteId, docType])).rows[0];
  if (existing) {
    await query(`update email_outbox set attempts=attempts+1,last_error=coalesce($2,last_error),updated_at=now() where id=$1`, [existing.id, lastError]);
    return;
  }
  await query(`insert into email_outbox(organization_id,quote_id,doc_type,recipient,subject,message,last_error) values($1,$2,$3,$4,$5,$6,$7)`, [org, quoteId, docType, recipient, subject, message, lastError]);
  const label = docType === 'invoice' ? 'facture' : 'devis';
  await query(`insert into dashboard_journal_events(organization_id,event_type,title,description,severity,source,internal_path,dedupe_key)
    values($1,'email_pending','E-mail en attente','Le document a été enregistré mais son envoi par e-mail n''a pas pu aboutir immédiatement (messagerie non configurée ou indisponible). Il partira automatiquement dès que l''envoi sera de nouveau possible — suivez-le depuis Devis & factures.','warning','invoices','#/invoices','email-pending-'||$2)
    on conflict(organization_id,dedupe_key) do nothing`, [org, `${docType}-${quoteId}`]);
}

export async function flushOutbox(org: string, limit = 20) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const rows = (await query(`select o.id,o.quote_id,o.doc_type,o.recipient,o.subject,o.message from email_outbox o where o.organization_id=$1 and o.status='pending' order by o.created_at limit ${safeLimit}`, [org])).rows;
  let sent = 0, failed = 0;
  for (const o of rows) {
    try {
      if (!o.quote_id) throw new Error('Document source introuvable');
      const type = o.doc_type === 'invoice' ? 'invoice' as const : 'quote' as const;
      const d = await renderDocument(org, o.quote_id, type);
      const pdf = await readPrivateObject(d.keys.pdf);
      const sig = await signatureForEmail(org, d.row.activity_id, type);
      await sendOrgMail(org, { to: o.recipient, subject: o.subject, text: o.message + sig.text, html: emailBodyHtml(o.message, sig.html), attachments: [...(sig.inlineAttachments || []), { filename: `${d.row.number}.pdf`, content: pdf }] });
      await query(`update quotes set sent_at=now(),updated_at=now() where id=$1 and organization_id=$2`, [o.quote_id, org]);
      if (type === 'invoice') { try { const { createInvoiceWarranty } = await import('./warranty.js'); await createInvoiceWarranty(org, o.quote_id, d.row as any); } catch {/* garantie best effort */} }
      await query(`update email_outbox set status='sent',sent_at=now(),updated_at=now() where id=$1`, [o.id]);
      await query(`update dashboard_journal_events set resolved_at=coalesce(resolved_at,now()) where organization_id=$1 and dedupe_key=$2`, [org, `email-pending-${o.doc_type}-${o.quote_id}`]);
      sent++;
    } catch (e: any) {
      await query(`update email_outbox set attempts=attempts+1,last_error=$2,updated_at=now() where id=$1`, [o.id, String(e?.message || e).slice(0, 400)]);
      failed++;
    }
  }
  const remaining = Number((await query(`select count(*)::int n from email_outbox where organization_id=$1 and status='pending'`, [org])).rows[0]?.n || 0);
  return { sent, failed, remaining };
}

export async function outboxCount(org: string) {
  return Number((await query(`select count(*)::int n from email_outbox where organization_id=$1 and status='pending'`, [org])).rows[0]?.n || 0);
}
