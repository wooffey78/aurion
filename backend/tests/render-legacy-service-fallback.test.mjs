import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('le service Render canonique reste fermé sans configuration backend et les anciennes origines redirigent vers Francfort', () => {
  const pkg = JSON.parse(read('package.json'));
  const start = read('tools/start-render-compat.mjs');
  const migrate = read('tools/run-migrate-compat.mjs');
  const config = read('tools/render-backend-config.mjs');
  assert.equal(pkg.scripts.start, 'node tools/start-render-compat.mjs');
  assert.equal(pkg.scripts.migrate, 'node tools/run-migrate-compat.mjs');
  assert.match(start, /RENDER_SERVICE_ID/);
  assert.match(start, /AURION_PUBLIC_ORIGIN \|\| 'https:\/\/aurion-2hye\.onrender\.com'/);
  assert.match(start, /RENDER_EXTERNAL_URL \|\| 'https:\/\/aurion-2hye\.onrender\.com'/);
  assert.match(start, /if\s*\(isCanonicalService\)/);
  assert.match(start, /writeHead\(503/);
  assert.match(start, /writeHead\(status, \{ Location: destination\.href/);
  assert.match(start, /const status = request\.method === 'GET' \|\| request\.method === 'HEAD' \? 302 : 307/);
  assert.match(migrate, /hasProductionBackendConfig/);
  assert.match(config, /DATABASE_URL/);
  assert.match(config, /JWT_SECRET/);
  assert.match(config, /AURION_ENCRYPTION_KEY/);
  assert.ok(config.includes(String.raw`/^[^\\s@]+@[^\\s@]+\.[^\\s@]+$/`) || config.includes(String.raw`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`));
});
