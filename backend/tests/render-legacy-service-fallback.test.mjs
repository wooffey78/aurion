import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('le service Render sans configuration backend redirige vers la production sans secret inventé', () => {
  const pkg = JSON.parse(read('package.json'));
  const start = read('tools/start-render-compat.mjs');
  const migrate = read('tools/run-migrate-compat.mjs');
  const config = read('tools/render-backend-config.mjs');

  assert.equal(pkg.scripts.start, 'node tools/start-render-compat.mjs');
  assert.equal(pkg.scripts.migrate, 'node tools/run-migrate-compat.mjs');
  assert.match(start, /RENDER_SERVICE_ID/);
  assert.match(start, /https:\/\/aurion-web-o6ah\.onrender\.com/);
  assert.match(start, /hasProductionBackendConfig/);
  assert.match(migrate, /hasProductionBackendConfig/);
  assert.match(config, /DATABASE_URL/);
  assert.match(config, /JWT_SECRET/);
  assert.match(config, /AURION_ENCRYPTION_KEY/);
  assert.ok(config.includes(String.raw`/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/`) || config.includes(String.raw`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`));
});

test('les scripts de compatibilité Render sont syntaxiquement valides', () => {
  for (const path of [
    'tools/render-backend-config.mjs',
    'tools/run-migrate-compat.mjs',
    'tools/start-render-compat.mjs',
  ]) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(path, root))], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || path);
  }
});
