import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const business = readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');
const clients = readFileSync(new URL('../src/services/clients.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../assets/js/pages/dash/other.js', import.meta.url), 'utf8');

const start = business.indexOf("app.get('/time-metrics'");
const end = business.indexOf("app.post('/time-sessions/start'", start);
const metrics = business.slice(start, end);

test('les indicateurs de temps utilisent uniquement les sessions terminées et l’activité sélectionnée', () => {
  assert.match(metrics, /sum\(manual_minutes\)/);
  assert.match(metrics, /sum\(duration_seconds\)/);
  assert.match(metrics, /status='completed' and ended_at is not null/);
  assert.match(metrics, /\$2::uuid is null or activity_id=\$2/);
  assert.doesNotMatch(metrics, /from clients where organization_id=\$1/);
  assert.match(business, /delete from client_time_sessions where organization_id=\$1 and activity_id=\$2/);
  assert.match(ui, /activité sélectionnée/);
});

test('la fiche client ne transforme plus une estimation sans session en temps économisé', () => {
  assert.match(clients, /sum\(manual_minutes\)/);
  assert.match(clients, /status='completed' and ended_at is not null/);
  assert.match(clients, /const estimatedMinutes=Number\(tm\?\.manual_minutes\|\|0\)/);
  assert.doesNotMatch(clients, /estimatedMinutes=Number\(c\?\.estimated_minutes/);
});

test('la fiche client n’affiche pas un faux « 0,0 min » sans session terminée', () => {
  const sheet = readFileSync(new URL('../../assets/js/pages/dash/clientsheet.js', import.meta.url), 'utf8');
  assert.match(clients, /timeSessionCount:Number\(tm\?\.completed_sessions\|\|0\)/);
  assert.match(sheet, /st\.timeSessionCount/);
  assert.match(sheet, /Aucune session terminée/);
  assert.match(sheet, /\?`\$\{Number\(st\.actualMinutes\|\|0\)\.toFixed\(1\)\} min`:'—'/);
});
