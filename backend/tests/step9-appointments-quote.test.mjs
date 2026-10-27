import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

const other=fs.readFileSync(path.join(root,'assets/js/pages/dash/other.js'),'utf8');
const api=fs.readFileSync(path.join(root,'assets/js/core/api.js'),'utf8');
const business=fs.readFileSync(path.join(root,'backend/src/routes/business.ts'),'utf8');
const migration=fs.readFileSync(path.join(root,'backend/migrations/046_appointment_quote_details.sql'),'utf8');
const calendar=fs.readFileSync(path.join(root,'backend/src/services/calendar.ts'),'utf8');

test('étape 9 — rendez-vous lié au devis, autofill client/devis/adresse et fiche PDF',()=>{
  for(const token of ['quoteId','Prix client TTC','Pièces nécessaires','addressSource','Adresse postale','Adresse d’intervention','Adresse libre','Consulter','appointmentPdfUrl']) assert.match(other,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(api,/appointmentPdfUrl/);
  assert.match(business,/quote_id/);
  assert.match(business,/quote_total_ttc/);
  assert.match(business,/quote_items/);
  assert.match(business,/appointments\/:id\.pdf/);
  assert.match(business,/address_source/);
  assert.match(migration,/quote_id uuid/);
  assert.match(calendar,/q\.number quote_number/);
});
