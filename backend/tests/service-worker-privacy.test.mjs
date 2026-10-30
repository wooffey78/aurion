import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('service worker only handles GET requests to the same origin that match the static allowlist', () => {
  assert.match(worker, /function shouldCacheStaticRequest\(request\)/);
  assert.match(worker, /request\.method!=='GET'\)return false/);
  assert.match(worker, /url\.origin!==self\.location\.origin/);
  assert.match(worker, /CACHEABLE_EXACT\.has\(url\.pathname\)/);
  assert.match(worker, /CACHEABLE_PREFIXES\.some\(prefix=>url\.pathname\.startsWith\(prefix\)\)/);
});

test('service worker does not cache private API responses and falls back only for static files', () => {
  assert.match(worker, /if\(!shouldCacheStaticRequest\(event\.request\)\)return/);
  assert.match(worker, /cache\.put\(event\.request,response\.clone\(\)\)/);
  assert.match(worker, /caches\.match\(event\.request,\{ignoreSearch:true\}\)/);
  const prefixes = worker.match(/const CACHEABLE_PREFIXES=\[([\s\S]*?)\];/);
  assert.ok(prefixes, 'static prefixes should be explicitly enumerated');
  assert.doesNotMatch(prefixes[1], /api|suppliers|clients|auth/i);
});

test('le manifeste PWA fournit des icônes de lancement distinctes 192, 512 et maskable', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.icons.some(icon => icon.sizes === '192x192' && icon.purpose === 'any'), true);
  assert.equal(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'any'), true);
  assert.equal(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'), true);
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, icon.src.replace('./', ''))), `icône manquante : ${icon.src}`);
  assert.match(worker, /aurion-maskable-512\.png/);
});
