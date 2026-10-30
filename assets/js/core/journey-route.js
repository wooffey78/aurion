export const JOURNEY_STEP_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

export function visibleJourneySteps(status) {
  return status === 'to_create' ? [1, 3, 4, 5, 6, 7] : [...JOURNEY_STEP_IDS];
}

export function safeJourneyStep(step, status) {
  const route = visibleJourneySteps(status);
  const requested = Number(step);
  if (!Number.isInteger(requested)) return route[0];
  if (route.includes(requested)) return requested;
  return route.find(id => id > requested) ?? route.at(-1);
}

export function journeyStepOrdinal(step, status) {
  const route = visibleJourneySteps(status);
  const safe = safeJourneyStep(step, status);
  return Math.max(1, route.indexOf(safe) + 1);
}

export function journeyProgress(step, status) {
  const route = visibleJourneySteps(status);
  return Math.round((journeyStepOrdinal(step, status) / route.length) * 100);
}

export function nextJourneyStep(step, status) {
  const route = visibleJourneySteps(status);
  const index = route.indexOf(safeJourneyStep(step, status));
  return route[Math.min(route.length - 1, index + 1)];
}

export function previousJourneyStep(step, status) {
  const route = visibleJourneySteps(status);
  const index = route.indexOf(safeJourneyStep(step, status));
  return route[Math.max(0, index - 1)];
}
