import nodemailer from 'nodemailer';
import { query } from '../db.js';
import { AurionError } from './errors.js';
import { encryptSecret, decryptSecret } from './secrets.js';
import { connection, gmailSend } from './google.js';
import { companyDisplayName } from './company.js';

export type Security = 'ssl' | 'starttls' | 'none';
export interface MailSettings { email: string; password: string; host: string; port: number; security: Security; username?: string; fromName?: string }
export interface Preset { id: string; label: string; domains: string[]; host: string; port: number; security: Security; appPassword: boolean; appPasswordUrl?: string; note?: string }

export const PRESETS: Preset[] = [
  { id: 'gmail', label: 'Gmail / Google Workspace', domains: ['gmail.com', 'googlemail.com'], host: 'smtp.gmail.com', port: 465, security: 'ssl', appPassword: true, appPasswordUrl: 'https://myaccount.google.com/apppasswords' },
  { id: 'outlook', label: 'Outlook / Hotmail', domains: ['outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.com', 'live.fr', 'msn.com'], host: 'smtp-mail.outlook.com', port: 587, security: 'starttls', appPassword: true, appPasswordUrl: 'https://account.live.com/proofs/AppPassword', note: 'Microsoft restreint l’envoi par mot de passe : si la vérification échoue, préférez une autre messagerie.' },
  { id: 'yahoo', label: 'Yahoo', domains: ['yahoo.com', 'yahoo.fr', 'ymail.com'], host: 'smtp.mail.yahoo.com', port: 465, security: 'ssl', appPassword: true, appPasswordUrl: 'https://login.yahoo.com/account/security' },
  { id: 'icloud', label: 'iCloud', domains: ['icloud.com', 'me.com', 'mac.com'], host: 'smtp.mail.me.com', port: 587, security: 'starttls', appPassword: true, appPasswordUrl: 'https://appleid.apple.com/account/manage' },
  { id: 'orange', label: 'Orange', domains: ['orange.fr', 'wanadoo.fr'], host: 'smtp.orange.fr', port: 465, security: 'ssl', appPassword: false },
  { id: 'free', label: 'Free', domains: ['free.fr'], host: 'smtp.free.fr', port: 465, security: 'ssl', appPassword: false },
  { id: 'sfr', label: 'SFR', domains: ['sfr.fr', 'neuf.fr'], host: 'smtp.sfr.fr', port: 465, security: 'ssl', appPassword: false },
  { id: 'laposte', label: 'La Poste', domains: ['laposte.net'], host: 'smtp.laposte.net', port: 465, security: 'ssl', appPassword: false },
  { id: 'custom', label: 'Autre messagerie', domains: [], host: '', port: 465, security: 'ssl', appPassword: false },
];
export const presetById = (id?: string) => PRESETS.find(p => p.id === id);
export function detectPreset(email: string) {
  const d = String(email).toLowerCase().split('@')[1] || '';
  return PRESETS.find(p => p.domains.includes(d));
}

const isLocalHost = (h: string) => ['localhost', '127.0.0.1', '::1'].includes(h.toLowerCase());

