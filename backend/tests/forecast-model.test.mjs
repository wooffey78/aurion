import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateForecast, normalizeForecastAssumptions } from '../../assets/js/core/forecast.js';

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
