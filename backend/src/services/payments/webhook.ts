// Bloc 13 — Traitement du webhook de paiement client : SIGNATURE vérifiée (HMAC-SHA256
// « t=<unix>,v1=<hex(secret, "<t>.<corps>") », miroir du webhook PA du bloc 3), comparaison
// à temps constant, tolérance ±300 s (anti-rejeu), idempotence par event_id, paiement
// PARTIEL géré sans double saisie. Le statut de la facture n'est mis à jour QUE sur
// confirmation vérifiée du prestataire — une redirection du navigateur ne suffit jamais.
// Aucun numéro de carte n'est stocké ; le payload du prestataire est conservé tel quel.
import { createHmac, timingSafeEqual, randomUUID as cryptoRandomUUID } from 'node:crypto';
import { query, withTenant } from '../../db.js';
import { calculateInvoicePayment } from '../invoice-workflow.js';
import { publishInTransaction } from '../events-outbox.js';

export class PaymentWebhookError extends Error { constructor(public code: string, message: string) { super(message); } }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vérifie l'en-tête de signature : format strict, horodatage dans ±300 s, HMAC du corps. */
export function verifyPaymentSignature(rawBody: Buffer, header: string, secret: string): void {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(header || ''));
  if (!m) throw new PaymentWebhookError('BAD_SIGNATURE', 'En-tête de signature absent ou mal formé.');
  const t = Number(m[1]);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) throw new PaymentWebhookError('STALE_TIMESTAMP', 'Horodatage de signature hors tolérance (anti-rejeu).');
  const expected = createHmac('sha256', secret).update(`${t}.`, 'utf8').update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex'), b = Buffer.from(m[2], 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new PaymentWebhookError('BAD_SIGNATURE', 'Signature invalide pour le corps reçu.');
}

export interface PayWebhookEnvelope {
  eventId: string;
  type: string;
  linkToken: string;
  providerRef?: string;
  amountPaid?: number;
}

export function parsePaymentEnvelope(payload: any): PayWebhookEnvelope {
  const eventId = String(payload?.eventId || '');
  const type = String(payload?.type || '');
  const linkToken = String(payload?.linkToken || '');
  if (!eventId || !linkToken) throw new PaymentWebhookError('INVALID_PAYLOAD', 'Charge utile non conforme (eventId et linkToken requis).');
  if (type !== 'payment.succeeded' && type !== 'payment.failed' && type !== 'payment.cancelled') {
    throw new PaymentWebhookError('UNKNOWN_TYPE', `Type d'événement non pris en charge : « ${type} ».`);
  }
  return { eventId, type, linkToken, providerRef: payload?.providerRef ? String(payload.providerRef) : undefined, amountPaid: payload?.amountPaid !== undefined ? Number(payload.amountPaid) : undefined };
}

export interface PayWebhookOutcome {
  status: 'processed' | 'duplicate';
  paymentStatus: string;
  invoiceNumber: string | null;
  amountPaid: number;
  paidInFull: boolean;
}

