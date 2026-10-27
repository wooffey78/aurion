import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../..',import.meta.url);
const quote=fs.readFileSync(new URL('assets/js/pages/dash/quote.js',root),'utf8');
const docs=fs.readFileSync(new URL('assets/js/pages/dash/docs.js',root),'utf8');
const route=fs.readFileSync(new URL('backend/src/routes/business.ts',root),'utf8');
const pricingSrc=fs.readFileSync(new URL('assets/js/core/pricing.js',root),'utf8');
const pricingVm={Math,Number,Error,console}; vm.createContext(pricingVm);
vm.runInContext(pricingSrc.replace('export function computePricing','function computePricing')+'\nthis.computePricing=computePricing;',pricingVm);
const pricing=pricingVm.computePricing;

test('facture directe : le choix facture reste prioritaire au brouillon devis',()=>{
  assert.match(docs,/S\.documentType=b\.dataset\.newType/);
  assert.match(quote,/documentKind=editing\?/);
  assert.match(quote,/S\.documentType==='invoice'\?'invoice'/);
  assert.match(quote,/documentType=editing\?/);
});

test('pièces : coût interne uniquement, jamais ajouté au prix client',()=>{
  assert.ok(route.includes('const unitPrice=item.unitPrice!==null&&item.unitPrice!==undefined'));
  assert.match(route,/const euroCoefficient=coefficientBasis==='purchase'&&coefficientUnit==='euro'/);
  assert.ok(route.includes('const total=Number(service?.default_price||0)'));
  const r=pricing({partCost:100,shippingCost:0,mileageKm:0,vatRate:20,targetTtc:240,driver:'ttc',coefficientValue:20,coefficientUnit:'percent',coefficientBasis:'purchase'});
  assert.equal(r.totalTtc,240);
  assert.equal(r.purchaseHt,100);
  assert.equal(r.grossMargin,80);
});

test('coefficient pièces : il entre dans le coût de calcul et réduit la marge sans bouger le TTC',()=>{
  const base=pricing({partCost:100,vatRate:20,targetTtc:240,driver:'ttc',coefficientValue:0,coefficientUnit:'percent',coefficientBasis:'purchase'});
  const adjusted=pricing({partCost:100,vatRate:20,targetTtc:240,driver:'ttc',coefficientValue:20,coefficientUnit:'percent',coefficientBasis:'purchase'});
  assert.equal(base.totalTtc,240);
  assert.equal(adjusted.totalTtc,240);
  assert.equal(adjusted.purchaseHt,100);
  assert.equal(adjusted.coefficientMarkupHt,20);
  assert.equal(adjusted.grossMargin,80);
  assert.equal(adjusted.netResult,80);
});

test('coefficient : le coût fournisseur reste réel, le coefficient entre dans la marge et le TTC reste fixe',()=>{
  const r=pricing({partCost:100,partQuantity:2,shippingCost:0,mileageKm:0,vatRate:0,targetTtc:120,driver:'ttc',coefficientValue:10,coefficientUnit:'percent',coefficientBasis:'purchase'});
  assert.equal(r.purchaseHt,100);
  assert.equal(r.coefficientMarkupHt,10);
  assert.equal(r.minimumSellingHt,110);
  assert.equal(r.totalTtc,120);
  assert.equal(r.grossMargin,10);
});

test('prestation catalogue : son prix TTC est fixe et englobe les éléments de calcul',()=>{
  assert.match(route,/const total=Number\(service\?\.default_price\|\|0\)/);
  assert.match(quote,/const total=service/);
  assert.doesNotMatch(route,/total\+=qty\*unitHt/);
});

test('kilométrage client : le montant est ajouté au prix client TTC',()=>{
  const r=pricing({partCost:50,mileageKm:100,mileageRate:.5,vatRate:20,targetTtc:120,driver:'ttc',mileageMode:'client_price'});
  assert.equal(r.totalTtc,180);
  const fixed=pricing({partCost:50,mileageKm:100,mileageRate:.5,vatRate:20,targetTtc:120,driver:'ttc',mileageMode:'client_price',targetIncludesMileage:true});
  assert.equal(fixed.totalTtc,180);
});

