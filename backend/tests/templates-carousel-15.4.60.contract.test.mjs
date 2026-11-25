// Contrats V2 — carrousel des modèles de documents.
// Exigences utilisateur : le devis et la facture du même modèle sont présentés ENSEMBLE comme
// un lot, les cartes sont numérotées (savoir quand on a fait le tour), le choix du lot
// s'applique aux deux types de documents et à toutes les fiches PDF, et l'aperçu montre les
// deux PDF réels côte à côte.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const other = read('assets/js/pages/dash/other.js');
const css = read('assets/css/app.css');
const styles = read('backend/src/services/document-styles.ts');
const previews = readdirSync(new URL('../../assets/templates/previews', import.meta.url));

const styleIds = [...styles.matchAll(/id: '(aurion-[a-z]+)'/g)].map(m => m[1]);
const templateIds = [...other.matchAll(/\['(aurion-[a-z]+)',/g)].map(m => m[1]);

test('les 20 modèles sont exposés et possèdent leurs 40 aperçus (devis + facture)', () => {
  assert.equal(styleIds.length, 20, 'le catalogue doit contenir 20 modèles');
  assert.equal(new Set(styleIds).size, 20, 'les identifiants doivent être uniques');
  assert.deepEqual([...templateIds].sort(), [...styleIds].sort(), 'le carrousel doit afficher exactement le catalogue serveur');
  for (const id of styleIds) {
    for (const type of ['quote', 'invoice']) {
      assert.ok(previews.includes(`${type}-${id}.png`), `vignette manquante : ${type}-${id}.png`);
      assert.ok(existsSync(new URL(`../../assets/templates/${type}-${id}.pdf`, import.meta.url)), `PDF manquant : ${type}-${id}.pdf`);
    }
  }
});

test('chaque carte est un lot : le devis et la facture du même modèle sont montrés ensemble', () => {
  assert.match(other, /template-pair/);
  assert.match(other, /quote-\$\{id\}\.png/);
  assert.match(other, /invoice-\$\{id\}\.png/);
  assert.match(other, /<i>Devis<\/i>/);
  assert.match(other, /<i>Facture<\/i>/);
  // Le choix enregistre les DEUX styles : le lot est indissociable à la sélection.
  assert.match(other, /saveDocumentTemplateChoices\(\{quote:style,invoice:style\}\)/);
});

test('les cartes sont numérotées et le compteur indique le lot affiché et le tour effectué', () => {
  assert.match(other, /template-index/);
  assert.match(other, /String\(i\+1\)\.padStart\(2,'0'\)/);
  assert.match(other, /id="template-current"/);
  assert.match(other, /id="template-turns"/);
  assert.match(other, /Tour \$\{Math\.floor\(\(Math\.abs\(angle\)\+start\*STEP\)\/360\)\+1\}/);
});

test('l’anneau reste un vrai carrousel 3D qui tourne au clic et revient à son point de départ', () => {
  assert.match(other, /const rel=\(\(i\*STEP\+angle\)%360\+360\)%360/);
  assert.match(other, /angle\+=dir\*STEP/);
  assert.match(other, /const a=i\*STEP\+angle;/);
  assert.match(other, /rotateY\(\$\{a\.toFixed\(2\)\}deg\)/);
  assert.doesNotMatch(other, /ring\.style\.transform=/);
  assert.match(other, /let diff=Math\.round\(rel\/STEP\);if\(diff>N\/2\)diff-=N/);
  assert.match(css, /perspective:1600px/);
  assert.match(css, /\.template-ring\{position:relative;[^}]*transform-style:preserve-3d/);
  assert.match(css, /\.template-back\{transform:rotateY\(180deg\)/);
  assert.match(other, /data-start="\$\{start\}"/);
  assert.match(other, /let angle=-start\*STEP/);
});

test('la carte de face ouvre l’aperçu des deux PDF et valide le lot', () => {
  assert.match(other, /template-preview-pair/);
  assert.match(other, /src="\.\/assets\/templates\/quote-\$\{style\}\.pdf"/);
  assert.match(other, /src="\.\/assets\/templates\/invoice-\$\{style\}\.pdf"/);
  assert.match(other, /Utiliser ce lot/);
  assert.match(css, /\.template-preview-pair\{display:grid;grid-template-columns:1fr 1fr/);
  // Fermetures prévues : croix, bouton Fermer, clic sur le fond, Échap.
  assert.match(other, /if\(ev\.key==='Escape'\)\{back\.remove\(\)/);
  assert.match(other, /if\(ev\.target===back\)back\.remove\(\)/);
});
