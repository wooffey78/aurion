// 15.4.50 (suggestion B3-bis) — Bibliothèque de prestations types par profil métier.
// La bibliothèque GLOBALE (migration 117, lecture seule pour le runtime) propose, pour le
// profil de l'activité, des lignes de devis types (libellé, unité, prix indicatif, durée
// typique). Les personnalisations de l'entreprise (valeurs confirmées) vivent dans
// profile_service_overrides et GAGNENT toujours sur la bibliothèque : une valeur confirmée
// manuellement n'est jamais réécrite par une mise à jour (règle prompt 02). Les prix de la
// bibliothèque sont INDICATIFS et affichés comme tels — jamais injectés sans confirmation.
import { query } from '../db.js';
import type { SqlExecutor } from './sql-executor.js';

export interface LibraryService {
  label: string; description: string; unit: string;
  /** Prix indicatif en centimes — null = à renseigner, jamais deviné. */
  defaultPriceCents: number | null;
  typicalMinutes: number | null;
  origin: 'library' | 'confirmed';
}

/**
 * Fusionne bibliothèque + overrides. Fonction PURE — testée sans base : la proposition
 * d'origine est conservée quand la valeur n'a pas été confirmée ; l'override CONFIRMÉ gagne ;
 * un override d'origine « proposed » n'écrase pas non plus la bibliothèque (traçabilité).
 */
export function mergeLibraryWithOverrides(library: LibraryService[], overrides: Array<{ label: string; unit?: string | null; defaultPriceCents?: number | null; typicalMinutes?: number | null; origin: string }>): LibraryService[] {
  const byLabel = new Map(library.map(s => [s.label.toLowerCase(), { ...s }]));
  for (const o of overrides) {
    const key = String(o.label || '').toLowerCase();
    const existing = byLabel.get(key);
    if (!existing) {
      byLabel.set(key, {
        label: String(o.label), description: '', unit: o.unit ?? 'forfait',
        defaultPriceCents: o.defaultPriceCents ?? null, typicalMinutes: o.typicalMinutes ?? null,
        origin: o.origin === 'confirmed' ? 'confirmed' : 'library',
      });
      continue;
    }
    if (o.origin !== 'confirmed') continue; // une proposition locale ne réécrit pas la référence
    existing.unit = o.unit ?? existing.unit;
    existing.defaultPriceCents = o.defaultPriceCents ?? existing.defaultPriceCents;
    existing.typicalMinutes = o.typicalMinutes ?? existing.typicalMinutes;
    existing.origin = 'confirmed';
  }
  return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/** Bibliothèque + overrides de l'entreprise pour un profil (wrapper base). */
export async function libraryForProfile(exec: SqlExecutor, organizationId: string, profileCode: string): Promise<{ profileCode: string; services: LibraryService[]; source: string }> {
  // 15.4.52 — la bibliothèque globale n'est PAS scopée par organisation : plus de paramètre
  // $1 inutilisé (PostgreSQL 42P18 « could not determine data type of parameter » → 500).
  void organizationId;
  const library = (await exec.query(
    `select label,description,unit,default_price_cents as "defaultPriceCents",typical_minutes as "typicalMinutes"
     from profile_service_library where profile_code=$1 order by label`,
    [profileCode],
  )).rows.map((r: any) => ({
    label: String(r.label), description: String(r.description || ''), unit: String(r.unit || 'forfait'),
    defaultPriceCents: r.defaultPriceCents == null ? null : Number(r.defaultPriceCents),
    typicalMinutes: r.typicalMinutes == null ? null : Number(r.typicalMinutes),
    origin: 'library' as const,
  }));
  const overrides = (await exec.query(
    `select label,unit,default_price_cents as "defaultPriceCents",typical_minutes as "typicalMinutes",origin
     from profile_service_overrides where organization_id=$1 and profile_code=$2`,
    [organizationId, profileCode],
  )).rows.map((r: any) => ({
    label: String(r.label), unit: r.unit, defaultPriceCents: r.defaultPriceCents == null ? null : Number(r.defaultPriceCents),
    typicalMinutes: r.typicalMinutes == null ? null : Number(r.typicalMinutes), origin: String(r.origin),
  }));
  return {
    profileCode,
    services: mergeLibraryWithOverrides(library, overrides),
    source: 'bibliothèque globale versionnée 2026.11 + personnalisations de l\u2019entreprise (les valeurs confirmées gagnent)',
  };
}

/** Enregistre ou met à jour une personnalisation confirmée (rôle chef d'entreprise côté route). */
export async function upsertOverride(organizationId: string, profileCode: string, input: { label: string; unit?: string | null; defaultPriceCents?: number | null; typicalMinutes?: number | null; updatedBy?: string | null }): Promise<{ saved: boolean }> {
  const label = String(input.label || '').trim().slice(0, 160);
  if (!label) throw new Error('LABEL_REQUIRED');
  const x = await query(
    `insert into profile_service_overrides(organization_id,profile_code,label,unit,default_price_cents,typical_minutes,origin,updated_by)
     values($1,$2,$3,$4,$5,$6,'confirmed',$7)
     on conflict (organization_id,profile_code,label) do update
       set unit=excluded.unit,default_price_cents=excluded.default_price_cents,typical_minutes=excluded.typical_minutes,origin='confirmed',updated_by=excluded.updated_by,updated_at=now()`,
    [organizationId, profileCode, label, input.unit ?? null, input.defaultPriceCents ?? null, input.typicalMinutes ?? null, input.updatedBy ?? null],
  );
  return { saved: Boolean(x.rowCount) };
}

/** Amorce la bibliothèque globale depuis les prestations suggérées du catalogue embarqué (idempotent). */
export async function seedFromEmbeddedCatalog(): Promise<number> {
  const { PROFILE_CODES, profileFor } = await import('./profiles.js');
  let inserted = 0;
  for (const code of PROFILE_CODES) {
    const p = profileFor(code);
    for (const service of p.suggestedServices || []) {
      const x = await query(
        `insert into profile_service_library(profile_code,label,description,unit,source,catalog_version)
         values($1,$2,$3,'forfait','catalogue-embarque','2026.11')
         on conflict (profile_code,label,catalog_version) do nothing`,
        [code, String(service).slice(0, 160), `Prestation typique du profil « ${p.title} » (prix et durée à confirmer par l'entreprise).`],
      );
      inserted += x.rowCount ?? 0;
    }
  }
  return inserted;
}
