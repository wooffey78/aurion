import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../../assets/js/pages/dash/other.js', import.meta.url), 'utf8');
const docsUi = readFileSync(new URL('../../assets/js/pages/dash/docs.js', import.meta.url), 'utf8');
const business = readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');
const report = readFileSync(new URL('../src/services/accounting-report.ts', import.meta.url), 'utf8');

test('les indicateurs comptables affichent leur base de trésorerie réelle', () => {
  assert.match(ui, /Encaissements HT/);
  assert.match(ui, /TVA encaissée/);
  assert.match(ui, /Factures encaissées/);
  assert.match(ui, /Kilométrage sur factures/);
  assert.match(ui, /Dépenses et coûts directs HT/);
  assert.match(business, /count\(distinct q\.id\)::int n from quotes q join invoice_payments p/);
});

test('les totaux de l’accueil excluent devis annulés et rendez-vous passés', () => {
  assert.match(ui, /document_type!=='invoice'&&!\['canceled','cancelled','rejected','void','deleted'\]/);
  assert.match(ui, /new Date\(a\.starts_at\)>now/);
  assert.match(ui, /Rendez-vous à venir/);
});

test('les cotisations estimées des documents utilisent les assiettes figées du document', () => {
  assert.match(docsUi, /contribution_snapshot/);
  assert.match(docsUi, /basis==='gross_margin'/);
  assert.match(docsUi, /basis==='profit'/);
  assert.match(docsUi, /row\?\.basis\|\|'ca_ht'/);
  assert.match(docsUi, /taux historique/);
  assert.match(report, /function estimateDocumentContributions/);
  assert.match(report, /q\.contribution_snapshot/);
  assert.match(report, /taux et assiettes figés dans le document/);
  assert.match(report, /Cotisations estimées \(document\)/);
});

test('les prévisions issues des factures sont libellées comme factures et comme projections', () => {
  assert.match(ui, /Factures moyennes \/ mois/);
  assert.match(ui, /Factures projetées/);
  assert.match(ui, /Année — réalisé HT \+ projection HT/);
  assert.match(ui, /elles ne constituent pas un historique ni une promesse d’encaissement/);
  assert.match(ui, /data-edit-forecast-fixed-costs/);
  assert.match(ui, /api\.saveForecastAssumptions\(payload\)/);
});
