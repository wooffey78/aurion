// Bloc 10 (prompt 10) — moteur de stock traçable, réservations et seuils de réapprovisionnement.
// RÈGLE CENTRALE : la quantité d'un article n'est JAMAIS modifiée par écriture libre — toute
// variation passe par `createStockMovement`, qui verrouille la ligne article, recalcule le
// stock physique, refuse le stock négatif, écrit le mouvement historisé (quantité signée,
// motif, origine/destination, acteur, lien opérationnel) puis évalue le seuil.
// Le STOCK DISPONIBLE = physique − réservations actives ; la réservation ne touche pas le
// physique, la consommation réelle crée le mouvement au moment confirmé.
import type { SqlExecutor } from './sql-executor.js';
import { query } from '../db.js';
import { emitOrgEvent, resolveOrgEvent } from './events.js';

export type MovementType = 'initial' | 'receipt' | 'consumption' | 'adjustment' | 'return' | 'damage' | 'loss';

/** Sens attendu de chaque type de mouvement : +1 entrée de stock, −1 sortie, 0 signé libre. */
export const MOVEMENT_SIGNS: Record<MovementType, 1 | -1 | 0> = {
  initial: 1,
  receipt: 1,
  consumption: -1,
  adjustment: 0,
  return: -1,
  damage: -1,
  loss: -1,
};

export interface MovementInput {
  partId: string;
  type: MovementType;
  /** Quantité signée : positive pour une entrée, négative pour une sortie, libre pour un ajustement. */
  quantity: number;
  reason?: string | null;
  origin?: string | null;
  destination?: string | null;
  actorId?: string | null;
  opType?: string | null;
  opId?: string | null;
  /** 15.4.50 (A6) — emplacement du mouvement (migration 111) : null = sans dimension tracée. */
  locationId?: string | null;
}

export class StockError extends Error {
  constructor(public code: 'NEGATIVE_STOCK' | 'PART_NOT_FOUND' | 'INVALID_QUANTITY' | 'PART_LOCKED', message: string) {
    super(message);
  }
}

/** Arrondi 2 décimales identique au reste du moteur (invoice-workflow.roundMoney). */
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Valide une quantité de mouvement : finie, non nulle, signe conforme au type.
 * Fonction PURE — testée sans base.
 */
export function validateMovementQuantity(type: MovementType, quantity: number): { quantity: number } {
  if (!Number.isFinite(quantity) || Math.abs(quantity) < 1e-9) {
    throw new StockError('INVALID_QUANTITY', 'La quantité du mouvement doit être un nombre non nul.');
  }
  const rounded = round2(quantity);
  const sign = MOVEMENT_SIGNS[type];
  if (sign === 1 && rounded <= 0) throw new StockError('INVALID_QUANTITY', `Un mouvement de type « ${type} » doit être positif.`);
  if (sign === -1 && rounded >= 0) throw new StockError('INVALID_QUANTITY', `Un mouvement de type « ${type} » doit être négatif.`);
  return { quantity: rounded };
}

/**
 * Calcule le stock résultant et refuse le négatif. Fonction PURE — testée sans base.
 */
export function computeStockAfter(currentStock: number, quantity: number, allowNegative = false): number {
  const after = round2(Number(currentStock || 0) + Number(quantity));
  if (!allowNegative && after < 0) {
    throw new StockError('NEGATIVE_STOCK', `Stock insuffisant : ${round2(currentStock)} en physique, ${round2(quantity)} demandé.`);
  }
  return after;
}

type Executor = SqlExecutor | { query: (text: string, values?: unknown[]) => Promise<any> };

/**
 * Crée un mouvement de stock traçable dans une transaction existante (le verrou FOR UPDATE
 * couvre la transaction appelante). Évalue ensuite le seuil de réapprovisionnement.
 */
