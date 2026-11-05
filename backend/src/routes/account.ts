import type { FastifyInstance } from 'fastify';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { db, query } from '../db.js';
import { signAccessToken } from '../plugins/auth.js';
import {
  requestPasswordReset, validateResetToken, resetPassword, changePassword, bumpSessions, currentLegalDocs, legalDocumentsReadyForContracts,
  subscriptionState, subscriptionEvent,
} from '../services/account.js';
import { AurionError } from '../services/errors.js';
import { revokeAllRefreshSessions } from '../services/native-sessions.js';
import { savePrivateUpload, readPrivateObject, deletePrivateObject } from '../services/storage.js';
import { activateStripeCheckout, verifyStripeWebhookSignature } from '../services/stripe-billing.js';
import { calculateTtcCents } from '../services/money.js';
import { platformMailerConfigured, sendConfiguredPlatformMail } from '../services/platform-mailer.js';

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(12).max(256);
const billingSubscribeSchema = z.object({
  planCode: z.enum(['monthly', 'yearly']),
  method: z.enum(['card', 'bank_transfer']),
}).strict();
const checkoutSessionQuerySchema = z.object({ session_id: z.string().trim().min(1).max(200) });
const avatarTypes = new Set(['image/png','image/jpeg','image/webp']);

/** URL publique utilisée dans les liens e-mail : jamais déduite d'un en-tête Host non fiable. */
function publicBaseUrl(request: any) {
  if (config.APP_BASE_URL) return config.APP_BASE_URL;
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  const host = String(request.headers.host || '');
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ? `http://${host}` : '';
}

