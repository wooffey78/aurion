// Contrats 15.4.59 — réparation du blocage « La requête a échoué. » à la création de fiche
// client (session « ouverte mais exclue » occupant l'index unique 012), réalimentation du
// compteur « temps économisé » et badge compteur cliquable (pause ⇄ relance) sur la fiche.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const business = read('backend/src/routes/business.ts');
  const clients = read('backend/src/services/clients.ts');
const api = read('assets/js/core/api.js');
const sheet = read('assets/js/pages/dash/clientsheet.js');

const resetStart = business.indexOf("app.post('/time-metrics/reset'");
const resetEnd = business.indexOf("app.get('/time-metrics'", resetStart);
const reset = business.slice(resetStart, resetEnd);

const clientsStart = business.indexOf("app.post('/clients'");
const clientsEnd = business.indexOf("app.delete('/clients/:id'", clientsStart);
const clientsRoute = business.slice(clientsStart, clientsEnd);

const startA = business.indexOf("app.post('/time-sessions/start'");
const startB = business.indexOf("app.post('/time-sessions/:id/stop'", startA);
const startRoute = business.slice(startA, startB);

test('la remise à zéro referme les sessions ouvertes de la portée AVANT de les exclure', () => {
  // Portée activité : running (durée accumulée) puis paused (clôture simple), SANS filtre
  // excluded_at — une session ouverte mais déjà exclue doit aussi être refermée.
  assert.match(reset, /update client_time_sessions set duration_seconds=accumulated_seconds\+greatest\(0,extract\(epoch from\(now\(\)-started_at\)\)::int\),accumulated_seconds=accumulated_seconds\+greatest\(0,extract\(epoch from\(now\(\)-started_at\)\)::int\),ended_at=now\(\),status='completed',paused_at=null where organization_id=\$1 and activity_id=\$2 and ended_at is null and status='running'/);
  assert.match(reset, /update client_time_sessions set ended_at=now\(\),status='completed' where organization_id=\$1 and activity_id=\$2 and ended_at is null and status='paused'/);
  // Portée organisation (activité unique) : mêmes fermetures avant l'exclusion globale.
  assert.match(reset, /status='completed',paused_at=null where organization_id=\$1 and ended_at is null and status='running'/);
  assert.match(reset, /update client_time_sessions set ended_at=now\(\),status='completed' where organization_id=\$1 and ended_at is null and status='paused'/);
  // L'exclusion soft reste l'étape finale, bornée à l'activité ; jamais de suppression.
  assert.match(reset, /excluded_at=coalesce\(excluded_at,now\(\)\) where organization_id=\$1 and activity_id=\$2 and excluded_at is null returning id/);
});

test('POST /clients cicatrise l’état « ouverte mais exclue » avant toute insertion', () => {
  assert.match(clientsRoute, /closeOpenExcludedSessions\(org,r\.auth!\.userId\)/);
  // Ordre garanti : fermetures Bloc 5 + cicatrisation AVANT l'écriture de la fiche.
  assert.ok(clientsRoute.indexOf('closeOpenExcludedSessions') < clientsRoute.indexOf("insert into clients("));
});

test('les sessions exclues ouvertes sont refermées sans jamais redevenir comptabilisées', () => {
  // Le helper ne ferme QUE des sessions déjà exclues (excluded_at is not null) : une session
  // fermée par cicatrisation ne réintègre jamais le compteur (aucun reset d'exclusion).
  assert.match(business, /excluded_at is not null and ended_at is null and status='running'/);
  assert.match(business, /excluded_at is not null and ended_at is null and status='paused'/);
  assert.doesNotMatch(business, /set excluded_at=null/);
});

test('démarrer un chrono ne peut plus heurter l’index unique 012', () => {
  assert.match(startRoute, /closeOpenExcludedSessions\(org,r\.auth!\.userId\)/);
  assert.match(startRoute, /takeoverOtherClientSessions\(org,r\.auth!\.userId,clientId\)/);
  // Session déjà en cours pour CE client : retour idempotent, jamais de 23505 → 500.
  assert.match(startRoute, /alreadyRunning:true/);
  // La reprise de contrôle préserve la durée : la session running d'un autre client est
  // refermée avec sa durée accumulée (client_id<>$3), la paused par clôture simple.
  assert.match(business, /async function takeoverOtherClientSessions\(org:string,userId:string,clientId:string\)/);
  assert.match(business, /client_id<>\$3 and excluded_at is null and ended_at is null and status='running'/);
  assert.match(business, /client_id<>\$3 and excluded_at is null and ended_at is null and status='paused'/);
});

test('resumeClientTimer cicatrise et reprend le contrôle avant ses relectures', () => {
  const a = business.indexOf('async function resumeClientTimer');
  const b = business.indexOf('async function stopClientTimer', a);
  const src = business.slice(a, b);
  assert.match(src, /closeOpenExcludedSessions\(org,userId\)/);
  assert.match(src, /takeoverOtherClientSessions\(org,userId,clientId\)/);
  assert.ok(src.indexOf('closeOpenExcludedSessions') < src.indexOf("select id from client_time_sessions where organization_id=\$1 and user_id=\$2 and client_id=\$3 and excluded_at is null"));
});

