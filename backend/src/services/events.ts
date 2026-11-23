// Bloc 19 (prompt général §7) — socle d'émission d'événements métier.
// Les événements étaient écrits par des INSERT dispersés ; ce module centralise l'émission
// dans le flux in-app existant `dashboard_journal_events` (identifié, daté, dédoublonné par
// dedupe_key, résoluble). Chaque événement reste idempotent : un même dedupe_key ne crée
// jamais de doublon ; la résolution est réversible (resolved_at réinitialisable).
import { query } from '../db.js';

export type OrgEventSeverity = 'action' | 'info' | 'warning' | 'error' | 'success';

export interface OrgEventInput {
  type: string;
  title: string;
  description?: string;
  severity?: OrgEventSeverity;
  source?: string;
  internalPath?: string | null;
  externalUrl?: string | null;
  /** Clé de dédoublonnage dans l'organisation (obligatoire pour l'idempotence). */
  dedupeKey: string;
}

/** Émet (ou met à jour) un événement in-app pour une organisation. Idempotent par dedupe_key. */
export async function emitOrgEvent(organizationId: string, event: OrgEventInput): Promise<void> {
  await query(
    `insert into dashboard_journal_events(organization_id,event_type,title,description,severity,source,internal_path,external_url,dedupe_key)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (organization_id,dedupe_key) do update
       set title=excluded.title,
           description=excluded.description,
           severity=excluded.severity,
           source=excluded.source,
           internal_path=excluded.internal_path,
           external_url=excluded.external_url,
           -- La condition est re-détectée : l'événement redevient actif (l'émission n'est
           -- appelée qu'au moment où la condition est constatée par le module propriétaire).
           resolved_at=null,
           is_read=false`,
    [
      organizationId,
      String(event.type).slice(0, 60),
      String(event.title).slice(0, 240),
      String(event.description ?? ''),
      event.severity ?? 'info',
      event.source ?? 'system',
      event.internalPath ?? null,
      event.externalUrl ?? null,
      String(event.dedupeKey).slice(0, 240),
    ],
  );
}

/** Résout (ferme) l'événement correspondant, sans rouvrir une entrée déjà résolue manuellement. */
export async function resolveOrgEvent(organizationId: string, dedupeKey: string): Promise<void> {
  await query(
    `update dashboard_journal_events set resolved_at=coalesce(resolved_at,now())
     where organization_id=$1 and dedupe_key=$2`,
    [organizationId, String(dedupeKey).slice(0, 240)],
  );
}

/** Marque l'événement comme non résolu (état revenu à la normale puis re-détécté). */
export async function reopenOrgEvent(organizationId: string, dedupeKey: string): Promise<void> {
  await query(
    `update dashboard_journal_events set resolved_at=null,is_read=false
     where organization_id=$1 and dedupe_key=$2`,
    [organizationId, String(dedupeKey).slice(0, 240)],
  );
}
