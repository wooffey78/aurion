import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const business = readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');
const clients = readFileSync(new URL('../src/services/clients.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../assets/js/pages/dash/other.js', import.meta.url), 'utf8');
const sheet = readFileSync(new URL('../../assets/js/pages/dash/clientsheet.js', import.meta.url), 'utf8');
const integrations = readFileSync(new URL('../src/routes/integrations.ts', import.meta.url), 'utf8');

const start = business.indexOf("app.get('/time-metrics'");
const end = business.indexOf("app.post('/time-sessions/start'", start);
const metrics = business.slice(start, end);

test('les indicateurs de temps utilisent uniquement les sessions terminées, non exclues, et l’activité sélectionnée', () => {
  // 15.4.67 — le compteur global additionne l'estimation FIXE de chaque client distinct
  // (une seule fois par client), plus jamais une baseline par session ; le temps réel
  // reste la somme exacte des durées de sessions terminées.
  assert.match(metrics, /sum\(c\.estimated_minutes\),0\) manual_minutes/);
  assert.match(metrics, /distinct s\.client_id/);
  assert.match(metrics, /sum\(duration_seconds\)/);
  assert.match(metrics, /excluded_at is null and status='completed' and ended_at is not null/);
  assert.match(metrics, /\$2::uuid is null or activity_id=\$2/);
  assert.doesNotMatch(metrics, /from clients where organization_id=\$1/);
  // Les statistiques journalières/hebdomadaires/mensuelles respectent la même portée.
  assert.match(metrics, /excluded_at is null and status='completed' and ended_at is not null`;/);
});

test('le moteur du « temps économisé » honore l’estimation saisie à chaque prise en charge', () => {
  // Défaut 15.4.57 corrigé : `hasHistory ? 0 : …` écrasait la saisie par 0 dès la deuxième
  // session d’un client — Σ manuel = 0 → compteur bloqué à zéro.
  assert.match(business, /const providedManual=Number\.isFinite\(Number\(b\.manualMinutes\)\)\?Math\.max\(0,Number\(b\.manualMinutes\)\):null;/);
  assert.match(business, /const manual=providedManual!=null\?providedManual:\(hasHistory\?0:/);
  assert.doesNotMatch(business, /const manual=hasHistory\?0:/);
  // La première session comptabilisée repart de l’estimation de la fiche (pas d’invention au-delà).
  assert.match(business, /select estimated_minutes from clients where id=\$1 and organization_id=\$2/);
  // Le relais du chronomètre (reprise après conversion en facture) applique le même moteur.
  assert.match(business, /async function resumeClientTimer\(org:string,userId:string,clientId:string,activityId:string,manualMinutes\?:unknown\)/);
  assert.match(business, /const provided=Number\.isFinite\(Number\(manualMinutes\)\)\?Math\.max\(0,Number\(manualMinutes\)\):null;/);
});

test('la remise à zéro exclut du compteur sans supprimer l’historique (référentiel §07-6)', () => {
  assert.match(business, /update client_time_sessions set excluded_at=coalesce\(excluded_at,now\(\)\) where organization_id=\$1 and activity_id=\$2/);
  assert.doesNotMatch(business, /delete from client_time_sessions/);
  assert.match(business, /ACTIVITY_REQUIRED/);
  assert.match(business, /excludedSessions:x\.rowCount\|\|0/);
});

test('toutes les lectures de sessions respectent l’exclusion (métriques, fiche client, calendrier)', () => {
  assert.match(clients, /excluded_at is null and status='completed' and ended_at is not null/);
  assert.match(integrations, /excluded_at is null and ended_at is null and status='running'/);
  assert.match(integrations, /excluded_at is null and ended_at is null and status='paused'/);
  // Les temps réels restent exploitables par les chantiers malgré la remise à zéro du compteur.
  const chantiers = readFileSync(new URL('../src/services/chantiers.ts', import.meta.url), 'utf8');
  assert.match(chantiers, /client_time_sessions t join chantier_links/);
  assert.doesNotMatch(chantiers, /excluded_at is null/);
});

test('la fiche client applique l’estimation FIXE du client, comptée une seule fois (15.4.67)', () => {
  // 15.4.67 (consigne éditeur) — le temps manuel de la fiche est la valeur FIXE du client
  // (estimated_minutes) : interagir cinq fois avec une fiche estimée à 10 minutes reste
  // 10 minutes ; le temps réel reste la durée cumulée des sessions terminées.
  assert.match(clients, /const estimatedMinutes=Number\(c\.estimated_minutes\|\|0\)/);
  assert.match(clients, /status='completed' and ended_at is not null/);
  assert.doesNotMatch(clients, /sum\(greatest\(coalesce\(manual_minutes,0\),1\)\)/);
  assert.doesNotMatch(clients, /estimatedMinutes=Number\(tm\?\.manual_minutes\|\|0\)/);
});

test('la fiche client n’affiche pas un faux « 0,0 min » sans session terminée', () => {
  assert.match(clients, /timeSessionCount:Number\(tm\?\.completed_sessions\|\|0\)/);
  assert.match(sheet, /st\.timeSessionCount/);
  assert.match(sheet, /Aucune session terminée/);
  assert.match(sheet, /\?`\$\{Number\(st\.actualMinutes\|\|0\)\.toFixed\(1\)\} min`:'—'/);
  assert.match(ui, /activité sélectionnée/);
});
