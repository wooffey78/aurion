import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

test('la synchronisation inter-appareils détecte une modification en environ une seconde',()=>{
  const sync=read('assets/js/account-sync.js');
  assert.match(sync,/window\.setInterval\(poll,1000\)/);
  assert.doesNotMatch(sync,/window\.setInterval\(poll,20000\)/);
  assert.match(sync,/aurion:account-sync-changed/);
  assert.doesNotMatch(sync,/location\.reload\(\)/);
});

test('une pièce détachée peut être explicitement validée depuis le formulaire catalogue',()=>{
  const catalog=read('assets/js/pages/dash/catalog.js');
  assert.match(catalog,/Valider la pièce/);
  assert.match(catalog,/api\.createPart/);
  assert.match(catalog,/api\.updatePart/);
});

test('le règlement de facture reste disponible via le workflow de paiement',()=>{
  const docs=read('assets/js/pages/dash/docs.js');
  const api=read('assets/js/core/api.js');
  assert.match(docs,/settle-doc/);
  assert.match(api,/addInvoicePayment/);
  assert.match(api,/\/invoices\/\$\{id\}\/payments/);
});

test('le moteur de tableau de bord expose la prévision et son historique',()=>{
  const other=read('assets/js/pages/dash/other.js');
  assert.match(other,/Prévision de croissance/);
  assert.match(other,/forecast-history/);
  assert.match(other,/dashboardSummary/);
});
