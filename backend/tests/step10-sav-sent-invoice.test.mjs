import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const docs = read('assets/js/pages/dash/docs.js');
const integrations = read('backend/src/routes/integrations.ts');
const business = read('backend/src/routes/business.ts');

// Étape 10 : une facture envoyée doit rendre le bouton SAV disponible et
// toutes les informations du dossier SAV doivent apparaître dans l'encart SAV.
test('étape 10 — facture envoyée => bouton SAV et report complet dans l’encart SAV', () => {
  assert.match(docs, /q\.sent_at\?`<button class="btn secondary small sav-from-invoice"/);
  assert.match(docs, /<section class="panel"><div class="section-title"><div><h2>SAV<\/h2>/);
  assert.match(docs, /x\.invoice_number/);
  assert.match(docs, /x\.client_name/);
  assert.match(docs, /x\.items/);
  assert.match(docs, /x\.note/);
  assert.match(docs, /x\.amount_ttc/);
  assert.match(integrations, /await query\('update quotes set sent_at=now\(\),updated_at=now\(\) where id=\$1 and organization_id=\$2'/);
  assert.match(integrations, /if\(type==='invoice'\) await createInvoiceWarranty/);
  assert.match(docs, /await api\.createSav\(/);
  assert.match(docs, /await hooks\.refresh\('invoices'\)/);
  assert.match(business, /where id=\$1 and organization_id=\$2 and document_type='invoice'/);
  assert.match(business, /!inv\.sent_at\)return reply\.code\(400\)/);
});
