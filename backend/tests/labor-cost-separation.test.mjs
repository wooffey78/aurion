import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePricing } from '../../assets/js/core/pricing.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('le coût interne de main-d’œuvre est distinct du prix de vente', () => {
  const quote = read('../../assets/js/pages/dash/quote.js');
  assert.match(quote, /id="laborSellingHt"/);
  assert.match(quote, /id="laborInternalCostHt"/);
  assert.match(quote, /laborInternalCostHt:num\('#laborInternalCostHt'\)/);
  assert.match(quote, /labor_internal_cost_ht:num\('#laborInternalCostHt'\)/);
  assert.doesNotMatch(quote, /laborInternalCostHt:\$\('#laborSellingHt'\)/);
});

test('le coût interne réduit la marge sans modifier le prix TTC fixé', () => {
  const base = computePricing({ partCost: 0, mileageKm: 0, vatRate: 0, targetTtc: 120, driver: 'ttc', laborSellingHt: 50, laborInternalCostHt: 0, contributions: [] });
  const withCost = computePricing({ partCost: 0, mileageKm: 0, vatRate: 0, targetTtc: 120, driver: 'ttc', laborSellingHt: 50, laborInternalCostHt: 20, contributions: [] });
  assert.equal(base.totalTtc, 120);
  assert.equal(withCost.totalTtc, 120);
  assert.equal(base.netMargin - withCost.netMargin, 20);
});
