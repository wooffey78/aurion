// Bloc 1 — Configuration canonique injectée par le serveur, fin de la dépendance à une URL
// Render codée en dur dans les sources du frontend, Render réconcilié avec « gratuit temporaire ».
// Aucun changement de comportement pour les utilisateurs : même origine servie, mode local
// Windows préservé, enveloppes natives inchangées (window.AURION_API_URL reste prioritaire).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

process.env.NODE_ENV ||= 'test';
process.env.DATABASE_URL ||= 'postgresql://aurion_runtime:test@127.0.0.1:5432/aurion_bloc1';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const DEMO_FALLBACK = 'https://aurion-2hye.onrender.com';

/** Évalue assets/js/config.js dans un contexte simulé (document/location/window). */
function evalConfig({ origin = 'https://aurion.integration.test', meta = '', preSet } = {}) {
  const context = vm.createContext({});
  context.document = { querySelector: () => (meta ? { content: meta } : null) };
  context.window = {};
  if (preSet !== undefined) context.window.AURION_API_URL = preSet;
  context.location = new URL(origin);
  vm.runInContext(readFileSync(new URL('../../assets/js/config.js', import.meta.url), 'utf8'), context);
  return { api: context.window.AURION_API_URL, prod: context.window.AURION_PRODUCTION_API_URL };
}

test('bloc1: config.js — navigation http(s) servie : même origine, quelle que soit la méta', () => {
  const served = evalConfig({ origin: 'https://aurion.integration.test', meta: '' });
  assert.equal(served.api, '');
  const servedMeta = evalConfig({ origin: 'https://aurion.integration.test', meta: 'https://ovh-canonique.example.invalid' });
  assert.equal(servedMeta.api, '');
});

test('bloc1: config.js — mode local Windows préservé (ports 3000 et 4000)', () => {
  assert.equal(evalConfig({ origin: 'http://localhost:3000' }).api, 'http://127.0.0.1:4000');
  assert.equal(evalConfig({ origin: 'http://127.0.0.1:4000' }).api, '');
});

test('bloc1: config.js — contexte sans origine HTTP : méta canonique, puis repli documenté', () => {
  const withMeta = evalConfig({ origin: 'file:///C:/Aurion/index.html', meta: 'https://ovh-canonique.example.invalid' });
  assert.equal(withMeta.api, 'https://ovh-canonique.example.invalid');
  assert.equal(withMeta.prod, 'https://ovh-canonique.example.invalid');
  const fallback = evalConfig({ origin: 'file:///C:/Aurion/index.html', meta: '' });
  assert.equal(fallback.api, DEMO_FALLBACK);
  assert.equal(fallback.prod, DEMO_FALLBACK);
});

test('bloc1: config.js — une enveloppe native qui pose window.AURION_API_URL reste prioritaire', () => {
  const native = evalConfig({ origin: 'file:///C:/Aurion/index.html', meta: 'https://ovh-canonique.example.invalid', preSet: 'https://app-native.example.invalid' });
  assert.equal(native.api, 'https://app-native.example.invalid');
});

test('bloc1: la page servie injecte la méta canonique depuis APP_BASE_URL (aucun onrender.com dans le HTML)', async () => {
  const { buildApp } = await import(new URL('../dist/app.js', import.meta.url).pathname);
  const app = await buildApp();
  const expectedBase = String(process.env.APP_BASE_URL || '').trim();
  const escaped = expectedBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, new RegExp(`<meta name="aurion-api-base" content="${escaped}">`), 'la méta canonique doit refléter APP_BASE_URL de l\'environnement');
    assert.ok(!res.body.includes('onrender.com'), 'la page servie ne doit plus contenir l\'URL Render');
    const index = await app.inject({ method: 'GET', url: '/index.html' });
    assert.equal(index.statusCode, 200);
    assert.match(index.body, /aurion-api-base/);
    // Le shell statique reste servilement inchangé : sw.js et manifest toujours accessibles.
    const sw = await app.inject({ method: 'GET', url: '/sw.js' });
    assert.equal(sw.statusCode, 200);
    const manifest = await app.inject({ method: 'GET', url: '/manifest.webmanifest' });
    assert.equal(manifest.statusCode, 200);
  } finally { await app.close(); }
});

test('bloc1: render.yaml — plan gratuit, plus aucun plan payant, URL Render documentée comme temporaire', () => {
  const yaml = readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8');
  assert.match(yaml, /plan: free/);
  assert.ok(!/plan: starter/.test(yaml), 'le plan payant starter doit avoir disparu');
  assert.match(yaml, /AURION_PUBLIC_ORIGIN/);
  assert.match(yaml, /ENVIRONNEMENT TEMPORAIRE GRATUIT/);
});
