import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';
const uuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
export async function dashboardJournalRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);
  app.get('/journal/events', async r => {
    const org = r.auth!.organizationId;
    return { events: (await query('select id,event_type as "eventType",title,description,severity,source,internal_path as "internalPath",external_url as "externalUrl",is_read as "isRead",resolved_at as "resolvedAt",created_at as "createdAt" from dashboard_journal_events where organization_id=$1 and event_type not like 'administrative_%' and event_type not like 'journey_%' order by created_at desc', [org])).rows };
  });
  app.patch('/journal/events/:id', async (r, reply) => {
    const org = r.auth!.organizationId, id = String((r.params as any).id), b = r.body as any || {};
    if (!uuid(id)) return reply.code(400).send({ error: 'INVALID_EVENT' });
    const result = await query('update dashboard_journal_events set is_read=coalesce($1,is_read),resolved_at=case when $2::boolean is true then coalesce(resolved_at,now()) when $2::boolean is false then null else resolved_at end where id=$3 and organization_id=$4 returning id,is_read,resolved_at', [typeof b.isRead === 'boolean' ? b.isRead : null, typeof b.resolved === 'boolean' ? b.resolved : null, id, org]);
    if (!result.rowCount) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true, event: result.rows[0] };
  });
}