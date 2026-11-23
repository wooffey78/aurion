// Bloc 10 (prompt 10) — achats : commande → réception partielle/complète → retour.
// INVARIANTS :
//  • le stock n'est alimenté QU'À LA RÉCEPTION CONFIRMÉE (mouvement « receipt » par article) ;
//  • aucun coût n'est transmis à la comptabilité automatiquement (aucune écriture créée ici) ;
//  • une commande annulée ne peut pas être réceptionnée ; une réception ne dépasse jamais la
//    ligne commandée ; un retour crée un mouvement « return » (sortie vers le fournisseur).
import { query, db, beginTenant } from '../db.js';
import { createStockMovement, round2 } from './stock.js';
import { emitOrgEvent } from './events.js';

export class PurchaseError extends Error {
  constructor(public code: 'ORDER_NOT_FOUND' | 'INVALID_STATE' | 'INVALID_LINE' | 'SUPPLIER_NOT_FOUND' | 'OVER_RECEPTION' | 'LINE_NOT_FOUND', message: string) {
    super(message);
  }
}

export interface OrderLineInput {
  partId?: string | null;
  label: string;
  quantity: number;
  unitPrice?: number;
  unit?: string | null;
}

/** Valide les lignes d'une commande : libellé, quantité > 0, prix >= 0. Fonction PURE — testée sans base. */
export function normalizeOrderLines(lines: unknown): OrderLineInput[] {
  if (!Array.isArray(lines) || lines.length === 0) throw new PurchaseError('INVALID_LINE', 'Une commande doit contenir au moins une ligne.');
  if (lines.length > 200) throw new PurchaseError('INVALID_LINE', 'Une commande ne peut pas dépasser 200 lignes.');
  return lines.map((raw: any, index: number) => {
    const label = String(raw?.label ?? '').trim();
    if (!label) throw new PurchaseError('INVALID_LINE', `Ligne ${index + 1} : le libellé est obligatoire.`);
    const quantity = round2(Number(String(raw?.quantity ?? '').replace(',', '.')));
    if (!Number.isFinite(quantity) || quantity <= 0) throw new PurchaseError('INVALID_LINE', `Ligne ${index + 1} : la quantité doit être un nombre positif.`);
    const unitPrice = round2(Number(String(raw?.unitPrice ?? '0').replace(',', '.')) || 0);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new PurchaseError('INVALID_LINE', `Ligne ${index + 1} : le prix unitaire doit être un nombre positif ou nul.`);
    return { partId: raw?.partId ? String(raw.partId) : null, label: label.slice(0, 240), quantity, unitPrice, unit: raw?.unit ? String(raw.unit).slice(0, 20) : null };
  });
}

/** Montant total d'une commande : somme quantité × prix unitaire. Fonction PURE — testée sans base. */
export function orderTotal(lines: Array<{ quantity: number; unitPrice?: number | null }>): number {
  return round2(lines.reduce((t, l) => t + round2(l.quantity * (l.unitPrice ?? 0)), 0));
}

export async function createOrder(organizationId: string, actorId: string | null, input: {
  supplierId: string; activityId?: string | null; reference?: string | null; note?: string | null; lines: unknown;
}) {
  const supplier = (await query('select id from suppliers where id=$1 and organization_id=$2', [input.supplierId, organizationId])).rows[0];
  if (!supplier) throw new PurchaseError('SUPPLIER_NOT_FOUND', 'Fournisseur introuvable dans cette organisation.');
  const lines = normalizeOrderLines(input.lines);
  const order = (await query(
    `insert into purchase_orders(organization_id,activity_id,supplier_id,reference,note,created_by)
     values($1,$2,$3,$4,$5,$6) returning id,status`,
    [organizationId, input.activityId ?? null, input.supplierId, input.reference?.slice(0, 160) ?? null, input.note?.slice(0, 4000) ?? null, actorId],
  )).rows[0];
  for (const line of lines) {
    await query(
      `insert into purchase_order_lines(organization_id,purchase_order_id,part_id,label,quantity,unit_price,unit)
       values($1,$2,$3,$4,$5,$6,$7)`,
      [organizationId, order.id, line.partId, line.label, line.quantity, line.unitPrice, line.unit],
    );
  }
  return { id: String(order.id), status: String(order.status), lines: lines.length, total: orderTotal(lines) };
}

/** Valide (commande) : draft → ordered. Les lignes deviennent immuables (hors réception). */
export async function placeOrder(organizationId: string, orderId: string): Promise<{ status: string }> {
  const x = await query(
    `update purchase_orders set status='ordered',ordered_at=now(),updated_at=now()
     where id=$1 and organization_id=$2 and status='draft' returning id`,
    [orderId, organizationId],
  );
  if (!x.rowCount) throw new PurchaseError('INVALID_STATE', 'Seule une commande en brouillon peut être validée (statuts : draft → ordered).');
  return { status: 'ordered' };
}

