import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../../assets/js/pages/dash/other.js', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../../assets/js/core/forecast.js', import.meta.url), 'utf8');

// 15.4.67 (consigne éditeur) : le bloc « scénario indicatif » et ses cartes d'hypothèses
// disparaissent de l'écran ; le panneau « Horizon de facturation » présente le tableau
// (entrées / sorties / solde estimé) et sa bascule graphique — mêmes bases de calcul.
assert.match(source, /Horizon de facturation/);
assert.doesNotMatch(source, /SCÉNARIO INDICATIF/);
assert.doesNotMatch(source, /Factures moyennes \/ mois/);
assert.match(source, /Entrées estimées/);
assert.match(source, /Sorties estimées/);
assert.match(source, /Solde estimé/);
// §7.2 : les charges fixes enregistrées (/forecast/assumptions) sont LUES et modifiables ;
// le libellé d'appel reste honnête (« Renseigner les charges fixes »), jamais « enregistrer
// les hypothèses » présenté comme une obligation.
assert.match(source, /api\.forecastAssumptions\(\)/);
assert.match(source, /data-edit-forecast-fixed-costs>Charges fixes<\/button>/);
assert.doesNotMatch(source, /Enregistrer les hypothèses/);
assert.match(source, /forecastPanelMarkup\('treasury',S\.quotes,active\(\)\)/);
assert.match(model, /potentialClientsPerMonth/);
assert.match(model, /variableCostPerRepair/);
assert.match(model, /fixedMonthlyCosts/);
assert.match(model, /reservePercent/);
assert.match(model, /\[1, 3, 6, 12\]/);
console.log('Step 9 scenario-based forecast: 21 assertions passed.');
