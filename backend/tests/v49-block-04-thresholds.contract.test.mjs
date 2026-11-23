// 15.4.49 — Bloc 04 (prompt 04) : seuils réglementaires versionnés en base avec repli
// déterministe sur les constantes documentées, métadonnées complètes du référentiel micro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('migration 105 : table des seuils par domaine et date d\u2019effet, version 2026 identique aux constantes', () => {
  const m = read('../migrations/105_regulatory_thresholds.sql');
  assert.match(m, /create table if not exists regulatory_thresholds/);
  assert.match(m, /unique\(domain, effective_from\)/);
  assert.match(m, /\{"sale":203100,"services":83600,"vatSaleBase":85000,"vatServicesBase":37500,"vatSaleMajorated":93500,"vatServicesMajorated":41250\}/);
  assert.match(m, /create policy regulatory_thresholds_read on regulatory_thresholds for select to aurion_runtime using \(true\)/);
  assert.match(m, /grant select on regulatory_thresholds to aurion_runtime/);
  // Métadonnées complètes du référentiel micro (colonnes additives, défauts neutres).
  assert.match(m, /add column if not exists published_on date/);
  assert.match(m, /add column if not exists jurisdiction varchar\(60\) not null default 'FR'/);
  assert.match(m, /add column if not exists scope text/);
  assert.match(m, /verification_status in \('draft', 'verified', 'to_reverify', 'unverified'\)/);
});

test('chargement : version à la date demandée, repli déterministe sur les constantes du code', () => {
  const s = read('../src/services/fiscal-calendar.ts');
  assert.match(s, /export function thresholdsFromRow/);
  assert.match(s, /export async function loadThresholdsRef/);
  assert.match(s, /where domain='micro' and effective_from<=\$1::date and \(effective_to is null or \$1::date<effective_to\)/);
  assert.match(s, /return parsed \?\? THRESHOLDS_2026;/);
  assert.match(s, /return THRESHOLDS_2026;/); // base indisponible → repli constant, jamais inventé
  const route = read('../src/routes/business.ts');
  assert.match(route, /loadThresholdsRef\(`\$\{year\}-12-31`\)/);
  assert.match(route, /referential:\{version:thresholds\.version,verifiedOn:thresholds\.verifiedOn,source:thresholds\.source\}/);
});

test('métadonnées du référentiel micro exposées (publication, juridiction, périmètre, statut)', () => {
  const s = read('../src/services/micro-referential.ts');
  assert.match(s, /published_on,jurisdiction,scope,verification_status from micro_referential_versions/);
  assert.match(s, /publishedOn: v\.published_on \? iso\(v\.published_on\) : null/);
  assert.match(s, /verificationStatus: v\.verification_status \?\? null/);
});
