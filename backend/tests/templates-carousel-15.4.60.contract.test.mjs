// Contrats 15.4.60 — anneau 3D circulaire des modèles de documents.
// Exigence utilisateur : les modèles sont présentés DIRECTEMENT sous forme d'aperçu (pas de
// carte avec bouton d'aperçu), le clic fait tourner l'anneau 3D (les cartes tournent derrière),
// l'anneau revient à la carte d'origine après un tour complet, et un clic sur la face avant
// ouvre l'aperçu taille réelle où le choix du modèle se valide.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const other = read('assets/js/pages/dash/other.js');
const css = read('assets/css/app.css');

test('les cartes du carrousel sont les aperçus eux-mêmes — plus de bouton d\'aperçu ni de bouton de sélection par carte', () => {
  // Face avant = l'aperçu réel (PNG généré depuis le même PDF que celui servi).
  assert.match(other, /template-face"><img src="\.\/assets\/templates\/previews\/\$\{type\}-\$\{id\}\.png"/);
  // Verso visible pendant la rotation (les cartes tournent derrière sans effet miroir).
  assert.match(other, /template-back/);
  // Plus aucun bouton par carte : l'ancien « Aperçu PDF » par carte et les boutons de sélection disparaissent.
  assert.doesNotMatch(other, /Aperçu PDF<\/a>/);
  assert.doesNotMatch(other, /template-select/);
  // Les 16 faces existent réellement (8 styles × devis/facture).
  const files = readdirSync(new URL('../../assets/templates/previews', import.meta.url));
  const expected = ['minimal','classic','signature','horizon','orchidee','encre','corail','glacier'];
  for (const type of ['invoice', 'quote']) for (const style of expected)
    assert.ok(files.includes(`${type}-aurion-${style}.png`), `face manquante : ${type}-aurion-${style}.png`);
});

test('l\'anneau est en 3D, tourne au clic et revient à la carte d\'origine après un tour complet', () => {
  // Angle normalisé modulo 360° : après 8 pas, la carte d'origine est de nouveau face avant.
  assert.match(other, /const rel=\(\(i\*STEP\+angle\)%360\+360\)%360/);
  assert.match(other, /angle\+=dir\*STEP/);
  // Chaque carte est posée à son angle MONDE continu (i·45°+angle) : la carte de face reste
  // exactement centrée (un anneau parent tourné décalerait l'avant de ½(rz−rx) sur mobile).
  assert.match(other, /const a=i\*STEP\+angle;/);
  assert.match(other, /rotateY\(\$\{a\.toFixed\(2\)\}deg\)/);
  assert.doesNotMatch(other, /ring\.style\.transform=/);
  // Clic sur une carte du fond → amène cette carte devant par le chemin le plus court.
  assert.match(other, /let diff=Math\.round\(rel\/STEP\);if\(diff>N\/2\)diff-=N/);
  // Vraie scène 3D : perspective + cartes en rotations composées.
  assert.match(css, /perspective:1600px/);
  assert.match(css, /\.template-ring\{position:relative;[^}]*transform-style:preserve-3d/);
  // Cartes du fond visibles (verso dédié, pas de disparition arrière).
  assert.match(css, /\.template-back\{transform:rotateY\(180deg\)/);
  // L'anneau démarre sur le modèle actif de l'activité.
  assert.match(other, /data-start="\$\{sel>0\?sel:0\}"/);
  assert.match(other, /let angle=-Number\(carousel\.dataset\.start\|\|0\)\*STEP/);
});

test('la carte de face ouvre l\'aperçu taille réelle (PDF intégré) avec validation du modèle', () => {
  assert.match(other, /template-modal-embed"><iframe src="\.\/assets\/templates\/\$\{type\}-\$\{style\}\.pdf"/);
  // 15.4.61 — le PDF s'ouvre aussi dans un onglet dédié (repli garanti hors intégration).
  assert.match(other, /Ouvrir dans un onglet/);
  assert.match(other, /Utiliser ce modèle/);
  assert.match(other, /applyTemplateChoice\(type,style,name\)/);
  assert.match(other, /api\.saveDocumentTemplateChoices\(next\)/);
  assert.match(css, /\.template-modal-embed embed,\.template-modal-embed iframe\{display:block/);
  // Fermetures prévues : croix, bouton Fermer, clic sur le fond, Échap.
  assert.match(other, /if\(ev\.key==='Escape'\)\{back\.remove\(\)/);
  assert.match(other, /if\(ev\.target===back\)back\.remove\(\)/);
});
