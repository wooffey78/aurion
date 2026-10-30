import crypto from 'node:crypto';
import { db, query } from '../db.js';
import { AurionError } from './errors.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { sendPlatformMail } from './platform-mailer.js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { BACKEND_ROOT } from './storage.js';

import { calculateTtcCents } from './money.js';
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const ipHash = (ip?: string) => sha256('aurion-ip:' + (ip || ''));
const RESET_MINUTES = 30;

// Cache très court de session_version : invalide instantanément les sessions après changement / réinitialisation du mot de passe.
const svCache = new Map<string, { v: number; t: number }>();
export async function sessionVersionOf(userId: string) {
  const c = svCache.get(userId);
  if (c && Date.now() - c.t < 3000) return c.v;
  const r = await query('select session_version from users where id=$1', [userId]);
  const v = r.rows[0] ? Number(r.rows[0].session_version) : -1;
  svCache.set(userId, { v, t: Date.now() });
  return v;
}
export function forgetSessionVersion(userId: string) { svCache.delete(userId); }

/** Demande de réinitialisation : ne révèle JAMAIS si le compte existe (réponse identique côté route). */
export async function requestPasswordReset(email: string, baseUrl: string, ip: string | undefined, log: any) {
  const u = (await query('select id,email from users where lower(email)=lower($1)', [email])).rows[0];
  if (!u) return;
  const recent = (await query("select count(*)::int n from password_reset_tokens where user_id=$1 and created_at>now()-interval '1 hour'", [u.id])).rows[0].n;
  if (recent >= 3) return;
  const token = crypto.randomBytes(32).toString('base64url');
  await query("insert into password_reset_tokens(user_id,token_hash,expires_at,request_ip_hash) values($1,$2,now()+($3::text||' minutes')::interval,$4)", [u.id, sha256(token), String(RESET_MINUTES), ipHash(ip)]);
  const link = `${baseUrl.replace(/\/$/, '')}/#/reset?token=${token}`;
  try {
    await sendPlatformMail(u.id, {
      to: u.email, subject: 'Réinitialisation de votre mot de passe Aurion',
      text: `Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe Aurion.\n\nCliquez sur ce lien (valable ${RESET_MINUTES} minutes, utilisable une seule fois) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.\n\nAurion`,
    });
    log.info({ event: 'password_reset_mail_sent' }, 'password reset mail sent');
  } catch (e: any) {
    log.warn({ event: 'password_reset_mail_failed', reason: String(e?.code || e?.message || e).slice(0, 80) }, 'password reset mail not sent');
  }
}

export async function validateResetToken(token: string) {
  const r = await query('select 1 from password_reset_tokens where token_hash=$1 and used_at is null and expires_at>now()', [sha256(String(token || ''))]);
  return !!r.rowCount;
}

export async function resetPassword(token: string, newPassword: string) {
  const hash = await hashPassword(newPassword);
  const c = await db.connect();
  try {
    await c.query('begin');
    const t = (await c.query('select id,user_id from password_reset_tokens where token_hash=$1 and used_at is null and expires_at>now() for update', [sha256(String(token || ''))])).rows[0];
    if (!t) { await c.query('rollback'); throw new AurionError('RESET_TOKEN_INVALID', 'Ce lien est invalide ou a expiré. Refaites une demande de réinitialisation.', 400); }
    await c.query('update users set password_hash=$1,password_changed_at=now(),session_version=session_version+1 where id=$2', [hash, t.user_id]);
    await c.query('update password_reset_tokens set used_at=now() where user_id=$1 and used_at is null', [t.user_id]);   // usage unique + invalide les autres jetons
    await c.query('commit');
    forgetSessionVersion(t.user_id);
  } catch (e) { try { await c.query('rollback'); } catch { /* déjà annulé */ } throw e; }
  finally { c.release(); }
}

export async function changePassword(userId: string, current: string, next: string) {
  const u = (await query('select password_hash from users where id=$1', [userId])).rows[0];
  if (!u || !(await verifyPassword(u.password_hash, current))) throw new AurionError('INVALID_CREDENTIALS', 'Le mot de passe actuel est incorrect.', 400);
  await query('update users set password_hash=$1,password_changed_at=now(),session_version=session_version+1 where id=$2', [await hashPassword(next), userId]);
  forgetSessionVersion(userId);
  return sessionVersionOf(userId);
}
export async function bumpSessions(userId: string) {
  await query('update users set session_version=session_version+1 where id=$1', [userId]);
  forgetSessionVersion(userId);
  return sessionVersionOf(userId);
}

