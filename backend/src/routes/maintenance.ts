// 15.4.50 — Routes contrats d'entretien (B2), chaîne d'intégrité documentaire (B5) et
// historique de prix matériaux (B4). Génération de rendez-vous = propositions VALIDÉES par
// l'entrepreneur via l'agenda existant (jamais d'automate fermé) ; la chaîne d'intégrité est
// append-only ; l'analyse de prix ne consomme QUE les achats réels de l'entreprise.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, db, beginTenant, sqlExecutor } from '../db.js';
import { createContract, proposeContractSchedule, FREQUENCY_MONTHS, type ContractFrequency } from '../services/maintenance-contracts.js';
import { computeChainEntry, verifyChain, type ChainEntry } from '../services/integrity-chain.js';
import { analyzePriceTrend, type PricePoint } from '../services/price-history.js';
import { emitOrgEvent } from '../services/events.js';
import type { SqlExecutor } from '../services/sql-executor.js';

export async function maintenanceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/maintenance/contracts', async r => {
    const org = r.auth!.organizationId;
    const rows = (await query(
      `select c.id,c.name,c.client_id as "clientId",cl.name as "clientName",c.frequency,c.weekday,c.preferred_time as "preferredTime",
              c.duration_minutes as "durationMinutes",c.agreed_amount_cents as "agreedAmountCents",c.first_occurrence as "firstOccurrence",
              c.status,c.notes,c.created_at as "createdAt",
              (select count(*)::int from appointments a where a.organization_id=c.organization_id and a.title like ('%' || c.name || '%')) as "scheduledCount"
       from maintenance_contracts c left join clients cl on cl.id=c.client_id
       where c.organization_id=$1 order by c.created_at desc limit 200`, [org],
    )).rows;
    return { contracts: rows, frequencies: Object.keys(FREQUENCY_MONTHS) };
  });

  app.post('/maintenance/contracts', async (r, reply) => {
    const org = r.auth!.organizationId;
    const body = z.object({
      name: z.string().trim().min(2).max(200),
      clientId: z.string().uuid(),
      frequency: z.enum(['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual']),
      weekday: z.number().int().min(0).max(6),
      preferredTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      durationMinutes: z.number().int().min(15).max(600).default(120),
      agreedAmountCents: z.union([z.number().int().min(0), z.literal(''), z.null()]).optional(),
      firstOccurrence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: z.string().max(2000).optional(),
    }).safeParse(r.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Nom, client, fréquence, jour de semaine et première occurrence requis.' });
    try {
      return await createContract(org, { ...body.data, agreedAmountCents: body.data.agreedAmountCents === '' || body.data.agreedAmountCents === undefined ? null : body.data.agreedAmountCents ?? null, createdBy: r.auth!.userId });
    } catch (e: any) {
      return reply.code(400).send({ error: 'CONTRACT_INVALID', message: String(e?.message || e) });
    }
  });

  /** Occurrences proposées pour la fenêtre — rien n'est créé : validation humaine ensuite. */
  app.get('/maintenance/contracts/:id/schedule', async (r, reply) => {
    const org = r.auth!.organizationId;
    const id = String((r.params as any).id);
    const from = String((r.query as any)?.from || new Date().toISOString().slice(0, 10));
    const to = String((r.query as any)?.to || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    try {
      return await proposeContractSchedule(sqlExecutor, org, id, from, to);
    } catch (e: any) {
      if (e?.message === 'CONTRACT_NOT_FOUND') return reply.code(404).send({ error: 'NOT_FOUND', message: 'Contrat introuvable.' });
      if (e?.message === 'CONTRACT_WINDOW_INVALID') return reply.code(400).send({ error: 'WINDOW_INVALID', message: 'Fenêtre de planification invalide.' });
      throw e;
    }
  });
}

export async function integrityRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/integrity/chain', async r => {
    const org = r.auth!.organizationId;
    const rows = (await query(
      `select document_id as "documentId",document_kind as "documentKind",document_number as "documentNumber",
              sha256,chain_hash as "chainHash",prev_chain_hash as "prevChainHash",recorded_at as "recordedAt"
       from document_integrity_chain where organization_id=$1 order by recorded_at asc limit 2000`, [org],
    )).rows.map((r2: any) => ({
      documentId: String(r2.documentId), documentKind: r2.documentKind, documentNumber: r2.documentNumber,
      sha256: String(r2.sha256), chainHash: String(r2.chainHash), prevChainHash: r2.prevChainHash ?? null,
      recordedAt: new Date(r2.recordedAt).toISOString(),
    }));
    const verification = verifyChain(rows as ChainEntry[]);
    return { ...verification, entries: rows.length };
  });
}

