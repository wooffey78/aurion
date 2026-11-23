// 15.4.50 (B8) — Webhooks sortants : gestion des endpoints (chef d'entreprise), consultation
// des livraisons et rejeu contrôlé des lettres mortes. Le secret est généré côté serveur et
// renvoyé UNE SEULE fois à la création ; seul son chiffré est stocké (jamais en clair).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';
import { randomBytes } from 'node:crypto';
import { encryptSecret } from '../services/secrets.js';
import { secretFingerprint, WEBHOOK_EVENT_TYPES, webhookNextDelayMs, verifyDeliverySignature, buildDeliveryHeaders } from '../services/outgoing-webhooks.js';

export async function webhookOutRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/webhooks/endpoints', async (r, reply) => {
    if (!['owner', 'admin'].includes(r.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Gestion des webhooks réservée au chef d\u2019entreprise (ou administrateur).' });
    const org = r.auth!.organizationId;
    const rows = (await query(
      `select e.id,e.label,e.url,e.events,e.status,e.created_at as "createdAt",
              (select count(*)::int from webhook_deliveries d where d.endpoint_id=e.id and d.organization_id=e.organization_id) as "deliveries",
              (select count(*)::int from webhook_deliveries d where d.endpoint_id=e.id and d.organization_id=e.organization_id and d.status='dead_lettered') as "deadLetters"
       from webhook_endpoints e where e.organization_id=$1 order by e.created_at desc limit 100`, [org],
    )).rows;
    return { endpoints: rows, eventTypes: WEBHOOK_EVENT_TYPES };
  });

  app.post('/webhooks/endpoints', async (r, reply) => {
    if (!['owner', 'admin'].includes(r.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const org = r.auth!.organizationId;
    const body = z.object({
      label: z.string().trim().min(2).max(120),
      url: z.string().url().max(400).refine(u => /^https:\/\//.test(u), { message: 'Seule une URL HTTPS est acceptée (les données métier voyagent signées, jamais en clair).' }),
      events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).max(WEBHOOK_EVENT_TYPES.length),
    }).safeParse(r.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Libellé, URL HTTPS et au moins un type d\u2019événement requis.' });
    const secret = randomBytes(32).toString('hex');
    const row = (await query(
      `insert into webhook_endpoints(organization_id,label,url,events,secret_cipher,secret_fingerprint,created_by)
       values($1,$2,$3,$4,$5,$6,$7) returning id`,
      [org, body.data.label, body.data.url, body.data.events, encryptSecret(secret), secretFingerprint(secret), r.auth!.userId],
    )).rows[0];
    // Le secret est montré UNE SEULE fois (comme les jetons de paiement) : l'entreprise le
    // conserve dans son gestionnaire de secrets pour vérifier les signatures reçues.
    return { id: String(row.id), secret, signatureHeader: 'X-Aurion-Signature', verifyExample: verifyDeliverySignature(secret, '{"event":"ping"}', buildDeliveryHeaders(secret, '{"event":"ping"}')['X-Aurion-Signature']) };
  });

  app.post('/webhooks/endpoints/:id/revoke', async (r, reply) => {
    if (!['owner', 'admin'].includes(r.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const org = r.auth!.organizationId;
    const id = String((r.params as any).id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const x = await query(`update webhook_endpoints set status='revoked',updated_at=now() where id=$2 and organization_id=$1 and status<>'revoked'`, [org, id]);
    if (!x.rowCount) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Endpoint introuvable ou déjà révoqué.' });
    return { revoked: true };
  });

  app.get('/webhooks/deliveries', async (r, reply) => {
    if (!['owner', 'admin'].includes(r.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const org = r.auth!.organizationId;
    const rows = (await query(
      `select d.id,d.event_type as "eventType",d.status,d.attempts,d.next_attempt_at as "nextAttemptAt",
              d.last_error as "lastError",d.created_at as "createdAt",d.processed_at as "processedAt",e.label as "endpoint"
       from webhook_deliveries d join webhook_endpoints e on e.id=d.endpoint_id
       where d.organization_id=$1 order by d.created_at desc limit 100`, [org],
    )).rows;
    const counts: Record<string, number> = { pending: 0, processing: 0, processed: 0, failed: 0, dead_lettered: 0 };
    for (const row of rows) counts[String(row.status)] = (counts[String(row.status)] || 0) + 1;
    return { deliveries: rows, counts, backoffNote: `Nouvelle tentative après échec : backoff exponentiel (${webhookNextDelayMs(1) / 1000}s, puis doublement, plafond 60s), lettre morte au 5e essai, rejeu contrôlé uniquement.` };
  });
}
