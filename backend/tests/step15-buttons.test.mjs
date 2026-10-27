import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

const catalog = fs.readFileSync(path.join(root,'assets/js/pages/dash/catalog.js'), 'utf8');
const docs = fs.readFileSync(path.join(root,'assets/js/pages/dash/docs.js'), 'utf8');

test('Step 15: supply edit/delete buttons react only after click', () => {
  const edit = catalog.match(/all\('\.edit-supply'\)[\s\S]{0,260}/)?.[0] || '';
  const del = catalog.match(/all\('\.del-supply'\)[\s\S]{0,220}/)?.[0] || '';
  assert.match(edit, /b\.onclick\s*=\s*\(\)\s*=>/);
  assert.match(del, /b\.onclick\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(edit, /all\('\.edit-supply'\)\.forEach\(b=>\{const x=.*modalForm/);
  assert.doesNotMatch(del, /all\('\.del-supply'\)\.forEach\(b=>confirmDelete/);
});

test('Step 15: SAV edit opens only from the edit button click', () => {
  const edit = docs.match(/all\('\.edit-sav'\)[\s\S]{0,1200}/)?.[0] || '';
  assert.match(edit, /b\.onclick\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(edit, /all\('\.edit-sav'\)\.forEach\(b=>\{const x=.*modalForm/);
});