// ---------------------------------------------------------------- documents légaux versionnés
const LEGAL_SEEDS: { kind: string; title: string; file: string; requiredEnv: string[] }[] = [
  { kind: 'cgv', title: 'Conditions générales d’utilisation et de vente', file: 'CGU-CGV.md', requiredEnv: ['AURION_LEGAL_PUBLISHER_NAME','AURION_LEGAL_PUBLISHER_FORM','AURION_LEGAL_PUBLISHER_SIREN','AURION_LEGAL_PUBLISHER_ADDRESS','AURION_LEGAL_PUBLISHER_EMAIL'] },
  { kind: 'privacy', title: 'Politique de confidentialité et annexe de traitement des données', file: 'POLITIQUE-CONFIDENTIALITE.md', requiredEnv: ['AURION_LEGAL_PUBLISHER_NAME','AURION_LEGAL_PUBLISHER_FORM','AURION_LEGAL_PUBLISHER_SIREN','AURION_LEGAL_PUBLISHER_ADDRESS','AURION_LEGAL_PUBLISHER_EMAIL','AURION_PRIVACY_CONTACT_EMAIL','AURION_SUBPROCESSORS'] },
  { kind: 'cookies', title: 'Politique cookies et stockages du navigateur', file: 'COOKIES.md', requiredEnv: ['AURION_LEGAL_PUBLISHER_NAME','AURION_PRIVACY_CONTACT_EMAIL'] },
  { kind: 'legal-notice', title: 'Mentions légales', file: 'LEGAL-NOTICE.md', requiredEnv: ['AURION_LEGAL_PUBLISHER_NAME','AURION_LEGAL_PUBLISHER_FORM','AURION_LEGAL_PUBLISHER_SIREN','AURION_LEGAL_PUBLISHER_SIRET','AURION_LEGAL_PUBLISHER_ADDRESS','AURION_LEGAL_PUBLISHER_VAT','AURION_LEGAL_DIRECTOR','AURION_LEGAL_PUBLISHER_EMAIL','AURION_HOST_NAME','AURION_HOST_ADDRESS','AURION_HOST_CONTACT','AURION_PRIVACY_CONTACT_EMAIL'] },
  { kind: 'accessibility', title: 'Déclaration d’accessibilité', file: 'DECLARATION-ACCESSIBILITE.md', requiredEnv: ['AURION_LEGAL_PUBLISHER_NAME','AURION_ACCESSIBILITY_CONTACT_EMAIL','AURION_ACCESSIBILITY_AUDIT_DATE','AURION_ACCESSIBILITY_AUDIT_RESULT'] },
];
const legalTokenLabel: Record<string,string> = {
  AURION_LEGAL_PUBLISHER_NAME:'raison sociale de l’éditeur', AURION_LEGAL_PUBLISHER_FORM:'forme juridique', AURION_LEGAL_PUBLISHER_SIREN:'SIREN de l’éditeur', AURION_LEGAL_PUBLISHER_SIRET:'SIRET de l’éditeur', AURION_LEGAL_PUBLISHER_ADDRESS:'adresse de l’éditeur', AURION_LEGAL_PUBLISHER_VAT:'numéro de TVA intracommunautaire ou motif de non-applicabilité', AURION_LEGAL_DIRECTOR:'directeur de la publication', AURION_LEGAL_PUBLISHER_EMAIL:'e-mail de l’éditeur', AURION_PRIVACY_CONTACT_EMAIL:'contact données personnelles', AURION_HOST_NAME:'identité de l’hébergeur contractuel', AURION_HOST_ADDRESS:'adresse de l’hébergeur contractuel', AURION_HOST_CONTACT:'numéro de téléphone et contact de l’hébergeur', AURION_SUBPROCESSORS:'liste exacte des sous-traitants', AURION_ACCESSIBILITY_CONTACT_EMAIL:'contact accessibilité', AURION_ACCESSIBILITY_AUDIT_DATE:'date de l’audit d’accessibilité', AURION_ACCESSIBILITY_AUDIT_RESULT:'résultat de l’audit d’accessibilité', LEGAL_UPDATED_AT:new Date().toLocaleDateString('fr-FR')
};
/** Initialise les documents juridiques versionnés; une approbation explicite de version est requise pour publication. */
export async function ensureLegalDocuments() {
  const publicationApproved = process.env.AURION_LEGAL_PUBLICATION_APPROVAL === '2.1';
  for (const s of LEGAL_SEEDS) {
    const f = path.join(BACKEND_ROOT, '..', 'docs', s.file);
    let body = existsSync(f) ? readFileSync(f, 'utf8') : `# ${s.title}\n\nTexte juridique indisponible.`;
    body = body.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key: string) => String(process.env[key] || `[À renseigner : ${legalTokenLabel[key] || key}]`));
    const hasUnresolvedContent = /\{\{[A-Z0-9_]+\}\}|\[(?:À compléter|À confirmer|À valider|À choisir|À désigner)[^\]]*\]|PROJET DE DOCUMENT|PROJET DE PAGE|PROJET À COMPLÉTER/i.test(body);
    const isDraft = !publicationApproved || s.requiredEnv.some(key => !String(process.env[key] || '').trim()) || hasUnresolvedContent;
    await query('update legal_documents set is_current=false where kind=$1 and is_current=true',[s.kind]);
    await query(`insert into legal_documents(kind,version,title,body,is_current,is_draft) values($1,'2.1',$2,$3,true,$4) on conflict(kind,version) do update set title=excluded.title,body=excluded.body,is_current=true,is_draft=excluded.is_draft`, [s.kind, s.title, body, isDraft]);
  }
}
export async function currentLegalDocs() {
  return (await query('select id,kind,version,title,is_draft,published_at from legal_documents where is_current=true order by kind')).rows;
}
export async function legalDocumentsReadyForContracts() {
  const rows = (await query(`select kind from legal_documents where is_current=true and is_draft=false and kind in ('cgv','privacy','legal-notice','cookies')`)).rows;
  return new Set(rows.map((row: any) => row.kind)).size === 4;
}
export async function recordAcceptances(client: { query: (q: string, v?: any[]) => Promise<any> }, userId: string, ip?: string) {
  await client.query(`insert into legal_acceptances(user_id,document_id,ip_hash) select $1,id,$2 from legal_documents where is_current=true and is_draft=false and kind in ('cgv','privacy')`, [userId, ipHash(ip)]);
}

