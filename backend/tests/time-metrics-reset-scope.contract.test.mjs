// Contrat 15.4.36 — la remise à zéro du compteur de temps ne supprime QUE l'activité affichée.
// Le bouton du tableau de bord d'activité transmet l'activité active ; le serveur refuse une
// remise à zéro ambiguë (plusieurs activités) au lieu de tout effacer silencieusement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const business = read('backend/src/routes/business.ts');
const api = read('assets/js/core/api.js');
const other = read('assets/js/pages/dash/other.js');

test('l’API transmet l’activité affichée à la remise à zéro', () => {
  assert.match(api, /resetTimeMetrics:activityId=>request\('\/time-metrics\/reset'/);
  assert.match(api, /activityId=\$\{encodeURIComponent\(activityId\)\}/);
  assert.match(api, /timeMetrics:activityId=>request\('\/time-metrics'/);
});

test('le bouton du tableau de bord n’appelle jamais une remise à zéro globale', () => {
  assert.match(other, /api\.resetTimeMetrics\(current\.id\)/);
  assert.doesNotMatch(other, /api\.resetTimeMetrics\(\)/);
  assert.match(other, /activité affichée/);
  assert.match(other, /Les sessions des autres activités sont conservées/);
  assert.match(other, /Action irréversible/);
  // Sans activité sélectionnée, l'action est refusée avec un message explicite.
  assert.match(other, /Sélectionnez d’abord une activité/);
});

test('le serveur borne la suppression à l’activité et refuse une portée ambiguë', () => {
  assert.match(business, /delete from client_time_sessions where organization_id=\$1 and activity_id=\$2/);
  assert.match(business, /ACTIVITY_REQUIRED/);
  assert.match(business, /La remise à zéro doit viser une activité précise/);
  const start = business.indexOf("app.post('/time-metrics/reset'");
  const end = business.indexOf("app.get('/time-metrics'", start);
  const route = business.slice(start, end);
  assert.match(route, /count\(\*\)::int n from activities where organization_id=\$1/);
  assert.doesNotMatch(route, /delete from client_time_sessions where organization_id=\$1'\)/, 'suppression globale interdite');
});
