import { config } from '../config.js';
import { query } from '../db.js';
import { makeTransport, normalizeSettings, sendOrgMail } from './mail.js';

/**
 * E-mails de la PLATEFORME (réinitialisation de mot de passe...) : indépendants de la messagerie des utilisateurs.
 * Variables : PLATFORM_SMTP_HOST / PORT / SECURITY / USER / PASS / FROM.
 * À défaut, repli sur la messagerie de l'organisation du compte concerné (si elle est configurée), sinon l'envoi échoue proprement.
 */
export function platformMailerConfigured() { return !!config.PLATFORM_SMTP_HOST; }

export async function sendPlatformMail(userId: string, mail: { to: string; subject: string; text: string; attachments?: Array<{ filename: string; content: Buffer }> }) {
  if (config.PLATFORM_SMTP_HOST) {
    const s = normalizeSettings({ email: config.PLATFORM_SMTP_FROM || config.PLATFORM_SMTP_USER, password: config.PLATFORM_SMTP_PASS, username: config.PLATFORM_SMTP_USER || config.PLATFORM_SMTP_FROM, host: config.PLATFORM_SMTP_HOST, port: config.PLATFORM_SMTP_PORT, security: config.PLATFORM_SMTP_SECURITY, provider: 'custom', fromName: 'Aurion' });
    const t = makeTransport(s);
    try { await t.sendMail({ from: { name: 'Aurion', address: s.email }, ...mail }); } finally { t.close(); }
    return 'platform' as const;
  }
  const m = (await query('select organization_id from organization_members where user_id=$1 limit 1', [userId])).rows[0];
  if (!m) throw new Error('NO_MAIL_TRANSPORT');
  await sendOrgMail(m.organization_id, mail);
  return 'organization' as const;
}
