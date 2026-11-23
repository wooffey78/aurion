import test from 'node:test';
import assert from 'node:assert/strict';
import { computePricing as browser } from '../../assets/js/core/pricing.js';

test('coefficient commercial : le coût fournisseur reste indépendant mais le coefficient entre dans le résultat',()=>{
  const r=browser({partCost:100,shippingCost:10,vatRate:20,coefficientUnit:'percent',coefficientValue:10,targetTtc:132,driver:'ttc',contributions:[{name:'URSSAF',rate:0,basis:'ca_ht'}]});
  assert.equal(r.purchaseHt,100);
  assert.equal(r.minimumSellingHt,120);
  assert.equal(r.totalHt,110);
  assert.equal(r.coefficientMarkupHt,10);
  assert.equal(r.grossMargin,-10);
});

test('kilométrage : coût interne et tarif client sont distincts',()=>{
  const a=browser({partCost:0,shippingCost:0,vatRate:20,mileageKm:100,mileageInternalRate:.35,mileageClientRate:.55,mileageMode:'margin',targetTtc:65,driver:'ttc',urssafRate:0});
  const b=browser({partCost:0,shippingCost:0,vatRate:20,mileageKm:100,mileageInternalRate:.35,mileageClientRate:.55,mileageMode:'client_price',targetTtc:66,driver:'ttc',urssafRate:0});
  assert.equal(a.mileageTotal,35); assert.equal(a.directCostsHt,35); assert.equal(a.billedMileageHt,0);
  assert.equal(a.totalTtc,65);
  assert.equal(b.mileageTotal,55); assert.equal(b.directCostsHt,35); assert.equal(b.billedMileageHt,55);
  assert.equal(b.baseTtc,66); assert.equal(b.mileageBilledTtc,66); assert.equal(b.totalTtc,132);
});

test('plusieurs cotisations et résultat net',()=>{
  const r=browser({partCost:20,shippingCost:10,vatRate:20,targetTtc:120,driver:'ttc',contributions:[{name:'A',rate:10,basis:'ca_ht'},{name:'B',rate:5,basis:'ca_ht'}]});
  assert.equal(r.totalHt,100); assert.equal(r.grossMargin,70); assert.equal(r.contributionsTotal,15); assert.equal(r.netResult,55);
});

test('arrondi final et coût main-d’œuvre interne séparé',()=>{
  const r=browser({partCost:12.345,shippingCost:3.333,laborInternalCostHt:8.888,laborSellingHt:50,vatRate:20,driver:'ttc',targetTtc:78.81,contributions:[]});
  assert.equal(r.purchaseHt,12.35); assert.equal(r.totalTtc,78.81); assert.equal(r.internalLaborCostHt,8.89);
});
