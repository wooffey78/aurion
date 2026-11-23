// 15.4.50 — Routes de modularité métier : fonctionnalités proposées selon le profil de
// l'activité active, bibliothèque de prestations types et rapport mensuel du dirigeant.
// Les propositions sont CONDITIONNÉES AU MÉTIER (profile-features.ts) : une fonctionnalité
// sans rapport avec l'activité n'est jamais suggérée — elle peut rester accessible par
// configuration explicite, mais le produit ne pousse pas ce qui n'a pas de sens.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, sqlExecutor } from '../db.js';
import { featuresForProfile, FEATURE_PROFILE_CODES } from '../services/profile-features.js';
import { libraryForProfile, upsertOverride, seedFromEmbeddedCatalog } from '../services/service-library.js';
import { monthlyReportData } from '../services/monthly-report.js';

export async function profileFeatureRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** Fonctionnalités de l'activité ACTIVE (ou du profil demandé) — consommé par l'interface. */
  app.get('/profile-features', async r => {
    const org = r.auth!.organizationId;
    const requested = String((r.query as any)?.profileCode || '').trim();
    let code = requested;
    if (!code) {
      const aid = (r.headers['x-aurion-activity-id'] as string) || null;
      // activity_profile_overrides est clé par activité (sans colonne organisation) :
      // le tenant est porté par la jointure sur activities (RLS 074).
      const row = aid
        ? (await query(`select o.profile_code as "code" from activity_profile_overrides o join activities a on a.id=o.activity_id where o.activity_id=$2 and a.organization_id=$1`, [org, aid])).rows[0]
        : (await query(`select o.profile_code as "code" from activity_profile_overrides o join activities a on a.id=o.activity_id where a.organization_id=$1 order by o.updated_at desc limit 1`, [org])).rows[0];
      code = String(row?.code || '');
    }
    return { ...featuresForProfile(code), catalog: FEATURE_PROFILE_CODES.length };
  });

  // Bibliothèque de prestations types du profil (prix indicatifs, confirmations gagnent).
  app.get('/profile-services', async (r, reply) => {
    const org = r.auth!.organizationId;
    const code = String((r.query as any)?.profileCode || '').trim();
    if (!code) return reply400(reply, 'profileCode requis.');
    const lib = await libraryForProfile(sqlExecutor, org, code);
    return lib;
  });

  app.put('/profile-services', async (r, reply) => {
    if (!['owner', 'admin'].includes(r.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Personnalisation réservée au chef d\u2019entreprise (ou administrateur).' });
    const org = r.auth!.organizationId;
    const body = z.object({
      profileCode: z.string().trim().max(40),
      label: z.string().trim().min(2).max(160),
      unit: z.string().trim().max(30).optional(),
      defaultPriceCents: z.union([z.number().int().min(0), z.literal(''), z.null()]).optional(),
      typicalMinutes: z.union([z.number().int().min(0).max(6000), z.literal(''), z.null()]).optional(),
    }).safeParse(r.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Profil et libellé requis ; prix/durée optionnels (ils restent indicatifs jusqu\u2019à confirmation).' });
    const saved = await upsertOverride(org, body.data.profileCode, {
      label: body.data.label, unit: body.data.unit ?? null,
      defaultPriceCents: body.data.defaultPriceCents === '' || body.data.defaultPriceCents === undefined ? null : body.data.defaultPriceCents ?? null,
      typicalMinutes: body.data.typicalMinutes === '' || body.data.typicalMinutes === undefined ? null : body.data.typicalMinutes ?? null,
      updatedBy: r.auth!.userId,
    });
    return saved;
  });

  /** Rapport mensuel du dirigeant (B7) : données réelles, sections chartables au choix. */
  app.get('/reports/monthly', async (r, reply) => {
    const org = r.auth!.organizationId;
    const month = String((r.query as any)?.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) return reply.code(400).send({ error: 'MONTH_INVALID', message: 'Fournissez un mois au format AAAA-MM.' });
    return monthlyReportData(sqlExecutor, org, month);
  });
}

function reply400(reply: any, message: string) {
  return reply.code(400).send({ error: 'INVALID_INPUT', message });
}

/** Amorçage idempotent de la bibliothèque globale (appelé à la première consultation). */
export async function ensureServiceLibrarySeeded(): Promise<void> {
  await seedFromEmbeddedCatalog();
}
