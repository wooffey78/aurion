// 108 (prompt 09) — Agenda unifié : vue d'ensemble lisible (rendez-vous, indisponibilités,
// tâches planifiées) et gestion des indisponibilités qui participent à la détection de
// collisions. Lecture additive : les rendez-vous restent servis par /appointments (aucun
// retrait) ; la vue unifiée agrège les modèles existants sans seconde fiche de vérité.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';
import { parseRecurrenceRule, expandRecurrence } from '../services/recurrence.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const unavailabilityInput = z.object({
  startsAt: z.string().min(10).max(40),
  endsAt: z.string().min(10).max(40),
  reason: z.string().trim().min(1).max(240),
  activityId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
}).passthrough();

export async function agendaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/agenda', async r => {
    const org = r.auth!.organizationId;
    const aid = (r.headers['x-aurion-activity-id'] as string) || undefined;
    const from = isoDate.safeParse((r.query as any)?.from), to = isoDate.safeParse((r.query as any)?.to);
    const fromIso = from.success ? from.data : new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const toIso = to.success ? to.data : new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const fromTs = `${fromIso}T00:00:00Z`, toTs = `${toIso}T23:59:59Z`;
    const [appointments, unavailabilities, tasks] = await Promise.all([
      query(`select a.id,a.title,a.starts_at as "startsAt",a.ends_at as "endsAt",a.status,a.origin,a.client_id as "clientId",c.name as "clientName",a.location_address as "location",a.activity_id as "activityId",a.address_source as "addressSource",a.quote_id as "quoteId"
             from appointments a left join clients c on c.id=a.client_id
             where a.organization_id=$1 and ($2::uuid is null or a.activity_id=$2::uuid)
               and a.starts_at <= $3::timestamptz and coalesce(a.ends_at,a.starts_at) >= $4::timestamptz
             order by a.starts_at`, [org, aid, toTs, fromTs]),
      query(`select id,reason,starts_at as "startsAt",ends_at as "endsAt",activity_id as "activityId",user_id as "userId"
             from calendar_unavailabilities where organization_id=$1 and ($2::uuid is null or activity_id=$2::uuid)
               and starts_at <= $3::timestamptz and coalesce(ends_at,starts_at) >= $4::timestamptz
             order by starts_at`, [org, aid, toTs, fromTs]),
      query(`select id,title,status,due_at as "dueAt" from tasks
             where organization_id=$1 and due_at is not null and due_at <= $2::timestamptz and due_at >= $3::timestamptz
             order by due_at`, [org, toTs, fromTs]),
    ]);
    return {
      from: fromIso, to: toIso,
      items: [
        ...appointments.rows.map((a: any) => ({ kind: 'appointment', ...a })),
        ...unavailabilities.rows.map((u: any) => ({ kind: 'unavailability', ...u })),
        ...tasks.rows.map((t: any) => ({ kind: 'task', ...t, startsAt: t.dueAt, endsAt: null })),
      ],
    };
  });

  app.get('/agenda/unavailabilities', async r => {
    const org = r.auth!.organizationId;
    const aid = (r.headers['x-aurion-activity-id'] as string) || undefined;
    return (await query(`select id,reason,starts_at as "startsAt",ends_at as "endsAt",activity_id as "activityId",created_at as "createdAt" from calendar_unavailabilities where organization_id=$1 and ($2::uuid is null or activity_id=$2::uuid) order by starts_at desc limit 200`, [org, aid])).rows;
  });

  app.post('/agenda/unavailabilities', async (r, reply) => {
    const parsed = unavailabilityInput.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Indiquez un motif, un début et une fin d\u2019indisponibilité.' });
    const b: any = parsed.data, org = r.auth!.organizationId;
    const start = new Date(b.startsAt), end = new Date(b.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'L\u2019heure de fin ne peut pas être antérieure à l\u2019heure de début.' });
    const id = crypto.randomUUID();
    await query(`insert into calendar_unavailabilities(id,organization_id,activity_id,user_id,starts_at,ends_at,reason) values($1,$2,$3,$4,$5,$6,$7)`,
      [id, org, b.activityId || null, r.auth!.userId, start, end, b.reason]);
    return reply.code(201).send({ id });
  });

  app.delete('/agenda/unavailabilities/:id', async (r, reply) => {
    const id = String((r.params as any).id), org = r.auth!.organizationId;
    const x = await query('delete from calendar_unavailabilities where id=$1 and organization_id=$2 returning id', [id, org]);
    if (!x.rowCount) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  // 15.4.50 (A7) — Occurrences développées des rendez-vous récurrents : la vue unifiée
  // existe déjà (ci-dessus) ; ce endpoint ajoute la DÉVELOPPEMENT déterministe des
  // récurrences stockées (recurrence_rule en métadonnées 108, jamais expansé avant).
  // Lecture seule : les occurrences affichées sont dérivées du rendez-vous modèle — aucun
  // second rendez-vous n'est créé en base (la source de vérité reste l'objet récurrent).
  app.get('/agenda/occurrences', async r => {
    const org = r.auth!.organizationId;
    const aid = (r.headers['x-aurion-activity-id'] as string) || undefined;
    const from = isoDate.safeParse((r.query as any)?.from), to = isoDate.safeParse((r.query as any)?.to);
    const fromIso = from.success ? from.data : new Date().toISOString().slice(0, 10);
    const toIso = to.success ? to.data : new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const recurring = (await query(
      `select a.id,a.title,a.starts_at as "startsAt",a.ends_at as "endsAt",a.recurrence_rule as "rule",a.client_id as "clientId",c.name as "clientName",a.activity_id as "activityId"
       from appointments a left join clients c on c.id=a.client_id
       where a.organization_id=$1 and ($2::uuid is null or a.activity_id=$2::uuid)
         and a.recurrence_rule is not null and a.status not in ('canceled','cancelled','annulé','annule')`,
      [org, aid],
    )).rows;
    const items: Array<any> = [];
    for (const a of recurring) {
      let rule = null;
      try { rule = parseRecurrenceRule(a.rule); } catch { rule = null; }
      if (!rule) continue; // règle non reconnue : rien d'inventé, l'objet reste visible tel quel
      const durationMs = a.endsAt ? new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime() : 3600000;
      for (const startIso of expandRecurrence(rule, new Date(a.startsAt).toISOString(), `${fromIso}T00:00:00Z`, `${toIso}T23:59:59Z`)) {
        const start = new Date(startIso);
        items.push({
          kind: 'occurrence', appointmentId: a.id, title: a.title, startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + durationMs).toISOString(), clientId: a.clientId,
          clientName: a.clientName, activityId: a.activityId, derived: true,
        });
      }
    }
    return { from: fromIso, to: toIso, occurrences: items, note: 'Occurrences dérivées du rendez-vous récurrent (lecture seule) : aucun rendez-vous dupliqué en base.' };
  });
}
