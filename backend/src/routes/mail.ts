import type { FastifyInstance } from 'fastify';
import { AurionError } from '../services/errors.js';
import { PRESETS, detectPreset, loadSettings, normalizeSettings, verifySettings, saveSettings, deleteSettings, mailStatus, sendWithSettings } from '../services/mail.js';
import { companyDisplayName } from '../services/company.js';

/** Messagerie de l'entreprise : saisie une seule fois dans l'interface Aurion (jamais dans PowerShell). */
export async function mailRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);
  const canEdit = (r: any) => ['owner', 'admin'].includes(r.auth!.role);

  app.get('/integrations/mail/status', async r => ({
    ...(await mailStatus(r.auth!.organizationId)),
    presets: PRESETS.map(p => ({ id: p.id, label: p.label, host: p.host, port: p.port, security: p.security, appPassword: p.appPassword, appPasswordUrl: p.appPasswordUrl, note: p.note, domains: p.domains })),
  }));

  app.put('/integrations/mail', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (r, reply) => {
    if (!canEdit(r)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const org = r.auth!.organizationId, b: any = r.body || {};
    let existing = null; try { existing = await loadSettings(org); } catch { existing = null; }
    const keep = existing && existing.email === String(b.email || '').trim().toLowerCase() ? existing.password : undefined;
    const s = normalizeSettings(b, keep);
    await verifySettings(s);
    const provider = b.provider && b.provider !== 'auto' ? String(b.provider) : (detectPreset(s.email)?.id || 'custom');
    await saveSettings(org, s, provider);
    return { ok: true, status: await mailStatus(org) };
  });

  app.post('/integrations/mail/test', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (r) => {
    const s = await loadSettings(r.auth!.organizationId);
    if (!s) throw new AurionError('MAIL_NOT_CONFIGURED', 'La messagerie n’est pas configurée.');
    const company = await companyDisplayName(r.auth!.organizationId);
    await sendWithSettings({ ...s, fromName: s.fromName || company }, { to: s.email, subject: 'Aurion : messagerie connectée', text: `Bonjour,\n\nCe message confirme que votre messagerie est correctement connectée à Aurion : vos devis, factures et rendez-vous seront envoyés depuis cette adresse, signés « ${company} ».\n\nAurion` });
    return { ok: true, sentTo: s.email };
  });

  app.delete('/integrations/mail', async (r, reply) => {
    if (!canEdit(r)) return reply.code(403).send({ error: 'FORBIDDEN' });
    await deleteSettings(r.auth!.organizationId);
    return { ok: true };
  });
}
