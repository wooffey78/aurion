import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const dashboard = fs.readFileSync(path.join(root, 'assets/js/pages/dashboard.js'), 'utf8');
const suppliers = fs.readFileSync(path.join(root, 'assets/js/pages/dash/suppliers.js'), 'utf8');

test('Etape 20: la sidebar expose un accès direct et fiable à Fournisseurs', () => {
  assert.match(dashboard, /\['suppliers','Fournisseurs','▱'\]/);
  assert.match(dashboard, /VIEWS\s*=\s*\{[^}]*suppliers/s);
  assert.match(dashboard, /hooks\.refresh\(b\.dataset\.view\)\.catch/);
  assert.match(dashboard, /suppliers:\['suppliers','parts'\]/);
  assert.doesNotMatch(dashboard, /const supplierNav=/);
  assert.match(suppliers, /export const suppliers\s*=\s*\{/);
});

test('Fournisseurs affiche une erreur de chargement et permet de réessayer', () => {
  assert.match(dashboard, /S\.suppliersError=x\?\.message/);
  assert.match(suppliers, /class="error supplier-load-error" role="alert"/);
  assert.match(suppliers, /id="retry-suppliers"/);
  assert.match(suppliers, /hooks\.refresh\('suppliers'\)/);
});
