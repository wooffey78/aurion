import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(new URL('../..',import.meta.url).pathname);
const docs=fs.readFileSync(path.join(root,'assets/js/pages/dash/docs.js'),'utf8');
const quote=fs.readFileSync(path.join(root,'assets/js/pages/dash/quote.js'),'utf8');
const support=fs.readFileSync(path.join(root,'assets/js/pages/dash/other.js'),'utf8');
const agenda=fs.readFileSync(path.join(root,'assets/js/pages/dash/other.js'),'utf8');
const route=fs.readFileSync(path.join(root,'backend/src/routes/business.ts'),'utf8');

test('étape 2: Devis & factures propose Nouvelle facture',()=>{
  assert.match(docs,/data-new-type="invoice">\+ Nouvelle facture<\/button>/);
  assert.match(docs,/all\('\[data-new-type\]'\)|all\('\[data-new-type\]'\)/);
  assert.match(docs,/S\.documentType=b\.dataset\.newType/);
  assert.match(quote,/documentKind=q\?\.document_type==='invoice'\?'invoice':'quote'/);
  assert.match(quote,/q\?\.documentType&&\!editing\)S\.documentType=q\.documentType==='invoice'\?'invoice':'quote'/);
  assert.match(quote,/body\.documentType==='invoice'\?'Facture enregistrée\.'/);
  assert.doesNotMatch(quote,/toast\(documentType===/);
  assert.match(route,/const documentType=b\.documentType==='invoice'\?'invoice':'quote'/);
  assert.match(route,/nextNumber\(org,documentType==='invoice'\?'FAC':'DEV'\)/);
  assert.match(route,/status=documentType==='invoice'\?'issued':'draft'/);
  assert.doesNotMatch(route,/INVOICE_FROM_QUOTE_ONLY/);
});

test('étape 2: modification de factures reste disponible',()=>{
  assert.match(docs,/edit-doc" data-id="\$\{q\.id\}/);
  assert.match(docs,/S\.editing=get\(b\.dataset\.id\)/);
  assert.match(docs,/S\.documentType=S\.editing\.document_type==='invoice'\?'invoice':'quote'/);
});

console.log('step2 invoice button: OK');
