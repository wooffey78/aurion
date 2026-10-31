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

test('Render blueprint targets the existing Frankfurt service and external production database', () => {
  const render = read('render.yaml');
  assert.match(render, /type: web/);
  assert.match(render, /name: aurion/);
  assert.match(render, /region: frankfurt/);
  assert.match(render, /plan: starter/);
  assert.doesNotMatch(render, /type: pserv|type: postgres|type: keyvalue/);
  assert.match(render, /key: DATABASE_URL\s+sync: false/);
  assert.match(render, /key: AURION_MIGRATION_DATABASE_URL\s+sync: false/);
  assert.match(render, /key: AURION_RUNTIME_DB_ROLE\s+sync: false/);
  assert.match(render, /key: HOST\s+value: 0\.0\.0\.0/);
  assert.match(render, /healthCheckPath: \/health\/db/);
  assert.match(render, /key: AURION_STORAGE_BACKEND\s+value: s3/);
  assert.match(render, /key: AURION_PUBLIC_ORIGIN\s+value: https:\/\/aurion-2hye\.onrender\.com/);
  assert.match(read('backend/src/routes/health.ts'), /app\.get\("\/health\/db"/);
});

test('commercial readiness migrations exist but are not applied automatically by repository checks', () => {
  for (const migration of [
    'backend/migrations/070_contract_withdrawal_requests.sql',
    'backend/migrations/071_electronic_invoice_not_transmitted_status.sql',
    'backend/migrations/072_micro_enterprise_subscription_prices.sql'
  ]) {
    assert.ok(read(migration).trim().length > 30, `Missing or empty migration: ${migration}`);
  }
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.start, /start-render-compat|backend start/);
  assert.doesNotMatch(pkg.scripts.check, /migrate:prod|db:migrate/);
});

test('PWA cache is restricted to static assets and never stores business API responses', () => {
  const sw = read('sw.js');
  assert.match(sw, /function shouldCacheStaticRequest/);
  assert.match(sw, /if\(!shouldCacheStaticRequest\(event\.request\)\)return/);
  assert.match(sw, /CACHEABLE_PREFIXES/);
  assert.match(sw, /caches\.match\(event\.request,\{ignoreSearch:true\}\)/);
  assert.doesNotMatch(sw, /caches\.open\(CACHE\)\.then\(c=>c\.put\(e\.request/);
});

test('CSP keeps images local and blocks third-party image-host dependencies', () => {
  const security = read('backend/src/plugins/security.ts');
  assert.match(security, /imgSrc:\[\"'self'\",\"data:\",\"blob:\"\]/);
  for (const host of ['https://www.apple.com','https://msftstories.thesourcemediaassets.com','https://storage.googleapis.com']) {
    assert.ok(!security.includes(host), `Unexpected third-party image host in CSP: ${host}`);
  }
  for (const asset of ['assets/platforms/ios.svg','assets/platforms/windows.svg','assets/platforms/android.svg','assets/platforms/macos.svg']) {
    assert.ok(read(asset), `Expected local platform image: ${asset}`);
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
