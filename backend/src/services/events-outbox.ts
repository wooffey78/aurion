// 109 (prompt 05) — Outbox transactionnel d'événements métier : fondation de la livraison
// « au moins une fois » SANS effet métier multiple.
//
// Principes (prompt 05) :
//   - l'événement est écrit DANS la transaction métier de l'opération source
//     (publishInTransaction) : publié = validé, rien n'est émis depuis une opération
//     qui a échoué ;
//   - l'idempotence est garantie par la clé unique (organization_id, idempotency_key) :
//     rejeu ou concurrence → une seule ligne ;
//   - le worker livre vers les canaux disponibles (journal de bord in-app en premier)
//     avec revendication atomique `for update skip locked` (multi-instances), reprise
//     après erreur, backoff exponentiel et lettre morte après épuisement des tentatives ;
//   - BOUCLE IMPOSSIBLE par construction : le canal journal n'est JAMAIS re-publié dans
//     l'outbox (aucun événement→action→même événement) ; les workflows (098) continuent
//     d'écrire directement leurs actions internes, sans passer par l'outbox.
//
// Le journal de bord existant (dashboard_journal_events, 065) reste inchangé : il devient
// un canal de livraison de l'outbox, pas un doublon du modèle.
import { adminQuery, query, withTenant } from '../db.js';
import { emitOrgEvent } from './events.js';

export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_BASE_DELAY_MS = 60_000;
export const OUTBOX_MAX_DELAY_MS = 3_600_000;

/** Backoff exponentiel plafonné (60 s → 3 600 s) — fonction PURE, testée sans base. */
export function outboxNextDelayMs(attempts: number): number {
  const a = Math.max(0, Math.floor(Number(attempts) || 0));
  return Math.min(OUTBOX_MAX_DELAY_MS, OUTBOX_BASE_DELAY_MS * Math.pow(2, a));
}

/** Lettre morte après épuisement des tentatives (le compteur futur atteint le maximum) — PURE. */
export function outboxShouldDeadLetter(nextAttempts: number): boolean {
  return Math.max(1, Math.floor(Number(nextAttempts) || 1)) >= OUTBOX_MAX_ATTEMPTS;
}

export interface OutboxEventInput {
  type: string;
  /** Clé de dédoublonnage dans l'organisation (obligatoire) : opération + objet source. */
  idempotencyKey: string;
  actorId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  correlationId?: string | null;
  payload?: unknown;
  eventVersion?: number;
}

type Executor = { query: (text: string, values?: unknown[]) => Promise<any> };

/**
 * Publie un événement dans la transaction métier de l'opération source. Retourne true si
 * l'événement a été créé (false = déjà publié : même clé, aucun doublon).
 */
export async function publishInTransaction(exec: Executor, organizationId: string, input: OutboxEventInput): Promise<boolean> {
  const key = String(input.idempotencyKey || '').slice(0, 160);
  if (!key) throw new Error('OUTBOX_IDEMPOTENCY_KEY_REQUIRED');
  const x = await exec.query(
    `insert into business_events_outbox(organization_id,event_type,event_version,actor_id,source_entity_type,source_entity_id,correlation_id,payload,idempotency_key)
     values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
     on conflict (organization_id,idempotency_key) do nothing returning id`,
    [
      organizationId,
      String(input.type).slice(0, 60),
      Math.max(1, Math.floor(Number(input.eventVersion ?? 1))),
      input.actorId ?? null,
      input.sourceEntityType ?? null,
      input.sourceEntityId ?? null,
      input.correlationId ?? null,
      JSON.stringify(input.payload ?? {}),
      key,
    ],
  );
  return Boolean(x.rowCount);
}

