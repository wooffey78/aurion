// 15.4.52/53 (PROMPT B1-B4 + C3) — contrat de câblage FRONT des quatre branchements et de la
// porte des mentions : vérification de source (gabarits navigation.test.mjs), exécutable sans
// base ni navigateur. La recette navigateur réelle reste celle du document de prompts (Phase B).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const mainJs = read('../../assets/js/main.js');
const clientsheet = read('../../assets/js/pages/dash/clientsheet.js');
const docs = read('../../assets/js/pages/dash/docs.js');
const api = read('../../assets/js/core/api.js');
const dashboard = read('../../assets/js/pages/dashboard.js');
const portal = read('../../assets/js/pages/portal.js');
const other = read('../../assets/js/pages/dash/other.js');

test('B1 — encart fiabilité client : route appelée depuis la fiche, mention anti-prédiction affichée', () => {
  assert.match(api, /clientReliability:/);
  assert.match(clientsheet, /clientReliability/);
  assert.match(clientsheet, /Aucune prédiction|aucune prédiction/i);
  // La vue reste utilisable si l'encart échoue (jamais de blocage de la fiche).
  assert.match(clientsheet, /catch/);
});

test('B2 — fenêtre « Facturer » : dérive contrôlée côté serveur, justification exigée côté interface', () => {
  // L'interface transmet les rubriques comparées ; le serveur recalcule la dérive (source de
  // vérité) et la fenêtre de justification reprend les raisons exactes du moteur (422).
  assert.match(docs, /quoteRubrics/);
  assert.match(docs, /deviationJustification/);
  assert.match(docs, /DEVIATION_JUSTIFICATION_REQUIRED/);
  assert.match(docs, /requiresJustification|deviationPct/);
});

test('B3 — vérification d\u2019intégrité accessible depuis l\u2019écran documents', () => {
  assert.match(api, /integrityChain:/);
  assert.match(docs, /integrityChain|integrity\/chain/);
  assert.match(docs, /Intégrité|intégrité/);
});

test('B4 — page publique du portail : route avant authentification, aucun appel authentifié', () => {
  // La route publique est traitée AVANT les vues nécessitant une session (position dans main.js).
  const portalRoute = mainJs.indexOf("'/portail/");
  const onboardingRoute = mainJs.indexOf("'/onboarding'");
  assert.ok(portalRoute > 0, 'la route #/portail/ doit être câblée dans main.js');
  assert.ok(portalRoute < onboardingRoute, 'la route portail doit être traitée dans le bloc public (avant les routes authentifiées)');
  // La page ne consomme QUE les endpoints publics du portail (token) + les pages légales.
  assert.match(portal, /\/portal\//);
  assert.match(portal, /CGU|cgu|legal/);
  assert.doesNotMatch(portal, /api\.clients\(|api\.quotes\(|api\.organization\(/);
  // Alias de lien : le token seul doit suffire (aucune session requise).
  assert.match(mainJs, /renderPortal/);
});

test('B4 — gestion des accès portail côté organisation (liste, création, révocation, partage)', () => {
  assert.match(api, /portalAccesses:/);
  assert.match(api, /createPortalAccess:/);
  assert.match(api, /revokePortalAccess:/);
  assert.match(api, /sharePortalQuote:/);
  assert.match(clientsheet, /portalAccesses|portail/i);
});

test('C3 — fenêtre « Facturer » : liste des mentions à compléter avec renvoi Paramètres', () => {
  // La pré-vérification passe par la méthode API dédiée (endpoint /mentions/blocking).
  assert.match(api, /mentions\/blocking/);
  assert.match(docs, /blockingMentions/);
  assert.match(docs, /MENTIONS_INCOMPLETES|mentions obligatoires/i);
  assert.match(docs, /Paramètres/);
});

test('Navigation — aucune régression de la délégation data-go (boutons d\u2019accueil)', () => {
  // Correctif 15.4.50-r2 : le module charts.js doit être parse-sûr — aucun cast TypeScript dans
  // le CODE (les commentaires sont exclus de la vérification, ils documentent le correctif).
  const chartsCode = read('../../assets/js/core/charts.js').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(chartsCode, / as number\[\]/);
  assert.match(dashboard, /installDataGoDelegation/);
  assert.match(dashboard, /!VIEWS\[id\]/);
});
