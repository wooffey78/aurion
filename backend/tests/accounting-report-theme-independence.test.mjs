import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, '../src/services/accounting-report.ts'), 'utf8');

test('accounting PDF export does not depend on the legacy organization theme service', () => {
  assert.doesNotMatch(source, /import\s*\{\s*getTheme\s*\}\s*from\s*['"]\.\/theme\.js['"]/);
  assert.doesNotMatch(source, /await\s+getTheme\s*\(/);
  assert.match(source, /NAVY\s*=\s*['"]#0b1220['"]/);
  assert.match(source, /accent\s*=\s*['"]#0b63ce['"]/);
});