// ---------------------------------------------------------------- abonnement (paiement désactivé : architecture uniquement)
export async function subscriptionState(orgId: string) {
  const platform=((await query(`select 1 from platform_admins pa join organization_members om on om.user_id=pa.user_id where om.organization_id=$1 limit 1`,[orgId])).rowCount ?? 0) > 0;
  const vip=((await query(`select 1 from vip_guest_accounts v join organization_members om on om.user_id=v.user_id where om.organization_id=$1 limit 1`,[orgId])).rowCount ?? 0) > 0;
  if(platform || vip) return {status:platform?'admin':'vip',planCode:null,trialStartedAt:null,trialEndsAt:null,daysLeft:0,cancelAtPeriodEnd:false,canceledAt:null,currentPeriodEnd:null,paymentEnabled:false,requiresCard:false,autoChargeAfterTrial:false,readOnly:false,dataReadOnlyUntil:null,plans:[],paymentMethods:{card:false,bankTransfer:false}};
  let s = (await query('select * from subscriptions where organization_id=$1', [orgId])).rows[0];
  if (!s) { await query("insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at,data_read_only_until) values($1,'trialing',now(),now()+interval '60 days',now()+interval '120 days') on conflict do nothing", [orgId]); s = (await query('select * from subscriptions where organization_id=$1', [orgId])).rows[0]; }
  const now = Date.now();
  let status = s.status as string;
  const trialEnd = new Date(s.trial_ends_at).getTime();
  const periodEnd = s.current_period_end ? new Date(s.current_period_end).getTime() : 0;
  if (status === 'trialing' && trialEnd < now) status = 'expired';
  if (status === 'active' && periodEnd && periodEnd < now) status = 'expired';
  if (status === 'expired' && s.status !== 'expired') await query("update subscriptions set status='expired',data_read_only_until=coalesce(data_read_only_until,coalesce(current_period_end,trial_ends_at)+interval '60 days'),updated_at=now() where organization_id=$1",[orgId]);
  const end=status==='active'&&periodEnd?periodEnd:trialEnd;
  const daysLeft=(status==='trialing'||status==='active')?Math.max(0,Math.ceil((end-now)/86400000)):0;
  const readOnly=status==='expired';
  const plans=(await query('select code,name,price_ht_cents,billing_interval,trial_days from plans where active=true order by price_ht_cents')).rows.map((plan:any)=>({...plan,price_ttc_cents:calculateTtcCents(Number(plan.price_ht_cents))}));
  const paymentMethods={card:!!process.env.STRIPE_SECRET_KEY,bankTransfer:!!process.env.BANK_TRANSFER_IBAN};
  return {status,planCode:s.plan_code,trialStartedAt:s.trial_started_at,trialEndsAt:s.trial_ends_at,daysLeft,cancelAtPeriodEnd:s.cancel_at_period_end,canceledAt:s.canceled_at,currentPeriodEnd:s.current_period_end,paymentEnabled:paymentMethods.card||paymentMethods.bankTransfer,requiresCard:paymentMethods.card,autoChargeAfterTrial:false,readOnly,dataReadOnlyUntil:s.data_read_only_until||null,plans,paymentMethods};
}
export async function subscriptionEvent(orgId: string, kind: string, detail?: unknown) {
  await query('insert into subscription_events(organization_id,kind,detail) values($1,$2,$3)', [orgId, kind, detail ? JSON.stringify(detail) : null]);
}
