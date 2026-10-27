import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

test('production binds to all interfaces but development defaults to loopback', () => {
  const config = read('backend/src/config.ts');
  assert.match(config, /HOST:z\.string\(\)\.default\(process\.env\.NODE_ENV === 'production' \? '0\.0\.0\.0' : '127\.0\.0\.1'\)/);
});

test('public database health response never returns raw driver messages', () => {
  const route = read('backend/src/routes/health.ts');
  assert.match(route, /DATABASE_UNAVAILABLE/);
  assert.doesNotMatch(route, /message:String\(e\?\.message/);
});

test('Render blueprint is free-tier web only and requires an externally managed database URL', () => {
  const render = read('render.yaml');
  assert.match(render, /type: web/);
  assert.match(render, /plan: free/);
  assert.doesNotMatch(render, /type: pserv|type: postgres|type: keyvalue/);
  assert.match(render, /key: DATABASE_URL\s+sync: false/);
  assert.match(render, /key: HOST\s+value: 0\.0\.0\.0/);
  assert.match(render, /healthCheckPath: \/health\/db/);
});

test('PWA cache is restricted to static assets and never stores business API responses', () => {
  const sw = read('sw.js');
  assert.match(sw, /function shouldCacheStaticRequest/);
  assert.match(sw, /if\(!shouldCacheStaticRequest\(event\.request\)\)return/);
  assert.match(sw, /CACHEABLE_PREFIXES/);
  assert.match(sw, /caches\.match\(event\.request,\{ignoreSearch:true\}\)/);
  assert.doesNotMatch(sw, /caches\.open\(CACHE\)\.then\(c=>c\.put\(e\.request/);
});

test('production image CSP permits the known landing-card image hosts', () => {
  const security = read('backend/src/plugins/security.ts');
  for (const host of ['https://www.apple.com','https://msftstories.thesourcemediaassets.com','https://storage.googleapis.com']) {
    assert.ok(security.includes(host), `CSP image host missing: ${host}`);
  }
});

test('repository ignores local environment, uploads and generated dependencies', () => {
  const ignore = read('.gitignore');
  for (const entry of ['.env', 'backend/storage/', 'node_modules/', 'backend/dist/']) assert.ok(ignore.includes(entry), `missing ignore entry ${entry}`);
});

test('fresh checkout test command builds dist before node tests load compiled services', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.test, /npm run build && npm --prefix backend test/);
});

test('startup failure messages do not echo raw driver exceptions', () => {
  const server = read('backend/src/server.ts');
  assert.match(server, /STARTUP_FAILED/);
  assert.doesNotMatch(server, /Demarrage impossible :',e\?\.message/);
});
