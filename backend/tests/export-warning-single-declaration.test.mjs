import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, '../src/routes/documents.ts'), 'utf8');

test('full export has a single warnings collection shared by all omission paths', () => {
  assert.equal((source.match(/const exportWarnings:string\[\]=\[\]/g) || []).length, 1);
  assert.match(source, /exportWarnings\.push/);
});
