// Bloc 10 (prompt 10) — routes achats fournisseurs : commande → validation → réception
// partielle/complète → retour. Aucune écriture comptable automatique : les coûts réels sont
// conservés sur les réceptions et les mouvements, la comptabilisation reste une décision humaine.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';
import { createOrder, placeOrder, cancelOrder, receiveOrder, returnToSupplier, PurchaseError, type ReceptionLineInput } from '../services/purchases.js';

const orderCreateSchema = z.object({
  supplierId: z.string().uuid(),
  activityId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  reference: z.string().max(160).optional(),
  note: z.string().max(4000).optional(),
  lines: z.array(z.object({
    partId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
    label: z.string().max(240),
    quantity: z.union([z.number().finite(), z.string().max(40)]),
    unitPrice: z.union([z.number().finite(), z.string().max(40)]).optional(),
    unit: z.string().max(20).optional(),
  }).passthrough()).min(1),
}).passthrough();

const orderPatchSchema = z.object({
  reference: z.string().max(160).optional(),
  note: z.string().max(4000).optional(),
  lines: z.array(z.object({
    partId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
    label: z.string().max(240),
    quantity: z.union([z.number().finite(), z.string().max(40)]),
    unitPrice: z.union([z.number().finite(), z.string().max(40)]).optional(),
    unit: z.string().max(20).optional(),
  }).passthrough()).optional(),
}).passthrough();

const receptionSchema = z.object({
  note: z.string().max(400).optional(),
  lines: z.array(z.object({
    lineId: z.string().uuid(),
    quantity: z.union([z.number().finite(), z.string().max(40)]),
    unitCost: z.union([z.number().finite(), z.string().max(40), z.null()]).optional(),
  }).passthrough()).min(1),
}).passthrough();

const returnSchema = z.object({
  supplierId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  purchaseOrderId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  lines: z.array(z.object({
    partId: z.string().uuid(),
    quantity: z.union([z.number().finite(), z.string().max(40)]),
    reason: z.string().max(400).optional(),
  }).passthrough()).min(1),
}).passthrough();

function purchaseError(reply: any, e: any) {
  if (e instanceof PurchaseError) {
    const status = e.code === 'ORDER_NOT_FOUND' || e.code === 'LINE_NOT_FOUND' || e.code === 'SUPPLIER_NOT_FOUND' ? 404
      : e.code === 'INVALID_STATE' ? 409 : 400;
    return reply.code(status).send({ error: e.code, message: e.message });
  }
  throw e;
}

