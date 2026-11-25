// Contrats 15.4.63 — les exigences de l'utilisateur : admin encarts⇄diagrammes exclusifs,
// EasyWeb-dev en pied de page, avatar jamais vide, modèles (cartes plus petites + écarts
// visibles + scène élargie), anti-sauts, détail prévisionnel = scénario réel, encarts
// comptables avec repli local honnête, aucune ligne de pièce automatique, multi-prestations
// (ajout/retrait, calculs), compteur temps automatique, e-mail document honnête (file
// d'attente + alertes Aurion + badge), classeur Excel de référence lié au moteur de calcul.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const other = read('assets/js/pages/dash/other.js');
const docs = read('assets/js/pages/dash/docs.js');
const quote = read('assets/js/pages/dash/quote.js');
const core = read('assets/js/pages/dash/core.js');
const dashboard = read('assets/js/pages/dashboard.js');
const forecast = read('assets/js/core/forecast.js');
const index = read('index.html');
const css = read('assets/css/app.css');
const admin = read('backend/src/routes/admin.ts');
const business = read('backend/src/routes/business.ts');
const mailRoute = read('backend/src/routes/mail.ts');
const migration = read('backend/migrations/123_email_outbox_multi_services.sql');
const outbox = read('backend/src/services/email-outbox.ts');
const apijs = read('assets/js/core/api.js');

test('1 — Administration : l\u2019encart d\u2019affichage des indicateurs est supprimé (15.4.66)', () => {
  // 15.4.66 (consigne éditeur) : la bascule exclusive encarts ⇄ diagrammes et sa vue
  // mémorisée disparaissent complètement ; les cartes chiffrées restent la seule vue.
  assert.doesNotMatch(other, /id="admin-view-toggle"/);
  assert.doesNotMatch(other, /id="admin-charts"/);
  assert.doesNotMatch(other, /aurion-admin-view/);
  assert.doesNotMatch(other, /id="admin-view-cards"/);
  assert.doesNotMatch(other, /id="admin-view-charts"/);
  assert.match(other, /id="admin-metrics"/);
});

test('2 — les CSS des diagrammes d\u2019administration sont retirées avec l\u2019encart (15.4.66)', () => {
  assert.doesNotMatch(css, /\.admin-charts-grid/);
  assert.doesNotMatch(css, /\.admin-view-switch/);
});

test('3 — pied de page : Développement & support : EasyWeb-dev', () => {
  assert.match(index, /Développement &amp; support&nbsp;: EasyWeb-dev/);
  assert.doesNotMatch(index, /easyfixit\.reparation@gmail\.com/);
});

test('4 — barre supérieure : simple lien « Mon compte » au design Aurion (15.4.66)', () => {
  // 15.4.67 (consigne éditeur) : le lien « Mon compte » devient un lien-IMAGE arrondi qui
  // reprend l'avatar téléversé dans « Mon compte » (repli : initiales du compte).
  assert.match(dashboard, /<a class="account-link account-avatar-link" href="#\/dashboard\?view=account" title="Mon compte" aria-label="Mon compte"><span class="account-avatar-bubble" id="shell-avatar">/);
  assert.match(dashboard, /refreshShellAvatar/);
  assert.doesNotMatch(dashboard, /syncShellAvatar/);
  assert.match(dashboard, /S\.company\?\.name\|\|'Entreprise'/);
  assert.match(dashboard, /barre supérieure jamais bloquée par une donnée absente/);
});

