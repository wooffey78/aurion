import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Accueil distingue devis actifs, encaissements et rendez-vous à venir', () => {
  const ui = read('../../assets/js/pages/dash/other.js');
  assert.match(ui, /Devis en cours/);
  assert.match(ui, /!\['canceled','cancelled','rejected','void','deleted'\]\.includes/);
  assert.match(ui, /Rendez-vous à venir/);
  assert.match(ui, /new Date\(a\.starts_at\)>now/);
  assert.match(ui, /encaissements HT, majorations comprises/);
  assert.match(ui, /TTC, SAV déduits/);
});

test('Accueil et trésorerie présentent les prévisions comme scénario et flux engagés distincts', () => {
  const ui = read('../../assets/js/pages/dash/other.js');
  const forecast = read('../../assets/js/core/forecast.js');
  const shared = read('../../backend/src/services/document-forecast.ts');
  assert.match(ui, /Prévision de facturation — scénario indicatif/);
  assert.match(ui, /Factures projetées/);
  assert.match(ui, /Entrées estimées \(TTC\)/);
  assert.match(ui, /Créances restantes \(engagé\)/);
  assert.match(ui, /Devis ouverts \(potentiel\)/);
  assert.match(forecast, /averageTicketHt/);
  assert.match(forecast, /monthlyEntriesHt\s*=\s*repairsPerMonth\s*\*\s*assumptions\.averageTicketHt/);
  assert.match(forecast, /monthlyReserve\s*=\s*monthlyEntriesHt/);
  assert.match(shared, /documentForecastEntries/);
  assert.match(shared, /savTtc/);
  assert.match(shared, /entries: quotesTtc \+ savTtc/);
});

test('Comptabilité nomme explicitement les encaissements et la TVA encaissée', () => {
  const ui = read('../../assets/js/pages/dash/other.js');
  const report = read('../../backend/src/services/accounting-report.ts');
  assert.match(ui, /<span>Encaissements HT<\/span>/);
  assert.match(ui, /<span>TVA encaissée<\/span>/);
  assert.match(ui, /<span>Factures encaissées<\/span>/);
  assert.match(report, /Encaissements HT annuels/);
  assert.match(report, /TVA encaissée/);
  assert.match(report, /Factures émises/);
});

test('La fiche client sépare factures émises, payé et restant dû', () => {
  const ui = read('../../assets/js/pages/dash/clientsheet.js');
  assert.match(ui, /Factures émises TTC/);
  assert.match(ui, /payé \$\{money\(st\.paidTtc\|\|0\)\}/);
  assert.match(ui, /restant \$\{money\(st\.remainingTtc\|\|0\)\}/);
});

test('Les indicateurs de temps sont libellés sur les sessions terminées', () => {
  const ui = read('../../assets/js/pages/dash/other.js');
  const route = read('../../backend/src/routes/business.ts');
  assert.match(ui, /Sessions terminées uniquement/);
  assert.match(ui, /Par session terminée/);
  assert.match(route, /completed/);
  assert.match(route, /activity_id/);
});

test('Administration distingue les organisations, comptes et catégories d’accès gratuit', () => {
  const ui = read('../../assets/js/pages/dash/other.js');
  const route = read('../../backend/src/routes/admin.ts');
  assert.match(ui, /Entreprises \/ organisations/);
  assert.match(ui, /Comptes utilisateurs/);
  assert.match(ui, /adminOnly/);
  assert.match(ui, /vipOnly/);
  assert.match(ui, /adminAndVip/);
  assert.match(route, /conversionCohort/);
  assert.match(route, /organizations/);
});