export async function purchaseRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  app.get('/purchases/orders', async r => {
    const status = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'].includes(String((r.query as any)?.status)) ? String((r.query as any).status) : null;
    const rows = (await query(
      `select o.id,o.status,o.reference,o.note,o.ordered_at as "orderedAt",o.cancelled_at as "cancelledAt",o.created_at as "createdAt",
              o.supplier_id as "supplierId",s.name as "supplierName",
              coalesce((select sum(l.quantity*l.unit_price) from purchase_order_lines l where l.purchase_order_id=o.id),0) as "totalAmount",
              (select json_agg(json_build_object('id',l.id,'partId',l.part_id,'label',l.label,'quantity',l.quantity,'unitPrice',l.unit_price,
                                                 'receivedQuantity',l.received_quantity,'unit',l.unit) order by l.created_at)
                 from purchase_order_lines l where l.purchase_order_id=o.id) as lines
       from purchase_orders o join suppliers s on s.id=o.supplier_id
       where o.organization_id=$1 and ($2::varchar is null or o.status=$2)
       order by o.created_at desc limit 200`,
      [r.auth!.organizationId, status],
    )).rows;
    return { orders: rows };
  });

  app.get('/purchases/orders/:id', async (r, reply) => {
    const id = String((r.params as any).id);
    const order = (await query(
      `select o.*,s.name as "supplierName" from purchase_orders o join suppliers s on s.id=o.supplier_id where o.id=$1 and o.organization_id=$2`,
      [id, r.auth!.organizationId],
    )).rows[0];
    if (!order) return reply.code(404).send({ error: 'NOT_FOUND' });
    const lines = (await query(
      `select id,part_id as "partId",label,quantity,unit_price as "unitPrice",received_quantity as "receivedQuantity",unit
       from purchase_order_lines where purchase_order_id=$1 and organization_id=$2 order by created_at`,
      [id, r.auth!.organizationId],
    )).rows;
    const receptions = (await query(
      `select id,note,received_at as "receivedAt" from purchase_receptions where purchase_order_id=$1 and organization_id=$2 order by received_at desc`,
      [id, r.auth!.organizationId],
    )).rows;
    return { order, lines, receptions };
  });

  app.post('/purchases/orders', async (r, reply) => {
    const parsed = orderCreateSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Commande invalide : fournisseur obligatoire et au moins une ligne (libellé, quantité positive).' });
    try {
      const result = await createOrder(r.auth!.organizationId, r.auth!.userId, { ...parsed.data, activityId: (parsed.data as any).activityId || null });
      return reply.code(201).send(result);
    } catch (e: any) { return purchaseError(reply, e); }
  });

  // Modification : uniquement en brouillon (les lignes deviennent immuables après validation).
  app.patch('/purchases/orders/:id', async (r, reply) => {
    const parsed = orderPatchSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const id = String((r.params as any).id), org = r.auth!.organizationId, b: any = parsed.data;
    const order = (await query(`select id,status from purchase_orders where id=$1 and organization_id=$2`, [id, org])).rows[0];
    if (!order) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (order.status !== 'draft') return reply.code(409).send({ error: 'INVALID_STATE', message: 'Seule une commande en brouillon peut être modifiée. Validez-la, annulez-la ou réceptionnez-la.' });
    if (b.reference !== undefined || b.note !== undefined) {
      await query(`update purchase_orders set reference=coalesce($2,reference),note=coalesce($3,note),updated_at=now() where id=$1 and organization_id=$4`, [id, b.reference ?? null, b.note ?? null, org]);
    }
    if (b.lines) {
      await query(`delete from purchase_order_lines where purchase_order_id=$1 and organization_id=$2`, [id, org]);
      const { normalizeOrderLines } = await import('../services/purchases.js');
      for (const line of normalizeOrderLines(b.lines)) {
        await query(`insert into purchase_order_lines(organization_id,purchase_order_id,part_id,label,quantity,unit_price,unit) values($1,$2,$3,$4,$5,$6,$7)`, [org, id, line.partId, line.label, line.quantity, line.unitPrice, line.unit]);
      }
    }
    return { ok: true };
  });

  // Validation humaine : draft → ordered (les seuils ne commandent jamais seuls).
  app.post('/purchases/orders/:id/order', async (r, reply) => {
    try { return await placeOrder(r.auth!.organizationId, String((r.params as any).id)); }
    catch (e: any) { return purchaseError(reply, e); }
  });

  app.post('/purchases/orders/:id/cancel', async (r, reply) => {
    try { return await cancelOrder(r.auth!.organizationId, String((r.params as any).id)); }
    catch (e: any) { return purchaseError(reply, e); }
  });

  // Réception partielle ou complète : alimente le stock à la confirmation uniquement.
  app.post('/purchases/orders/:id/receptions', async (r, reply) => {
    const parsed = receptionSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Réception invalide : indiquez au moins une ligne (lineId, quantité positive).' });
    try {
      const result = await receiveOrder(r.auth!.organizationId, String((r.params as any).id), r.auth!.userId, parsed.data.lines as unknown as ReceptionLineInput[], (parsed.data as any).note);
      return reply.code(201).send(result);
    } catch (e: any) { return purchaseError(reply, e); }
  });

  app.get('/purchases/receptions', async r => {
    const orderId = String((r.query as any)?.orderId || '');
    const rows = (await query(
      `select rc.id,rc.purchase_order_id as "purchaseOrderId",rc.note,rc.received_at as "receivedAt",
              (select json_agg(json_build_object('quantity',rl.quantity,'unitCost',rl.unit_cost,'partId',rl.part_id,'movementId',rl.movement_id))
                 from purchase_reception_lines rl where rl.reception_id=rc.id) as lines
       from purchase_receptions rc
       where rc.organization_id=$1 and ($2::uuid is null or rc.purchase_order_id=$2::uuid)
       order by rc.received_at desc limit 200`,
      [r.auth!.organizationId, /^[0-9a-f-]{36}$/i.test(orderId) ? orderId : null],
    )).rows;
    return { receptions: rows };
  });

  // Retour fournisseur : mouvement de sortie tracé, jamais d'écriture automatique.
  app.post('/purchases/returns', async (r, reply) => {
    const parsed = returnSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Retour invalide : indiquez au moins une ligne (partId, quantité positive).' });
    try {
      return await returnToSupplier(r.auth!.organizationId, r.auth!.userId, parsed.data as any);
    } catch (e: any) { return purchaseError(reply, e); }
  });
}
