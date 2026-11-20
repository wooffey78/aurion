import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReminderPenalty, reminderTotal } from '../dist/services/invoice-workflow.js';

test('majoration fixe : elle s’ajoute au montant précédent', () => {
  assert.equal(calculateReminderPenalty(100, 10, 'fixed', 5), 5);
  assert.equal(reminderTotal(100, 10, 5), 115);
});

test('majoration en pourcentage : elle est calculée sur le total TTC précédent', () => {
  assert.equal(calculateReminderPenalty(100, 10, 'percent', 10), 11);
  assert.equal(reminderTotal(100, 10, 11), 121);
});

test('aucune majoration conserve le montant précédent', () => {
  assert.equal(calculateReminderPenalty(100, 10, 'none', 50), 0);
  assert.equal(reminderTotal(100, 10, 0), 110);
});