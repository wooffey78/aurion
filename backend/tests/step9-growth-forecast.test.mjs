import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../../assets/js/pages/dash/other.js', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../../assets/js/core/forecast.js', import.meta.url), 'utf8');

// 15.4.34/35 : le panneau prévisionnel est un SCÉNARIO INDICATIF fondé sur les factures
// récentes — aucun libellé ne prétend compter des réparations ni présenter un historique.
assert.match(source, /Prévision de facturation — scénario indicatif/);
assert.match(source, /Factures moyennes \/ mois/);
assert.match(source, /Ticket moyen TTC/);
assert.match(source, /Base moyenne de provision HT/);
assert.match(source, /Coût direct moyen \/ facture/);
assert.match(source, /Charges fixes mensuelles suivies/);
assert.match(source, /Taux de provision/);
assert.match(source, /Entrées estimées/);
assert.match(source, /Sorties estimées/);
assert.match(source, /Solde estimé/);
assert.match(source, /Calcul automatique/);
// §7.2 : les charges fixes enregistrées (/forecast/assumptions) sont LUES et modifiables ;
// le libellé d'appel reste honnête (« Renseigner les charges fixes »), jamais « enregistrer
// les hypothèses » présenté comme une obligation.
assert.match(source, /api\.forecastAssumptions\(\)/);
assert.match(source, /Renseigner les charges fixes/);
assert.doesNotMatch(source, /Enregistrer les hypothèses/);
assert.match(source, /forecastPanelMarkup\('treasury',S\.quotes,active\(\)\)/);
assert.match(model, /potentialClientsPerMonth/);
assert.match(model, /variableCostPerRepair/);
assert.match(model, /fixedMonthlyCosts/);
assert.match(model, /reservePercent/);
assert.match(model, /\[1, 3, 6, 12\]/);
console.log('Step 9 scenario-based forecast: 21 assertions passed.');