export function normalizeSettings(input: any, fallbackPassword?: string): MailSettings {
  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AurionError('INVALID_INPUT', 'Adresse e-mail invalide.');
  const preset = presetById(input?.provider) && input.provider !== 'custom' ? presetById(input.provider)! : (input?.provider === 'custom' ? presetById('custom')! : detectPreset(email) || presetById('custom')!);
  const host = String(input?.host || preset.host || '').trim();
  const port = Number(input?.port || preset.port);
  const security = (['ssl', 'starttls', 'none'].includes(input?.security) ? input.security : preset.security) as Security;
  const password = String(input?.password || fallbackPassword || '');
  if (!password) throw new AurionError('INVALID_INPUT', 'Le mot de passe est obligatoire.');
  if (!host) throw new AurionError('INVALID_INPUT', 'Serveur d’envoi (SMTP) manquant : ouvrez les paramètres avancés.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AurionError('INVALID_INPUT', 'Port invalide.');
  if (security === 'none' && !isLocalHost(host)) throw new AurionError('INVALID_INPUT', 'Une connexion non chiffrée n’est autorisée que vers le poste local.');
  return { email, password, host, port, security, username: String(input?.username || email).trim(), fromName: String(input?.fromName || '').trim() || undefined };
}

export function makeTransport(s: MailSettings) {
  return nodemailer.createTransport({
    host: s.host, port: s.port, secure: s.security === 'ssl', requireTLS: s.security === 'starttls', ignoreTLS: s.security === 'none',
    auth: { user: s.username || s.email, pass: s.password },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 45000,
  });
}

function mapMailError(e: any, s: MailSettings) {
  const preset = detectPreset(s.email) || presetById(s.host.includes('gmail') ? 'gmail' : undefined);
  if (e instanceof AurionError) return e;
  const code = String(e?.code || '');
  if (code === 'EAUTH' || e?.responseCode === 535 || e?.responseCode === 534) {
    const hint = preset?.appPassword ? ' Avec ce fournisseur, le mot de passe habituel est refusé : créez un « mot de passe d’application » (validation en 2 étapes requise).' : '';
    return new AurionError('MAIL_AUTH_FAILED', 'Identifiants refusés par le serveur de messagerie.' + hint);
  }
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ENOTFOUND', 'ECONNREFUSED', 'EDNS'].includes(code))
    return new AurionError('MAIL_CONNECTION_FAILED', `Impossible de joindre ${s.host}:${s.port}. Vérifiez votre connexion Internet ou les paramètres avancés (serveur, port, sécurité).`, 502);
  return new AurionError('MAIL_SEND_FAILED', 'Envoi impossible : ' + String(e?.message || e), 502);
}

export async function verifySettings(s: MailSettings) {
  const t = makeTransport(s);
  try { await t.verify(); } catch (e) { throw mapMailError(e, s); } finally { t.close(); }
}

export async function sendWithSettings(s: MailSettings, mail: nodemailer.SendMailOptions) {
  const t = makeTransport(s);
  try {
    return await t.sendMail({ from: { name: s.fromName || '', address: s.email }, replyTo: s.email, ...mail });
  } catch (e) { throw mapMailError(e, s); } finally { t.close(); }
}

// ---------------------------------------------------------------- stockage par entreprise
export async function loadSettings(orgId: string): Promise<MailSettings | null> {
  const r = await query('select * from mail_accounts where organization_id=$1', [orgId]);
  const a = r.rows[0];
  if (!a) return null;
  let password = '';
  try { password = decryptSecret(a.password_enc); } catch { throw new AurionError('MAIL_SECRET_UNREADABLE', 'Le mot de passe de messagerie n’est plus lisible : saisissez-le à nouveau dans Paramètres → Messagerie & agenda.'); }
  return { email: a.email, password, host: a.smtp_host, port: a.smtp_port, security: a.security, username: a.username, fromName: a.from_name || undefined };
}

export async function saveSettings(orgId: string, s: MailSettings, provider: string) {
  await query(
    `insert into mail_accounts(organization_id,provider,email,username,password_enc,smtp_host,smtp_port,security,from_name,verified_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     on conflict(organization_id) do update set provider=excluded.provider,email=excluded.email,username=excluded.username,password_enc=excluded.password_enc,
       smtp_host=excluded.smtp_host,smtp_port=excluded.smtp_port,security=excluded.security,from_name=excluded.from_name,verified_at=now(),updated_at=now()`,
    [orgId, provider, s.email, s.username || s.email, encryptSecret(s.password), s.host, s.port, s.security, s.fromName || null]);
}

export async function deleteSettings(orgId: string) { await query('delete from mail_accounts where organization_id=$1', [orgId]); }

export async function mailStatus(orgId: string) {
  const r = await query('select provider,email,smtp_host,smtp_port,security,from_name,verified_at from mail_accounts where organization_id=$1', [orgId]);
  const a = r.rows[0];
  const g = await connection(orgId).catch(() => null);
  return {
    configured: !!a || !!g, method: a ? 'smtp' : g ? 'google' : null,
    account: a ? { provider: a.provider, email: a.email, host: a.smtp_host, port: a.smtp_port, security: a.security, fromName: a.from_name, verifiedAt: a.verified_at } : null,
    google: { configured: !!process.env.GOOGLE_CLIENT_ID, connected: !!g, email: g?.row?.google_email || null },
  };
}

export async function mailConfigured(orgId: string) { return (await mailStatus(orgId)).configured; }

export interface OrgMail { to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer; contentType?: string }[]; icalEvent?: { method: string; content: string; filename?: string } }

/** Envoi unique pour toute l'application : messagerie de l'entreprise, sinon compte Google OAuth. */
export async function sendOrgMail(orgId: string, mail: OrgMail) {
  const s = await loadSettings(orgId);
  if (s) { await sendWithSettings({ ...s, fromName: s.fromName || await companyDisplayName(orgId) }, mail as any); return { via: 'smtp' as const }; }
  const g = await connection(orgId).catch(() => null);
  if (g && !mail.icalEvent) {
    await gmailSend(orgId, mail.to, mail.subject, mail.text, mail.attachments?.[0]);
    return { via: 'google' as const };
  }
  throw new AurionError('MAIL_NOT_CONFIGURED', 'La messagerie n’est pas configurée. Ouvrez Paramètres → Messagerie & agenda pour renseigner votre adresse e-mail (une seule fois).');
}