export async function createStockMovement(
  exec: Executor,
  organizationId: string,
  input: MovementInput,
): Promise<{ id: string; quantity: number; quantityAfter: number; belowThreshold: boolean; threshold: number; available: number }> {
  const { quantity } = validateMovementQuantity(input.type, input.quantity);
  const part = (await exec.query(
    `select id,stock,coalesce(min_stock_threshold,0) as threshold from parts where id=$1 and organization_id=$2 for update`,
    [input.partId, organizationId],
  )).rows[0];
  if (!part) throw new StockError('PART_NOT_FOUND', 'Article introuvable dans cette organisation.');
  const after = computeStockAfter(Number(part.stock || 0), quantity);
  const movement = (await exec.query(
    `insert into stock_movements(organization_id,part_id,movement_type,quantity,quantity_after,reason,origin,destination,actor_id,op_type,op_id,location_id)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [organizationId, input.partId, input.type, quantity, after, input.reason ?? null, input.origin ?? null, input.destination ?? null, input.actorId ?? null, input.opType ?? null, input.opId ?? null, input.locationId ?? null],
  )).rows[0];
  await exec.query('update parts set stock=$1,updated_at=now() where id=$2 and organization_id=$3', [after, input.partId, organizationId]);
  const available = round2(after - Number((await exec.query(
    `select coalesce(sum(quantity),0) reserved from part_reservations where organization_id=$1 and part_id=$2 and status='active'`,
    [organizationId, input.partId],
  )).rows[0]?.reserved ?? 0));
  const belowThreshold = await evaluateThreshold(exec, organizationId, input.partId, available, Number(part.threshold || 0), after);
  return { id: String(movement.id), quantity, quantityAfter: after, belowThreshold, threshold: Number(part.threshold || 0), available };
}

/**
 * Évalue le seuil d'un article et maintient l'alerte du journal de bord (idempotente par
 * dedupe_key) : sous le seuil → événement actif ; au-dessus → résolution. Le seuil s'applique
 * au STOCK DISPONIBLE (physique − réservations), pour éviter la surréservation.
 */
export async function evaluateThreshold(
  exec: Executor,
  organizationId: string,
  partId: string,
  available: number,
  threshold: number,
  physical: number,
  partName = '',
): Promise<boolean> {
  if (threshold <= 0) return false;
  if (round2(available) < round2(threshold)) {
    await emitOrgEvent(organizationId, {
      type: 'stock_below_threshold',
      title: partName ? `Stock faible : ${partName}` : 'Stock faible',
      description: `Stock disponible ${round2(available)} ${available === 1 ? 'unité' : 'unités'} (physique ${round2(physical)}), sous le seuil de réapprovisionnement ${round2(threshold)}. Une proposition de réapprovisionnement peut être préparée — aucune commande n'est créée automatiquement.`,
      severity: 'warning',
      source: 'stock',
      internalPath: '/catalogue',
      dedupeKey: `stock-below-threshold:${partId}`,
    });
    return true;
  }
  await resolveOrgEvent(organizationId, `stock-below-threshold:${partId}`);
  return false;
}

/** Disponible d'un article : physique − réservations actives. */
export async function availableQuantity(exec: Executor, organizationId: string, partId: string): Promise<number> {
  const row = (await exec.query(
    `select p.stock - coalesce((select sum(r.quantity) from part_reservations r where r.organization_id=p.organization_id and r.part_id=p.id and r.status='active'),0) as available
     from parts p where p.id=$1 and p.organization_id=$2`,
    [partId, organizationId],
  )).rows[0];
  return round2(Number(row?.available ?? 0));
}

export type ReservationInput = {
  partId: string;
  quantity: number;
  quoteId?: string | null;
  appointmentId?: string | null;
  note?: string | null;
  createdBy?: string | null;
};

/**
 * Crée une réservation : diminue le DISPONIBLE, jamais le physique. La surréservation est
 * refusée : disponible insuffisant → erreur explicite (le dépassement reste une décision
 * humaine, pas un état silencieux).
 */
