// Bloc 10 (prompt 10) — routes du moteur de stock : synthèse disponible/réservé/commandé,
// mouvements traçables, réservations (création/libération/consommation), propositions de
// réapprovisionnement. Toutes les écritures passent par le service (aucune écriture libre).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, db, beginTenant } from '../db.js';
import { createStockMovement, stockSummary, stockMovements, listReservations, reservePart, releaseReservation, consumeReservation, StockError, type MovementType } from '../services/stock.js';
import { reorderProposals, recordReorderProposal } from '../services/purchases.js';

const movementTypes = new Set<MovementType>(['initial', 'receipt', 'consumption', 'adjustment', 'return', 'damage', 'loss']);
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

const adjustSchema = z.object({
  partId: z.string().uuid(),
  movementType: z.enum(['adjustment', 'receipt', 'consumption', 'damage', 'loss', 'return', 'initial']).optional(),
  /** Quantité signée (sorties négatives) OU nouvelle valeur absolue via targetStock. */
  quantity: z.union([z.number().finite(), z.string().max(40)]).optional(),
  targetStock: z.union([z.number().finite(), z.string().max(40)]).optional(),
  reason: z.string().max(400).optional(),
}).passthrough();

const reserveSchema = z.object({
  partId: z.string().uuid(),
  quantity: z.union([z.number().finite(), z.string().max(40)]),
  quoteId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  appointmentId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  note: z.string().max(400).optional(),
}).passthrough();

function toNumber(v: unknown): number {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new StockError('INVALID_QUANTITY', 'Quantité invalide.');
  return n;
}

