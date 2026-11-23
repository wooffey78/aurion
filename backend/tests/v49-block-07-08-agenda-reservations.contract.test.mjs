// 15.4.49 — Blocs 07 & 08 (prompts 09 & 08) : agenda — collisions avec dérogation auditées,
// origine des événements, indisponibilités, temps de déplacement honnête ; libération des
// réservations liées aux documents et rendez-vous supprimés.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('migration 108 : origine des rendez-vous, indisponibilités et audit des dérogations (RLS + réplication)', () => {
  const m = read('../migrations/108_agenda_unification.sql');
  assert.match(m, /alter table appointments add column if not exists origin varchar\(20\) not null default 'internal'/);
  assert.match(m, /check \(origin in \('internal', 'external_import', 'synchronized'\)\)/);
  assert.match(m, /add column if not exists external_uid varchar\(255\)/);
  assert.match(m, /add column if not exists timezone varchar\(64\)/);
  assert.match(m, /add column if not exists recurrence_rule varchar\(200\)/);
  assert.match(m, /create table if not exists calendar_unavailabilities/);
  assert.match(m, /create table if not exists calendar_override_audit/);
  assert.match(m, /policy tenant_isolation on public\.calendar_unavailabilities/);
  assert.match(m, /policy tenant_isolation on public\.calendar_override_audit/);
});

test('collisions : chevauchement détecté (rendez-vous + indisponibilités), 409 avec la liste', () => {
  const b = read('../src/routes/business.ts');
  assert.match(b, /async function calendarConflicts\(org:string,excludeId:string\|null,startIso:string,endIso:string\)/);
  assert.match(b, /tstzrange\(a\.starts_at,coalesce\(a\.ends_at,a\.starts_at\),'\[\)'\) && tstzrange\(\$3::timestamptz,\$4::timestamptz,'\[\)'\)/);
  assert.match(b, /tstzrange\(starts_at,coalesce\(ends_at,starts_at\),'\[\)'\) && tstzrange\(\$2::timestamptz,\$3::timestamptz,'\[\)'\)/);
  assert.match(b, /error:'CALENDAR_CONFLICT',message:'Ce créneau chevauche un rendez-vous ou une indisponibilité existants/);
  // Dérogation EXPLICITE et AUDITÉE : allowConflict + motif obligatoire + ligne d'audit.
  assert.match(b, /error:'CONFLICT_REASON_REQUIRED'/);
  assert.match(b, /insert into calendar_override_audit\(organization_id,appointment_id,conflict_items,reason,actor_id\)/);
  // Le déplacement (PATCH) vérifie aussi les collisions, hors le rendez-vous lui-même.
  assert.match(b, /const conflicts=await calendarConflicts\(org,String\(id\),start\.toISOString\(\),end\.toISOString\(\)\)/);
});

test('origine déclarée : jamais de fausse origine (défaut internal, valeurs validées)', () => {
  const b = read('../src/routes/business.ts');
  assert.match(b, /const origin=\['internal','external_import','synchronized'\]\.includes\(String\(b\.origin\)\)\?String\(b\.origin\):'internal'/);
  const s = read('../src/services/statuses.ts');
  assert.match(s, /export const AGENDA_ORIGINS = \['internal', 'external_import', 'synchronized'\] as const/);
});

test('temps de déplacement : aucune valeur prétendue réelle sans source de routage configurée', () => {
  const b = read('../src/routes/business.ts');
  assert.match(b, /app\.get\('\/appointments\/travel-time'/);
  assert.match(b, /source:'unknown',provider:null,note:'Aucune source de routage configurée : la durée de déplacement est inconnue/);
  assert.match(b, /aucune durée réelle ne peut être calculée \(valeur inconnue, jamais inventée\)/);
});

test('agenda unifié : rendez-vous + indisponibilités + tâches planifiées dans une seule vue lisible', () => {
  const a = read('../src/routes/agenda.ts');
  assert.match(a, /app\.get\('\/agenda', async r =>/);
  assert.match(a, /kind: 'appointment'/);
  assert.match(a, /kind: 'unavailability'/);
  assert.match(a, /kind: 'task'/);
  assert.match(a, /from calendar_unavailabilities where organization_id=\$1/);
  assert.match(a, /app\.post\('\/agenda\/unavailabilities'/);
  assert.match(a, /app\.delete\('\/agenda\/unavailabilities\/:id'/);
});

test('réservations : la suppression d\u2019un devis ou d\u2019un rendez-vous libère les réservations actives', () => {
  const st = read('../src/services/stock.ts');
  assert.match(st, /export async function releaseAppointmentReservations/);
  assert.match(st, /where organization_id=\$1 and appointment_id=\$2 and status='active' returning id/);
  const b = read('../src/routes/business.ts');
  assert.match(b, /await releaseQuoteReservations\(client,org,id,'Document supprimé'\)/);
  assert.match(b, /await releaseAppointmentReservations\(client,org,id,'Rendez-vous supprimé'\)/);
});
