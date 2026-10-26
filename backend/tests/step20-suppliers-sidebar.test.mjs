import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const dashboard = fs.readFileSync(path.join(root, 'assets/js/pages/dashboard.js'), 'utf8');
const suppliers = fs.readFileSync(path.join(root, 'assets/js/pages/dash/suppliers.js'), 'utf8');

test('Etape 20: la sidebar expose un accès direct à Fournisseurs', () => {
  assert.match(dashboard, /\['suppliers','Fournisseurs','▱'\]/);
  assert.match(dashboard, /data-view=\\\"suppliers\\\"/);
  assert.match(dashboard, /supplierNav\.onclick=ev=>\{ev\.preventDefault\(\);ev\.stopPropagation\(\);hooks\.refresh\('suppliers'\)/);
  assert.match(dashboard, /VIEWS\s*=\s*\{[^}]*suppliers/s);
  assert.match(suppliers, /export const suppliers\s*=\s*\{/);
});
