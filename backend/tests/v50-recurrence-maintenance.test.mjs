// 15.4.50 — Récurrences (A7) et contrats d'entretien (B2) : expansion déterministe, bornes,
// report au jour de semaine demandé, propositions (jamais de création automatique).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const dist = p => existsSync(fileURLToPath(new URL(p, import.meta.url))) ? fileURLToPath(new URL(p, import.meta.url)) : false;
const recPath = dist('../dist/services/recurrence.js');
const mcPath = dist('../dist/services/maintenance-contracts.js');

test('migration 112 : contrats additifs, RLS et réplication', () => {
  const m = read('../migrations/112_maintenance_contracts.sql');
  assert.match(m, /create table if not exists maintenance_contracts/);
  assert.match(m, /frequency varchar\(20\) not null check \(frequency in \('monthly','bimonthly','quarterly','semiannual','annual'\)\)/);
  assert.match(m, /policy tenant_isolation on public\.maintenance_contracts/);
});

test('unitaire — expansion hebdomadaire : intervalle, fenêtre et borne par défaut', { skip: !recPath }, async () => {
  const { parseRecurrenceRule, expandRecurrence } = await import(pathToFileURL(recPath).href);
  const rule = parseRecurrenceRule({ freq: 'weekly', interval: 2 });
  assert.equal(rule.interval, 2);
  assert.equal(rule.count, 26); // borne par défaut documentée
  const occurrences = expandRecurrence(rule, '2026-01-05T09:00:00Z', '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z');
  assert.deepEqual(occurrences, ['2026-01-05T09:00:00.000Z', '2026-01-19T09:00:00.000Z', '2026-02-02T09:00:00.000Z', '2026-02-16T09:00:00.000Z']);
  // Règle non reconnue : null (l'agenda l'affiche telle quelle, sans inventer d'occurrences).
  assert.equal(parseRecurrenceRule({ freq: 'daily' }), null);
  assert.throws(() => parseRecurrenceRule({ freq: 'weekly', interval: 99 }), /interval/);
  // Fenêtre invalide : erreur, pas une liste vide silencieuse.
  assert.throws(() => expandRecurrence(rule, '2026-01-05T09:00:00Z', '2026-03-01T00:00:00Z', '2026-01-01T00:00:00Z'), /Fenêtre/);
});

test('unitaire — occurrences de contrat : pas mensuels, report au jour demandé, fenêtre bornée', { skip: !mcPath }, async () => {
  const { generateContractOccurrences, FREQUENCY_MONTHS, contractLabel } = await import(pathToFileURL(mcPath).href);
  assert.deepEqual(FREQUENCY_MONTHS.quarterly, 3);
  const spec = { frequency: 'quarterly', weekday: 1, firstOccurrence: '2026-01-05', durationMinutes: 120 };
  const occurrences = generateContractOccurrences(spec, '2026-01-01', '2026-08-01');
  assert.equal(occurrences.length, 3); // janvier, avril, juillet
  for (const o of occurrences) {
    const d = new Date(o.startsAt);
    assert.equal(d.getUTCDay(), 1, `occurrence ${o.date} doit tomber un lundi`);
    assert.equal(o.endsAt > o.startsAt, true);
  }
  assert.equal(occurrences[0].date, '2026-01-05');
  assert.match(contractLabel('Entretien chaudière', 'quarterly'), /trimestriel/);
});
