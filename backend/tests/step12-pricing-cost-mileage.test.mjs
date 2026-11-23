import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../../assets/js/core/pricing.js',import.meta.url),'utf8');
const transformed=src.replace('export function computePricing','function computePricing')+'\nthis.computePricing=computePricing;';
const ctx={Math,Number,Error};vm.createContext(ctx);vm.runInContext(transformed,ctx);const pricing=ctx.computePricing;

test('coût achat : reste un coût interne et ne change pas le prix TTC saisi',()=>{
  const r=pricing({partCost:100,shippingCost:0,mileageKm:0,mileageRate:0,vatRate:0,urssafRate:0,targetTtc:150,driver:'ttc',mileageMode:'margin'});
  assert.equal(r.totalTtc,150); assert.equal(r.purchaseHt,100); assert.equal(r.laborHt,50);
});

test('kilométrage déduit de la marge : TTC 200, marge 50 avec frais 50',()=>{
  const r=pricing({partCost:100,shippingCost:0,mileageKm:50,mileageInternalRate:1,mileageClientRate:1,vatRate:0,urssafRate:0,targetTtc:200,driver:'ttc',mileageMode:'margin'});
  assert.equal(r.totalTtc,200); assert.equal(r.grossMargin,50); assert.equal(r.directCostsHt,150); assert.equal(r.mileageTotal,50); assert.equal(r.billedMileageHt,0);
});

test('kilométrage ajouté au prix client : TTC 200 + 50 = 250, marge 100',()=>{
  const r=pricing({partCost:100,shippingCost:0,mileageKm:50,mileageInternalRate:1,mileageClientRate:1,vatRate:0,urssafRate:0,targetTtc:200,driver:'ttc',mileageMode:'client_price'});
  assert.equal(r.totalTtc,250); assert.equal(r.grossMargin,100); assert.equal(r.directCostsHt,150); assert.equal(r.mileageTotal,50); assert.equal(r.billedMileageHt,50);
});

test('sans kilométrage : TTC et marge restent inchangés',()=>{
  const r=pricing({partCost:100,shippingCost:0,mileageKm:0,mileageRate:1,vatRate:0,urssafRate:0,targetTtc:200,driver:'ttc',mileageMode:'client_price'});
  assert.equal(r.totalTtc,200); assert.equal(r.grossMargin,100);
});

test('kilométrage ajouté avec main-d’œuvre saisie : le TTC de base est conservé et la surcharge km est ajoutée',()=>{
  const r=pricing({partCost:20,shippingCost:0,laborSellingHt:80,mileageKm:50,mileageInternalRate:1,mileageClientRate:1,vatRate:0,urssafRate:0,targetTtc:200,driver:'ttc',mileageMode:'client_price'});
  assert.equal(r.totalTtc,250); assert.equal(r.baseTtc,200); assert.equal(r.mileageBilledTtc,50); assert.equal(r.laborSellingHt,80);
});

test('TVA 20 % en mode ajouté : la marge de base reste inchangée et le TTC augmente de km × tarif × 1,2',()=>{
  const r=pricing({partCost:100,shippingCost:0,mileageKm:50,mileageInternalRate:1,mileageClientRate:1,vatRate:20,urssafRate:0,targetTtc:200,driver:'ttc',mileageMode:'client_price'});
  assert.equal(r.baseTtc,200); assert.equal(r.mileageBilledTtc,60); assert.equal(r.totalTtc,260); assert.equal(r.grossMargin,66.67);
});
