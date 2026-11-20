import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { query } from '../db.js';
import { loadSignature, saveSignature, renderSignature } from '../services/signature.js';
import { companyDisplayName } from '../services/company.js';
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
    const p = z.object({ enabled: z.boolean().optional().default(true), firstName: short(120), lastName: short(120), jobTitle: short(160), company: short(200), phone: short(60), website: short(240), address: short(300), extra: short(600), includeQuotes: z.boolean().optional().default(true), includeInvoices: z.boolean().optional().default(true), includeProfessional: z.boolean().optional().default(true) }).safeParse(r.body);
    if (!p.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    await saveSignature(r.auth!.organizationId, p.data);
    const org = r.auth!.organizationId;
    const saved = await loadSignature(org);
    return { ok: true, signature: saved, preview: renderSignature(saved, await companyDisplayName(org)).trim() };
  });

  // ---- synchronisation globale du compte : une seule version serveur pour toutes les données persistées
  app.get('/sync/version', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (r, reply) => {
    const row = (await query('select revision, updated_at from account_sync_versions where organization_id=$1', [r.auth!.organizationId])).rows[0];
    const payload = { revision: Number(row?.revision || 0), updatedAt: row?.updated_at || null, organizationId: r.auth!.organizationId, userId: r.auth!.userId };
    const etag = '"' + createHash('sha256').update(JSON.stringify(payload)).digest('base64url') + '"';
    reply.header('ETag', etag).header('Cache-Control', 'private, no-cache');
    const requested = String(r.headers['if-none-match'] || '').split(',').map(x => x.trim());
    if (requested.includes('*') || requested.includes(etag)) return reply.code(304).send();
    return reply.send(payload);
  });

  // ---- brouillon de devis/facture synchronisé entre appareils, cloisonné par compte et entreprise
  app.get('/settings/draft', async r => {
    const row = (await query<{ payload: unknown; updated_at: string }>(
      'select payload, updated_at from user_drafts where organization_id=$1 and user_id=$2 and draft_key=$3',
      [r.auth!.organizationId, r.auth!.userId, 'quote'],
    )).rows[0];
    return { draft: row?.payload ?? null, updatedAt: row?.updated_at ?? null };
  });
  app.put('/settings/draft', async (r, reply) => {
    const body = r.body as { payload?: unknown } | undefined;
    if (!body?.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      return reply.code(400).send({ error: 'INVALID_DRAFT' });
    }
    let serialized: string;
    try { serialized = JSON.stringify(body.payload); } catch { return reply.code(400).send({ error: 'INVALID_DRAFT' }); }
    if (Buffer.byteLength(serialized, 'utf8') > 200_000) return reply.code(413).send({ error: 'DRAFT_TOO_LARGE' });
    await query(
      `insert into user_drafts(organization_id,user_id,draft_key,payload,updated_at)
       values($1,$2,$3,$4::jsonb,now())
       on conflict(organization_id,user_id,draft_key) do update set payload=excluded.payload,updated_at=now()`,
      [r.auth!.organizationId, r.auth!.userId, 'quote', serialized],
    );
    return { ok: true, updatedAt: new Date().toISOString() };
  });
  app.delete('/settings/draft', async r => {
    await query('delete from user_drafts where organization_id=$1 and user_id=$2 and draft_key=$3',
      [r.auth!.organizationId, r.auth!.userId, 'quote']);
    return { ok: true };
  });

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
