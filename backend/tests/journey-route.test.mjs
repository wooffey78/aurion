import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyProgress, journeyStepOrdinal, nextJourneyStep, previousJourneyStep, safeJourneyStep, visibleJourneySteps } from '../../assets/js/core/journey-route.js';

test('le parcours de création masque seulement l’étape d’identification et conserve les identifiants canoniques', () => {
  assert.deepEqual(visibleJourneySteps('existing'), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(visibleJourneySteps('unknown'), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(visibleJourneySteps('to_create'), [1, 3, 4, 5, 6, 7]);
});

test('une URL vers une étape masquée est redirigée dans la séquence visible', () => {
  assert.equal(safeJourneyStep(2, 'to_create'), 3);
  assert.equal(safeJourneyStep(99, 'to_create'), 7);
  assert.equal(safeJourneyStep(0, 'existing'), 1);
});

test('ordinal, progression, précédent et suivant sont calculés sur les étapes visibles', () => {
  assert.equal(journeyStepOrdinal(3, 'to_create'), 2);
  assert.equal(journeyProgress(3, 'to_create'), 33);
  assert.equal(previousJourneyStep(3, 'to_create'), 1);
  assert.equal(nextJourneyStep(1, 'to_create'), 3);
  assert.equal(nextJourneyStep(6, 'to_create'), 7);
  assert.equal(journeyProgress(7, 'to_create'), 100);
});
