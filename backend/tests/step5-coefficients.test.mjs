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

test('étape 5 : le devis expose un coefficient en pourcentage ou en euros appliqué aux pièces ou à la marge', () => {
  const quote = fs.readFileSync(new URL('../../assets/js/pages/dash/quote.js', import.meta.url), 'utf8');
  assert.match(quote, /id="coefficientBasis"/);
  assert.match(quote, /value="purchase"/);
  assert.match(quote, /value="margin"/);
  assert.match(quote, /id="coefficientUnit"/);
  assert.match(quote, /value="percent"/);
  assert.match(quote, /value="euro"/);
});

test('étape 5 : un coefficient en euros appliqué aux pièces augmente le coût d’achat du nombre de pièces', () => {
  const r = pricing({ ...base, partCost: 100, partQuantity: 2, coefficientValue: 5, coefficientUnit: 'euro', coefficientBasis: 'purchase' });
  assert.equal(r.purchaseHt, 110);
});

test('étape 5 : un coefficient en euros appliqué à la marge augmente la marge sans modifier les achats', () => {
  const r = pricing({ ...base, partCost: 100, coefficientValue: 7, coefficientUnit: 'euro', coefficientBasis: 'margin' });
  assert.equal(r.purchaseHt, 100);
  assert.equal(r.laborHt, 17);
});