// 15.4.51 (PROMPT B3) — la fonction est déplacée dans services/integrity-chain.ts pour être
// appelée par le flux d'émission des factures (routes/business.ts). Réexport conservé :
// les importations existantes (tests de rejeu) restent valables sans modification.
export { recordDocumentIntegrity } from '../services/integrity-chain.js';

export async function priceHistoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/price-history/:partId', async (r, reply) => {
    const org = r.auth!.organizationId;
    const partId = String((r.params as any).partId);
    if (!/^[0-9a-f-]{36}$/i.test(partId)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const threshold = Math.max(1, Math.min(200, Math.round(Number((r.query as any)?.alertThresholdPct ?? 10))));
    const rows = (await query(
      `select observed_at as "observedAt",unit_cost_cents as "unitCostCents",source,supplier_id as "supplierId"
       from part_price_history where organization_id=$1 and part_id=$2 order by observed_at asc limit 500`,
      [org, partId],
    )).rows;
    const points: PricePoint[] = rows.map((r2: any) => ({ observedAt: new Date(r2.observedAt).toISOString().slice(0, 10), unitCostCents: Number(r2.unitCostCents) }));
    const trend = analyzePriceTrend(points, threshold);
    if (trend.alert) {
      const part = (await query(`select name from parts where id=$2 and organization_id=$1`, [org, partId])).rows[0];
      await emitOrgEvent(org, {
        type: 'part_price_alert',
        title: `Hausse de prix : ${part?.name ?? 'article'}`,
        description: trend.reason,
        severity: 'warning', source: 'price-history', internalPath: '/catalogue', dedupeKey: `price-alert:${partId}:${trend.lastPriceCents}`,
      });
    }
    return { ...trend, history: points };
  });

  app.post('/price-history/:partId', async (r, reply) => {
    const org = r.auth!.organizationId;
    const partId = String((r.params as any).partId);
    const body = z.object({
      unitCostCents: z.number().int().min(0).max(10_000_000_000),
      observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      source: z.enum(['manual', 'receipt', 'purchase_order', 'import']).default('manual'),
      supplierId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
    }).safeParse(r.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Prix unitaire en centimes requis (≥ 0).' });
    const part = (await query(`select id from parts where id=$2 and organization_id=$1`, [org, partId])).rowCount;
    if (!part) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Article introuvable.' });
    await query(
      `insert into part_price_history(organization_id,part_id,supplier_id,unit_cost_cents,observed_at,source,recorded_by)
       values($1,$2,$3,$4,$5::date,$6,$7)`,
      [org, partId, body.data.supplierId || null, body.data.unitCostCents, body.data.observedAt || new Date().toISOString().slice(0, 10), body.data.source, r.auth!.userId],
    );
    return { recorded: true };
  });
}

/** Ré-export utilitaire pour les tests de transaction (usage : ouvrir une transaction tenant). */
export async function withTenantTransaction(organizationId: string, fn: (exec: SqlExecutor) => Promise<void>): Promise<void> {
  const client = await db.connect();
  try {
    await beginTenant(client);
    await fn(client as unknown as SqlExecutor);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => { });
    throw error;
  } finally {
    client.release();
  }
}