test('5 — modèles : cartes plus petites, écarts garantis, scène élargie, anti-sauts', () => {
  // cartes rétrécies
  assert.match(css, /width:clamp\(150px,38vw,205px\);height:calc\(clamp\(150px,38vw,205px\)\*1\.414\)/);
  // écart réel garanti entre la carte de face et ses voisines (demi-largeurs projetées + 40px)
  assert.match(other, /const rx=Math\.max\(70,Math\.min\(470,\(\(cardW\*1\.05\+cardW\*0\.94\*0\.707\)\*mag\/2\+40\)\/0\.707\)\);/);
  // anneau plus profond et scène élargie
  assert.match(other, /const rz=Math\.max\(150,Math\.min\(600,w\*0\.54\)\);/);
  assert.match(css, /height:clamp\(300px,44vw,560px\)/);
  // anti-sauts : dimensions réservées pour les aperçus
  assert.match(css, /\.template-face img,\.template-back img\{width:100%;height:100%;object-fit:cover/);
});

test('6 — détail prévisionnel : projections du scénario (plus jamais 0 sans raison)', () => {
  assert.match(forecast, /entriesHt: monthlyEntriesHt \* months,/);
  // 15.4.67 — le panneau Horizon dessine un graphique natif (SVG) à bascule.
  assert.match(other, /function horizonChartSvg\(p\)/);
  assert.match(other, /forecast-chart-wrap/);
  // 15.4.67 — les projections HT du scénario disparaissent ; le graphique SVG de l'horizon
  // les remplace (aucune valeur inventée à l'écran, mêmes bases de calcul).
  assert.doesNotMatch(other, /projection HT \(scénario\)/);
  assert.match(other, /forecast-chart-wrap/);
  assert.doesNotMatch(other, /S\.dashboardCounters\?\.forecast\?\.months3\|\|0/);
});

test('7 — encarts comptables : repli local honnête au lieu de zéros trompeurs', () => {
  assert.match(other, /const accountingFallback=serverEmpty&&localRows\.length>0/);
  assert.match(other, /mêmes règles que le/);
  assert.match(other, /data-accounting-fallback/);
  // 15.4.64 — le repli s'applique AVANT la lecture des encarts (objets recréés, plus de mutation tardive).
  assert.match(other, /revenue_ht:sum\(r=>r\.ht\)/);
  assert.match(other, /15\.4\.64 — CORRECTIF : le repli local s'applique AVANT la lecture des encarts/);
});

test('8 — devis/factures : plus aucune ligne de pièce ajoutée automatiquement', () => {
  assert.match(quote, /plus aucun ajout automatique de pièce/);
  assert.doesNotMatch(quote, /if\(learnedParts\.length\)\{const wanted=S\.parts\.filter/);
});

test('9 — multi-prestations : ajout/retrait manuels, calculs, PDF et sauvegarde', () => {
  assert.match(quote, /id="add-service"/);
  assert.match(quote, /id="service-extras"/);
  assert.match(quote, /const extrasTotal=\(\)=>serviceExtras\.reduce/);
  assert.match(quote, /const addServiceExtra=\(\)=>/);
  assert.match(quote, /kind:'service'/);
  // 15.4.67 — le champ porte le TOTAL cumulé + la remise TTC tracée séparément.
  assert.match(quote, /finalPriceTtc:r2\(num\('#targetTtc'\)\),discountTtc:r2\(discountTtc\)/);
  assert.match(quote, /Prestations complémentaires \(TTC\)/);
  assert.match(quote, /serviceExtras=q\?\(q\.items\|\|\[\]\)\.filter\(i=>i\.kind==='service'\)/);
  // backend : la ligne porte son kind et le TTC final intègre les prestations
  assert.match(business, /kind: z\.enum\(\['part','service'\]\)\.optional\(\)/);
  assert.match(business, /insert into quote_items\(quote_id,position,label,quantity,unit_cost,part_id,sale_coefficient_percent,unit_price,photo_key,activity_category,kind\)/);
  assert.match(business, /'kind',i\.kind/);
  assert.match(migration, /alter table quote_items add column if not exists kind varchar\(20\) not null default 'part';/);
});

test('10 — compteur temps : arrêt automatique en fin de prise en charge client', () => {
  assert.match(business, /le compteur temps du client s'arrête DÈS la facturation/);
  assert.match(business, /if\(converted\.clientId\)\{try\{await stopClientTimer/);
  assert.doesNotMatch(business, /emailStatus==='sent'&&converted\.clientId\)\{try\{await stopClientTimer/);
  assert.match(dashboard, /fin de prise en charge client : quitter la fiche client arrête automatiquement/);
  assert.match(dashboard, /previous==='clients'&&id!=='clients'&&S\.timeMetrics\?\.active\?\.id/);
  assert.match(dashboard, /api\.stopTimeSession\(sid\)/);
});

test('11 — e-mail document : statut honnête, file d\u2019attente, alertes Aurion, badge et vidage', () => {
  // serveur : mise en file quand la messagerie est absente ou en échec + vidage automatique
  assert.match(business, /await queueOutboxEmail\(org,id,type,c\.email,subject,body\);\n    return 'queued';/);
  assert.match(business, /app\.post\('\/communications\/email\/flush'/);
  assert.match(mailRoute, /flushOutbox\(org\)/);
  assert.match(mailRoute, /le test réussi déclenche le vidage de la boîte d'envoi/);
  assert.match(outbox, /export async function queueOutboxEmail/);
  assert.match(outbox, /export async function flushOutbox/);
  assert.match(outbox, /email_pending/);
  assert.match(migration, /create table if not exists email_outbox\(/);
  // interface : alerte honnête + badge + bouton de vidage
  assert.match(core, /if\(status==='queued'\)return toast\(`\$\{noun\} enregistré et validé\./);
  assert.match(docs, /email-pending-pill/);
  assert.match(docs, /id="flush-outbox"/);
  assert.match(apijs, /flushEmails:\(\)=>request\('\/communications\/email\/flush',\{method:'POST'\}\)/);
  // la liste des documents porte l'indicateur d'attente
  assert.match(business, /exists\(select 1 from email_outbox o where o\.quote_id=q\.id and o\.status='pending'\) email_pending/);
});

test('12 — classeur Excel de référence lié au moteur (contrat golden séparé)', () => {
  assert.ok(read('assets/reference/classeur-reference.json').includes('computePricing().totalTtc'));
  assert.match(admin, /app\.get\('\/admin\/tiime'/); // rien n'est cassé par la vague
});
