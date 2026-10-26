import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const route = fs.readFileSync(path.join(root,'backend/src/routes/business.ts'),'utf8');
const docs = fs.readFileSync(path.join(root,'assets/js/pages/dash/docs.js'),'utf8');
const quote = fs.readFileSync(path.join(root,'assets/js/pages/dash/quote.js'),'utf8');

// Red test: invoice editing must be exposed and PATCH must not reject invoice documents.
assert.match(docs, /edit-doc.*data-id=.*q\.id/,
  'Le module documents doit proposer une action Modifier pour les factures.');
assert.match(docs, /<button class=\"btn secondary small edit-doc\" data-id=\"\$\{q\.id\}\">Modifier<\/button>/,
  'Le bouton Modifier doit être disponible pour tous les documents, y compris les factures.');
assert.doesNotMatch(route, /if\(cur\.document_type==='invoice'\)return reply\.code\(409\)\.send\(\{error:'INVOICE_DOCUMENT_ONLY'/,
  'PATCH /quotes/:id ne doit plus refuser une facture existante.');
assert.match(route, /select id,activity_id,client_id,margin_coefficient_percent,coefficient_value,coefficient_unit,coefficient_basis,payment_status,document_type,catalog_pricing/, 'Le patch doit identifier le type de document avant modification.');
assert.match(quote, /q\?\.document_type==='invoice'/, 'Le formulaire doit distinguer le contexte facture du devis.');
console.log('step14 contract: OK');
