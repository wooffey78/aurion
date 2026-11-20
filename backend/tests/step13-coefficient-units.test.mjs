import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const pricingSrc = fs.readFileSync(new URL('../../assets/js/core/pricing.js', import.meta.url), 'utf8');
const transformed = pricingSrc.replace('export function computePricing', 'function computePricing') + '\nthis.computePricing = computePricing;';
const context = { Math, Number, Error, console };
vm.createContext(context);
vm.runInContext(transformed, context);
const pricing = context.computePricing;

const quote = fs.readFileSync(new URL('../../assets/js/pages/dash/quote.js', import.meta.url), 'utf8');

test('étape 13 — le devis propose bien les deux unités de coefficient', () => {
  assert.match(quote, /id="coefficientUnit"/);
  assert.match(quote, /value="percent"/);
  assert.match(quote, />%<\/option>/);
  assert.match(quote, /value="euro"/);
  assert.match(quote, />€<\/option>/);
});

test('étape 13 — un coefficient en pourcentage est calculé comme un pourcentage', () => {
  const r = pricing({ partCost: 200, partQuantity: 1, shippingCost: 0, mileageKm: 0, mileageRate: 0, vatRate: 0, urssafRate: 0, coefficientValue: 10, coefficientUnit: 'percent', coefficientBasis: 'purchase', targetTtc: 220, driver: 'ttc' });
  assert.equal(r.purchaseHt, 200);
  assert.equal(r.coefficientMarkupHt, 20);
  assert.equal(r.minimumSellingHt, 220);
});

test('étape 13 — un coefficient en euros est calculé comme un montant fixe', () => {
  const r = pricing({ partCost: 200, partQuantity: 1, shippingCost: 0, mileageKm: 0, mileageRate: 0, vatRate: 0, urssafRate: 0, coefficientValue: 10, coefficientUnit: 'euro', coefficientBasis: 'purchase', targetTtc: 210, driver: 'ttc' });
  assert.equal(r.purchaseHt, 200);
  assert.equal(r.coefficientMarkupHt, 10);
  assert.equal(r.minimumSellingHt, 210);
});

test('étape 13 — les deux unités restent indépendantes sur la même base', () => {
  const percent = pricing({ partCost: 100, partQuantity: 1, shippingCost: 0, mileageKm: 0, mileageRate: 0, vatRate: 0, urssafRate: 0, coefficientValue: 10, coefficientUnit: 'percent', coefficientBasis: 'purchase', targetTtc: 110, driver: 'ttc' });
  const euro = pricing({ partCost: 100, partQuantity: 1, shippingCost: 0, mileageKm: 0, mileageRate: 0, vatRate: 0, urssafRate: 0, coefficientValue: 10, coefficientUnit: 'euro', coefficientBasis: 'purchase', targetTtc: 110, driver: 'ttc' });
  assert.equal(percent.purchaseHt, 100);
  assert.equal(percent.coefficientMarkupHt, 10);
  assert.equal(percent.minimumSellingHt, 110);
  assert.equal(euro.purchaseHt, 100);
  assert.equal(euro.coefficientMarkupHt, 10);
  assert.equal(euro.minimumSellingHt, 110);
});
