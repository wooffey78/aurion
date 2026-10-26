// Non-régression : toutes les routes conservées de la version 13.0 doivent toujours exister. La route /regulatory est explicitement dépréciée par la migration 013.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'src', 'routes');
const src = readdirSync(dir).filter(f => f.endsWith('.ts')).map(f => readFileSync(path.join(dir, f), 'utf8')).join('\n');
const now = new Set([...src.matchAll(/app\.(get|post|put|patch|delete)\(['"`]([^'"`]*)/g)].map(m => `${m[1]} ${m[2]}`));
const expected = readFileSync(path.join(here, 'routes-13.0.txt'), 'utf8').split('\n').filter(Boolean);
test(`les ${expected.length} routes de la version 13.0 existent toujours`, () => {
  const missing = expected.filter(r => !now.has(r));
  assert.deepEqual(missing, []);
});