export async function reservePart(
  exec: Executor,
  organizationId: string,
  input: ReservationInput,
): Promise<{ id: string; availableAfter: number }> {
  const qty = round2(Number(input.quantity));
  if (!Number.isFinite(qty) || qty <= 0) throw new StockError('INVALID_QUANTITY', 'La quantité réservée doit être un nombre positif.');
  const part = (await exec.query(`select id from parts where id=$1 and organization_id=$2 for update`, [input.partId, organizationId])).rows[0];
  if (!part) throw new StockError('PART_NOT_FOUND', 'Article introuvable dans cette organisation.');
  const available = await availableQuantity(exec, organizationId, input.partId);
  if (qty > available) {
    throw new StockError('NEGATIVE_STOCK', `Réservation refusée : disponible ${available}, demandé ${qty}. La réservation ne doit jamais dépasser le stock disponible.`);
  }
  const row = (await exec.query(
    `insert into part_reservations(organization_id,part_id,quote_id,appointment_id,quantity,created_by,note)
     values($1,$2,$3,$4,$5,$6,$7) returning id`,
    [organizationId, input.partId, input.quoteId ?? null, input.appointmentId ?? null, qty, input.createdBy ?? null, input.note ?? null],
  )).rows[0];
  return { id: String(row.id), availableAfter: round2(available - qty) };
}

/** Libère une réservation active (annulation ou modification de l'opération liée). */
export async function releaseReservation(exec: Executor, organizationId: string, reservationId: string, reason: string): Promise<boolean> {
  const x = await exec.query(
    `update part_reservations set status='released',updated_at=now(),note=coalesce($3,note)
     where id=$1 and organization_id=$2 and status='active' returning id`,
    [reservationId, organizationId, reason.slice(0, 400)],
  );
  return Boolean(x.rowCount);
}

/**
 * Consomme une réservation : le statut passe à consumed et un mouvement « consumption » est
 * créé AU MOMENT DE LA CONFIRMATION (lien opérationnel conservé). Refus si déjà consommée.
 */
export async function consumeReservation(
  exec: Executor,
  organizationId: string,
  reservationId: string,
  opts: { actorId?: string | null; opType?: string | null; opId?: string | null; reason?: string | null } = {},
): Promise<{ movementId: string; quantity: number }> {
  const res = (await exec.query(
    `select id,part_id,quantity,status from part_reservations where id=$1 and organization_id=$2 for update`,
    [reservationId, organizationId],
  )).rows[0];
  if (!res) throw new StockError('PART_NOT_FOUND', 'Réservation introuvable.');
  if (res.status !== 'active') throw new StockError('PART_LOCKED', `Réservation déjà traitée (${res.status}) : elle ne peut plus être consommée.`);
  const movement = await createStockMovement(exec, organizationId, {
    partId: String(res.part_id),
    type: 'consumption',
    quantity: -Number(res.quantity),
    reason: opts.reason ?? 'Consommation d’une réservation confirmée',
    actorId: opts.actorId ?? null,
    opType: opts.opType ?? null,
    opId: opts.opId ?? null,
  });
  await exec.query(`update part_reservations set status='consumed',updated_at=now() where id=$1 and organization_id=$2`, [reservationId, organizationId]);
  return { movementId: movement.id, quantity: Number(res.quantity) };
}

/** Libère toutes les réservations actives liées à un devis (annulation/modification). */
export async function releaseQuoteReservations(exec: Executor, organizationId: string, quoteId: string, reason: string): Promise<number> {
  const x = await exec.query(
    `update part_reservations set status='released',updated_at=now(),note=coalesce($3,note)
     where organization_id=$1 and quote_id=$2 and status='active' returning id`,
    [organizationId, quoteId, reason.slice(0, 400)],
  );
  return x.rowCount ?? 0;
}

/**
 * Prompt 08 — libère toutes les réservations actives liées à un rendez-vous (annulation
 * ou suppression) : réserver n'est pas consommer, et la disparition de la cause rend les
 * quantités au disponible. Miroir exact de releaseQuoteReservations.
 */
