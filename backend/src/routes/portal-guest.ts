// 15.4.50 (A1/A2) — Routes portail client : administration (chef d'entreprise) et accès
// public par jeton. Côté public : l'autorisation est portée par le jeton (hashé en base,
// jamais en clair), l'expiration, la révocation et le rate-limit — même modèle que
// share-links.ts. Aucune donnée au-delà des devis explicitement partagés : ni notes
// internes, ni marges, ni coûts, ni documents d'autres clients (prompt 14).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, sqlExecutor } from '../db.js';
import { db, beginTenant } from '../db.js';
import { newPortalToken, hashPortalToken, portalView, acceptQuoteFromPortal, PortalError } from '../services/portal-guest.js';
import type { SqlExecutor } from '../services/sql-executor.js';

export async function portalGuestRoutes(app: FastifyInstance) {
  // ---- Administration (authentifiée, réservée au chef d'entreprise) ----
  app.addHook('preHandler', app.requireAuth);
  app.get('/portal/accesses', async (r, reply) => {
    if (!['owner', 'admin'].includes(r.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Gestion du portail réservée au chef d\u2019entreprise (ou administrateur).' });
    const org = r.auth!.organizationId;
    const rows = (await query(
      `select a.id,a.client_id as "clientId",c.name as "clientName",a.contact_email as "contactEmail",a.contact_name as "contactName",
              a.status,a.invited_at as "invitedAt",a.activated_at as "activatedAt",a.revoked_at as "revokedAt",a.expires_at as "expiresAt",
              a.last_seen_at as "lastSeenAt",
              (select count(*)::int from portal_shared_quotes s where s.access_id=a.id and s.organization_id=a.organization_id and s.revoked_at is null) as "sharedQuotes"
       from client_portal_access a join clients c on c.id=a.client_id
       where a.organization_id=$1 order by a.invited_at desc limit 200`, [org],
    )).rows;
    return { accesses: rows };
  });

  app.post('/portal/accesses', async (r, reply) => {
    if (!['owner', 'admin'].includes(r.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const org = r.auth!.organizationId;
    const body = z.object({
      clientId: z.string().uuid(),
      contactEmail: z.string().email().max(200),
      contactName: z.string().trim().max(160).optional(),
      expiresAt: z.union([z.string().max(40), z.literal(''), z.null()]).optional(),
    }).safeParse(r.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Client et e-mail du contact requis (e-mail valide).' });
    const client = (await query(`select id from clients where id=$2 and organization_id=$1`, [org, body.data.clientId])).rowCount;
    if (!client) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Client introuvable.' });
    const { token, tokenHash } = newPortalToken();
    const row = (await query(
      `insert into client_portal_access(organization_id,client_id,contact_email,contact_name,token_hash,invited_by,expires_at)
       values($1,$2,$3,$4,$5,$6,$7) returning id`,
      [org, body.data.clientId, body.data.contactEmail.toLowerCase(), body.data.contactName ?? null, tokenHash, r.auth!.userId, body.data.expiresAt || null],
    )).rows[0];
    // Le jeton en clair est renvoyé UNE SEULE fois (à l'entrepreneur, pour l'envoyer au
    // client) — jamais stocké, jamais re-récupérable (comme les liens de paiement).
    return { id: String(row.id), token, invitationNote: `Lien à transmettre au client : /portal/${token} (envoyé une seule fois, révocable à tout moment).` };
  });

  app.post('/portal/accesses/:id/revoke', async (r, reply) => {
    if (!['owner', 'admin'].includes(r.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const org = r.auth!.organizationId;
    const id = String((r.params as any).id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const x = await query(`update client_portal_access set status='revoked',revoked_at=now() where id=$2 and organization_id=$1 and status<>'revoked'`, [org, id]);
    if (!x.rowCount) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Accès introuvable ou déjà révoqué.' });
    return { revoked: true };
  });

  app.post('/portal/accesses/:id/share-quote', async (r, reply) => {
    if (!['owner', 'admin'].includes(r.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
    const org = r.auth!.organizationId;
    const id = String((r.params as any).id);
    const body = z.object({ quoteId: z.string().uuid() }).safeParse(r.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const access = (await query(`select id,client_id from client_portal_access where id=$2 and organization_id=$1 and status<>'revoked'`, [org, id])).rows[0];
    if (!access) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Accès portail introuvable ou révoqué.' });
    const quote = (await query(`select id,client_id from quotes where id=$2 and organization_id=$1 and document_type='quote'`, [org, body.data.quoteId])).rows[0];
    if (!quote) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Devis introuvable.' });
    if (String(quote.client_id || '') !== String(access.client_id)) {
      return reply.code(409).send({ error: 'CLIENT_MISMATCH', message: 'Ce devis appartient à un autre client : le partage est refusé (isolation client).' });
    }
    await query(
      `insert into portal_shared_quotes(organization_id,access_id,quote_id,shared_by) values($1,$2,$3,$4)
       on conflict (organization_id,access_id,quote_id) do nothing`,
      [org, id, body.data.quoteId, r.auth!.userId],
    );
    return { shared: true };
  });

}

/**
 * Routes PUBLIQUES du portail — plugin séparé : aucun requireAuth sur ce scope,
 * l'autorisation est portée par le jeton (hashé, expirable, révocable) et le rate-limit,
 * exactement comme les liens de partage de share-links.ts.
 */
export async function portalPublicRoutes(app: FastifyInstance) {
  const tokenParam = /^[0-9a-f]{48}$/;

  app.get('/portal/:token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (r, reply) => {
    const token = String((r.params as any).token || '');
    if (!tokenParam.test(token)) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Ce portail n\u2019existe pas (ou plus).' });
    const access = (await query(
      `select id,organization_id from client_portal_access where token_hash=$1 and status<>'revoked'`,
      [hashPortalToken(token)],
    )).rows[0];
    if (!access) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Ce portail n\u2019existe pas (ou plus).' });
    await query(`update client_portal_access set last_seen_at=now(),status=case when status='invited' then 'active' else status end,activated_at=coalesce(activated_at,now()) where id=$1`, [access.id]);
    try {
      const view = await portalView(sqlExecutor, String(access.organization_id), String(access.id));
      return view;
    } catch (e: any) {
      if (e instanceof PortalError) return reply.code(e.code === 'ACCESS_EXPIRED' ? 410 : 404).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/portal/:token/quotes/:quoteId/accept', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (r, reply) => {
    const token = String((r.params as any).token || '');
    const quoteId = String((r.params as any).quoteId || '');
    if (!tokenParam.test(token) || !/^[0-9a-f-]{36}$/i.test(quoteId)) return reply.code(404).send({ error: 'NOT_FOUND' });
    const access = (await query(
      `select id,organization_id from client_portal_access where token_hash=$1 and status<>'revoked'`,
      [hashPortalToken(token)],
    )).rows[0];
    if (!access) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Ce portail n\u2019existe pas (ou plus).' });
    const client = await db.connect();
    try {
      await beginTenant(client);
      const result = await acceptQuoteFromPortal(client as unknown as SqlExecutor, String(access.organization_id), String(access.id), quoteId, String((r.body as any)?.signedName || ''), {
        remoteIp: (r.headers['x-forwarded-for'] as string)?.split(',')[0] || (r.ip as string) || null,
        userAgent: (r.headers['user-agent'] as string) || null,
      });
      await client.query('commit');
      return result;
    } catch (e: any) {
      await client.query('rollback').catch(() => { });
      if (e instanceof PortalError) return reply.code(e.code === 'QUOTE_ALREADY_CLOSED' ? 409 : e.code === 'NAME_REQUIRED' ? 400 : 404).send({ error: e.code, message: e.message });
      throw e;
    } finally {
      client.release();
    }
  });
}
