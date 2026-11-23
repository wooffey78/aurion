// 109 (prompt 05) — Observabilité de l'outbox et rejeu contrôlé : consultation de l'état de
// livraison des événements métier et réactivation manuelle d'un événement en lettre morte
// (action humaine, motif requis, jamais automatique). Accès restreint au chef d'entreprise
// et à l'administrateur, comme les autres opérations sensibles.
import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';
import { replayDeadLetteredEvent } from '../services/events-outbox.js';

export async function outboxRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/journal/outbox', async (r, reply) => {
    if (!['owner', 'admin'].includes(r.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Consultation réservée au chef d\u2019entreprise (ou administrateur).' });
    const org = r.auth!.organizationId;
    const rows = (await query(
      `select id,event_type as "eventType",event_version as "eventVersion",source_entity_type as "sourceEntityType",source_entity_id as "sourceEntityId",
              correlation_id as "correlationId",status,attempts,next_attempt_at as "nextAttemptAt",last_error as "lastError",
              created_at as "createdAt",processed_at as "processedAt"
       from business_events_outbox where organization_id=$1
       order by created_at desc limit 100`, [org],
    )).rows;
    const counts: Record<string, number> = { pending: 0, processing: 0, processed: 0, failed: 0, dead_lettered: 0 };
    for (const row of rows) counts[String(row.status)] = (counts[String(row.status)] || 0) + 1;
    return { events: rows, counts };
  });

  app.post('/journal/outbox/:id/replay', async (r, reply) => {
    if (!['owner', 'admin'].includes(r.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Rejeu réservé au chef d\u2019entreprise (ou administrateur).' });
    const id = String((r.params as any).id);
    const reason = String((r.body as any)?.reason || '').trim().slice(0, 400);
    if (!reason || reason.length < 3) return reply.code(400).send({ error: 'REASON_REQUIRED', message: 'Indiquez le motif du rejeu : il est conservé dans l\u2019audit.' });
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const ok = await replayDeadLetteredEvent(r.auth!.organizationId, id, r.auth!.userId);
    if (!ok) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Aucun événement en lettre morte avec cet identifiant.' });
    return { ok: true, note: 'Événement remis en file (pending) : il sera livré au prochain balayage.' };
  });
}
