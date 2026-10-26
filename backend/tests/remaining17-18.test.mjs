import test from 'node:test';
import assert from 'node:assert/strict';
import { computePricing } from '../../assets/js/core/pricing.js';
import { detectService, rankRelevantParts } from '../../assets/js/core/recommendations.js';

test('étape 17: détecte la prestation et classe les pièces pertinentes', () => {
  const services=[{name:'Réparation écran iPhone',description:'remplacement vitre et écran'},{name:'Nettoyage informatique',description:'entretien logiciel'}];
  const detected=detectService('remplacement écran iphone 13',services);
  assert.equal(detected?.name,'Réparation écran iPhone');
  const parts=[{id:'1',name:'Écran iPhone 13',category:'Écrans',model:'iPhone 13',reference:'IP13-SCR'},{id:'2',name:'Pâte thermique',category:'Informatique',model:'Universel',reference:'PASTE'}];
  assert.equal(rankRelevantParts(detected,parts,[])[0]?.id,'1');
  assert.equal(rankRelevantParts(detected,parts,["écran iphone 13|||||ip13-scr"])[0]?.id,'1');
});

test('étape 18: sépare le coefficient pièce du coefficient main-d’œuvre', () => {
  const r=computePricing({partCost:100,shippingCost:0,mileageKm:0,mileageRate:0,vatRate:0,urssafRate:0,partCoefficientPercent:10,laborCoefficientPercent:20,targetTtc:200,driver:'ttc'});
  assert.equal(r.purchaseHt,110);
  assert.equal(r.laborHt,108);
  assert.equal(r.netMargin,108);
});
