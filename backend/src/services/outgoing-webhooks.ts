// 15.4.50 (suggestion B8) — Webhooks sortants signés : canal de l'outbox 109 vers les outils
// partenaires (cabinets comptables, intégrateurs). Même contrat que l'outbox métier :
// livraison au moins une fois, idempotence, backoff exponentiel plafonné, lettre morte au
// 5e essai et rejeu contrôlé. La signature HMAC-SHA256 couvre le CORPS EXACT envoyé
// (timestamp inclus contre le rejeu) ; le secret n'est jamais stocké en clair (migration 115 :
// cipher via le stockage des secrets existant + empreinte pour vérifier sans révéler).
import { createHash, createHmac } from 'node:crypto';
import type { SqlExecutor } from './sql-executor.js';

export const WEBHOOK_MAX_ATTEMPTS = 5;
/** Types d'événements sortants disponibles (liste fermée, documentée). */
export const WEBHOOK_EVENT_TYPES = [
  'quote_accepted', 'quote_rejected', 'invoice_sent', 'invoice_paid',
  'client_merged', 'chantier_drift', 'integrity_chain_recorded',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Empreinte de vérification du secret (sans le révéler). */
export function secretFingerprint(secret: string): string {
  return createHash('sha256').update(String(secret)).digest('hex');
}

/**
 * Construit l'en-tête de signature : `t=<epoch-secondes>,v1=<hmac-sha256(secret, t + '.' + body)>`.
 * Le corps signé est EXACTEMENT celui envoyé — une réécriture casse la vérification côté tiers.
 * Fonction PURE — testée sans base (vecteurs de test fixes).
 */
export function buildDeliveryHeaders(secret: string, body: string, timestampSeconds?: number): { 'Content-Type': string; 'X-Aurion-Signature': string } & Record<string, string> {
  const t = Math.floor(Number(timestampSeconds ?? Date.now() / 1000));
  const signature = createHmac('sha256', String(secret)).update(`${t}.${body}`).digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-Aurion-Signature': `t=${t},v1=${signature}`,
  };
}

/** Vérifie une signature (utile pour les tests de bout en bout et la doc tiers). PURE. */
export function verifyDeliverySignature(secret: string, body: string, header: string): boolean {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(header || ''));
  if (!m) return false;
  const expected = buildDeliveryHeaders(secret, body, Number(m[1]))['X-Aurion-Signature'];
  return expected === String(header);
}

/** Backoff exponentiel plafonné — mêmes bornes que l'outbox métier (109). */
export function webhookNextDelayMs(attempts: number): number {
  return Math.min(60000, Math.round(1000 * Math.pow(2, Math.max(0, attempts - 1))));
}

/**
 * Met en file les livraisons d'un événement outbox vers tous les endpoints actifs abonnés
 * à ce type d'événement (appelé par le sweep). Idempotent par (org, idempotency_key).
 */
export async function enqueueForEvent(exec: SqlExecutor, organizationId: string, event: { eventType: string; sourceEntityType?: string | null; sourceEntityId?: string | null; idempotencyKey: string; payload: unknown }): Promise<number> {
  const rows = (await exec.query(
    `select id from webhook_endpoints where organization_id=$1 and status='active' and $2 = any(events)`,
    [organizationId, event.eventType],
  )).rows;
  let queued = 0;
  for (const row of rows) {
    const key = `${row.id}:${event.idempotencyKey}`.slice(0, 160);
    const x = await exec.query(
      `insert into webhook_deliveries(organization_id,endpoint_id,event_type,source_entity_type,source_entity_id,payload,idempotency_key)
       values($1,$2,$3,$4,$5,$6,$7) on conflict (organization_id,idempotency_key) do nothing`,
      [organizationId, row.id, event.eventType, event.sourceEntityType ?? null, event.sourceEntityId ?? null, JSON.stringify(event.payload ?? null), key],
    );
    queued += x.rowCount ?? 0;
  }
  return queued;
}

/**
 * Tente une livraison (appelée par le sweep, une tentative par appel). Le statut n'est
 * jamais « processed » sans réponse 2xx réelle du tiers — aucun faux succès (prompt 05).
 */
export async function attemptDelivery(exec: SqlExecutor, organizationId: string, deliveryId: string, fetchImpl: typeof fetch): Promise<{ status: string; attempts: number }> {
  const d = (await exec.query(
    `select w.id,w.endpoint_id,w.event_type,w.payload,w.idempotency_key,w.attempts,e.url,e.secret_cipher
     from webhook_deliveries w join webhook_endpoints e on e.id=w.endpoint_id
     where w.id=$2 and w.organization_id=$1 and w.status in ('pending','failed') for update of w`,
    [organizationId, deliveryId],
  )).rows[0];
  if (!d) return { status: 'not_found', attempts: -1 };
  const attempts = Number(d.attempts || 0) + 1;
  const body = JSON.stringify({ event: d.event_type, data: d.payload, idempotencyKey: d.idempotency_key, attempts });
  // Le secret chiffré est déchiffré par le service de secrets existant (aucun secret en clair
  // dans les journaux ni dans la base). La clé de déchiffrement provient de la configuration.
  const { decryptSecret } = await import('./secrets.js');
  const secret = await decryptSecret(String(d.secret_cipher));
  const headers = buildDeliveryHeaders(secret, body);
  try {
    const res = await fetchImpl(String(d.url), { method: 'POST', headers: { ...headers, 'X-Aurion-Delivery': String(d.id) }, body });
    if (res.ok) {
      await exec.query(`update webhook_deliveries set status='processed',attempts=$3,processed_at=now(),next_attempt_at=now() where id=$2 and organization_id=$1`, [organizationId, deliveryId, attempts]);
      return { status: 'processed', attempts };
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (error: any) {
    const dead = attempts >= WEBHOOK_MAX_ATTEMPTS;
    await exec.query(
      `update webhook_deliveries set status=$3,attempts=$4,last_error=$5,next_attempt_at=now() + make_interval(secs => $6) where id=$2 and organization_id=$1`,
      [organizationId, deliveryId, dead ? 'dead_lettered' : 'failed', attempts, String(error?.message || error).slice(0, 500), webhookNextDelayMs(attempts) / 1000],
    );
    return { status: dead ? 'dead_lettered' : 'failed', attempts };
  }
}
