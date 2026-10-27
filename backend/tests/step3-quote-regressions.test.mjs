import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const quote=fs.readFileSync(path.join(root,'assets/js/pages/dash/quote.js'),'utf8');
const business=fs.readFileSync(path.join(root,'backend/src/routes/business.ts'),'utf8');
const pricing=fs.readFileSync(path.join(root,'assets/js/core/pricing.js'),'utf8');

test('étape 3 : aucune marge nette de 1 € n’est injectée par défaut',()=>{
  assert.doesNotMatch(quote,/id="minimumProfit"[^>]*value="1"/);
  assert.doesNotMatch(quote,/id="targetNet"[^>]*value="1"/);
  assert.match(quote,/targetNet:num\('#minimumProfit'\)/);
  assert.match(pricing,/num\(input\.targetNet, 'résultat net', -1e9, 1e9\)/);
});

test('étape 3 : le type de document est toujours défini avant enregistrement',()=>{
  assert.match(quote,/documentKind=editing\?/);
  assert.match(quote,/body=\{documentType/);
  assert.doesNotMatch(quote,/toast\(documentType===/);
});

test('étape 3 : édition conserve les coefficients configurés déjà enregistrés',()=>{
  assert.match(quote,/q\?\.coefficient_value/);
  assert.match(quote,/q\?\.coefficient_unit/);
  assert.match(quote,/q\?\.coefficient_basis/);
  assert.match(quote,/a\.default_part_coefficient_percent/);
  assert.doesNotMatch(quote,/default_labor_coefficient_percent/);
  assert.match(business,/coefficientValue/);
});

test('étape 3 : trois sources d’adresse de facturation et une saisie libre sont persistées',()=>{
  for(const value of ['client','intervention','free']) assert.match(quote,new RegExp('value="' + value + '"'));
  assert.match(quote,/id="billingAddress"/);
  assert.match(business,/invoiceAddressSource==='free'/);
  assert.match(business,/billingAddress/);
  assert.match(business,/billing_address_snapshot/);
});