/** Annule : possible tant qu'aucune réception confirmée (sinon passer par un retour). */
export async function cancelOrder(organizationId: string, orderId: string): Promise<{ status: string }> {
  const open = (await query(`select 1 from purchase_receptions where purchase_order_id=$1 and organization_id=$2 limit 1`, [orderId, organizationId])).rowCount;
  if (open) throw new PurchaseError('INVALID_STATE', 'Une commande déjà réceptionnée ne peut pas être annulée : enregistrez un retour fournisseur.');
  const x = await query(
    `update purchase_orders set status='cancelled',cancelled_at=now(),updated_at=now()
     where id=$1 and organization_id=$2 and status in ('draft','ordered') returning id`,
    [orderId, organizationId],
  );
  if (!x.rowCount) throw new PurchaseError('INVALID_STATE', 'Seule une commande en brouillon ou commandée (sans réception) peut être annulée.');
  return { status: 'cancelled' };
}

export interface ReceptionLineInput { lineId: string; quantity: number; unitCost?: number | null }

/**
 * Réception confirmée (partielle ou complète) : pour chaque ligne liée à un article, crée un
 * mouvement « receipt » (entrée en stock, coût réel conservé sur le mouvement de réception).
 * La ligne de réception ne peut jamais dépasser la quantité commandée non encore reçue.
 */
export async function receiveOrder(
  organizationId: string,
  orderId: string,
  actorId: string | null,
  lines: ReceptionLineInput[],
  note?: string | null,
): Promise<{ status: string; receivedLines: number; movements: Array<{ lineId: string; movementId: string; quantity: number }> }> {
  if (!Array.isArray(lines) || lines.length === 0) throw new PurchaseError('INVALID_LINE', 'Indiquez au moins une ligne à réceptionner.');
  const order = (await query(
    `select id,status,activity_id from purchase_orders where id=$1 and organization_id=$2`,
    [orderId, organizationId],
  )).rows[0];
  if (!order) throw new PurchaseError('ORDER_NOT_FOUND', 'Commande introuvable.');
  if (!['ordered', 'partially_received'].includes(String(order.status))) {
    throw new PurchaseError('INVALID_STATE', `Une commande « ${order.status} » ne peut pas être réceptionnée.`);
  }
  const client = await db.connect();
  const movements: Array<{ lineId: string; movementId: string; quantity: number }> = [];
  try {
    await beginTenant(client);
    await client.query('select * from purchase_orders where id=$1 and organization_id=$2 for update', [orderId, organizationId]);
    const reception = (await client.query(
      `insert into purchase_receptions(organization_id,purchase_order_id,note,received_by) values($1,$2,$3,$4) returning id`,
      [organizationId, orderId, note?.slice(0, 400) ?? null, actorId],
    )).rows[0];
    for (const line of lines) {
      const qty = round2(Number(String(line.quantity ?? '').replace(',', '.')));
      if (!Number.isFinite(qty) || qty <= 0) throw new PurchaseError('INVALID_LINE', 'Quantité de réception invalide.');
      const row = (await client.query(
        `select id,part_id,quantity,received_quantity,label from purchase_order_lines
         where id=$1 and organization_id=$2 and purchase_order_id=$3 for update`,
        [line.lineId, organizationId, orderId],
      )).rows[0];
      if (!row) throw new PurchaseError('LINE_NOT_FOUND', 'Ligne de commande introuvable.');
      const remaining = round2(Number(row.quantity) - Number(row.received_quantity));
      if (qty > remaining + 1e-9) {
        throw new PurchaseError('OVER_RECEPTION', `Ligne « ${row.label} » : ${remaining} restant(s) à réceptionner, ${qty} reçu(s). Une réception ne dépasse jamais la quantité commandée.`);
      }
      const unitCost = line.unitCost != null ? round2(Number(String(line.unitCost).replace(',', '.')) || 0) : null;
      let movementId: string | null = null;
      if (row.part_id) {
        const movement = await createStockMovement(client, organizationId, {
          partId: String(row.part_id),
          type: 'receipt',
          quantity: qty,
          reason: `Réception fournisseur (commande ${orderId.slice(0, 8)})`,
          origin: 'fournisseur',
          destination: row.part_id ? 'stock' : null,
          actorId,
          opType: 'purchase_order',
          opId: orderId,
        });
        movementId = movement.id;
      }
      await client.query(
        `insert into purchase_reception_lines(organization_id,reception_id,order_line_id,part_id,quantity,unit_cost,movement_id)
         values($1,$2,$3,$4,$5,$6,$7)`,
        [organizationId, reception.id, row.id, row.part_id ?? null, qty, unitCost, movementId],
      );
      await client.query(
        `update purchase_order_lines set received_quantity=received_quantity+$2,updated_at=now() where id=$1 and organization_id=$3`,
        [row.id, qty, organizationId],
      );
      movements.push({ lineId: String(row.id), movementId: movementId ?? '', quantity: qty });
    }
    const complete = (await client.query(
      `select 1 from purchase_order_lines where purchase_order_id=$1 and organization_id=$2 and received_quantity<quantity limit 1`,
      [orderId, organizationId],
    )).rowCount;
    const status = complete ? 'partially_received' : 'received';
    await client.query(`update purchase_orders set status=$2,updated_at=now() where id=$1 and organization_id=$3`, [orderId, status, organizationId]);
    await client.query('commit');
    return { status, receivedLines: movements.length, movements };
  } catch (error) {
    await client.query('rollback').catch(() => { });
    throw error;
  } finally {
    client.release();
  }
}

