import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, '../src/services/accounting-report.ts'), 'utf8');

test('accounting CSV protects text fields from spreadsheet formula injection', () => {
  assert.ok(source.includes("const escText=(v:unknown)=>{const value=String(v??'');return esc(/^[\\t\\r\\n ]*[=+\\-@]/.test(value)?`'${value}`:value)};"));
  assert.ok(source.includes('const textFields=new Set([0,1,2,3,4,15,16,20]);'));
  assert.ok(source.includes('textFields.has(index)?escText(value):esc(value)'));
});
