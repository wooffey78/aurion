// Bloc 3 — APIs de réplication hors connexion : instantané paginé, delta incrémental via le
// journal de changements (migration 084), curseur et registre. Sécurité :
//   - authentification obligatoire (requireAuth) + contexte tenant par requête (RLS 074,
//     échec fermé sans contexte) ;
//   - lecture seule : aucune écriture directe ici — les opérations hors connexion passent par
//     POST /sync/ops (Bloc 4), qui réutilise les services métier existants ;
//   - pagination bornée, reprise d'un instantané interrompu par page, delta reprise par curseur.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';
import { SYNC_ENTITIES, SYNC_SCHEMA_VERSION, syncEntityNames, pruneSyncJournal } from '../services/sync-replication.js';
import { syncOpSchema, applySyncOps, type SyncOp } from '../services/sync-ops.js';

export async function syncReplicationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);
  const rate = { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } };

  // Registre : le client sait quoi répliquer et avec quelle version de schéma.
  app.get('/sync/registry', rate, async () => ({
    schemaVersion: SYNC_SCHEMA_VERSION,
    entities: syncEntityNames(),
  }));

  // Curseur courant : un appareil neuf commence un instantané puis applique le delta depuis cursor.
  app.get('/sync/cursor', rate, async (r) => {
    const row = (await query<{ cursor: string }>(
      'select coalesce(max(id),0)::text as cursor from sync_entity_changes where organization_id=$1',
      [r.auth!.organizationId]
    )).rows[0];
    return { cursor: Number(row?.cursor ?? 0) };
  });

  // Instantané paginé d'une entité (reprise interrompue : refaire la page où l'on s'est arrêté).
  app.get('/sync/snapshot/:entity', rate, async (r, reply) => {
    const entity = String((r.params as any).entity || '');
    const def = SYNC_ENTITIES[entity];
    if (!def) return reply.code(404).send({ error: 'UNKNOWN_ENTITY' });
    const p = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(500).default(200) }).safeParse(r.query);
    if (!p.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const { page, limit } = p.data;
    const org = r.auth!.organizationId;
    // Identifiants stables pour une pagination résistante aux insertions concurrentes.
    const rows = (await query<{ data: Record<string, unknown> }>(
      `select to_jsonb(t.*) as data from ${def.table} t${def.joinTable ? ` join ${def.joinTable} j on j.id=t.${def.joinKey}` : ''} where ${def.joinTable ? 'j.organization_id' : 't.organization_id'}=$1 order by t.${def.keyColumn || def.orderColumn || 'id'} asc limit $2 offset $3`,
      [org, limit, (page - 1) * limit]
    )).rows.map(x => x.data);
    const cursor = (await query<{ cursor: string }>(
      'select coalesce(max(id),0)::text as cursor from sync_entity_changes where organization_id=$1', [org]
    )).rows[0]?.cursor ?? '0';
    const total = rows.length < limit && page === 1 ? rows.length
      : Number((await query<{ n: number }>(`select count(*)::int as n from ${def.table} t${def.joinTable ? ` join ${def.joinTable} j on j.id=t.${def.joinKey}` : ''} where ${def.joinTable ? 'j.organization_id' : 't.organization_id'}=$1`, [org])).rows[0]?.n ?? 0);
    return { entity, page, limit, total, hasMore: rows.length === limit, rows, cursorAtStart: Number(cursor) };
  });

  // Delta incrémental : journal depuis le curseur, données courantes jointes pour les upserts.
  app.get('/sync/delta', rate, async (r, reply) => {
    const p = z.object({
      since: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(1000).default(500),
    }).safeParse(r.query);
    if (!p.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const { since, limit } = p.data;
    const org = r.auth!.organizationId;
    await pruneSyncJournal(org);
    const changes = (await query<{ id: string; entity: string; entity_id: string; op: string; changed_at: Date }>(
      'select id, entity, entity_id, op, changed_at from sync_entity_changes where organization_id=$1 and id>$2 order by id asc limit $3',
      [org, since, limit]
    )).rows;
    const out: Array<{ id: number; entity: string; entityId: string; op: string; changedAt: Date; data: Record<string, unknown> | null }> = [];
    for (const c of changes) {
      if (c.op === 'delete') {
        out.push({ id: Number(c.id), entity: c.entity, entityId: c.entity_id, op: 'delete', changedAt: c.changed_at, data: null });
        continue;
      }
      const def = SYNC_ENTITIES[c.entity];
      if (!def) continue; // entité non répliquée : ignorée pour le client (le curseur avance)
      const data = (await query<{ data: Record<string, unknown> }>(
        `select to_jsonb(t.*) as data from ${def.table} t${def.joinTable ? ` join ${def.joinTable} j on j.id=t.${def.joinKey}` : ''} where t.${def.keyColumn || 'id'}=$1 and ${def.joinTable ? 'j.organization_id' : 't.organization_id'}=$2 limit 1`,
        [c.entity_id, org]
      )).rows[0]?.data ?? null;
      if (!data) continue; // déjà supprimée ensuite : le tombstone suivant la couvrira
      out.push({ id: Number(c.id), entity: c.entity, entityId: c.entity_id, op: 'upsert', changedAt: c.changed_at, data });
    }
    const cursor = out.length ? out[out.length - 1].id : since;
    return { cursor, hasMore: changes.length === limit, changes: out };
  });

  // Dépôt des opérations décidées hors connexion (Bloc 4). Chaque opération rejoue la ROUTE
  // RÉELLE (mêmes validations, mêmes droits) : aucune seconde confirmation n'est demandée pour
  // une instruction complète ; l'idempotence (organisation+opClientId) interdit tout doublon.
  app.post('/sync/ops', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (r, reply) => {
    const p = z.object({ ops: z.array(syncOpSchema).min(1).max(200) }).safeParse(r.body);
    if (!p.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const authHeader = String(r.headers.authorization || '');
    if (!authHeader) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    const results = await applySyncOps(app, r.auth!.organizationId, authHeader, p.data.ops as SyncOp[]);
    return { results };
  });
}
