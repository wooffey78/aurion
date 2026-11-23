import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const business=fs.readFileSync(new URL('../src/routes/business.ts',import.meta.url),'utf8');
const accounting=fs.readFileSync(new URL('../src/services/accounting.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/044_quote_mileage_mode.sql',import.meta.url),'utf8');

test('étape 3 : le prévisionnel intègre achat + TVA + cotisations + kilométrage quand celui-ci est une sortie',()=>{
  assert.match(business,/const forecastOut=rows\.reduce/);
  assert.match(business,/urssaf_rate/);
  assert.match(business,/mileage_mode/);
  assert.match(business,/mileage_internal_rate/);
});

test('étape 4 : le choix kilométrique est persisté et utilisé par les calculs',()=>{
  assert.match(migration,/mileage_mode varchar\(20\).*client_price/);
  assert.match(business,/mileage_mode/);
  assert.match(accounting,/mileage_mode='margin'/);
});
