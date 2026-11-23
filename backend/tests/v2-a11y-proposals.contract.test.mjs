// V2 (15.4.46) — Accessibilité des écrans de propositions : chaque bouton « Utiliser »
// porte un nom accessible (le libellé seul était ambigu pour un lecteur d'écran : quatre
// boutons identiques sans contexte), les propositions forment une liste sémantique
// (ul/li) et la feuille de style gère la liste. Invariants déjà couverts ailleurs :
// breakpoints mobiles 640px, :focus-visible, prefers-reduced-motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const repoRoot = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, repoRoot), 'utf8');

test('15.4.46: onboarding — « Utiliser » nommé par proposition, liste sémantique', () => {
  const src = read('assets/js/pages/onboarding.js');
  assert.match(src, /aria-label="Utiliser la proposition \$\{esc\(p\.title\)\}"/, 'nom accessible manquant sur les boutons « Utiliser »');
  assert.match(src, /<ul class="profile-proposal-list">\$\{list\}/, 'les propositions ne forment pas une liste sémantique');
  assert.match(src, /<li class="profile-proposal-row">/, 'rangée en <li>');
  // La re-détection ne fait pas perdre le nom accessible (le handler reste lié à data-profile-use).
  assert.match(src, /querySelectorAll\('\[data-profile-use\]'\)/);
});

test('15.4.46: settings — mêmes garanties sur le modal d\'activité', () => {
  const src = read('assets/js/pages/dash/settings.js');
  assert.match(src, /aria-label="Utiliser la proposition \$\{e\(p\.title\)\}"/);
  assert.match(src, /<ul class="profile-proposal-list">\$\{list\}/);
  assert.match(src, /<li class="profile-proposal-row">/);
});

test('15.4.46: style — liste sans puces, rangées inchangées, mobile et focus déjà couverts', () => {
  const css = read('assets/css/app.css');
  assert.match(css, /\.profile-proposal-list\{list-style:none/, 'style de liste manquant');
  // La rangée garde son style existant (les <li> remplacent les <div> sans régression).
  assert.match(css, /\.profile-proposal-row\{display:flex;align-items:center/);
  assert.match(css, /@media \(max-width:640px\)\{\.profile-proposal-row\{flex-direction:column/);
  // Garde : zone de propositions annoncée comme région vive dans les deux écrans.
  const ob = read('assets/js/pages/onboarding.js');
  const st = read('assets/js/pages/dash/settings.js');
  assert.match(ob, /id="ob-proposals" aria-live="polite"/);
  assert.match(st, /id="profile-proposals" aria-live="polite"/);
  // Correctifs mobiles 15.4.46 (débordement horizontal 375px, vérifié au navigateur) :
  // la carte onboarding n'est pas gonflée par son contenu, la grille .stack ne dépasse
  // jamais son conteneur, et la pilule de confiance passe à la ligne en colonne.
  assert.match(css, /\.onboarding-card\{max-width:960px;width:min\(960px,100%\);min-width:0\}/);
  assert.match(css, /\.stack\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:16px\}/);
  assert.match(css, /\.profile-proposal-row \.pill\{white-space:normal\}\}/);
});
