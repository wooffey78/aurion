// 15.4.49 — Blocs 01 & 02 (prompts 01 & 02) : provenance de l'identité de l'entreprise et
// versionnage du catalogue de métiers. Contrats de source : migrations additives, routes,
// exposition API, journal d'historique, interface (source/date/établissements).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('migration 103 : provenance + historique des identifiants légaux (additive, RLS, réplication)', () => {
  const m = read('../migrations/103_company_identity_provenance.sql');
  assert.match(m, /alter table organizations add column if not exists identity_source varchar\(40\)/);
  assert.match(m, /alter table organizations add column if not exists identity_checked_at timestamptz/);
  assert.match(m, /create table if not exists organization_identity_history/);
  assert.match(m, /old_value text,\s*\n\s*new_value text/);
  assert.match(m, /policy tenant_isolation on public\.organization_identity_history/);
  assert.match(m, /aurion_sync_journal_write_orgkey/); // réplication 086
});

test('PATCH /organization : historique écrit uniquement sur CHANGEMENT effectif, source déclarée', () => {
  const s = read('../src/routes/organizations.ts');
  assert.match(s, /organization_identity_history\(organization_id,field,old_value,new_value,source,actor_id\)/);
  assert.match(s, /if \(String\(oldValue \?\? ''\) === String\(newValue \?\? ''\)\) continue;/);
  assert.match(s, /then coalesce\(\$19::varchar,'saisie manuelle'\) else identity_source end/);
  assert.match(s, /identity_checked_at=case when \$19::varchar='registre-public'/);
  assert.match(s, /identity_source,identity_checked_at/); // exposé en GET et en retour PATCH
});

test('schéma : identitySource validé contre les valeurs autorisées (aucune valeur libre)', () => {
  const v = read('../src/services/validation.ts');
  assert.match(v, /identitySource: z\.enum\(\['registre-public', 'saisie manuelle', 'import'\]\)\.optional\(\)/);
});

test('service registre : établissements connus exposés (siège + secondaires, dédupliqués)', () => {
  const s = read('../src/services/public-registry.ts');
  assert.match(s, /export interface RegistryEstablishment/);
  assert.match(s, /establishments\?: RegistryEstablishment\[\]/);
  assert.match(s, /const establishments: RegistryEstablishment\[\] = \[\]/);
});

test('interface : source/date des propositions affichées, divergence d\u2019établissements visible', () => {
  const cd = read('../../assets/js/core/company-detect.js');
  assert.match(cd, /Source : \$\{esc\(meta\.source\)\}/);
  assert.match(cd, /données indicatives du registre public, à confirmer/);
  assert.match(cd, /export function renderEstablishmentsNote/);
  assert.match(cd, /le SIRET affiché n'est pas le siège social/);
  const st = read('../../assets/js/pages/dash/settings.js');
  assert.match(st, /identitySource:registryApplied\?'registre-public':undefined/);
  assert.match(st, /Provenance des informations d'identité/);
  assert.match(st, /renderEstablishmentsNote\(\$\('#company-registry-establishments'\)/);
});

test('migration 104 : versions du catalogue de profils (global, lisible, non modifiable par le runtime)', () => {
  const m = read('../migrations/104_profile_catalog_versions.sql');
  assert.match(m, /create table if not exists profile_catalog_versions/);
  assert.match(m, /create table if not exists profile_catalog_entries/);
  assert.match(m, /unique\(version\)/);
  assert.match(m, /unique\(version_id, profile_code\)/);
  assert.match(m, /alter table activity_profile_overrides add column if not exists profile_version varchar\(40\)/);
  assert.match(m, /create policy profile_catalog_read on profile_catalog_versions for select to aurion_runtime using \(true\)/);
  assert.match(m, /grant select on profile_catalog_versions, profile_catalog_entries to aurion_runtime/);
  assert.doesNotMatch(m, /on conflict \(version\) do update/); // jamais d'UPDATE d'une version publiée
});

test('service catalogue : version identifiable, entrées idempotentes, jamais réécrites', () => {
  const s = read('../src/services/profile-catalog.ts');
  assert.match(s, /export const PROFILE_CATALOG_VERSION/);
  assert.match(s, /version: '2026\.11'/);
  assert.match(s, /on conflict \(version\) do nothing/);
  assert.match(s, /on conflict \(version_id,profile_code\) do nothing/);
});

test('routes : GET /profiles/version, décision rattachée à la version, exposition du triplet complet', () => {
  const b = read('../src/routes/business.ts');
  assert.match(b, /app\.get\('\/profiles\/version',async\(\)=>profileCatalogStatus\(\)\)/);
  assert.match(b, /chosen_from_proposal,profile_version from activity_profile_overrides/);
  assert.match(b, /profileVersion:ov\?\.profile_version\|\|null/);
  assert.match(b, /chosen_at else now\(\) end,\s*\n\s*profile_version=excluded\.profile_version/);
});
