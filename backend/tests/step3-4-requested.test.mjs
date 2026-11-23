import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const quote=fs.readFileSync(path.join(root,'assets/js/pages/dash/quote.js'),'utf8');
const business=fs.readFileSync(path.join(root,'backend/src/routes/business.ts'),'utf8');
const clients=fs.readFileSync(path.join(root,'backend/src/services/clients.ts'),'utf8');
const sheet=fs.readFileSync(path.join(root,'assets/js/pages/dash/clientsheet.js'),'utf8');

test('étape 3 : le choix intervention utilise l’adresse d’intervention de la fiche client',()=>{
  assert.match(quote,/return c\?\.intervention_address\|\|''/);
  assert.doesNotMatch(quote,/const appointments=await api\.appointments\(\)/);
  assert.match(business,/select intervention_address from clients where id=\$1 and organization_id=\$2/);
  assert.match(clients,/last_invoice_address_source/);
  assert.match(sheet,/Dernier choix de facturation/);
});

test('étape 4 : le changement de base de coefficient répercute le coefficient configuré correspondant',()=>{
  assert.match(quote,/id="coefficientBasis" type="hidden" value="purchase"/);
  assert.match(quote,/default_part_coefficient_percent/);
  assert.match(quote,/default_part_coefficient_percent/);
  assert.match(quote,/coefficientBasis='purchase'/);
  assert.match(quote,/coefficientValue=q\?\.coefficient_basis!=='margin'/);
  assert.doesNotMatch(quote,/default_labor_coefficient_percent/);
  assert.match(quote,/\$\('#coefficientValue'\)\.value=String\(configured\)/);
});