test('contrat exact — 200 € TTC + 50 € de frais kilométriques = 250 € TTC, marge de base inchangée',()=>{
  const r=pricing({partCost:0,mileageKm:100,mileageClientRate:.5,vatRate:0,targetTtc:200,driver:'ttc',mileageMode:'client_price'});
  assert.equal(r.totalTtc,250);
  assert.equal(r.grossMargin,250);
});

test('kilométrage déduit de la marge : le TTC client reste inchangé',()=>{
  const r=pricing({partCost:50,mileageKm:100,mileageRate:.5,vatRate:20,targetTtc:120,driver:'ttc',mileageMode:'margin'});
  assert.equal(r.totalTtc,120);
});

test('main-d’œuvre HT : elle modifie la marge mais jamais le TTC client fixé',()=>{
  const r=pricing({partCost:50,mileageKm:0,vatRate:20,targetTtc:200,laborSellingHt:80,driver:'ttc',mileageMode:'margin'});
  assert.equal(r.totalTtc,200);
});

test('données invalides : le calculateur refuse les valeurs non numériques',()=>{
  for(const bad of [{vatRate:'abc'},{mileageKm:'abc'},{partCost:'abc'},{coefficientValue:'abc'}]){
    assert.throws(()=>pricing({...bad,targetTtc:100}),/Valeur invalide/);
  }
  assert.match(route,/requiredNumber\(b\.vatRate,'TVA'/);
  assert.match(route,/optionalNumber\(b\.purchaseVatRate,'TVA achats'/);
});


test('kilométrage ajouté au client : le TTC augmente mais la marge métier reste celle du prix de base',()=>{
  const base=pricing({partCost:100,mileageKm:0,vatRate:20,targetTtc:200,driver:'ttc',mileageMode:'client_price'});
  const withMileage=pricing({partCost:100,mileageKm:100,mileageClientRate:.5,mileageInternalRate:.5,vatRate:20,targetTtc:200,driver:'ttc',mileageMode:'client_price'});
  assert.equal(withMileage.totalTtc,260);
  const baseWithInternal=pricing({partCost:100,mileageKm:0,mileageClientRate:.5,mileageInternalRate:.5,vatRate:20,targetTtc:200,driver:'ttc',mileageMode:'client_price'});
  assert.equal(withMileage.netResult,baseWithInternal.netResult);
});

test('édition devis/facture : les paramètres SQL utilisent des positions cohérentes et ne réinjectent pas l’adresse comme mode kilométrique',()=>{
  const start=route.indexOf("app.patch('/quotes/:id'");
  const update=route.slice(start, route.indexOf("app.delete('/quotes/:id'", start));
  assert.ok(start>=0,'route PATCH /quotes/:id introuvable');
  assert.doesNotMatch(update,/mileage_mode=\$31/);
  assert.doesNotMatch(update,/billing_address_snapshot=coalesce\(\$30/);
  assert.match(update,/mileage_mode=\$8/);
  assert.match(update,/billing_address_snapshot=coalesce\(\$22/);
  assert.match(update,/final_price_ttc=\$15/);
});

test('sauvegarde devis/facture : insertion, lignes et édition partagent une transaction',()=>{
  assert.match(route,/async function withTransaction<T>[\s\S]*await client\.query\('begin'\)/);
  assert.match(route,/await client\.query\('rollback'\)/);
  const start=route.indexOf("app.post('/quotes'");
  const post=route.slice(start, route.indexOf("app.patch('/quotes/:id'", start));
  assert.match(post,/await withTransaction\(async clientDb=>/);
  assert.match(post,/await saveItems\(clientDb,/);
  const patch=route.slice(route.indexOf("app.patch('/quotes/:id'"));
  assert.match(patch,/updated=await withTransaction\(async clientDb=>/);
  assert.match(patch,/await saveItems\(clientDb,/);
});

console.log('regression-devis-facture-calculs: OK');
