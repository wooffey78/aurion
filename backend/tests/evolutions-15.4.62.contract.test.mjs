// Contrats 15.4.62 — les 8 évolutions/corrections demandées par l'utilisateur.
// 1 toutes les pièces proposées dans un devis · 2 prévisionnel prenant les devis en compte ·
// 3 plus de menu déroulant dans la prévision de facturation · 4 carrousel PC nettement plus
// espacé · 5 mention du développeur · 6 avatar jamais vide (image ET initiales) ·
// 7 Administration : encart Tiime prévu (souscription + connexion serveur) ·
// 8 Administration : indicateurs affichables en diagrammes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const quote = read('assets/js/pages/dash/quote.js');
const forecast = read('assets/js/core/forecast.js');
const other = read('assets/js/pages/dash/other.js');
const account = read('assets/js/pages/dash/account.js');
const dashboard = read('assets/js/pages/dashboard.js');
const index = read('index.html');
const css = read('assets/css/app.css');
const admin = read('backend/src/routes/admin.ts');
const migration = read('backend/migrations/122_tiime_platform_config.sql');
const apijs = read('assets/js/core/api.js');

test('1 — un devis propose TOUTES les pièces du catalogue (pas seulement la pièce configurée)', () => {
  assert.match(quote, /const rest=S\.parts\.filter\(x=>!ranked\.includes\(x\)\);const list=\[\.\.\.ranked,\.\.\.rest\];/);
  assert.match(quote, /on peut choisir n'importe quelle/);
  assert.doesNotMatch(quote, /const list=ranked\.length\?ranked:S\.parts/);
});

test('2 — le prévisionnel prend les devis en compte dans le volume mensuel', () => {
  assert.match(forecast, /const projectedCount = recentInvoices\.length \+ quoteSamples\.length;/);
  assert.match(forecast, /potentialClientsPerMonth: projectedCount \/ 6,/);
  assert.doesNotMatch(forecast, /potentialClientsPerMonth: recentInvoices\.length \/ 6/);
  assert.match(forecast, /Moyenne des devis/);
});

test('3 — la prévision de facturation ne propose plus de menu déroulant', () => {
  assert.doesNotMatch(other, /forecast-history/);
  // 15.4.67 — plus aucun menu déroulant ni projections repliées : le panneau « Horizon »
  // (tableau ⇄ graphique) se bascule par simple bouton, sans menu ni bloc caché.
  assert.match(other, /data-horizon-toggle="1"/);
  assert.doesNotMatch(other, /id="forecast-more"/);
  assert.doesNotMatch(other, /SCÉNARIO INDICATIF/);
  // 15.4.67 — le bouton Détail laisse place à la bascule tableau ⇄ graphique.
  assert.match(other, /data-horizon-toggle="1"/);
});

test('4 — carrousel : espacement PC nettement supérieur (anneau profond, cartes écartées, scène agrandie)', () => {
  assert.match(other, /const rz=Math\.max\(150,Math\.min\(600,w\*0\.54\)\);/);
  assert.match(other, /const rx=Math\.max\(70,Math\.min\(470,/);
  assert.match(css, /height:clamp\(300px,44vw,560px\)/);
});

test('5 — la mention du développeur figure dans le pied de page (contact réel, rien d\u2019inventé)', () => {
  // 15.4.63 — la mention affiche désormais EasyWeb-dev (choix utilisateur).
  assert.match(index, /Développement &amp; support&nbsp;:/);
  assert.match(index, /EasyWeb-dev/);
  assert.match(css, /\.app-footer-dev\{color:var\(--muted\)\}/);
});

test('6 — l\u2019avatar n\u2019est plus jamais vide : initiales toujours rendues, image recouvrante contrôlée', () => {
  assert.match(account, /<div class="account-avatar-stack"><div class="avatar-lg" aria-hidden="true">/);
  assert.match(account, /img\.onerror=\(\)=>img\.remove\(\);/);
  assert.match(account, /if\(blob&&blob\.size>0\)/);
  // 15.4.67 (consigne éditeur) : le lien « Mon compte » devient un lien-image arrondi qui
  // reprend l'avatar téléversé dans « Mon compte » (fetch authentifié, repli initiales).
  assert.match(dashboard, /id="shell-avatar"/);
  assert.match(dashboard, /class="account-link account-avatar-link"/);
  assert.match(css, /\.account-avatar-stack\{position:relative/);
  assert.match(css, /\.account-avatar-stack \.account-avatar-image\{position:absolute/);
});

test('7 — Administration → Intégrations → Plateformes agréées → Tiime : encart prévu et connexion serveur', () => {
  assert.match(other, /ADMINISTRATION → INTÉGRATIONS → PLATEFORMES AGRÉÉES/);
  assert.match(other, /Activez votre facturation électronique avec Aurion et Tiime/);
  assert.match(other, /Créer mon compte Tiime/);
  assert.match(other, /https:\/\/www\.tiime\.fr/);
  assert.match(other, /aucun partenariat n'est présenté comme signé/);
  // Configuration serveur : identifiant/secret API, URLs, URI de retour, scopes, webhooks, environnement.
  assert.match(other, /id="tiime-form"/);
  assert.match(other, /name="apiSecret" type="password"/);
  assert.match(other, /name="webhookSecret" type="password"/);
  assert.match(admin, /app\.get\('\/admin\/tiime'/);
  assert.match(admin, /app\.put\('\/admin\/tiime'/);
  assert.match(admin, /ils ne transitent jamais en retour d'API|Secrets : une valeur vide conserve/);
  assert.match(admin, /tiimePublic/);
  assert.match(migration, /create table if not exists platform_tiime_config\(/);
  assert.match(migration, /webhook_secret text not null default ''/);
  assert.match(migration, /environment varchar\(20\) not null default 'test'/);
  assert.match(apijs, /adminTiime:\(\)=>request\('\/admin\/tiime'\),flushEmails:\(\)=>request\('\/communications\/email\/flush',\{method:'POST'\}\),saveAdminTiime:b=>request\('\/admin\/tiime',\{method:'PUT',body:JSON\.stringify\(b\)\}\)/);
});

test('8 — Administration : cartes chiffrées uniquement (encart diagrammes supprimé, 15.4.66)', () => {
  // 15.4.66 (consigne éditeur) : l'encart d'affichage des indicateurs en diagrammes disparaît
  // complètement — bascule, vue mémorisée, conteneur et CSS. Les cartes chiffrées restent.
  assert.doesNotMatch(other, /id="admin-view-toggle"/);
  assert.doesNotMatch(other, /aurion-admin-view/);
  assert.doesNotMatch(other, /id="admin-charts"/);
  assert.doesNotMatch(other, /class="admin-view-switch"/);
  assert.match(other, /id="admin-metrics"/);
  assert.doesNotMatch(css, /\.admin-charts-grid\{/);
});