export async function accountRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------ publiques : mot de passe oublié
  app.post('/auth/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const parsed = z.object({ email: emailSchema }).safeParse(request.body);
    if (parsed.success) {
      const base = publicBaseUrl(request);
      // Traitement en arrière-plan : le temps de réponse ne révèle pas l'existence du compte.
      if (base) void requestPasswordReset(parsed.data.email, base, request.ip, request.log).catch(e => request.log.error({ err: e }, 'forgot-password failed'));
      else request.log.warn('APP_BASE_URL non défini : lien de réinitialisation non envoyé');
    }
    return reply.code(202).send({ ok: true, message: 'Si un compte correspond à cette adresse, un e-mail contenant un lien de réinitialisation vient d’être envoyé (valable 30 minutes).' });
  });
  app.get('/auth/reset-password/validate', { config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } }, async (request) => ({ valid: await validateResetToken(String((request.query as any)?.token || '')) }));
  app.post('/auth/reset-password', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const parsed = z.object({ token: z.string().min(20).max(200), password: passwordSchema }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Le mot de passe doit contenir au moins 12 caractères.' });
    await resetPassword(parsed.data.token, parsed.data.password);
    return { ok: true, message: 'Mot de passe mis à jour. Vous pouvez vous connecter.' };
  });

  // ------------------------------------------------------------ publiques : documents légaux (consultables avant l'inscription)
  app.get('/legal/documents', async () => ({ documents: await currentLegalDocs() }));
  app.get('/legal/documents/:kind', async (request, reply) => {
    const r = await query('select kind,version,title,body,is_draft,published_at from legal_documents where kind=$1 and is_current=true', [(request.params as any).kind]);
    if (!r.rowCount) return reply.code(404).send({ error: 'NOT_FOUND' });
    return r.rows[0];
  });

  // Parcours public de rétractation consommateur, accessible sans authentification.
  // Une seule implémentation de la rétractation : route publique (accès direct) et section « Mon compte » (authentifiée).
  const withdrawalHandler = (linked: boolean) => async (request: any, reply: any) => {
    const link = linked && request.auth ? { userId: String(request.auth.userId), organizationId: String(request.auth.organizationId) } : null;
    const parsed = z.object({
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().min(1).max(100),
      email: emailSchema,
      contractReference: z.string().trim().min(8).max(1000),
      contractDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      confirmationEmail: emailSchema,
    }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_WITHDRAWAL_DETAILS', message: 'Vérifiez votre identité, l’adresse de réponse et les références détaillées du contrat.' });
    const b = parsed.data;
    if (b.email.toLowerCase() !== b.confirmationEmail.toLowerCase()) return reply.code(400).send({ error: 'EMAIL_CONFIRMATION_MISMATCH', message: 'Les deux adresses e-mail doivent être identiques.' });
    const contractDate = new Date(`${b.contractDate}T00:00:00Z`);
    if (Number.isNaN(contractDate.getTime()) || contractDate.toISOString().slice(0, 10) !== b.contractDate) return reply.code(400).send({ error: 'INVALID_CONTRACT_DATE' });
    const submittedAt = new Date();
    if (contractDate.getTime() > Date.UTC(submittedAt.getUTCFullYear(), submittedAt.getUTCMonth(), submittedAt.getUTCDate())) return reply.code(400).send({ error: 'CONTRACT_DATE_IN_FUTURE' });
    const id = randomUUID();
    const declarationText = `Je soussigné(e) ${b.firstName} ${b.lastName}, notifie ma décision de me rétracter du contrat Aurion identifié comme suit : ${b.contractReference}. Date de conclusion indiquée : ${b.contractDate}. Adresse de réponse demandée : ${b.email}.`;
    await query(`insert into contract_withdrawal_requests(id,first_name,last_name,email,contract_reference,contract_date,declaration_text,submitted_at,user_id,organization_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, b.firstName, b.lastName, b.email, b.contractReference, b.contractDate, declarationText, submittedAt, link?.userId || null, link?.organizationId || null]);
    let receiptSent = false;
    try {
      if (!platformMailerConfigured()) throw new Error('PLATFORM_SMTP_NOT_CONFIGURED');
      await sendConfiguredPlatformMail({
        to: b.email,
        subject: 'Aurion — accusé de réception de votre déclaration de rétractation',
        text: `Bonjour ${b.firstName} ${b.lastName},\n\nAurion accuse réception de votre déclaration de rétractation.\n\nDéclaration :\n${declarationText}\n\nEnvoyée le ${submittedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} (heure de Paris).\nRéférence de suivi : ${id}\n\nCette confirmation constate la réception de votre déclaration et ne préjuge pas de son éligibilité ni du traitement du remboursement. Pour toute demande, répondez à cet e-mail ou écrivez à ${config.AURION_SUPPORT_EMAIL}.\n\nAurion`,
      });
      receiptSent = true;
      await query("update contract_withdrawal_requests set receipt_sent_at=now(),receipt_delivery_status='sent',updated_at=now() where id=$1", [id]);
    } catch (error: any) {
      const code = String(error?.code || error?.message || 'MAIL_DELIVERY_FAILED').replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 80);
      await query("update contract_withdrawal_requests set receipt_delivery_status='failed',receipt_error_code=$2,updated_at=now() where id=$1", [id, code]);
      request.log.error({ withdrawalId: id, code }, 'withdrawal receipt email could not be delivered');
    }
    return reply.code(201).send({ id, submittedAt: submittedAt.toISOString(), receiptSent, declaration: declarationText, supportEmail: config.AURION_SUPPORT_EMAIL });
  };
  app.post('/billing/withdrawal', { config: { rateLimit: { max: 3, timeWindow: '30 minutes' } } }, withdrawalHandler(false));
  app.post('/account/withdrawal', { preHandler: app.requireAuth, config: { rateLimit: { max: 3, timeWindow: '30 minutes' } } }, withdrawalHandler(true));

  // Stripe appelle cette route serveur-à-serveur : aucune session utilisateur n'est requise.
  // Le parseur local conserve les octets exacts nécessaires à Stripe-Signature.
  app.register(async stripeApp => {
    stripeApp.removeContentTypeParser('application/json');
    stripeApp.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

    stripeApp.post('/billing/stripe/webhook', async (request, reply) => {
      if (!config.STRIPE_WEBHOOK_SECRET) return reply.code(503).send({ error: 'WEBHOOK_DISABLED' });
      const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from(String(request.body ?? ''), 'utf8');
      const signature = String(request.headers['stripe-signature'] || '');
      if (!verifyStripeWebhookSignature(rawBody, signature, config.STRIPE_WEBHOOK_SECRET)) {
        return reply.code(400).send({ error: 'INVALID_WEBHOOK_SIGNATURE' });
      }

      let event: any;
      try { event = JSON.parse(rawBody.toString('utf8')); }
      catch { return reply.code(400).send({ error: 'INVALID_WEBHOOK_PAYLOAD' }); }
      if (typeof event?.id !== 'string' || !event.id || typeof event?.type !== 'string') {
        return reply.code(400).send({ error: 'INVALID_WEBHOOK_PAYLOAD' });
      }

      const client = await db.connect();
      try {
        await client.query('begin');
        const minimalPayload = JSON.stringify({ type: event.type, sessionId: event.data?.object?.id || null });
        const inserted = await client.query(
          `insert into billing_webhook_events(provider,event_id,payload)
           values('stripe',$1,$2::jsonb) on conflict(provider,event_id) do nothing returning id`,
          [event.id, minimalPayload],
        );
        if (inserted.rowCount !== 1) {
          await client.query('commit');
          return reply.code(200).send({ received: true, duplicate: true });
        }

        let activationStatus = 'ignored';
        if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
          const result = await activateStripeCheckout(client, event.data?.object || {});
          if (result.status === 'invalid' || result.status === 'unmatched') {
            // Signature et enveloppe Stripe sont valides : ne pas déclencher une boucle de retries
            // pour une session inconnue/altérée. Journaliser et acquitter l'événement.
            request.log.warn({ eventId: event.id, sessionId: event.data?.object?.id || null, status: result.status }, 'Stripe checkout event acknowledged without activation');
          }
          activationStatus = result.status;
        }
        await client.query(
          `update billing_webhook_events set processed_at=now(),payload=$2::jsonb
           where provider='stripe' and event_id=$1`,
          [event.id, JSON.stringify({ type: event.type, sessionId: event.data?.object?.id || null, activationStatus })],
        );
        await client.query('commit');
        return reply.code(200).send({ received: true, activated: activationStatus === 'activated', status: activationStatus });
      } catch (e: any) {
        await client.query('rollback').catch(() => {});
        request.log.error({ code: typeof e?.code === 'string' ? e.code : 'STRIPE_WEBHOOK_FAILED' }, 'Stripe webhook processing failed');
        return reply.code(500).send({ error: 'WEBHOOK_PROCESSING_FAILED' });
      } finally {
        client.release();
      }
    });
  });

  // ------------------------------------------------------------ authentifiées : compte, sécurité, abonnement
  app.register(async (priv: FastifyInstance) => {
    priv.addHook('preHandler', app.requireAuth);

    priv.get('/account', async request => {
      const a = request.auth!;
      const u = (await query('select id,email,full_name,job_title,phone_fixed,phone_mobile,created_at,password_changed_at,avatar_key from users where id=$1', [a.userId])).rows[0];
      const o = (await query('select id,name from organizations where id=$1', [a.organizationId])).rows[0];
      const acc = (await query(`select d.kind,d.version,d.title,d.is_draft,x.accepted_at from legal_acceptances x join legal_documents d on d.id=x.document_id where x.user_id=$1 order by x.accepted_at desc`, [a.userId])).rows;
      return {
        user: { id: u.id, email: u.email, fullName: u.full_name || '', jobTitle: u.job_title || '', fixedPhone: u.phone_fixed || '', mobilePhone: u.phone_mobile || '', createdAt: u.created_at, passwordChangedAt: u.password_changed_at, avatarUrl: u.avatar_key ? '/account/avatar' : null },
        role: a.role, organization: o, legalAcceptances: acc, subscription: await subscriptionState(a.organizationId),
      };
    });
    priv.get('/account/avatar', async (request, reply) => {
      const row=(await query('select avatar_key from users where id=$1',[request.auth!.userId])).rows[0];
      if(!row?.avatar_key)return reply.code(404).send({error:'NOT_FOUND',message:'Aucun avatar enregistré.'});
      try{
        const key=String(row.avatar_key);
        const mime=key.toLowerCase().endsWith('.png')?'image/png':key.toLowerCase().endsWith('.webp')?'image/webp':'image/jpeg';
        const buf=await readPrivateObject(key);
        return reply.header('Content-Type',mime).header('Cache-Control','private, max-age=0, no-store').send(buf);
      }catch{return reply.code(404).send({error:'NOT_FOUND',message:'Avatar introuvable.'});}
    });
    priv.post('/account/avatar', async (request, reply) => {
      const part=await request.file();
      if(!part || !avatarTypes.has(part.mimetype))return reply.code(400).send({error:'INVALID_IMAGE',message:'Choisissez une image PNG, JPEG ou WebP.'});
      const saved=await savePrivateUpload(request.auth!.organizationId,part,3*1024*1024);
      const newKey=`private/${request.auth!.organizationId}/${saved.safe}`;
      const old=(await query('select avatar_key from users where id=$1',[request.auth!.userId])).rows[0]?.avatar_key;
      await query('update users set avatar_key=$1 where id=$2',[newKey,request.auth!.userId]);
      if(old){try{await deletePrivateObject(String(old));}catch{}}
      return {ok:true,avatarUrl:'/account/avatar'};
    });
    priv.patch('/account', async (request, reply) => {
      const parsed = z.object({ fullName: z.string().trim().max(160), jobTitle: z.string().trim().max(160).optional(), fixedPhone: z.string().trim().max(60).optional(), mobilePhone: z.string().trim().max(60).optional() }).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
      await query(`update users set full_name=nullif($1,''),
        phone_fixed=case when $2::boolean then nullif($3,'') else phone_fixed end,
        phone_mobile=case when $4::boolean then nullif($5,'') else phone_mobile end,
        job_title=case when $7::boolean then nullif($8,'') else job_title end
        where id=$6`, [parsed.data.fullName, parsed.data.fixedPhone !== undefined, parsed.data.fixedPhone || '', parsed.data.mobilePhone !== undefined, parsed.data.mobilePhone || '', request.auth!.userId, parsed.data.jobTitle !== undefined, parsed.data.jobTitle || '']);
      return { ok: true };
    });
    // Historique des demandes de rétractation de l'utilisateur (D8) : ses demandes liées au compte ou envoyées avec son adresse.
    priv.get('/account/withdrawals', async request => {
      const me = (await query('select email from users where id=$1', [request.auth!.userId])).rows[0];
      const rows = (await query(`select id,first_name as "firstName",last_name as "lastName",email,contract_reference as "contractReference",to_char(contract_date,'YYYY-MM-DD') as "contractDate",submitted_at as "submittedAt",status,receipt_delivery_status as "receiptStatus",receipt_sent_at as "receiptSentAt",processed_at as "processedAt"
        from contract_withdrawal_requests where user_id=$1 or (user_id is null and lower(email)=lower($2)) order by submitted_at desc limit 50`, [request.auth!.userId, me?.email || ''])).rows;
      return { withdrawals: rows };
    });
    priv.post('/account/change-password', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
      const parsed = z.object({ currentPassword: z.string().min(1).max(256), newPassword: passwordSchema }).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Le nouveau mot de passe doit contenir au moins 12 caractères.' });
      const sv = await changePassword(request.auth!.userId, parsed.data.currentPassword, parsed.data.newPassword);
      app.setSession(reply, await signAccessToken({ ...request.auth!, sv }));   // la session courante reste ouverte, toutes les autres sont fermées
      return { ok: true, message: 'Mot de passe modifié. Vos autres sessions ont été déconnectées.' };
    });
    priv.post('/account/logout-all', async (request, reply) => {
      await bumpSessions(request.auth!.userId);
      await revokeAllRefreshSessions(request.auth!.userId);
      app.clearSession(reply); app.clearRefreshSession(reply);
      return { ok: true };
    });

    priv.get('/billing/subscription', async request => subscriptionState(request.auth!.organizationId));
    priv.get('/billing/history', async request => ({ events: (await query('select kind,detail,created_at from subscription_events where organization_id=$1 order by created_at desc limit 50', [request.auth!.organizationId])).rows }));
    priv.post('/billing/subscription/cancel', async (request, reply) => {
      if (!['owner', 'admin'].includes(request.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
      const org = request.auth!.organizationId;
      await query("update subscriptions set cancel_at_period_end=true,canceled_at=now(),updated_at=now() where organization_id=$1", [org]);
      await subscriptionEvent(org, 'cancel_requested');
      return subscriptionState(org);
    });
    priv.post('/billing/subscription/resume', async (request, reply) => {
      if (!['owner', 'admin'].includes(request.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
      const org = request.auth!.organizationId;
      await query("update subscriptions set cancel_at_period_end=false,canceled_at=null,updated_at=now() where organization_id=$1", [org]);
      await subscriptionEvent(org, 'resume_requested');
      return subscriptionState(org);
    });
    priv.post('/billing/subscribe', async (request,reply) => {
      if (!(await legalDocumentsReadyForContracts())) return reply.code(503).send({error:'LEGAL_DOCUMENTS_UNPUBLISHED',message:'La souscription est temporairement indisponible : les documents contractuels ne sont pas publiés.'});
      const parsed = billingSubscribeSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
      const { planCode, method } = parsed.data;
      // Stripe Checkout expire après 24 h ; les anciennes demandes en attente sont purgées.
      await query("delete from billing_payment_requests where status='pending' and created_at < now()-interval '24 hours'");
      const plan=(await query('select code,name,price_ht_cents,billing_interval from plans where code=$1 and active=true',[planCode])).rows[0];
      if(!plan) return reply.code(400).send({error:'INVALID_INPUT'});
      let amount: number;
      try { amount = calculateTtcCents(Number(plan.price_ht_cents)); }
      catch { return reply.code(400).send({ error: 'INVALID_INPUT' }); }
      const org=request.auth!.organizationId, ref=`AUR-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
      if(method==='bank_transfer'){
        if(!config.BANK_TRANSFER_IBAN)return reply.code(503).send({error:'BILLING_DISABLED',message:'Le virement bancaire n’est pas encore configuré.'});
        await query(`insert into billing_payment_requests(organization_id,plan_code,method,reference,amount_ttc_cents) values($1,$2,'bank_transfer',$3,$4)`,[org,planCode,ref,amount]);
        await subscriptionEvent(org,'payment_requested',{method,planCode,reference:ref,amountTtcCents:amount});
        return {ok:true,method,planCode,reference:ref,amountTtcCents:amount,bankTransfer:{holder:config.BANK_TRANSFER_HOLDER,iban:config.BANK_TRANSFER_IBAN,bic:config.BANK_TRANSFER_BIC}};
      }
      if(!config.STRIPE_SECRET_KEY)return reply.code(503).send({error:'BILLING_DISABLED',message:'Le paiement par carte n’est pas encore configuré.'});
      const base=(config.APP_BASE_URL||'').replace(/\/$/,''); if(!base)return reply.code(503).send({error:'BILLING_DISABLED',message:'APP_BASE_URL doit être configurée pour le paiement sécurisé.'});
      const form=new URLSearchParams();
      form.set('mode','payment');form.set('success_url',`${base}/#/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`);form.set('cancel_url',`${base}/#/dashboard?billing=cancelled`);form.set('payment_method_types[0]','card');
      form.set('line_items[0][price_data][currency]','eur');form.set('line_items[0][price_data][unit_amount]',String(amount));form.set('line_items[0][price_data][product_data][name]',String(plan.name));form.set('line_items[0][quantity]','1');
      form.set('metadata[organization_id]',org);form.set('metadata[plan_code]',planCode);form.set('metadata[reference]',ref);
      const pending = (await query(
        "insert into billing_payment_requests(organization_id,plan_code,method,reference,amount_ttc_cents) values($1,$2,'card',$3,$4) returning id",
        [org,planCode,ref,amount],
      )).rows[0];
      let sr: Response; let sd: any;
      try {
        sr=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${config.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':ref},body:form,signal:AbortSignal.timeout(10_000)});
        sd=await sr.json();
      } catch (e:any) {
        request.log.warn({code:e?.name==='TimeoutError'?'STRIPE_TIMEOUT':'STRIPE_SESSION_CREATE_FAILED',paymentRequestId:pending.id},'Stripe checkout creation failed');
        if(e?.name!=='TimeoutError') await query("update billing_payment_requests set status='canceled' where id=$1 and status='pending'",[pending.id]);
        return reply.code(502).send({error:'PAYMENT_PROVIDER_UNAVAILABLE',message:'Le prestataire de paiement ne répond pas. Réessayez dans quelques instants.'});
      }
      if(!sr.ok||!sd?.url||typeof sd.id!=='string'){
        await query("update billing_payment_requests set status='canceled' where id=$1 and status='pending'",[pending.id]);
        return reply.code(502).send({error:'PAYMENT_PROVIDER_ERROR',message:'Le prestataire de paiement n’a pas pu créer la session sécurisée.'});
      }
      const linked = await query("update billing_payment_requests set provider_session_id=$1 where id=$2 and status='pending' returning id",[sd.id,pending.id]);
      if(!linked.rowCount){
        request.log.error({paymentRequestId:pending.id,sessionId:sd.id},'Stripe session created but pending request could not be linked');
        return reply.code(500).send({error:'PAYMENT_REQUEST_LINK_FAILED'});
      }
      await subscriptionEvent(org,'payment_requested',{method,planCode,reference:ref,amountTtcCents:amount});
      return {ok:true,method,planCode,reference:ref,checkoutUrl:sd.url};
    });
    priv.get('/billing/checkout/complete', async (request, reply) => {
      const parsedQuery = checkoutSessionQuerySchema.safeParse(request.query);
      if (!parsedQuery.success || !config.STRIPE_SECRET_KEY) return reply.code(400).send({ error: 'INVALID_INPUT' });
      const sessionId = parsedQuery.data.session_id;

      let stripeResponse: Response;
      let session: any;
      try {
        stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
          headers: { Authorization: `Bearer ${config.STRIPE_SECRET_KEY}` },
          signal: AbortSignal.timeout(10_000),
        });
        session = await stripeResponse.json();
      } catch (e: any) {
        request.log.warn({ code: e?.name === 'TimeoutError' ? 'STRIPE_TIMEOUT' : 'STRIPE_LOOKUP_FAILED' }, 'Stripe checkout session lookup failed');
        return reply.code(502).send({ error: 'PAYMENT_PROVIDER_UNAVAILABLE', message: 'Le statut du paiement n’a pas pu être vérifié. Réessayez dans quelques instants.' });
      }
      if (!stripeResponse.ok || session?.payment_status !== 'paid') {
        return reply.code(400).send({ error: 'PAYMENT_NOT_CONFIRMED' });
      }

      const organizationId = request.auth!.organizationId;
      const client = await db.connect();
      try {
        await client.query('begin');
        const result = await activateStripeCheckout(client, session, organizationId);
        if (!['activated', 'already_processed'].includes(result.status)) {
          await client.query('rollback');
          return reply.code(400).send({ error: 'PAYMENT_NOT_CONFIRMED' });
        }
        await client.query('commit');
      } catch (e: any) {
        await client.query('rollback').catch(() => {});
        request.log.error({ code: typeof e?.code === 'string' ? e.code : 'BILLING_ACTIVATION_FAILED' }, 'Stripe checkout activation failed');
        return reply.code(500).send({ error: 'PAYMENT_ACTIVATION_FAILED' });
      } finally {
        client.release();
      }
      // Le retour navigateur et le webhook utilisent le même verrou d'idempotence.
      return subscriptionState(organizationId);
    });
  });

  // Stripe Checkout est un paiement ponctuel : aucune reconduction automatique. L’activation est confirmée au retour du paiement.

}
