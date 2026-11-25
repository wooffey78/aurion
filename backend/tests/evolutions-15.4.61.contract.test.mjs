// Contrats 15.4.61 — les 10 évolutions/corrections demandées par l'utilisateur.
// 1 compteur démarré dès la création client · 2 prévision de facturation · 3 pièce auto modifiable
// · 4 espacement carrousel desktop · 5 PDF taille réelle débloqué (CSP) · 6 invitation au design
// Aurion · 7 repli du menu déroulant · 8 téléversement de modèles supprimé · 9 comptabilité
// croisée (encarts remplis) · 10 retour du masquage Chantiers + Stripe/Tiime en pied de page.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const business = read('backend/src/routes/business.ts');
const accounting = read('backend/src/services/accounting.ts');
const other = read('assets/js/pages/dash/other.js');
const quote = read('assets/js/pages/dash/quote.js');
const suggest = read('assets/js/core/suggest.js');
const apijs = read('assets/js/core/api.js');
const index = read('index.html');
const css = read('assets/css/app.css');
const security = read('backend/src/plugins/security.ts');
const documents = read('backend/src/routes/documents.ts');
const clientsheet = read('assets/js/pages/dash/clientsheet.js');
const syncjs = read('assets/js/account-sync.js');

test('1 — le compteur de temps économisé démarre dès la création de la fiche client (toutes les voies)', () => {
  // Création depuis la liste des clients : session insérée par POST /clients.
  assert.match(business, /insert into client_time_sessions\(id,organization_id,user_id,client_id,activity_id,manual_minutes,started_at\) values\(\$1,\$2,\$3,\$4,\$5,\$6,now\(\)\)/);
  // Création directe dans un devis/facture : même démarrage automatique dans createClientForDocument.
  assert.match(business, /async function createClientForDocument\(executor:SqlExecutor,org:string,aid:string,userId:string,nc:any\)/);
  assert.match(business, /insert into client_time_sessions\(id,organization_id,user_id,client_id,activity_id,manual_minutes,started_at\) values\(\$1,\$2,\$3,\$4,\$5,coalesce\(\(select c\.estimated_minutes from clients c where c\.id=\$4\),0\),now\(\)\)/);
  // Le badge de la fiche reflète l'état réel (démarré par défaut → « en cours »).
  assert.match(clientsheet, /Compteur de temps économisé en cours — cliquer pour mettre en pause/);
  // L'utilisateur est informé au retour de la création.
  assert.match(other, /le compteur de temps économisé démarre automatiquement à son ouverture/);
});