/** Retour fournisseur : sortie de stock tracée (mouvement « return »), jamais d'écriture automatique. */
export async function returnToSupplier(organizationId: string, actorId: string | null, input: {
  supplierId?: string | null; purchaseOrderId?: string | null; lines: Array<{ partId: string; quantity: number; reason?: string | null }>;
}): Promise<{ movements: Array<{ partId: string; movementId: string; quantity: number }> }> {
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new PurchaseError('INVALID_LINE', 'Indiquez au moins une pièce à retourner.');
  const movements: Array<{ partId: string; movementId: string; quantity: number }> = [];
  for (const line of input.lines) {
    const qty = round2(Number(String(line.quantity ?? '').replace(',', '.')));
    if (!Number.isFinite(qty) || qty <= 0) throw new PurchaseError('INVALID_LINE', 'Quantité de retour invalide.');
    const part = (await query('select id from parts where id=$1 and organization_id=$2', [line.partId, organizationId])).rows[0];
    if (!part) throw new PurchaseError('LINE_NOT_FOUND', 'Article introuvable dans cette organisation.');
    const movement = await createStockMovement({ query }, organizationId, {
      partId: String(part.id),
      type: 'return',
      quantity: -qty,
      reason: line.reason?.slice(0, 400) ?? 'Retour fournisseur',
      destination: 'fournisseur',
      actorId,
      opType: input.purchaseOrderId ? 'purchase_order' : 'purchase_return',
      opId: input.purchaseOrderId ?? null,
    });
    movements.push({ partId: String(part.id), movementId: movement.id, quantity: -qty });
  }
  return { movements };
}

/**
 * Propositions de réapprovisionnement (seuils) : déterministes, AUCUNE commande fermée créée.
 * Suggestion = seuil − disponible + déjà commandé (non reçu) : les commandes ouvertes sont
 * prises en compte pour éviter les commandes redondantes (prompt 13, exemple 2).
 */
export async function reorderProposals(organizationId: string, activityId: string | null) {
  const rows = (await query(
    `select p.id,p.name,p.reference,p.unit,p.stock as physical,p.min_stock_threshold as threshold,
       coalesce((select sum(r.quantity) from part_reservations r where r.organization_id=p.organization_id and r.part_id=p.id and r.status='active'),0) as reserved,
       coalesce((select sum(l.quantity-l.received_quantity) from purchase_order_lines l join purchase_orders o on o.id=l.purchase_order_id
         where l.organization_id=p.organization_id and l.part_id=p.id and o.status in ('ordered','partially_received')),0) as ordered,
       (select json_build_object('supplierId',s.id,'supplier',s.name,'purchasePrice',sp.purchase_price)
         from supplier_parts sp join suppliers s on s.id=sp.supplier_id
         where sp.part_id=p.id and sp.available=true order by sp.purchase_price asc limit 1) as preferred_supplier
     from parts p
     where p.organization_id=$1 and ($2::uuid is null or p.activity_id=$2::uuid) and coalesce(p.min_stock_threshold,0)>0
     order by p.name`,
    [organizationId, activityId],
  )).rows;
  return rows.map((r: any) => {
    const physical = round2(Number(r.physical || 0)), reserved = round2(Number(r.reserved || 0));
    const ordered = round2(Number(r.ordered || 0)), threshold = round2(Number(r.threshold || 0));
    const available = round2(physical - reserved);
    const suggestion = round2(Math.max(0, threshold - available - ordered));
    return {
      id: String(r.id), name: r.name, reference: r.reference, unit: r.unit ?? null,
      physical, reserved, available, ordered, threshold,
      belowThreshold: available < threshold,
      suggestedQuantity: suggestion,
      preferredSupplier: r.preferred_supplier ?? null,
    };
  }).filter((p: any) => p.suggestedQuantity > 0);
}

/** Journalise la proposition dans le journal de bord (une seule entrée active par organisation). */
export async function recordReorderProposal(organizationId: string, count: number): Promise<void> {
  if (count <= 0) return;
  await emitOrgEvent(organizationId, {
    type: 'stock_reorder_proposal',
    title: 'Réapprovisionnement à examiner',
    description: `${count} article${count > 1 ? 's' : ''} sous le seuil : consultez les propositions de réapprovisionnement. Aucune commande n'est créée automatiquement.`,
    severity: 'action',
    source: 'stock',
    internalPath: '/catalogue',
    dedupeKey: 'stock-reorder-proposal',
  });
}
