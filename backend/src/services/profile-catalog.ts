// 104 (prompt 02) — Versionnage du catalogue de métiers : la version en vigueur du catalogue
// embarqué est identifiable, datée et sourcée, et enregistrée dans la table globale en
// lecture seule (migration 104) au même titre que le référentiel micro (078). Le catalogue
// VIVANT reste le code testé (profiles.ts + corpus de calibrage) : la table ne fait que le
// rendre identifiable et auditable, sans seconde copie divergente à maintenir.
import { query } from '../db.js';
import { PROFILE_CODES, profileFor } from './profiles.js';

/** Version du catalogue livré avec la 15.4.49 (30 profils, calibrage 15.4.44 conservé). */
export const PROFILE_CATALOG_VERSION = {
  version: '2026.11',
  effectiveFrom: '2026-11-21',
  source: 'Catalogue métiers embarqué Aurion (backend/src/services/profiles.ts) · corpus de calibrage 15.4.44',
  verifiedOn: '2026-11-21',
} as const;

/** Identifiant stable de la version 2026.11 en base (migration 104). */
const PROFILE_CATALOG_VERSION_ID = '33333333-3333-4333-8333-333333333301';

/**
 * Enregistre (idempotent) la version courante du catalogue et ses entrées dans la table de
 * versionnage. Jamais d'UPDATE des versions existantes : une évolution du catalogue naît
 * d'une NOUVELLE version (nouvelle constante + nouvelle insertion), les décisions passées
 * restent rattachées à leur version d'origine.
 */
export async function ensureProfileCatalogVersion(): Promise<{ version: string; entries: number; inserted: number }> {
  const v = PROFILE_CATALOG_VERSION;
  await query(
    `insert into profile_catalog_versions(id,version,effective_from,source,verified_on)
     values(${PROFILE_CATALOG_VERSION_ID}::uuid,$1,$2::date,$3,$4::date)
     on conflict (version) do nothing`,
    [v.version, v.effectiveFrom, v.source, v.verifiedOn],
  );
  let inserted = 0;
  for (const code of PROFILE_CODES) {
    const p = profileFor(code);
    const x = await query(
      `insert into profile_catalog_entries(version_id,profile_code,title,payload)
       select id,$2,$3,$4::jsonb from profile_catalog_versions where version=$1
       on conflict (version_id,profile_code) do nothing`,
      [v.version, code, p.title, JSON.stringify({ summary: p.summary, modules: p.modules, services: p.suggestedServices, parts: p.suggestedParts })],
    );
    inserted += x.rowCount ?? 0;
  }
  return { version: v.version, entries: PROFILE_CODES.length, inserted };
}

/** État du versionnage : version du code en vigueur + versions connues en base (jamais réécrites). */
export async function profileCatalogStatus(): Promise<{
  current: typeof PROFILE_CATALOG_VERSION;
  dbVersions: Array<{ version: string; effectiveFrom: string; effectiveTo: string | null; source: string; verifiedOn: string; entries: number }>;
}> {
  await ensureProfileCatalogVersion();
  const rows = (await query(
    `select v.version,v.effective_from,v.effective_to,v.source,v.verified_on,
            (select count(*)::int from profile_catalog_entries e where e.version_id=v.id) entries
     from profile_catalog_versions v order by v.effective_from asc`,
  )).rows;
  const iso = (d: unknown) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10);
  return {
    current: PROFILE_CATALOG_VERSION,
    dbVersions: rows.map((r: any) => ({
      version: String(r.version),
      effectiveFrom: iso(r.effective_from),
      effectiveTo: r.effective_to ? iso(r.effective_to) : null,
      source: String(r.source),
      verifiedOn: iso(r.verified_on),
      entries: Number(r.entries || 0),
    })),
  };
}
