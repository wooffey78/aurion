import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const main = read('assets/js/main.js');
const router = read('assets/js/core/router.js');
const shell = read('index.html');
const docs = read('assets/js/pages/dash/docs.js');
const dashboard = read('assets/js/pages/dashboard.js');
const css = read('assets/css/app.css');
const sw = read('sw.js');
const manifest = read('manifest.webmanifest');

test('les boutons d’accueil gardent les ancres natives et le routeur traite le hashchange', () => {
  assert.ok(shell.includes('href="#/auth"'));
  assert.ok(shell.includes('href="#/login"'));
  assert.ok(main.includes("if(r==='/auth')return renderAuth('register')"));
  assert.ok(main.includes("if(r==='/login')return renderAuth('login')"));
  assert.ok(router.includes('location.hash=path'));
  assert.ok(router.includes("addEventListener('hashchange',fn)"));
  assert.ok(!main.includes('bindLandingNavigation'));
  assert.ok(shell.includes('main.js?v=15.2.43-r1'));
  assert.ok(shell.includes('app.css?v=15.2.43-r1'));
  assert.ok(sw.includes('aurion-shell-v15.2.43-r1'));
});

test('la suppression de facture reste disponible même si elle est déjà réglée', () => {
  assert.match(docs, /title="Suppression définitive"/);
  assert.match(docs, /all\('\.delete-doc'\)\.forEach/);
  assert.match(docs, /api\.deleteQuote\(q\.id\)/);
  assert.doesNotMatch(docs, /q\.document_type==='invoice'&&q\.payment_status==='paid'\?'':/);
});

test('le bouton plein écran reflète son état actif et reste accessible', () => {
  assert.match(dashboard, /id="fs-toggle"/);
  assert.match(dashboard, /fullscreenchange/);
  assert.match(dashboard, /aria-pressed/);
  assert.match(dashboard, /is-fullscreen/);
  assert.match(dashboard, /requestFullscreen\(\)/);
});

test('l’interface et l’installation utilisent le thème clair et les centrages smartphone', () => {
  assert.match(css, /\.landing-hero \.button-row\{justify-content:center/);
  assert.match(css, /\.page-head\{align-items:center!important;text-align:center/);
  assert.match(css, /\.top-actions #fs-toggle\{margin:0 auto\}/);
  assert.match(manifest, /"theme_color":"#ffffff"/);
  assert.match(manifest, /"background_color":"#ffffff"/);
});
