import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('devis, factures, fiches clients et éléments catalogue sont supprimables depuis l’interface', () => {
  const api=read('../../assets/js/core/api.js');
  const docs=read('../../assets/js/pages/dash/docs.js');
  const other=read('../../assets/js/pages/dash/other.js');
  const clients=read('../../assets/js/pages/dash/clientsheet.js');
  const catalog=read('../../assets/js/pages/dash/catalog.js');
  for(const method of ['deleteQuote','deleteClient','deletePart','deleteSupply','deleteIntervention','deleteWarrantyPolicy','deleteSupplier']) assert.match(api,new RegExp(method+':'));
  assert.match(docs,/\.delete-doc/);
  assert.match(docs,/api\.deleteQuote\(q\.id\)/);
  assert.match(other,/api\.deleteClient\(c\.id\)/);
  assert.match(clients,/#sh-del/);
  for(const selector of ['.del-part','.del-supply','.del-intervention','.del-policy']) assert.ok(catalog.includes(selector), 'bouton de suppression absent: '+selector);
});

test('suppression des documents supprime aussi les métadonnées des fichiers dans une transaction', () => {
  const business=read('../src/routes/business.ts');
  const start=business.indexOf("app.delete('/quotes/:id'");
  const end=business.indexOf("app.post('/quotes/:id/invoice'",start);
  const route=business.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(route,/await client\.query\('begin'\)/);
  assert.match(route,/delete from generated_documents/);
  assert.match(route,/delete from quotes/);
  assert.ok(route.indexOf('delete from generated_documents')<route.indexOf('delete from quotes'));
  assert.match(route,/await client\.query\('commit'\)/);
});
