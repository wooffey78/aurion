import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../assets/js/core/pricing.js', import.meta.url), 'utf8');
const transformed = src.replace('export function computePricing', 'function computePricing') + '\nthis.computePricing = computePricing;';
const context = { Math, Number, Error, console };
vm.createContext(context);
vm.runInContext(transformed, context);
const pricing = context.computePricing;

const base = { partCost: 100, shippingCost: 0, mileageKm: 0, mileageRate: 0, vatRate: 0, urssafRate: 0, targetTtc: 110, driver: 'ttc' };

test('étape 5 : la persistance du devis transporte l’unité et la valeur du coefficient', () => {
  const route = fs.readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');
  assert.match(route, /coefficient_value/);
  assert.match(route, /coefficient_unit/);
  assert.match(route, /coefficientValue/);
  assert.match(route, /coefficientUnit/);
});

test('étape 5 : le devis expose un coefficient au coût des pièces en pourcentage ou en euros', () => {
  const quote = fs.readFileSync(new URL('../../assets/js/pages/dash/quote.js', import.meta.url), 'utf8');
  assert.match(quote, /id="coefficientBasis"/);
  assert.match(quote, /id="coefficientBasis" type="hidden" value="purchase"/);
  assert.doesNotMatch(quote, /default_labor_coefficient_percent/);
  assert.match(quote, /id="coefficientUnit"/);
  assert.match(quote, /value="percent"/);
  assert.match(quote, /value="euro"/);
});

test('étape 5 : le coefficient en euros majore le coût de calcul sans falsifier le coût fournisseur', () => {
  const r = pricing({ ...base, partCost: 100, partQuantity: 2, coefficientValue: 5, coefficientUnit: 'euro', coefficientBasis: 'purchase' });
  assert.equal(r.purchaseHt, 100);
  assert.equal(r.coefficientMarkupHt, 10);
  assert.equal(r.minimumSellingHt, 110);
  assert.equal(r.totalTtc, 110);
  assert.equal(r.grossMargin, 0);
});

test('étape 5 : un ancien coefficient sur la marge ne se transforme pas en coût pièce', () => {
  const r = pricing({ ...base, partCost: 100, coefficientValue: 7, coefficientUnit: 'euro', coefficientBasis: 'margin' });
  assert.equal(r.purchaseHt, 100);
  assert.equal(r.coefficientMarkupHt, 0);
  assert.equal(r.totalTtc, 110);
  assert.equal(r.laborHt, 10);
});
