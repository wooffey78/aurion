import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');
const other = fs.readFileSync(new URL('../../assets/js/pages/dash/other.js', import.meta.url), 'utf8');
const treasuryRoute = route.slice(route.indexOf("app.get('/treasury/summary'"));
const treasuryView = other.slice(other.indexOf('export const treasury='));

test('prévisionnel exclut les factures déjà émises et les frais kilométriques', () => {
  assert.match(treasuryRoute, /q\.document_type='quote'\s+and\s+q\.status<>'canceled'/);
  assert.doesNotMatch(treasuryRoute, /document_type in \('quote','invoice'\)/);
  assert.doesNotMatch(treasuryRoute, /mileageTotal/);
  assert.doesNotMatch(treasuryRoute, /const invoiced=/);
  assert.doesNotMatch(treasuryRoute, /invoicedPurchases/);
  assert.match(treasuryView, /Entrées prévues/);
  assert.doesNotMatch(treasuryView, /Frais kilométriques/);
  assert.doesNotMatch(treasuryView, /Déjà facturé/);
  assert.doesNotMatch(treasuryView, /mileage_km/);
  assert.doesNotMatch(treasuryView, /mileage_rate/);
  assert.doesNotMatch(treasuryView, /document_type==='invoice'/);
  assert.match(treasuryView, /Aucun devis prévisionnel/);
});