/** Traite le webhook : idempotent, transactionnel, statut mis à jour uniquement sur vérification. */
export async function processPaymentWebhook(envelope: PayWebhookEnvelope, payload: any, provider: string, orgId: string): Promise<PayWebhookOutcome> {
  // Idempotence stricte : rejeu du même event_id → acquitté sans écriture.
  const inserted = await withTenant(orgId, () => query(
    `insert into payment_webhook_events(organization_id,provider,event_id,payload,signature_valid)
     values($1,$2,$3,$4::jsonb,true)
     on conflict (provider,event_id,organization_id) do nothing returning id`,
    [orgId, provider, envelope.eventId, JSON.stringify(payload)],
  ));
  if (!inserted.rowCount) return { status: 'duplicate', paymentStatus: 'unchanged', invoiceNumber: null, amountPaid: 0, paidInFull: false };

  if (!UUID_RE.test(envelope.linkToken)) throw new PaymentWebhookError('INVALID_LINK', 'Jeton de lien invalide.');
  if (envelope.type === 'payment.failed' || envelope.type === 'payment.cancelled') {
    // Échec/annulation : journalisé, statut du lien inchangé (le client peut réessayer via le même lien).
    await withTenant(orgId, () => query('update payment_webhook_events set processed_at=now() where provider=$1 and event_id=$2 and organization_id=$3', [provider, envelope.eventId, orgId]));
    return { status: 'processed', paymentStatus: envelope.type === 'payment.failed' ? 'failed' : 'cancelled', invoiceNumber: null, amountPaid: 0, paidInFull: false };
  }

  // payment.succeeded : mise à jour transactionnelle de la facture et du lien.
  const result = await withTenant(orgId, async () => {
    const link = (await query(
      `select l.id,l.invoice_id,l.amount_ttc,l.invoice_total_at_creation,l.status,q.number invoice_number,q.total_ttc,q.amount_paid,q.activity_id
       from payment_links l join quotes q on q.id=l.invoice_id
       where l.link_token=$1 and l.organization_id=$2 for update of l`,
      [envelope.linkToken, orgId],
    )).rows[0];
    if (!link) throw new PaymentWebhookError('LINK_NOT_FOUND', 'Lien de paiement introuvable pour ce jeton.');
    if (link.status === 'invalidated' || link.status === 'cancelled') throw new PaymentWebhookError('LINK_INACTIVE', 'Ce lien de paiement n\u2019est plus actif (montant de la facture modifié ou facture annulée).');
    if (link.status === 'paid') return { alreadyPaid: true as const };
    // Toute modification du montant de la facture invalide le lien (garde stricte du prompt).
    if (Number(link.total_ttc) !== Number(link.invoice_total_at_creation)) {
      await query("update payment_links set status='invalidated',updated_at=now() where id=$1", [link.id]);
      throw new PaymentWebhookError('LINK_INVALIDATED', 'Le montant de la facture a été modifié après la création du lien : paiement refusé.');
    }
    const penaltyRow = (await query('select coalesce(sum(penalty_amount),0) total from invoice_reminders where quote_id=$1', [link.invoice_id])).rows[0];
    const requested = envelope.amountPaid !== undefined ? envelope.amountPaid : Number(link.amount_ttc);
    let calc: ReturnType<typeof calculateInvoicePayment>;
    try { calc = calculateInvoicePayment(Number(link.total_ttc), Number(penaltyRow?.total || 0), Number(link.amount_paid || 0), requested); }
    catch (e: any) {
      const code = String(e?.message || 'INVALID_PAYMENT_AMOUNT');
      if (code === 'INVOICE_ALREADY_PAID') return { alreadyPaid: true as const };
      throw new PaymentWebhookError('INVALID_PAYMENT_AMOUNT', `Montant de paiement refusé : ${code}.`);
    }
    const paymentId = cryptoRandomUUID();
    const paidAt = new Date();
    await query(
      `insert into invoice_payments(id,organization_id,quote_id,amount,payment_method,paid_at,reference,note)
       values($1,$2,$3,$4,'card',now(),$5,$6)`,
      [paymentId, orgId, link.invoice_id, calc.amount, `webhook ${provider}`, 'Paiement en ligne confirmé par le prestataire (webhook signé).'],
    );
    const paidInFull = Number(link.total_ttc) + Number(penaltyRow?.total || 0) <= Number(link.amount_paid || 0) + calc.amount + 0.004;
    // Même effet que le règlement manuel : montant encaissé, statut de la facture, écriture comptable.
    // 15.4.49 (prompt 07) : la facture réglée ne doit plus être relancée — next_reminder_at est
    // neutralisé comme le fait déjà le règlement manuel (les relances cessent quand régularisé).
    await query(
      "update quotes set amount_paid=$1::numeric,payment_status=$2::varchar(20),paid_at=case when $2::varchar(20)='paid' then $3::timestamptz else paid_at end,status=case when $2::varchar(20)='paid' then 'paid' else status end,next_reminder_at=case when $2::varchar(20)='paid' then null else next_reminder_at end,updated_at=now() where id=$4::uuid and organization_id=$5::uuid",
      [calc.paidAmount, calc.status, paidAt, link.invoice_id, orgId],
    );
    if (link.activity_id) {
      await query(
        "insert into accounting_entries(organization_id,activity_id,entry_type,amount,entry_date,source_id,label) values($1::uuid,$2::uuid,'payment',$3::numeric,($4::timestamptz)::date,$5::uuid,$6::varchar(240))",
        [orgId, link.activity_id, calc.amount, paidAt, paymentId, `Paiement en ligne facture ${link.invoice_number || ''}`],
      );
    }
    // Prompt 05 — paiement confirmé : événement publié dans l'outbox (livraison au journal
    // par le worker), idempotent par identifiant de règlement.
    await publishInTransaction({ query }, orgId, {
      type: 'invoice_payment_confirmed',
      idempotencyKey: `payment-confirmed:${paymentId}`,
      sourceEntityType: 'invoice',
      sourceEntityId: link.invoice_id,
      payload: { title: 'Paiement en ligne confirmé', description: `Règlement en ligne confirmé par le prestataire pour la facture ${link.invoice_number || ''} (${Number(calc.amount).toFixed(2)} €).`, severity: 'success' },
    });
    await query("update payment_links set status=$1,provider_ref=coalesce($2,provider_ref),updated_at=now() where id=$3",
      [paidInFull ? 'paid' : 'partially_paid', envelope.providerRef || null, link.id]);
    await query('update payment_webhook_events set processed_at=now() where provider=$1 and event_id=$2 and organization_id=$3', [provider, envelope.eventId, orgId]);
    return { alreadyPaid: false as const, invoiceNumber: String(link.invoice_number || ''), amountPaid: calc.amount, paidInFull };
  });
  if ((result as any).alreadyPaid) return { status: 'processed', paymentStatus: 'already_paid', invoiceNumber: null, amountPaid: 0, paidInFull: true };
  return { status: 'processed', paymentStatus: paidLabel((result as any).paidInFull), invoiceNumber: (result as any).invoiceNumber, amountPaid: (result as any).amountPaid, paidInFull: (result as any).paidInFull };
}

const paidLabel = (full: boolean) => full ? 'paid' : 'partially_paid';
