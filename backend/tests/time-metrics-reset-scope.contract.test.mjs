// Contrat 15.4.36 puis 15.4.58 — la remise à zéro du compteur de temps est bornée à l'activité
// affichée et n'efface plus l'historique : les sessions sont EXCLUES du calcul (excluded_at)
// et restent disponibles pour l'audit, les statistiques et les chantiers (référentiel §07-6).
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
  // 15.4.58 : l'historique n'est plus détruit — le message ne promet plus une suppression.
  assert.doesNotMatch(other, /Cette action supprime UNIQUEMENT/);
  assert.doesNotMatch(other, /Action irréversible\./);
  assert.match(other, /historique est conservé pour l’audit/);
  // Sans activité sélectionnée, l'action est refusée avec un message explicite.
  assert.match(other, /Sélectionnez d’abord une activité/);
});

test('le serveur borne l’exclusion à l’activité et refuse une portée ambiguë', () => {
  const start = business.indexOf("app.post('/time-metrics/reset'");
  const end = business.indexOf("app.get('/time-metrics'", start);
  const route = business.slice(start, end);
  // Exclusion soft : aucune suppression ; portée activité uniquement (la branche sans activité
  // n'est atteignable que pour une organisation à activité unique, derrière le garde
  // ACTIVITY_REQUIRED).
  assert.match(route, /update client_time_sessions set excluded_at=coalesce\(excluded_at,now\(\)\) where organization_id=\$1 and activity_id=\$2/);
  assert.match(route, /ACTIVITY_REQUIRED/);
  assert.match(route, /La remise à zéro doit viser une activité précise/);
  assert.match(route, /count\(\*\)::int n from activities where organization_id=\$1/);
  assert.match(business, /if\(aid\)\{[\s\S]*?excluded_at=coalesce\(excluded_at,now\(\)\)/);
  assert.doesNotMatch(business, /delete from client_time_sessions/);
});

test('les métriques n’ont pas régressé : sessions terminées, non exclues, activité sélectionnée', () => {
  const start = business.indexOf("app.get('/time-metrics'");
  const end = business.indexOf("app.post('/time-sessions/start'", start);
  assert.match(business.slice(start, end), /excluded_at is null and status='completed' and ended_at is not null/);
});
