import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Accueil : encarts Clients, Devis en cours et Entrées prévues supprimés (15.4.67), encaissements et rendez-vous conservés', () => {
  const ui = read('../../assets/js/pages/dash/other.js');
  // 15.4.67 (consigne éditeur) : les encarts « Clients », « Devis en cours » et
  // « Entrées prévues » disparaissent complètement de l'accueil.
  assert.doesNotMatch(ui, /<span>Devis en cours<\/span>/);
  assert.doesNotMatch(ui, /id="home-open-quotes"/);
  assert.doesNotMatch(ui, /<span>Clients<\/span>/);
  assert.doesNotMatch(ui, /id="home-clients"/);
  assert.doesNotMatch(ui, /id="home-entries-caption"/);
  // Les deux indicateurs conservés restent exacts.
  assert.match(ui, /Rendez-vous à venir/);
  assert.match(ui, /new Date\(a\.starts_at\)>now/);
  assert.match(ui, /Encaissements HT du mois/);
  assert.match(ui, /paiements reçus, majorations comprises/);
});

test('Accueil et trésorerie présentent les prévisions comme scénario et flux engagés distincts', () => {
  const ui = read('../../assets/js/pages/dash/other.js');
  const forecast = read('../../assets/js/core/forecast.js');
  const shared = read('../../backend/src/services/document-forecast.ts');
  // 15.4.67 (consigne éditeur) : le bloc « scénario indicatif » disparaît ; le panneau
  // partagé devient « Horizon de facturation », avec bascule tableau ⇄ graphique.
  assert.match(ui, /Horizon de facturation/);
  assert.match(ui, /data-horizon-toggle="1"/);
  assert.doesNotMatch(ui, /SCÉNARIO INDICATIF/);
  assert.match(ui, /Factures projetées/);
  assert.match(ui, /Entrées estimées \(TTC\)/);
  assert.match(ui, /Créances restantes \(engagé\)/);
  // 15.4.66 — le potentiel ne contient plus que les devis NON signés ; les devis signés
  // (acceptés par le client) entrent dans les calculs (entrées prévues).
  assert.match(ui, /Devis non signés \(potentiel\)/);
  assert.match(ui, /Devis signés \(intégrés\)/);
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
  // Les documents annulés/refusés restent visibles dans l'historique, mais marqués comme tels.
  assert.match(ui, /' · Annulé'/);
  assert.match(ui, /' · Refusé'/);
});

test('Les indicateurs de temps portent la règle 15.4.67 (estimation fixe par client)', () => {
  const ui = read('../../assets/js/pages/dash/other.js');
  const route = read('../../backend/src/routes/business.ts');
  // 15.4.67 (consigne éditeur) : estimation FIXE par client, comptée une seule fois quel que
  // soit le nombre de sessions ; plus aucune baseline par session, plus de bulle explicative.
  assert.match(ui, /Estimation fixe de chaque client consulté, comptée une seule fois/);
  assert.match(ui, /Par session terminée/);
  assert.doesNotMatch(ui, /Sessions terminées uniquement/);
  assert.doesNotMatch(ui, /Mesure cumulée/);
  assert.doesNotMatch(route, /MANUAL_BASELINE_MINUTES/);
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
