// 15.4.53 — harmonisation design et boutons fonctionnels : contrat de source.
// Verrouille les correctifs : navigation « + devis » depuis la fiche client, vue
// « Modèles de documents » branchée (VIEWS + navigation + datasets + drop-zone),
// barre de types de graphique au design Aurion, jetons d'accent de la charte,
// encarts chantiers au format .field/.kpi, alertes au thème clair.
// Contrat de source (gabarit v51-ops-supervision) : exécutable sans PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const other = read('../../assets/js/pages/dash/other.js');
const dashboard = read('../../assets/js/pages/dashboard.js');
const navigation = read('../../assets/js/core/navigation.js');
const clientsheet = read('../../assets/js/pages/dash/clientsheet.js');
const chantiers = read('../../assets/js/pages/dash/chantiers.js');
const charts = read('../../assets/js/core/charts.js');
const appCss = read('../../assets/css/app.css');

test('B-fix — « + devis » depuis la fiche client et la carte client ouvre l’écran de devis', () => {
  // Sans {navigation:true}, refresh('quote') ne rend jamais l’écran (pendingView reste sur
  // la liste clients) : le bouton paraissait mort. Le correctif demande explicitement le
  // changement d’écran, comme docs.js:80 (data-new-type) et quote.js:303 (après enregistrement).
  assert.match(other, /const quote=c=>\{S\.prefillClient=c\.id;S\.editing=null;S\.quoteDraft=null;S\.startBlankQuote=true;hooks\.refresh\('quote',\{navigation:true\}\)/);
  assert.doesNotMatch(other, /hooks\.refresh\('quote'\)(?!\s*\.catch)/);
});

test('B-fix — vue « Modèles de documents » branchée : VIEWS, navigation, datasets, bind sans crash', () => {
  assert.match(dashboard, /import\{home,clients,agenda,accounting,treasury,support,templates,admin\}from'\.\/dash\/other\.js';/);
  assert.match(dashboard, /const VIEWS=\{home,clients,chantiers,catalog,suppliers,quote,invoices:docs,templates,agenda,accounting,treasury,support,settings,account,admin\};/);
  assert.match(dashboard, /templates:\['templates','mail'\],/);
  assert.match(navigation, /\{id:'templates',label:'Modèles de documents',icon:'▤'\},/);
  // La zone de dépôt porte désormais l’id attendu par bind() (sinon TypeError et écran inerte).
  assert.match(other, /<div class="drop-zone" id="template-drop">/);
  // Après upload : re-rendu explicite de la vue (pendingView fixé), jamais un refresh muet.
  assert.match(other, /hooks\.refresh\('templates',\{navigation:true\}\)/);
});

test('Design — barre de types de graphique au design Aurion (CSS livré, jetons de charte)', () => {
  assert.match(appCss, /\.chart-toolbar\{[^}]*background:var\(--bg2\)/);
  assert.match(appCss, /\.chart-type-btn\.active\{[^}]*color:var\(--accent\)/);
  assert.match(appCss, /\.chart-legend\{[^}]*list-style:none/);
  assert.match(appCss, /\.legend-dot\{[^}]*border-radius:3px/);
  assert.match(appCss, /:root\{--accent:#0f2aa6;--accent-2:#166534\}/);
  assert.match(appCss, /#chantier-charts>\.panel\{margin-top:12px\}/);
  assert.match(appCss, /\.section-title \.field\.section-filter\{margin-left:auto/);
});

test('Design — charts.js n’utilise plus les couleurs de l’ancienne charte sombre', () => {
  assert.doesNotMatch(charts, /#529286|#8fb8ad|#3f7267|#2c4f58|#a9c7be|#6d8b83|#46586a|#0f2233/);
  assert.match(charts, /var\(--accent,#0f2aa6\)/);
  assert.match(charts, /var\(--accent-2,#166534\)/);
  assert.match(charts, /var\(--line,#9fbde0\)/);
  assert.match(charts, /var\(--panel,#eaf3fd\)/);
  assert.match(charts, /const PIE_COLORS = \['#0f2aa6', '#166534', '#b98a2f', '#4c627f', '#6f9b91', '#a61b1b'\];/);
});

test('Design — encarts chantiers au format Aurion (.field, .kpi, plus de styles inline)', () => {
  assert.match(chantiers, /<label class="field section-filter"><span>Statut<\/span><select id="chantier-status-filter"/);
  assert.match(chantiers, /<label class="field"><span>Nom du chantier<\/span><input name="name"/);
  assert.match(chantiers, /<label class="field"><span>Fréquence<\/span><select name="frequency"/);
  assert.match(chantiers, /<label class="field"><span>Type<\/span><select name="objectType" id="link-type"/);
  assert.match(chantiers, /<div class="kpi-grid">\$\{kpis\.map\(\(\[k, v\]\) => `<div class="kpi">/);
  assert.doesNotMatch(chantiers, /<article class="glass" style="padding:10px/);
  assert.doesNotMatch(chantiers, /<ul class="muted" style="margin/);
  assert.doesNotMatch(chantiers, /style="margin-left:auto;max-width:200px"/);
  // La fenêtre de rattachement conserve le ciblage .field pour masquer les champs non concernés.
  assert.match(chantiers, /sel\.closest\('label'\)\.hidden = !show/);
});

test('Design — select portail de la fiche client habillé (.field), comme son voisin', () => {
  assert.match(clientsheet, /<label class="field"><span>Accès concerné<\/span><select id="portal-share-access">/);
});

test('Design — alertes au thème clair : rouge de charte, confirmation danger distincte', () => {
  assert.match(appCss, /\.error\{color:var\(--red\)!important\}/);
  assert.match(appCss, /\.alert-loss\{[^}]*color:var\(--red\)!important\}/);
  assert.match(appCss, /\.confirm-icon\.danger\{[^}]*color:var\(--red\)/);
  assert.match(appCss, /\.legal-accept-bar\{margin:0 0 16px/);
});