test('l’endpoint de pause préserve la session relançable (ended_at reste null)', () => {
  assert.match(business, /app\.post\('\/time-sessions\/:id\/pause'/);
  const a = business.indexOf("app.post('/time-sessions/:id/pause'");
  const b = business.indexOf("app.post('/time-sessions/:id/abandon'", a);
  const route = business.slice(a, b);
  // Sémantique pauseClientTimer : temps écoulé accumulé, status='paused', ended_at null.
  assert.match(route, /paused_at=now\(\),status='paused',ended_at=null/);
  assert.match(route, /ended_at is null and status='running' returning id/);
  assert.match(route, /NOT_FOUND/);
  // Le front dispose bien de la méthode dédiée.
  assert.match(api, /pauseTimeSession:id=>request\(`\/time-sessions\/\$\{id\}\/pause`,opts\(\{method:'POST'\}\)\)/);
});

test('le badge compteur de la fiche client est une commande pause ⇄ relance', () => {
  // Un bouton (plus un simple libellé), avec les deux libellés d'état cliquables.
  assert.match(sheet, /<button type="button" class="link-btn" id="sh-time"/);
  assert.match(sheet, /cliquer pour mettre en pause/);
  assert.match(sheet, /cliquer pour relancer/);
  // En cours → pause (session active) ; en pause/absent → relance (start reprend la session
  // en pause ou en crée une honorant l'estimation de la fiche).
  assert.match(sheet, /api\.pauseTimeSession\(m\.active\.id\)/);
  assert.match(sheet, /api\.startTimeSession\(\{clientId:c\.id/);
  // Chrono en cours sur un autre client : information explicite, aucune bascule silencieuse.
  assert.match(sheet, /Le compteur tourne déjà pour/);
});

// ---------------------------------------------------------------- 15.4.59 (vague 2)

const convertA = business.indexOf('if(converted.clientId&&converted.activityId){try{await resumeClientTimer');
const convertB = business.indexOf("'client timer stop skipped after conversion'", convertA);

test('la conversion devis→facture ne peut plus échouer après le commit de la facture', () => {
  // Symptôme corrigé : le relais du chrono (resumeClientTimer) était UNGUARDED après la
  // transaction de conversion — sur l'état « ouverte mais exclue », son INSERT provoquait un
  // 23505 → 500 « La requête a échoué. » alors que la facture, déjà committée, existait.
  assert.ok(convertA > 0, 'le relais du chrono après conversion est gardé');
  assert.match(business, /client timer resume skipped after conversion/);
  assert.ok(convertB > convertA, 'l’arrêt du chrono après envoi est gardé de la même façon');
});

test('la moyenne historique du prévisionnel n’est plus diluée par la fenêtre demandée', () => {
  // Le diviseur est le nombre de mois effectivement historisés depuis le premier
  // encaissement de la fenêtre (borné par la fenêtre, minimum 1) — un compte récent n'est
  // plus systématiquement sous-estimé.
  assert.match(business, /const effectiveHistoryMonths=Math\.max\(1,monthsSinceFirstPayment\|\|historyMonths\)/);
  assert.match(business, /const historicalAverage=Number\(historical\?\.total\|\|0\)\/effectiveHistoryMonths/);
  assert.match(business, /monthsSinceFirstPayment/);
  // 15.4.61 — la moyenne croise paiements détaillés et factures payées (union « cash »).
  assert.match(business, /with cash as \(/);
  assert.match(business, /count\(distinct date_trunc\('month',paid_at\)\)::int/);
  // La formule de l'année reste intacte (contrat accounting-engine-coherence).
  assert.match(business, /yearToDateHt\+historicalAverage\*remainingMonths\+open/);
  // La transparence : le nombre de mois effectifs est exposé et rappelé dans la méthode.
  assert.match(business, /effectiveHistoryMonths,method:/);
  assert.match(business, /mois effectivement historisés/);
});

test('Chantiers : retour au masquage par activité (fonctionnement antérieur à 15.4.59, demande utilisateur)', () => {
  const nav = read('assets/js/core/navigation.js');
  const catalog = read('backend/src/services/profile-features.ts');
  const pfFront = read('assets/js/core/profile-features.js');
  // Le menu masque de nouveau Chantiers quand le catalogue le déclare hors cœur.
  assert.match(nav, /\{id:'chantiers',label:'Chantiers',icon:'▣'\}/);
  assert.match(nav, /features\.features\.chantiers===false/);
  // Le catalogue serveur redevient sélectif : mots-clés métier, core sans chantiers.
  assert.match(catalog, /const CORE: FeatureKey\[\] = \['client_portal'\]/);
  assert.match(catalog, /const chantiers = has\('installation'\)/);
  assert.match(catalog, /Profil de métier non reconnu : seules les fonctions communes/);
  // Le repli hors connexion masque également (réapparition à la reconnexion).
  assert.match(pfFront, /chantiers: false/);
  assert.doesNotMatch(pfFront, /chantiers: true/);
});

// 15.4.65 — formule harmonisée : baseline de 20 minutes par session terminée (compteur
// global ET stats par client), temps économisé jamais négatif.
assert.match(business, /MANUAL_BASELINE_MINUTES=20/);
assert.match(business, /greatest\(coalesce\(manual_minutes,0\),\$\{MANUAL_BASELINE_MINUTES\}\)/);
assert.match(clients, /greatest\(coalesce\(manual_minutes,0\),20\)/);
