import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

const docs=fs.readFileSync(path.join(root,'assets/js/pages/dash/docs.js'),'utf8');
const business=fs.readFileSync(path.join(root,'backend/src/routes/business.ts'),'utf8');

test('étape 7 — facture et relances consultables sous la facture avec calcul cumulé',()=>{
  assert.match(business,/json_build_object\('id',ir\.id,'reminderNumber',ir\.reminder_number,'penaltyAmount',ir\.penalty_amount,'createdAt',ir\.created_at\)/);
  assert.match(docs,/details class="invoice-history"/);
  assert.match(docs,/Facture et relances envoyées/);
  assert.match(docs,/q\.reminders/);
  assert.match(docs,/Majoration/);
  assert.match(docs,/penaltyAmount/);
  assert.match(docs,/total_ttc.*penaltyAmount/);
});
