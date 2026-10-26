import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { signAccessToken } from '../plugins/auth.js';
import {
  requestPasswordReset, validateResetToken, resetPassword, changePassword, bumpSessions, currentLegalDocs,
  subscriptionState, subscriptionEvent,
} from '../services/account.js';
import { AurionError } from '../services/errors.js';
import { revokeAllRefreshSessions } from '../services/native-sessions.js';
import { savePrivateUpload, fileFromKey } from '../services/storage.js';
import { readFile } from 'node:fs/promises';
import { unlink } from 'node:fs/promises';

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(12).max(256);
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

  // ------------------------------------------------------------ authentifiées : compte, sécurité, abonnement
  app.register(async (priv: FastifyInstance) => {
    priv.addHook('preHandler', app.requireAuth);

    priv.get('/account', async request => {
      const a = request.auth!;
      const u = (await query('select id,email,full_name,created_at,password_changed_at,avatar_key from users where id=$1', [a.userId])).rows[0];
      const o = (await query('select id,name from organizations where id=$1', [a.organizationId])).rows[0];
      const acc = (await query(`select d.kind,d.version,d.title,d.is_draft,x.accepted_at from legal_acceptances x join legal_documents d on d.id=x.document_id where x.user_id=$1 order by x.accepted_at desc`, [a.userId])).rows;
      return {
        user: { id: u.id, email: u.email, fullName: u.full_name || '', createdAt: u.created_at, passwordChangedAt: u.password_changed_at, avatarUrl: u.avatar_key ? '/account/avatar' : null },
        role: a.role, organization: o, legalAcceptances: acc, subscription: await subscriptionState(a.organizationId),
      };
    });
    priv.get('/account/avatar', async (request, reply) => {
      const row=(await query('select avatar_key from users where id=$1',[request.auth!.userId])).rows[0];
      if(!row?.avatar_key)return reply.code(404).send({error:'NOT_FOUND',message:'Aucun avatar enregistré.'});
      try{
        const key=String(row.avatar_key);
        const mime=key.toLowerCase().endsWith('.png')?'image/png':key.toLowerCase().endsWith('.webp')?'image/webp':'image/jpeg';
        const buf=await readFile(fileFromKey(key));
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
      if(old){try{await unlink(fileFromKey(String(old)));}catch{}}
      return {ok:true,avatarUrl:'/account/avatar'};
    });
    priv.patch('/account', async (request, reply) => {
      const parsed = z.object({ fullName: z.string().trim().max(160) }).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
      await query('update users set full_name=nullif($1,\'\') where id=$2', [parsed.data.fullName, request.auth!.userId]);
      return { ok: true };
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
      const b:any=request.body||{}, planCode=String(b.planCode||''), method=String(b.method||'');
      const plan=(await query('select code,name,price_ht_cents,billing_interval from plans where code=$1 and active=true',[planCode])).rows[0];
      if(!plan||!['monthly','yearly'].includes(planCode)||!['card','bank_transfer'].includes(method))return reply.code(400).send({error:'INVALID_INPUT'});
      const amount=Math.round(Number(plan.price_ht_cents)*1.20);
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
      const sr=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${config.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body:form});
      const sd:any=await sr.json(); if(!sr.ok||!sd.url)return reply.code(502).send({error:'PAYMENT_PROVIDER_ERROR',message:'Le prestataire de paiement n’a pas pu créer la session sécurisée.'});
      await query(`insert into billing_payment_requests(organization_id,plan_code,method,reference,amount_ttc_cents,provider_session_id) values($1,$2,'card',$3,$4,$5)`,[org,planCode,ref,amount,sd.id]);
      await subscriptionEvent(org,'payment_requested',{method,planCode,reference:ref,amountTtcCents:amount});
      return {ok:true,method,planCode,reference:ref,checkoutUrl:sd.url};
    });
    priv.get('/billing/checkout/complete',async(request,reply)=>{
      const sessionId=String((request.query as any)?.session_id||''); if(!sessionId||!config.STRIPE_SECRET_KEY)return reply.code(400).send({error:'INVALID_INPUT'});
      const sr=await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,{headers:{Authorization:`Bearer ${config.STRIPE_SECRET_KEY}`}}); const sd:any=await sr.json();
      if(!sr.ok||sd.payment_status!=='paid'||sd.metadata?.organization_id!==request.auth!.organizationId)return reply.code(400).send({error:'PAYMENT_NOT_CONFIRMED'});
      const planCode=String(sd.metadata?.plan_code||''); const plan=(await query('select code,billing_interval from plans where code=$1',[planCode])).rows[0]; if(!plan)return reply.code(400).send({error:'INVALID_INPUT'});
      const start=new Date(); const end=new Date(start); if(plan.billing_interval==='year')end.setFullYear(end.getFullYear()+1);else end.setMonth(end.getMonth()+1);
      await query(`update subscriptions set status='active',plan_code=$2,current_period_start=$3,current_period_end=$4,cancel_at_period_end=false,canceled_at=null,data_read_only_until=$4+interval '60 days',payment_method='card',billing_reference=$5,updated_at=now() where organization_id=$1`,[request.auth!.organizationId,planCode,start,end,String(sd.metadata.reference||sessionId)]);
      await query(`update billing_payment_requests set status='paid',paid_at=now() where provider_session_id=$1 and organization_id=$2`,[sessionId,request.auth!.organizationId]);
      await subscriptionEvent(request.auth!.organizationId,'payment_succeeded',{method:'card',planCode,reference:String(sd.metadata.reference||sessionId)});
      return subscriptionState(request.auth!.organizationId);
    });
  });

  // Stripe Checkout est un paiement ponctuel : aucune reconduction automatique. L’activation est confirmée au retour du paiement.

}
