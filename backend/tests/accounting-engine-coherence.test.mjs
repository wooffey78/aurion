import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('la comptabilité ne comptabilise pas le coefficient de vente comme un achat', () => {
  const accounting = read('../src/services/accounting.ts');
  assert.match(accounting, /sum\(base_cost\*case when coalesce\(total_ttc,0\)>0/);
  assert.doesNotMatch(accounting, /sum\(\(base_cost\+coefficient_markup\)/);
  assert.match(accounting, /coalesce\(part_cost,0\)\+coalesce\(shipping_cost,0\).*purchase_vat/s);
});

test('les sorties de trésorerie ne comptent que les coûts réels, jamais le coefficient commercial', () => {
  const business = read('../src/routes/business.ts');
  assert.match(business, /const p=Number\(x\.part_cost\|\|0\)\+Number\(x\.shipping_cost\|\|0\)\+Number\(x\.labor_internal_cost_ht\|\|0\)\+mileageCost/);
  assert.doesNotMatch(business, /const p=Number\(x\.part_cost\|\|0\)\+coefficientMarkup/);
  assert.match(business, /const forecastExpenses=rows\.reduce/);
  assert.doesNotMatch(business, /return n\+Number\(x\.part_cost\|\|0\)\+coefficientMarkup/);
});

test('les prévisions du tableau de bord sont exprimées en HT et tiennent compte des SAV', () => {
  const business = read('../src/routes/business.ts');
  assert.match(business, /sum\(total_ht\).*document_type='quote'/s);
  assert.match(business, /p\.amount\/nullif\(1\+q\.vat_rate\/100,0\)/);
  assert.match(business, /entry_type='sav'/);
  assert.match(business, /month:monthHt,monthHt/);
  assert.match(business, /yearToDateHt\+historicalAverage\*remainingMonths\+open/);
});
