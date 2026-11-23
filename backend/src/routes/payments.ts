// Bloc 13 — Routes de paiement en ligne (décision D3 non tranchée → adaptateur générique
// testé, fonction NON OPÉRATIONNELLE en production tant qu'aucun prestataire réel n'est
// connecté et validé en sandbox).
//  - POST /payments/webhook/:token : public serveur-à-serveur, corps brut préservé, signature
//    HMAC vérifiée, idempotence, anti-rejeu ; statut mis à jour uniquement sur confirmation.
//  - POST /invoices/:id/payment-link : facture ÉMISE uniquement (jamais un brouillon),
//    montant figé à la création ; toute modification du montant de la facture invalide le lien.
//  - GET  /invoices/:id/payment-links : liste des liens et de leurs statuts.
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { query } from '../db.js';
import { resolvePayAdapter, paymentsConfigured } from '../services/payments/index.js';
import { processPaymentWebhook, verifyPaymentSignature, parsePaymentEnvelope, PaymentWebhookError } from '../services/payments/webhook.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function paymentRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------- webhook public (prestataire → Aurion)
  app.register(async payWebhook => {
    payWebhook.removeContentTypeParser('application/json');
    payWebhook.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request: any, body: unknown, done: (err: any, body?: unknown) => void) => done(null, body));
    payWebhook.post('/payments/webhook/:token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request: any, reply: any) => {
      const token = String((request.params as any)?.token || '');
      if (!UUID_RE.test(token)) return reply.code(404).send({ error: 'WEBHOOK_NOT_FOUND' });
      const provider = config.AURION_PAY_PROVIDER;
      if (!provider || !resolvePayAdapter(provider)) return reply.code(503).send({ error: 'PAY_NOT_CONFIGURED', message: 'Paiement en ligne non configuré (décision D3 en attente).' });
      const rawBody = (request.body as Buffer) ?? Buffer.alloc(0);
      try {
        verifyPaymentSignature(rawBody, String((request.headers['x-aurion-pay-signature'] || '')), config.AURION_PAY_WEBHOOK_SECRET);
      } catch (e: any) {
        const code = e instanceof PaymentWebhookError ? e.code : 'BAD_SIGNATURE';
        return reply.code(400).send({ error: code, message: 'Webhook refusé : signature ou horodatage invalide.' });
      }
      let payload: any;
      try { payload = JSON.parse(rawBody.toString('utf8')); } catch { return reply.code(400).send({ error: 'INVALID_PAYLOAD', message: 'Corps non conforme.' }); }
      // Le jeton de la route DOIT correspondre au linkToken du corps (anti-pivot entre organisations).
      const envelope = parsePaymentEnvelope(payload);
      if (envelope.linkToken !== token) return reply.code(400).send({ error: 'TOKEN_MISMATCH', message: 'Jeton de route et jeton de lien différents.' });
      // Le tenant est résolu par le lien (jeton UUID unique par organisation).
      const linkOrg = (await query('select organization_id from payment_links where link_token=$1', [token])).rows[0]?.organization_id;
      if (!linkOrg) return reply.code(404).send({ error: 'LINK_NOT_FOUND', message: 'Lien de paiement introuvable.' });
      try {
        const outcome = await processPaymentWebhook(envelope, payload, provider, linkOrg);
        return reply.code(200).send({ ok: true, ...outcome });
      } catch (e: any) {
        if (e instanceof PaymentWebhookError) return reply.code(409).send({ error: e.code, message: e.message });
        request.log.error({ err: e }, 'payment webhook processing failed');
        return reply.code(500).send({ error: 'PAYMENT_PROCESSING_FAILED', message: 'Erreur interne : aucune écriture effectuée.' });
      }
    });
  });

  // ------------------------------------------------------------- liens de paiement (authentifiés)
  app.register(async payPrivate => {
    payPrivate.addHook('preHandler', app.requireAuth);

  payPrivate.post('/invoices/:id/payment-link', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (r, reply) => {
    const id = String((r.params as any).id), org = r.auth!.organizationId;
    if (!paymentsConfigured()) return reply.code(503).send({ error: 'PAY_NOT_CONFIGURED', message: 'Paiement en ligne non opérationnel : aucun prestataire connecté (décision D3 en attente). Aucun lien fictif n\u2019est généré.' });
    const q = (await query(`select q.id,q.number,q.total_ttc,q.amount_paid,q.payment_status from quotes q where q.id=$1 and q.organization_id=$2 and q.document_type='invoice'`, [id, org])).rows[0];
    if (!q) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Facture introuvable.' });
    // Un lien est généré pour une facture ÉMISE — jamais pour un brouillon.
    if (q.payment_status === 'draft') return reply.code(400).send({ error: 'DRAFT_NOT_EMITTABLE', message: 'Ce document est un brouillon : émettez la facture avant de générer un lien de paiement.' });
    const penaltyRow = (await query('select coalesce(sum(penalty_amount),0) total from invoice_reminders where quote_id=$1', [id])).rows[0];
    const due = Math.max(0, Math.round((Number(q.total_ttc) + Number(penaltyRow?.total || 0) - Number(q.amount_paid || 0)) * 100) / 100);
    if (due <= 0) return reply.code(409).send({ error: 'ALREADY_PAID', message: 'Cette facture est déjà réglée.' });
    const adapter = resolvePayAdapter(config.AURION_PAY_PROVIDER)!;
    let link;
    try { link = await adapter.createPaymentLink({ amountTtc: due, currency: 'EUR', reference: String(q.number), description: `Facture ${q.number}` }); }
    catch (e: any) { return reply.code(502).send({ error: 'PAYMENT_PROVIDER_FAILED', message: String(e?.message || 'Le prestataire de paiement est indisponible.') }); }
    const created = (await query(
      `insert into payment_links(organization_id,invoice_id,amount_ttc,invoice_total_at_creation,provider,provider_ref)
       values($1,$2,$3,$4,$5,$6) returning id,link_token,amount_ttc,status,provider`,
      [org, id, due, Number(q.total_ttc), config.AURION_PAY_PROVIDER, link.providerRef],
    )).rows[0];
    return reply.code(201).send({ id: created.id, linkToken: created.link_token, checkoutUrl: link.checkoutUrl, amountTtc: Number(created.amount_ttc), status: created.status, provider: created.provider, note: 'Le lien est lié à ce montant : toute modification de la facture l\u2019invalide. Le statut de paiement ne change que sur confirmation signée du prestataire.' });
  });

  payPrivate.get('/invoices/:id/payment-links', async r => {
    const id = String((r.params as any).id), org = r.auth!.organizationId;
    return (await query(
      `select id,link_token as "linkToken",amount_ttc as "amountTtc",invoice_total_at_creation as "invoiceTotalAtCreation",status,provider,provider_ref as "providerRef",created_at as "createdAt",updated_at as "updatedAt"
       from payment_links where organization_id=$1 and invoice_id=$2 order by created_at desc`,
      [org, id],
    )).rows;
  });
  });
}
