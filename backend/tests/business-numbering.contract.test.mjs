import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend=new URL('../',import.meta.url);
const business=readFileSync(new URL('src/routes/business.ts',backend),'utf8');
const migration=readFileSync(new URL('migrations/067_business_document_number_sequences.sql',backend),'utf8');
const sequenceStart=business.indexOf('async function nextNumber(');
const sequenceEnd=business.indexOf('async function pauseClientTimer(',sequenceStart);
const sequence=business.slice(sequenceStart,sequenceEnd);
const conversionStart=business.indexOf("app.post('/quotes/:id/invoice'");
const conversionEnd=business.indexOf("app.get('/invoices/:id/installments'",conversionStart);
const conversion=business.slice(conversionStart,conversionEnd);

test('les numéros DEV/FAC sont réservés de façon atomique par organisation et année',()=>{
  assert.match(migration,/primary key\(organization_id,prefix,year\)/);
  assert.match(sequence,/executor\.query\(/);
  assert.match(sequence,/on conflict\(organization_id,prefix,year\) do update/);
  assert.match(sequence,/greatest\(document_number_sequences\.last_value\+1,excluded\.last_value\)/);
  assert.match(sequence,/number like any\(\$4::text\[\]\)/);
});

test('la conversion verrouille le devis, contrôle son état puis attribue le numéro dans la transaction',()=>{
  assert.ok(conversionStart>=0&&conversionEnd>conversionStart);
  assert.match(conversion,/for update/);
  assert.match(conversion,/if\(current\.document_type==='invoice'\)/);
  assert.match(conversion,/withTransaction\(async client=>/);
  assert.match(conversion,/nextNumber\(org,'FAC',client\)/);
  assert.match(conversion,/document_type<>'invoice' returning id/);
});