export async function stockRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  // Synthèse par article : physique, réservé, disponible, commandé, seuil, hors seuil.
  app.get('/stock/summary', async r => {
    const activityId = uuid((r.query as any)?.activityId) ? String((r.query as any).activityId) : null;
    return stockSummary(r.auth!.organizationId, activityId);
  });

  // Historique des mouvements (traçabilité : quantité, motif, acteur, lien opérationnel).
  app.get('/stock/movements', async r => {
    const partId = uuid((r.query as any)?.partId) ? String((r.query as any).partId) : null;
    const limit = Number((r.query as any)?.limit) || 100;
    return { movements: await stockMovements(r.auth!.organizationId, partId, limit) };
  });

  // Réservations actives et passées.
  app.get('/stock/reservations', async r => {
    const partId = uuid((r.query as any)?.partId) ? String((r.query as any).partId) : null;
    const status = ['active', 'consumed', 'released', 'cancelled'].includes(String((r.query as any)?.status)) ? String((r.query as any).status) : null;
    return { reservations: await listReservations(r.auth!.organizationId, partId, status) };
  });

  // Correction traçable : un ajustement manuel crée un mouvement (jamais d'écriture libre).
  app.post('/stock/movements/adjust', async (r, reply) => {
    const parsed = adjustSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const b: any = parsed.data;
    const type = movementTypes.has(b.movementType) ? (b.movementType as MovementType) : 'adjustment';
    let quantity: number;
    const client = await db.connect();
    try {
      await beginTenant(client);
      if (b.targetStock !== undefined) {
        const current = (await client.query('select stock from parts where id=$1 and organization_id=$2', [b.partId, r.auth!.organizationId])).rows[0];
        if (!current) { await client.query('rollback').catch(() => { }); return reply.code(404).send({ error: 'NOT_FOUND', message: 'Article introuvable.' }); }
        quantity = Math.round((toNumber(b.targetStock) - Number(current.stock || 0)) * 100) / 100;
        if (Math.abs(quantity) < 1e-9) { await client.query('rollback').catch(() => { }); return reply.code(409).send({ error: 'NO_CHANGE', message: 'Le stock visé est déjà le stock actuel : aucun mouvement créé.' }); }
      } else {
        if (b.quantity === undefined) { await client.query('rollback').catch(() => { }); return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Indiquez quantity (variation signée) ou targetStock (nouvelle valeur).' }); }
        quantity = toNumber(b.quantity);
        if (type !== 'adjustment') quantity = type === 'receipt' || type === 'initial' ? Math.abs(quantity) : -Math.abs(quantity);
      }
      const result = await createStockMovement(client, r.auth!.organizationId, {
        partId: b.partId, type, quantity,
        reason: b.reason?.slice(0, 400) ?? 'Ajustement manuel tracé',
        origin: type === 'receipt' ? 'fournisseur' : null,
        destination: quantity < 0 ? 'sortie' : 'stock',
        actorId: r.auth!.userId,
        opType: 'manual_adjust',
      });
      await client.query('commit');
      return reply.code(201).send(result);
    } catch (e: any) {
      await client.query('rollback').catch(() => { });
      if (e instanceof StockError) return reply.code(e.code === 'PART_NOT_FOUND' ? 404 : 400).send({ error: e.code, message: e.message });
      throw e;
    } finally { client.release(); }
  });

  // Réservation : diminue le disponible, jamais le physique (surréservation refusée).
  app.post('/stock/reservations', async (r, reply) => {
    const parsed = reserveSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const b: any = parsed.data;
    const client = await db.connect();
    try {
      await beginTenant(client);
      const result = await reservePart(client, r.auth!.organizationId, {
        partId: b.partId,
        quantity: toNumber(b.quantity),
        quoteId: b.quoteId || null,
        appointmentId: b.appointmentId || null,
        note: b.note?.slice(0, 400) ?? null,
        createdBy: r.auth!.userId,
      });
      await client.query('commit');
      return reply.code(201).send(result);
    } catch (e: any) {
      await client.query('rollback').catch(() => { });
      if (e instanceof StockError) return reply.code(e.code === 'PART_NOT_FOUND' ? 404 : 400).send({ error: e.code, message: e.message });
      throw e;
    } finally { client.release(); }
  });

  // Libération (annulation/modification de l'opération liée).
  app.post('/stock/reservations/:id/release', async (r, reply) => {
    const id = String((r.params as any).id);
    if (!uuid(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const reason = String((r.body as any)?.reason || 'Réservation libérée').slice(0, 400);
    const client = await db.connect();
    try {
      await beginTenant(client);
      const ok = await releaseReservation(client, r.auth!.organizationId, id, reason);
      await client.query('commit');
      if (!ok) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Aucune réservation active à libérer.' });
      return { ok: true };
    } catch (e: any) {
      await client.query('rollback').catch(() => { });
      throw e;
    } finally { client.release(); }
  });

  // Consommation confirmée : crée le mouvement réel au moment confirmé (statut → consumed).
  app.post('/stock/reservations/:id/consume', async (r, reply) => {
    const id = String((r.params as any).id);
    if (!uuid(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const client = await db.connect();
    try {
      await beginTenant(client);
      const result = await consumeReservation(client, r.auth!.organizationId, id, {
        actorId: r.auth!.userId,
        opType: 'reservation',
        opId: id,
        reason: 'Consommation confirmée de la réservation',
      });
      await client.query('commit');
      return reply.code(201).send(result);
    } catch (e: any) {
      await client.query('rollback').catch(() => { });
      if (e instanceof StockError) return reply.code(e.code === 'PART_NOT_FOUND' ? 404 : e.code === 'PART_LOCKED' ? 409 : 400).send({ error: e.code, message: e.message });
      throw e;
    } finally { client.release(); }
  });

  // Propositions de réapprovisionnement : calcul déterministe (seuil − disponible + commandé),
  // AUCUNE commande fermée créée — les seuils produisent des propositions, pas des commandes.
  app.get('/stock/reorder-proposals', async r => {
    const activityId = uuid((r.query as any)?.activityId) ? String((r.query as any).activityId) : null;
    const proposals = await reorderProposals(r.auth!.organizationId, activityId);
    await recordReorderProposal(r.auth!.organizationId, proposals.length);
    return { proposals, note: 'Propositions déterministes (seuil − disponible − déjà commandé). Aucune commande fournisseur n\'est créée automatiquement : chaque commande reste une validation humaine.' };
  });

  // 15.4.50 (A6) — Emplacements de stock (atelier, camion, dépôt) : la dimension OÙ est
  // portée par les mouvements (migration 111), aucune quantité parallèle. Un transfert
  // atelier→camion = deux mouvements traçables (sortie + réception), jamais une écriture libre.
  app.get('/stock/locations', async r => {
    const org = r.auth!.organizationId;
    const rows = (await query(
      `select l.id,l.name,l.kind,l.is_default as "isDefault",l.created_at as "createdAt",
              (select coalesce(sum(m.quantity),0) from stock_movements m where m.organization_id=l.organization_id and m.location_id=l.id) as "netQuantity",
              (select count(distinct m.part_id)::int from stock_movements m where m.organization_id=l.organization_id and m.location_id=l.id) as "partCount"
       from stock_locations l where l.organization_id=$1 order by l.is_default desc, l.name`, [org],
    )).rows;
    return { locations: rows, note: 'Le niveau par emplacement se calcule depuis les mouvements (source de vérité) — un transfert = sortie d\u2019un côté + réception de l\u2019autre, toutes deux tracées.' };
  });

  app.post('/stock/locations', async (r, reply) => {
    const org = r.auth!.organizationId;
    const body = z.object({
      name: z.string().trim().min(1).max(120),
      kind: z.enum(['depot', 'truck', 'workshop', 'other']).default('depot'),
      isDefault: z.boolean().optional(),
    }).safeParse(r.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Nom d\u2019emplacement requis (type : dépôt, camion, atelier, autre).' });
    if (body.data.isDefault) {
      await query(`update stock_locations set is_default=false where organization_id=$1 and is_default=true`, [org]);
    }
    const row = (await query(
      `insert into stock_locations(organization_id,name,kind,is_default,created_by)
       values($1,$2,$3,$4,$5)
       on conflict (organization_id,name) do update set kind=excluded.kind,is_default=excluded.is_default,created_by=excluded.created_by
       returning id`,
      [org, body.data.name, body.data.kind, Boolean(body.data.isDefault), r.auth!.userId],
    )).rows[0];
    return { id: String(row.id) };
  });
}

// Ré-export pratique : vérification d'article (utilisée par d'autres routes).
export async function partExists(organizationId: string, partId: string): Promise<boolean> {
  return Boolean((await query('select 1 from parts where id=$1 and organization_id=$2', [partId, organizationId])).rowCount);
}
