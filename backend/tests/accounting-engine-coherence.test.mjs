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

test('le kilométrage comptable ne compte que celui refacturé au client', () => {
  const accounting = read('../src/services/accounting.ts');
  // En mode « margin », mileage_total est le coût interne du déplacement : il ne doit pas
  // apparaître comme un montant facturé.
  assert.match(accounting, /case when mileage_mode='client_price' then coalesce\(mileage_total,0\) else 0 end/);
  const report = read('../src/services/accounting-report.ts');
  // Une seule règle partagée par le PDF, le CSV et l'estimation des cotisations.
  assert.match(report, /export function mileageAccounting\(document: any\)/);
  assert.match(report, /billed: mode === 'client_price' \? total : 0/);
  assert.match(report, /internalDirect: mode === 'margin' \? \(internalRate > 0 \? km \* internalRate : total\) : 0/);
  assert.match(report, /const billedMileageHt = mileageAccounting\(document\)\.billed;/);
  assert.match(report, /const mileage=mileageAccounting\(r\);/);
  assert.match(report, /const mileage=mileageAccounting\(q\);/);
  assert.match(report, /'Frais km internes'/);
  assert.match(report, /mileage\.billed\.toFixed\(2\)/);
  assert.match(report, /mileage\.internalDirect\.toFixed\(2\)/);
  assert.doesNotMatch(report, /Frais km \$\{eur\(q\.mileage_total\)\}/);
  assert.doesNotMatch(report, /Number\(r\.mileage_total\|\|0\)\.toFixed\(2\)/);
});

test('les coûts directs ne comptent le kilométrage en marge qu’une seule fois', () => {
  const accounting = read('../src/services/accounting.ts');
  const report = read('../src/services/accounting-report.ts');
  // Même expression de coût interne dans le KPI et dans le PDF : mode margin uniquement,
  // jamais le supplément refacturé au client.
  assert.match(accounting, /case when q\.mileage_mode='margin' then case when coalesce\(q\.mileage_internal_rate,0\)>0 then coalesce\(q\.mileage_km,0\)\*q\.mileage_internal_rate else coalesce\(q\.mileage_total,0\) end/);
  assert.match(report, /case when q\.mileage_mode='margin'[\s\S]*?coalesce\(q\.mileage_km,0\)\*q\.mileage_internal_rate[\s\S]*?else coalesce\(q\.mileage_total,0\)/);
  assert.match(report, /else 0 end\+coalesce\(q\.labor_internal_cost_ht,0\)/);
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
  assert.match(business, /from sav_cases s join quotes q on q\.id=s\.invoice_id/);
  assert.match(business, /s\.sav_type='financial'/);
  assert.match(business, /s\.amount_ttc\/nullif\(1\+coalesce\(q\.vat_rate,0\)\/100,0\)/);
  assert.match(business, /month:monthHt,monthHt/);
  assert.match(business, /yearToDateHt\+historicalAverage\*remainingMonths\+open/);
});
