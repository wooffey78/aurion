import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const route=fs.readFileSync(new URL('../src/routes/business.ts',import.meta.url),'utf8');
const quote=fs.readFileSync(new URL('../../assets/js/pages/dash/quote.js',import.meta.url),'utf8');
const dash=fs.readFileSync(new URL('../../assets/js/pages/dashboard.js',import.meta.url),'utf8');
const docs=fs.readFileSync(new URL('../../assets/js/pages/dash/docs.js',import.meta.url),'utf8');

test('étape 5 : la navigation ne propose plus une section Nouveau devis séparée',()=>{
  assert.doesNotMatch(dash,/\['quote','Nouveau devis'/);
  assert.match(dash,/\['invoices','Devis & factures'/);
});

test('étape 6 : devis et factures utilisent le même endpoint de sauvegarde avec le bon type',()=>{
  assert.match(quote,/documentType=editing\?\(q\?\.document_type==='invoice'\?'invoice'/);
  assert.match(quote,/body=\{documentType/);
  assert.match(quote,/documentKind==='invoice'\?'Enregistrer la facture':'Enregistrer le devis'/);
  assert.match(route,/const documentType=b\.documentType==='invoice'\?'invoice':'quote'/);
  assert.match(route,/nextNumber\(org,documentType==='invoice'\?'FAC':'DEV'\)/);
  assert.match(route,/status=documentType==='invoice'\?'issued':'draft'/);
});

test('étape 6 : insertion SQL devis/facture aligne colonnes et paramètres (60 depuis le bloc 8 : catégories d\'activité)',()=>{
  const start=route.indexOf("insert into quotes(");
  const end=route.indexOf('])',start);
  const sql=route.slice(start,end);
  assert.ok(start>=0);
  const columns=route.slice(start,end+1).match(/insert into quotes\(([\s\S]*?)\)\s*values/);
  assert.ok(columns);
  // Bloc 4 : 52 colonnes historiques + 4 mentions électroniques (catégorie d'opération, TVA sur
  // les débits, adresse de livraison, SIREN client) = 56 colonnes.
  // Bloc 5 : + 2 champs d'exonération e-reporting déclarée (ereporting_exempt,
  // ereporting_exempt_reason — instantané du document historique) = 58 colonnes et 58
  // paramètres alignés. Contrat structurel suivi, sans affaiblissement.
  // Bloc 8 : + activité_category (document) et category_snapshot (instantané du référentiel) = 60.
  assert.equal(columns[1].split(',').length,60);
  const params=route.slice(route.indexOf('values(',start),end).match(/\$\d+/g)||[];
  assert.equal(new Set(params).size,60);
});
