import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';
import { loadSignature, saveSignature, renderSignature } from '../services/signature.js';
import { companyDisplayName } from '../services/company.js';
import { getTheme, saveTheme, resetTheme, defaultTheme } from '../services/theme.js';
import { computeMentions } from '../services/mentions.js';
import { profileFor } from '../services/profiles.js';

const short = (n: number) => z.string().trim().max(n).optional().default('');
export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);
  const canEdit = (r: any) => ['owner', 'admin'].includes(r.auth!.role);

  // ---- signature d'e-mail (utilisée automatiquement pour devis, factures, rendez-vous, rappels)
  app.get('/settings/email-signature', async r => {
    const org = r.auth!.organizationId, sig = await loadSignature(org);
    return { signature: sig, preview: renderSignature(sig, await companyDisplayName(org)).trim() };
  });
  app.put('/settings/email-signature', async (r, reply) => {
    if (!canEdit(r)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const p = z.object({ enabled: z.boolean().optional().default(true), firstName: short(120), lastName: short(120), jobTitle: short(160), company: short(200), phone: short(60), website: short(240), address: short(300), extra: short(600) }).safeParse(r.body);
    if (!p.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    await saveSignature(r.auth!.organizationId, p.data);
    const org = r.auth!.organizationId;
    return { ok: true, preview: renderSignature(await loadSignature(org), await companyDisplayName(org)).trim() };
  });

  // ---- thème visuel des documents (propre à chaque entreprise, modifiable)
  app.get('/settings/document-theme', async r => ({ theme: await getTheme(r.auth!.organizationId), suggested: defaultTheme(r.auth!.organizationId) }));
  app.put('/settings/document-theme', async (r, reply) => {
    if (!canEdit(r)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const p = z.object({ accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), font: z.enum(['sans', 'serif']).optional(), radius: z.enum(['round', 'square']).optional() }).safeParse(r.body);
    if (!p.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    return { theme: await saveTheme(r.auth!.organizationId, p.data) };
  });
  app.delete('/settings/document-theme', async (r, reply) => { if (!canEdit(r)) return reply.code(403).send({ error: 'FORBIDDEN' }); return { theme: await resetTheme(r.auth!.organizationId) }; });

  // ---- contrôle des mentions légales d'une activité (provenance de chaque mention)
  app.post('/documents/check-mentions', async (r, reply) => {
    const b: any = r.body || {};
    const org = r.auth!.organizationId;
    const a = (await query('select a.*,o.name company_name,o.siret,o.siren,(select profile_code from activity_profile_overrides where activity_id=a.id) profile_override from activities a join organizations o on o.id=a.organization_id where a.organization_id=$1 and ($2::uuid is null or a.id=$2) order by a.created_at limit 1', [org, b.activityId || null])).rows[0];
    if (!a) return reply.code(404).send({ error: 'NOT_FOUND' });
    const profile = profileFor(a.name, a.description || '', a.profile_override);
    const kind = b.kind === 'invoice' ? 'invoice' : 'quote';
    const mentions = computeMentions({ kind, profileCode: profile.code, company: { name: await companyDisplayName(org, a.id), siret: a.siret, siren: a.siren }, activity: a });
    return { kind, profile: profile.code, mentions, missing: mentions.filter(m => m.source === 'needs_confirmation').map(m => ({ key: m.key, note: m.note })) };
  });
}
