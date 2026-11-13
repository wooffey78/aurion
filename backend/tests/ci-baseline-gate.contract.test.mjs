import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateCommand, compareWithBaseline } from '../../tools/ci-gate-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');
const baseline = JSON.parse(read('docs/BASELINE-TESTS-B0-15.3.20.json'));

test('la politique CI refuse même un échec connu de la baseline historique', () => {
  const knownFailure = baseline.full.failures[0];
  const result = evaluateCommand({
    exitCode: 1,
    output: 'TAP version 13\nnot ok 1 - ' + knownFailure + '\n',
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [knownFailure]);
});

test('un échec de build ou de typecheck bloque la CI même sans sortie TAP', () => {
  assert.equal(evaluateCommand({ exitCode: 2, output: 'error TS2322: Type mismatch' }).ok, false);
  assert.equal(evaluateCommand({ exitCode: 127, output: 'npm: command not found' }).ok, false);
});

test('une sortie TAP not ok bloque même si le processus retourne zéro', () => {
  const result = evaluateCommand({ exitCode: 0, output: 'not ok 2 - assertion métier' });
  assert.equal(result.ok, false);
});

test('la comparaison baseline classe les échecs mais ne les absout pas', () => {
  const knownFailure = baseline.smoke.failures[0];
  const comparison = compareWithBaseline([knownFailure, 'régression ajoutée'], baseline.smoke.failures);
  assert.deepEqual(comparison.stillHistorical, [knownFailure]);
  assert.deepEqual(comparison.newFailures, ['régression ajoutée']);
  assert.equal(evaluateCommand({ exitCode: 1, output: 'not ok 1 - ' + knownFailure }).ok, false);
});

test('le workflow exige Node du fichier versionné, PostgreSQL isolé et validation stricte', () => {
  const workflow = read('.github/workflows/aurion-ci.yml');
  assert.match(workflow, /npm run build\s*&&\s*npm run typecheck/);
  assert.match(workflow, /postgres:17-alpine/);
  assert.match(workflow, /AURION_MIGRATION_DATABASE_URL/);
  assert.match(workflow, /AURION_INTEGRATION_TESTS:\s*"1"/);
  assert.match(workflow, /node tools\/verify-b0-baseline\.mjs/);
  assert.match(workflow, /node-version-file: \.node-version/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /zero-tolerance gate/);
});

test('le runner strict ne comporte aucune branche de tolérance pour la baseline', () => {
  const runner = read('tools/verify-b0-baseline.mjs');
  assert.match(runner, /evaluateCommand\(/);
  assert.match(runner, /compareWithBaseline\(/);
  assert.doesNotMatch(runner, /AURION_BASELINE_STRICT/);
  assert.match(runner, /échec obligatoire/);
});

test('la commande npm smoke exécute les tests du garde-fou CI', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['test:smoke'], /ci-baseline-gate\.contract\.test\.mjs/);
});

test('les tests backend exploitent le support TypeScript de Node 22.16', () => {
  const pkg = JSON.parse(read('backend/package.json'));
  assert.equal(pkg.scripts.test, 'node --experimental-strip-types --test');
});
