// Non-régression : conserver les routes métier historiques, sauf les fonctions explicitement retirées du produit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'src', 'routes');
const src = readdirSync(dir).filter(f => f.endsWith('.ts')).map(f => readFileSync(path.join(dir, f), 'utf8')).join('\n');
const now = new Set([...src.matchAll(/app\.(get|post|put|patch|delete)\(['"`]([^'"`]*)/g)].map(m => `${m[1].toUpperCase()} ${m[2]}`));
const intentionallyRemoved = new Set(['POST /documents/logo']);
const expected = readFileSync(path.join(here, 'routes-13.0.txt'), 'utf8').split('\n').filter(Boolean).map(route => route.replace(/^(get|post|put|patch|delete)/i, method => method.toUpperCase())).filter(route => !intentionallyRemoved.has(route));

test(`les ${expected.length} routes historiques conservées existent toujours`, () => {
  const missing = expected.filter(r => !now.has(r));
  assert.deepEqual(missing, []);
});

test('les anciennes routes administratives et de marque ne sont plus exposées', () => {
  for (const route of ['GET /documents/logo','POST /documents/logo','GET /journey/state','GET /administrative/formalities','POST /administrative/formalities','GET /settings/brand-bundle.zip','POST /ai/brand-logo/generate']) {
    assert.equal(now.has(route), false, 'route retirée encore présente : ' + route);
  }
  assert.ok(now.has('GET /journal/events'));
  assert.ok(now.has('GET /clients/:id/intervention-addresses'));
});
