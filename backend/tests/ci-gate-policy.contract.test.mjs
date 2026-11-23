import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCommand, compareWithBaseline, parseTapFailures } from '../../tools/ci-gate-policy.mjs';

test('la politique CI refuse un échec même s’il appartenait à la baseline', () => {
  const failures = parseTapFailures('TAP version 13\nnot ok 1 - erreur historique\nok 2 - stable\n');
  assert.deepEqual(failures, ['erreur historique']);
  assert.equal(evaluateCommand({ exitCode: 1, output: 'not ok 1 - erreur historique' }).ok, false);
});

test('un échec de build sans sortie TAP reste bloquant', () => {
  assert.equal(evaluateCommand({ exitCode: 2, output: 'error TS2322' }).ok, false);
  assert.equal(evaluateCommand({ exitCode: 127, output: 'npm not found' }).ok, false);
  assert.equal(evaluateCommand({ exitCode: 0, output: 'ok 1 - passed' }).ok, true);
});

test('la comparaison à la baseline classe les échecs sans les absoudre', () => {
  assert.deepEqual(compareWithBaseline(['historique', 'nouveau'], ['historique', 'résolu']), {
    newFailures: ['nouveau'], stillHistorical: ['historique'], resolvedHistorical: ['résolu'],
  });
});

test('le runner B0 utilise la politique commune pour les sorties et les comparaisons', async () => {
  const { readFileSync } = await import('node:fs');
  const script = readFileSync(new URL('../../tools/verify-b0-baseline.mjs', import.meta.url), 'utf8');
  assert.match(script, /evaluateCommand\(/);
  assert.match(script, /compareWithBaseline\(/);
});
