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
  // 15.4.65+ — « Factures encaissées » croise paiements détaillés et factures payées sans
  // ligne de paiement (UNION) : le contrat suit la requête réelle.
  assert.match(business, /count\(distinct quote_id\)::int n from \(/);
  assert.match(business, /from invoice_payments p join quotes q on q\.id=p\.quote_id/);
});

test('les totaux de l’accueil : rendez-vous futurs seuls, encarts devis supprimés (15.4.67)', () => {
  // 15.4.67 — l'encart « Devis en cours » disparaît de l'accueil : le filtre d'exclusion des
  // devis annulés n'y a plus d'équivalent (il reste appliqué côté trésorerie et documents).
  assert.doesNotMatch(ui, /id="home-open-quotes"/);
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

test('l’accueil ne présente pas des encaissements comme un chiffre d’affaires', () => {
  assert.match(ui, /Encaissements HT du mois/);
  assert.doesNotMatch(ui, /CA HT du mois/);
  assert.match(ui, /<small>Encaissements HT<\/small>/);
});

test('les prévisions sont présentées en tableau « Horizon » avec bascule graphique (15.4.67)', () => {
  // 15.4.67 (consigne éditeur) : le bloc « scénario indicatif » (projections HT 3/6/12 mois,
  // bouton Détail, cartes d’hypothèses) disparaît ; le tableau « Horizon » devient affichable
  // en graphique au simple clic, avec les mêmes bases explicites de calcul.
  assert.doesNotMatch(ui, /projection HT \(scénario\)/);
  assert.doesNotMatch(ui, /id="forecast-more"/);
  assert.doesNotMatch(ui, /Factures moyennes \/ mois/);
  assert.match(ui, /Horizon de facturation/);
  assert.match(ui, /data-horizon-toggle="1"/);
  assert.match(ui, /forecast-chart-wrap/);
  assert.match(ui, /Factures projetées/);
  assert.match(ui, /Sorties estimées \(TTC \+ provision HT\)/);
  assert.match(ui, /Solde estimé \(avant TVA à reverser\)/);
  assert.match(ui, /data-edit-forecast-fixed-costs/);
  assert.match(ui, /api\.saveForecastAssumptions\(payload\)/);
});