/** Livraison vers le canal journal de bord : l'outbox n'est JAMAIS réémis dans l'outbox. */
async function deliverToJournal(organizationId: string, row: any): Promise<void> {
  const payload = (row.payload && typeof row.payload === 'object') ? row.payload as Record<string, unknown> : {};
  const title = String(payload.title || row.event_type).slice(0, 240);
  const description = String(payload.description || `Événement métier « ${row.event_type} » enregistré par l'outbox (v${Number(row.event_version || 1)}).`).slice(0, 1000);
  await emitOrgEvent(organizationId, {
    type: String(row.event_type).slice(0, 60),
    title,
    description,
    severity: payload.severity === 'warning' || payload.severity === 'error' || payload.severity === 'success' ? payload.severity as any : 'info',
    source: row.source_entity_type ? `outbox:${row.source_entity_type}` : 'outbox',
    dedupeKey: `outbox:${row.id}`,
  });
}

export interface OutboxSweepResult { claimed: number; delivered: number; failed: number; deadLettered: number }

/**
 * Balayage planifié de l'outbox (appelé par le scheduler, comme le balayage des workflows) :
 * revendication atomique inter-organisations par le pool d'administration journalisé,
 * livraison par événement dans le contexte tenant exact (RLS 074), échec → backoff puis
 * lettre morte. Un échec sur un événement n'interrompt jamais les suivants.
 */
export async function processOutboxQueue(log: any, limit = 50): Promise<OutboxSweepResult> {
  const result: OutboxSweepResult = { claimed: 0, delivered: 0, failed: 0, deadLettered: 0 };
  let rows: any[] = [];
  try {
    // Multi-instances : seuls les événements dus sont revendiqués (status pending →
    // processing), `for update skip locked` empêche deux workers de prendre le même.
    rows = (await adminQuery(
      `with due as (
         select id from business_events_outbox
         where status='pending' and next_attempt_at<=now()
         order by next_attempt_at,created_at limit $1
         for update skip locked
       )
       update business_events_outbox o set status='processing'
       from due where o.id=due.id
       returning o.id,o.organization_id,o.event_type,o.event_version,o.payload,o.source_entity_type,o.attempts`,
      [Math.min(200, Math.max(1, limit))],
    )).rows;
  } catch (e: any) {
    log?.warn?.({ err: String(e?.message || e) }, 'outbox claim failed');
    return result;
  }
  result.claimed = rows.length;
  for (const row of rows) {
    const orgId = String(row.organization_id);
    try {
      await withTenant(orgId, async () => {
        const fresh = (await query('select id,status,attempts from business_events_outbox where id=$1 for update', [row.id])).rows[0];
        if (!fresh || fresh.status !== 'processing') return; // déjà traité par une autre instance
        await deliverToJournal(orgId, row);
        await query(`update business_events_outbox set status='processed',processed_at=now(),last_error=null where id=$1`, [row.id]);
      });
      result.delivered += 1;
    } catch (e: any) {
      result.failed += 1;
      const attempts = Number(row.attempts || 0) + 1;
      const dead = outboxShouldDeadLetter(attempts);
      const delay = outboxNextDelayMs(attempts - 1);
      try {
        await withTenant(orgId, async () => {
          await query(
            `update business_events_outbox
             set status=case when $2 then 'dead_lettered' else 'pending' end,
                 attempts=$3, next_attempt_at=now()+($4||' milliseconds')::interval, last_error=$5
             where id=$1`,
            [row.id, dead, attempts, String(delay), String(e?.message || e).slice(0, 1000)],
          );
        });
        if (dead) result.deadLettered += 1;
        log?.warn?.({ err: String(e?.message || e), eventId: row.id, attempts, dead }, 'outbox delivery failed');
      } catch (inner: any) {
        log?.error?.({ err: String(inner?.message || inner) }, 'outbox failure bookkeeping failed');
      }
    }
  }
  return result;
}

/**
 * Rejeu contrôlé d'un événement en lettre morte (action humaine, motif requis) : revient
 * à l'état pending pour un nouveau cycle de livraison. Jamais automatique.
 */
export async function replayDeadLetteredEvent(organizationId: string, eventId: string, actorId: string | null): Promise<boolean> {
  let ok = false;
  await withTenant(organizationId, async () => {
    const x = await query(
      `update business_events_outbox set status='pending',attempts=0,next_attempt_at=now(),last_error=null
       where id=$1 and organization_id=$2 and status='dead_lettered' returning id`,
      [eventId, organizationId],
    );
    ok = Boolean(x.rowCount);
  });
  return ok;
}
