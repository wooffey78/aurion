// Bloc 13 (prompt 13) — tâches internes : support des actions « créer une tâche » des
// workflows et suivi manuel. Source de vérité unique (table tasks), consommable par le
// dashboard sans calcul parallèle.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';

const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(4000).optional(),
  dueAt: z.union([z.string().max(40), z.null()]).optional(),
  activityId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
}).passthrough();

const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().max(4000).optional(),
  dueAt: z.union([z.string().max(40), z.literal(''), z.null()]).optional(),
  status: z.enum(['todo', 'done', 'cancelled']).optional(),
}).passthrough();

const isoDate = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_DATE');
  return d.toISOString();
};

export async function taskRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  app.get('/tasks', async r => {
    const status = ['todo', 'done', 'cancelled'].includes(String((r.query as any)?.status)) ? String((r.query as any).status) : null;
    const rows = (await query(
      `select id,title,description,status,due_at as "dueAt",source,source_id as "sourceId",done_at as "doneAt",
              created_at as "createdAt",updated_at as "updatedAt"
       from tasks where organization_id=$1 and ($2::varchar is null or status=$2)
       order by coalesce(due_at,created_at) asc limit 300`,
      [r.auth!.organizationId, status],
    )).rows;
    return { tasks: rows };
  });

  app.post('/tasks', async (r, reply) => {
    const parsed = taskCreateSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const b: any = parsed.data;
    let dueAt: string | null;
    try { dueAt = isoDate(b.dueAt); } catch { return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Date d\'échéance invalide.' }); }
    const id = (await query(
      `insert into tasks(organization_id,activity_id,title,description,due_at,source,created_by)
       values($1,$2,$3,$4,$5::timestamptz,'manual',$6) returning id`,
      [r.auth!.organizationId, b.activityId || null, b.title, b.description ?? '', dueAt, r.auth!.userId],
    )).rows[0];
    return reply.code(201).send({ id: String(id.id) });
  });

  app.patch('/tasks/:id', async (r, reply) => {
    const parsed = taskPatchSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const b: any = parsed.data, id = String((r.params as any).id), org = r.auth!.organizationId;
    let dueAt: string | null | undefined;
    try { dueAt = b.dueAt === undefined ? undefined : isoDate(b.dueAt); } catch { return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Date d\'échéance invalide.' }); }
    const row = (await query(`select id,status from tasks where id=$1 and organization_id=$2`, [id, org])).rows[0];
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND' });
    const status = b.status ?? row.status;
    const x = await query(
      `update tasks set title=coalesce($2,title),description=coalesce($3,description),
        due_at=case when $4::timestamptz is null and $5::boolean is true then null else coalesce($4::timestamptz,due_at) end,
        status=$6,done_at=case when $6='done' then coalesce(done_at,now()) else done_at end,updated_at=now()
       where id=$1 and organization_id=$7 returning id,status`,
      [id, b.title ?? null, b.description ?? null, dueAt ?? null, b.dueAt === '' ? true : false, status, org],
    );
    if (!x.rowCount) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true, status };
  });

  // Terminaison explicite (transition validée) — les tâches d'un workflow restent traçables
  // par leur source : jamais supprimées, seulement terminées ou annulées.
  app.post('/tasks/:id/done', async (r, reply) => {
    const id = String((r.params as any).id), org = r.auth!.organizationId;
    const x = await query(`update tasks set status='done',done_at=coalesce(done_at,now()),updated_at=now() where id=$1 and organization_id=$2 and status='todo' returning id`, [id, org]);
    if (!x.rowCount) return reply.code(409).send({ error: 'INVALID_STATE', message: 'Aucune tâche à faire sur cette entrée.' });
    return { ok: true };
  });
}
