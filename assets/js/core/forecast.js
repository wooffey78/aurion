// Projection illustrative des réparations potentielles : ce scénario ne remplace pas la comptabilité réelle.
export const DEFAULT_FORECAST_ASSUMPTIONS = Object.freeze({
  potentialClientsPerMonth: 0,
  averageTicketTtc: 0,
  variableCostPerRepair: 0,
  fixedMonthlyCosts: 0,
  reservePercent: 0,
});

const number = (value, max) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : 0;
};

export function normalizeForecastAssumptions(value = {}) {
  return {
    potentialClientsPerMonth: Math.round(number(value.potentialClientsPerMonth, 10000)),
    averageTicketTtc: number(value.averageTicketTtc, 1000000),
    variableCostPerRepair: number(value.variableCostPerRepair, 1000000),
    fixedMonthlyCosts: number(value.fixedMonthlyCosts, 10000000),
    reservePercent: number(value.reservePercent, 100),
  };
}

export function calculateForecast(value = {}) {
  const assumptions = normalizeForecastAssumptions(value);
  const repairsPerMonth = assumptions.potentialClientsPerMonth;
  const monthlyEntries = repairsPerMonth * assumptions.averageTicketTtc;
  const monthlyVariableCosts = repairsPerMonth * assumptions.variableCostPerRepair;
  const monthlyReserve = monthlyEntries * assumptions.reservePercent / 100;
  const monthlyOutputs = monthlyVariableCosts + assumptions.fixedMonthlyCosts + monthlyReserve;
  return {
    assumptions,
    periods: [1, 3, 6, 12].map(months => ({
      months, repairs: repairsPerMonth * months,
      entries: monthlyEntries * months,
      variableCosts: monthlyVariableCosts * months,
      fixedCosts: assumptions.fixedMonthlyCosts * months,
      reserve: monthlyReserve * months,
      outputs: monthlyOutputs * months,
      net: (monthlyEntries - monthlyOutputs) * months,
    })),
  };
}
