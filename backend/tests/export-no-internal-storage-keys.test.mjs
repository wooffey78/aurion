import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, '../src/routes/documents.ts'), 'utf8');

test('full export omits private logo storage keys from exported company data but still packages the logo', () => {
  assert.match(source, /const logoStorageKey=orgData\.logo_key/);
  assert.match(source, /delete orgData\.logo_key/);
  assert.match(source, /if\(logoStorageKey\)/);
  assert.match(source, /internalStorageKeysIncluded:false/);
});