test('2 — la prévision de facturation ne traite plus tous les devis ouverts comme signés le mois suivant', () => {
  // month1 = réalisé du mois + moyenne historique (l'ancien nextMonth=open est aboli).
  assert.match(business, /const nextMonth=monthHt\+historicalAverage;/);
  assert.doesNotMatch(business, /const nextMonth=open;/);
  // La moyenne historique croise paiements détaillés ET factures payées sans ligne de paiement.
  assert.match(business, /with cash as \(/);
  assert.match(business, /and not exists\(select 1 from invoice_payments p2 where p2\.quote_id=q\.id\)/);
  assert.match(business, /le mois à venir n’ajoute plus l’intégralité des devis ouverts/);
});

test('3 — la pièce proposée automatiquement reste modifiable et supprimable', () => {
  // Les valeurs tapées sont préservées avant tout redraw (détection 350 ms).
  assert.match(quote, /const syncLinesFromDom=\(\)=>\{document\.querySelectorAll\('\.line-row'\)\.forEach/);
  assert.match(quote, /const drawAll=\(\)=>\{syncLinesFromDom\(\);draw\(\);suggestLines\(\)\};/);
  // Une pièce retirée n'est plus ré-ajoutée automatiquement.
  // 15.4.63 — exigence utilisateur : plus aucune pièce ajoutée automatiquement (mécanisme
  // dismissedParts retiré avec le bloc d'ajout automatique lui-même).
  assert.match(quote, /plus aucun ajout automatique de pièce/);
  assert.doesNotMatch(quote, /const dismissedParts=new Set\(\);/);
});

test('4 — espacement desktop dans l\'anneau 3D (15.4.63 : écarts réellement visibles)', () => {
  assert.match(other, /const rz=Math\.max\(150,Math\.min\(600,w\*0\.54\)\);/);
  assert.match(other, /const rx=Math\.max\(70,Math\.min\(470,/);
  // V2 — la géométrie de l'anneau est conservée ; seules les faces deviennent des lots.
  assert.match(other, /const rz=Math\.max\(150,Math\.min\(600,w\*0\.54\)\);/);
});

test('5 — l\'aperçu taille réelle est débloqué : CSP frame-ancestors self + iframe + ouverture en onglet', () => {
  assert.match(security, /frameAncestors:\["'self'"\]/);
  assert.doesNotMatch(security, /frameAncestors:\["'none'"\]/);
  assert.doesNotMatch(documents, /frame-ancestors 'none'/);
  assert.match(documents, /frame-ancestors 'self'/);
  // La modale embarque le PDF réel et propose le repli « Ouvrir dans un onglet ».
  assert.match(other, /template-preview-pair/);
  assert.match(other, /src="\.\/assets\/templates\/quote-\$\{style\}\.pdf"/);
  assert.match(other, /src="\.\/assets\/templates\/invoice-\$\{style\}\.pdf"/);
  assert.match(other, /dans un onglet/);
});

test('6 — l\'encart d\'invitation (Administration) est au design Aurion', () => {
  assert.match(other, /guest-invite-row"><label class="field guest-invite-field"><span>E-mail de l'invité<\/span><input id="guest-email" type="email"/);
  assert.doesNotMatch(other, /<div class="button-row"><input id="guest-email"/);
  assert.match(css, /\.guest-invite-row\{display:flex/);
});

test('7 — le menu déroulant se replie après le choix d\'une prestation', () => {
  // Le focus ne rouvre pas une valeur venant d'être choisie.
  assert.match(suggest, /const pickedNow=\(\)=>lastPicked&&norm\(input\.value\)===norm\(lastPicked\);/);
  assert.match(suggest, /if\(box\.hidden&&!pickedNow\(\)\)render\(\)/);
  // Entrée hors liste : repli (et pas de soumission de formulaire).
  assert.match(suggest, /if\(idx>=0\)pick\(idx\);else\{box\.hidden=true;toggle\.setAttribute\('aria-expanded','false'\)\}/);
  // Commit sans sélection (flou) : repli garanti.
  assert.match(suggest, /input\.addEventListener\('change',\(\)=>\{if\(!box\.hidden\)\{box\.hidden=true;toggle\.setAttribute\('aria-expanded','false'\)\}\}\);/);
});

test('8 — le téléversement de modèles personnels est supprimé (UI, API, routes)', () => {
  assert.doesNotMatch(other, /template-drop|uploadTemplate|delete-template|Modèles personnels/);
  assert.doesNotMatch(apijs, /uploadTemplate|deleteTemplate:|templateStatus|documentTemplates:/);
  assert.doesNotMatch(documents, /document-templates\/upload|document-templates\/status|app\.delete\('\/document-templates\/:id'|app\.get\('\/document-templates',/);
  // Les choix de modèles natifs restent servis, et le rendu serveur des anciens modèles est conservé.
  assert.match(other, /saveDocumentTemplateChoices|documentTemplateChoices/);
  assert.match(documents, /document_templates/);
});

test('9 — comptabilité croisée : les factures payées sans ligne de paiement alimentent les encarts', () => {
  // Le moteur mensuel unionne les paiements détaillés et les factures payées (Excel, saisie directe).
  assert.match(accounting, /with payment_rows as \(/);
  assert.match(accounting, /q\.payment_status in \('paid','partially_paid'\) and coalesce\(q\.amount_paid,0\)>0/);
  assert.match(accounting, /not exists\(select 1 from invoice_payments p2 where p2\.quote_id=q\.id\)/);
  assert.match(accounting, /coalesce\(q\.paid_at,q\.updated_at,q\.created_at\) paid_at/);
  // « Factures encaissées » utilise la même union (jamais de double comptage).
  assert.match(business, /select count\(distinct quote_id\)::int n from \(/);
  // La synchronisation des encarts transmet l'activité sélectionnée (fini l'écrasement par une autre activité).
  assert.match(syncjs, /aurion\.activeActivityId/);
  assert.match(syncjs, /'x-aurion-activity-id':activityId/);
});

test('10 — Chantiers à nouveau masqué selon le métier + Stripe/Tiime et mentions légales sur toutes les pages', () => {
  const nav = read('assets/js/core/navigation.js');
  assert.match(nav, /if\(features&&features\.features&&features\.features\.chantiers===false\)hidden\.add\('chantiers'\);/);
  // Pied de page global, hors du conteneur remplacé par l'application → visible sur toutes les pages.
  assert.match(index, /<footer class="app-footer" role="contentinfo">/);
  assert.match(index, /Facturation électronique&nbsp;:<\/span><a href="https:\/\/www\.tiime\.fr"[^>]*>Tiime<\/a>/);
  assert.match(index, /Paiements sécurisés&nbsp;:<\/span><a href="https:\/\/stripe\.com"[^>]*>Stripe<\/a>/);
  assert.match(index, /href="#\/legal"/);
  assert.match(css, /\.app-footer\{margin-top:auto/);
});