export async function releaseAppointmentReservations(exec: Executor, organizationId: string, appointmentId: string, reason: string): Promise<number> {
  const x = await exec.query(
    `update part_reservations set status='released',updated_at=now(),note=coalesce($3,note)
     where organization_id=$1 and appointment_id=$2 and status='active' returning id`,
    [organizationId, appointmentId, reason.slice(0, 400)],
  );
  return x.rowCount ?? 0;
}

// ---------------------------------------------------------------------------------------
// Requêtes hors transaction (routes de lecture) — même SQL, pool tenant standard.
// ---------------------------------------------------------------------------------------

export async function stockSummary(organizationId: string, activityId: string | null) {
  const rows = (await query(
    `select p.id,p.name,p.reference,p.unit,p.stock as physical,
            coalesce(min_stock_threshold,0) as threshold,p.storage_location,
            coalesce((select sum(r.quantity) from part_reservations r where r.organization_id=p.organization_id and r.part_id=p.id and r.status='active'),0) as reserved,
            (p.stock - coalesce((select sum(r.quantity) from part_reservations r where r.organization_id=p.organization_id and r.part_id=p.id and r.status='active'),0)) as available,
            coalesce((select sum(l.quantity - l.received_quantity) from purchase_order_lines l join purchase_orders o on o.id=l.purchase_order_id
              where l.organization_id=p.organization_id and l.part_id=p.id and o.status in ('ordered','partially_received')),0) as ordered
     from parts p where p.organization_id=$1 and ($2::uuid is null or p.activity_id=$2::uuid) order by p.name`,
    [organizationId, activityId],
  )).rows.map((r: any) => ({
    id: String(r.id), name: r.name, reference: r.reference, unit: r.unit ?? null,
    physical: round2(Number(r.physical || 0)), reserved: round2(Number(r.reserved || 0)),
    available: round2(Number(r.available || 0)), ordered: round2(Number(r.ordered || 0)),
    threshold: round2(Number(r.threshold || 0)), storageLocation: r.storage_location ?? null,
    belowThreshold: Number(r.threshold || 0) > 0 && round2(Number(r.available || 0)) < round2(Number(r.threshold || 0)),
  }));
  return { parts: rows, belowThreshold: rows.filter(p => p.belowThreshold) };
}

export async function stockMovements(organizationId: string, partId: string | null, limit = 100) {
  const rows = (await query(
    `select m.id,m.part_id,m.movement_type as "movementType",m.quantity,m.quantity_after as "quantityAfter",
            m.reason,m.origin,m.destination,m.op_type as "opType",m.op_id as "opId",m.created_at as "createdAt",
            p.name as "partName"
     from stock_movements m join parts p on p.id=m.part_id
     where m.organization_id=$1 and ($2::uuid is null or m.part_id=$2::uuid)
     order by m.created_at desc limit $3`,
    [organizationId, partId, Math.min(500, Math.max(1, limit))],
  )).rows;
  return rows.map((r: any) => ({ ...r, quantity: round2(Number(r.quantity)), quantityAfter: round2(Number(r.quantityAfter)) }));
}

export async function listReservations(organizationId: string, partId: string | null, status: string | null) {
  const rows = (await query(
    `select r.id,r.part_id as "partId",p.name as "partName",r.quote_id as "quoteId",r.appointment_id as "appointmentId",
            r.quantity,r.status,r.note,r.created_at as "createdAt",r.updated_at as "updatedAt"
     from part_reservations r join parts p on p.id=r.part_id
     where r.organization_id=$1 and ($2::uuid is null or r.part_id=$2::uuid) and ($3::varchar is null or r.status=$3)
     order by r.created_at desc limit 500`,
    [organizationId, partId, status],
  )).rows;
  return rows.map((r: any) => ({ ...r, quantity: round2(Number(r.quantity)) }));
}
