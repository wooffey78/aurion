import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../..', import.meta.url);
const route = fs.readFileSync(new URL('backend/src/routes/business.ts', root), 'utf8');
const quote = fs.readFileSync(new URL('assets/js/pages/dash/quote.js', root), 'utf8');
const pricingSrc = fs.readFileSync(new URL('assets/js/core/pricing.js', root), 'utf8');
const vm = await import('node:vm');
const context = { Math, Number, Error, console };
vm.createContext(context);
vm.runInContext(pricingSrc.replace('export function computePricing','function computePricing')+'\nthis.computePricing=computePricing;', context);
const pricing = context.computePricing;

test('contrat métier v3 — kilométrage déduit : TTC inchangé, marge réduite du coût interne',()=>{
  const r=pricing({partCost:50,mileageKm:100,mileageInternalRate:.5,mileageClientRate:1,vatRate:20,targetTtc:200,driver:'ttc',mileageMode:'margin',urssafRate:0});
  assert.equal(r.totalTtc,200);
  assert.equal(r.grossMargin,66.67);
});

test('contrat métier v3 — kilométrage ajouté : TTC = base TTC + surcharge TTC, marge inchangée',()=>{
  const r=pricing({partCost:100,mileageKm:100,mileageInternalRate:.5,mileageClientRate:.5,vatRate:20,targetTtc:200,driver:'ttc',mileageMode:'client_price',urssafRate:0});
  assert.equal(r.totalTtc,260);
  assert.equal(r.grossMargin,66.67);
  assert.equal(r.baseTtc,200);
  assert.equal(r.mileageBilledTtc,60);
});

test('contrat persistant — final_price_ttc conserve le TTC de base et total_ttc conserve le total facturé',()=>{
  const post=route.slice(route.indexOf("app.post('/quotes'"), route.indexOf("app.patch('/quotes/:id'"));
  const patch=route.slice(route.indexOf("app.patch('/quotes/:id'"), route.indexOf("app.delete('/quotes/:id'"));
  assert.match(post,/p\.totalHt,p\.vat,p\.totalTtc,targetTtc/);
  assert.match(patch,/p\.totalHt,p\.vat,p\.totalTtc,targetTtc/);
  assert.match(route,/baseTargetTtc:targetTtc/);
  assert.match(quote,/const savedBaseTtc=q=>/);
  assert.match(quote,/calculation_snapshot\?\.result\?\.baseTtc/);
  assert.match(quote,/const savedBaseTtc=q=>/);
});

test('édition partielle — les lignes déjà enregistrées sont rechargées avant recalcul',()=>{
  assert.match(route,/currentItems= b\.items===undefined/);
  assert.match(route,/select label,quantity,unit_cost unitCost,unit_price unitPrice,part_id partId,sale_coefficient_percent saleCoefficientPercent from quote_items/);
});
