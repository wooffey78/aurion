import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET ||= 'money-test-secret-that-is-long-enough-123456';
const { calculateTtcCents } = await import('../dist/services/money.js');

test('TTC arrondi en centimes entiers selon le taux en points de base', () => {
  assert.equal(calculateTtcCents(1167, 2000), 1400);
  assert.equal(calculateTtcCents(12600, 2000), 15120);
  assert.equal(calculateTtcCents(1, 5000), 2);
  assert.equal(calculateTtcCents(10_000, 0), 10_000);
});

test('le moteur rejette les montants et taux hors plage', () => {
  assert.throws(() => calculateTtcCents(-1, 2000), /prix HT/);
  assert.throws(() => calculateTtcCents(1.5, 2000), /prix HT/);
  assert.throws(() => calculateTtcCents(1, -1), /taux de TVA/);
  assert.throws(() => calculateTtcCents(1, 100_001), /taux de TVA/);
  assert.throws(() => calculateTtcCents(Number.MAX_SAFE_INTEGER, 100_000), /précision entière sûre/);
});
