import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('la synchronisation live reste sans rechargement et protège les écritures ciblées',()=>{
  const sync=read('../../assets/js/account-sync.js');
  assert.match(sync,/window\.setInterval\(poll,1000\)/);
  assert.doesNotMatch(sync,/location\.reload\(/);
  assert.match(sync,/invoices\\\/\[\^\/\]\+\\\/payments/);
  assert.match(sync,/delete body\[key\]/);
  assert.match(sync,/parts\\\/\[\^\/\]\+/);
  assert.match(sync,/body\.stock=part\.stock/);
});

test('le moteur serveur expose les sources nécessaires aux encarts financiers',()=>{
  const business=read('../src/routes/business.ts');
  assert.match(business,/app\.get\('\/dashboard\/summary'/);
  assert.match(business,/app\.get\('\/accounting\/summary'/);
  assert.match(business,/app\.get\('\/treasury\/summary'/);
  assert.match(business,/invoice_payments/);
  assert.match(business,/accounting_entries/);
  assert.match(business,/document_type='quote'/);
});
