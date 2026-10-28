import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateForecast, normalizeForecastAssumptions, deriveAutomaticForecastAssumptions } from '../../assets/js/core/forecast.js';

test('projection calcule les entrées, coûts variables, frais fixes et provision sur les horizons attendus', () => {
  const result = calculateForecast({potentialClientsPerMonth:10,averageTicketTtc:100,variableCostPerRepair:25,fixedMonthlyCosts:200,reservePercent:10});
  assert.deepEqual(result.periods.map(p=>p.months),[1,3,6,12]);
  assert.equal(result.periods[0].repairs,10);
  assert.equal(result.periods[0].entries,1000);
  assert.equal(result.periods[0].variableCosts,250);
  assert.equal(result.periods[0].fixedCosts,200);
  assert.equal(result.periods[0].reserve,100);
  assert.equal(result.periods[0].outputs,550);
  assert.equal(result.periods[0].net,450);
  assert.equal(result.periods[1].net,1350);
});

test('les hypothèses sont bornées et les valeurs invalides deviennent zéro', () => {
  assert.deepEqual(normalizeForecastAssumptions({potentialClientsPerMonth:-1,averageTicketTtc:'NaN',variableCostPerRepair:2000000,fixedMonthlyCosts:10,reservePercent:140}),{potentialClientsPerMonth:0,averageTicketTtc:0,variableCostPerRepair:1000000,fixedMonthlyCosts:10,reservePercent:100});
});

test('le prévisionnel dérive ses valeurs des factures récentes et des taux configurés', () => {
  const now = new Date('2026-10-28T12:00:00.000Z');
  const documents = [
    {document_type:'invoice',status:'paid',created_at:'2026-10-01T10:00:00.000Z',total_ttc:120,part_cost:20,shipping_cost:5,labor_internal_cost_ht:10,mileage_mode:'margin',mileage_km:10,mileage_internal_rate:0.5,purchase_vat_mode:'exempt',urssaf_rate:22},
    {document_type:'invoice',status:'issued',created_at:'2026-09-01T10:00:00.000Z',total_ttc:180,part_cost:40,shipping_cost:0,labor_internal_cost_ht:20,mileage_mode:'client',purchase_vat_mode:'manual',purchase_vat_rate:20,urssaf_rate:22},
    {document_type:'quote',status:'draft',created_at:'2026-10-15T10:00:00.000Z',total_ttc:900,part_cost:300},
    {document_type:'invoice',status:'canceled',created_at:'2026-10-03T10:00:00.000Z',total_ttc:500,part_cost:100},
  ];
  const actual = deriveAutomaticForecastAssumptions(documents, {urssaf_rate:22,vat_rate:20}, now);
  assert.equal(actual.potentialClientsPerMonth, 0.3);
  assert.equal(actual.averageTicketTtc, 150);
  assert.equal(actual.variableCostPerRepair, 54);
  assert.equal(actual.fixedMonthlyCosts, 0);
  assert.equal(actual.reservePercent, 22);
  assert.equal(actual.metadata.recentInvoiceCount, 2);
  assert.match(actual.metadata.fixedCostsNote, /0 €/);
});

test('le prévisionnel ne contient plus de champs de saisie ou de sauvegarde manuelle', () => {
  const source = fs.readFileSync(new URL('../../assets/js/pages/dash/other.js', import.meta.url), 'utf8');
  assert.match(source, /deriveAutomaticForecastAssumptions/);
  assert.doesNotMatch(source, /name="(?:potentialClientsPerMonth|averageTicketTtc|variableCostPerRepair|fixedMonthlyCosts|reservePercent)"/);
  assert.doesNotMatch(source, /Enregistrer les hypothèses|valuesFromForecastForm|saveForecastAssumptions/);
});
