import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyIntegrationFile,
  discoverIntegrationTests,
  renderIntegrationReport,
  summarizeIntegrationRun,
} from '../../tools/integration-skip-gate.mjs';

const file = (relative, categories) => ({ relative, absolute: `/repo/${relative}`, categories });

function event(relative, name, extra = {}) {
  return { type: 'pass', file: `/repo/${relative}`, name, ...extra };
}

test('la découverte protège PostgreSQL, Stripe et Google sans inclure les tests unitaires', () => {
  const files = discoverIntegrationTests();
  const names = new Set(files.map(item => item.relative));
  for (const expected of [
    'backend/tests/stripe-billing.integration.test.mjs',
    'backend/tests/cloud-storage.integration.test.mjs',
    'backend/tests/signup-subscription.postgres.integration.test.mjs',
    'backend/tests/tenant-isolation.rls.test.mjs',
    'backend/tests/google-token-encryption.test.mjs',
    'backend/tests/runtime-privileges.test.mjs',
  ]) {
    assert.ok(names.has(expected), `fichier d’intégration non protégé : ${expected}`);
  }
  assert.equal(names.has('backend/tests/navigation.test.mjs'), false, 'un test unitaire ne doit pas être protégé');

  const stripe = files.find(item => item.relative === 'backend/tests/stripe-billing.integration.test.mjs');
  assert.deepEqual(stripe.categories, ['PostgreSQL', 'Stripe']);
  const google = files.find(item => item.relative === 'backend/tests/google-token-encryption.test.mjs');
  assert.deepEqual(google.categories, ['Google']);
});

test('un fichier et une configuration sans intégration ne sont pas protégés', () => {
  assert.equal(classifyIntegrationFile('backend/tests/navigation.test.mjs', 'import test from "node:test";').protected, false);
  assert.equal(classifyIntegrationFile('backend/tests/demo.test.mjs', "test('config', () => { process.env.DATABASE_URL ||= 'x'; });").protected, false);
  assert.equal(classifyIntegrationFile('backend/tests/demo.integration.test.mjs', '').protected, true);
});

test('un skip, un todo, un échec ou un fichier sans test rendent le rapport rouge', () => {
  const relative = 'backend/tests/stripe-billing.integration.test.mjs';
  const files = [file(relative, ['PostgreSQL', 'Stripe'])];
  const skipped = summarizeIntegrationRun({
    files,
    rootDirectory: '/repo',
    events: [
      event(relative, 'passe'),
      event(relative, 'ignoré', { skip: 'AURION_INTEGRATION_TESTS=1 requis' }),
      event(relative, 'todo', { todo: true }),
    ],
  });
  assert.equal(skipped.ok, false);
  assert.deepEqual(skipped.totals, { tests: 3, pass: 1, skip: 2, fail: 0 });
  assert.equal(skipped.skipped[0].reason, 'AURION_INTEGRATION_TESTS=1 requis');
  assert.match(renderIntegrationReport(skipped), /Tests : 3 · Réussis \(pass\) : 1 · Ignorés \(skip\) : 2 · Échecs \(fail\) : 0/);
  assert.match(renderIntegrationReport(skipped), /Tests ignorés \(bloquants\)/);

  const failed = summarizeIntegrationRun({ files, rootDirectory: '/repo', events: [event(relative, 'échoue', { type: 'fail' })] });
  assert.equal(failed.ok, false);
  assert.equal(failed.totals.fail, 1);

  const suiteFailure = summarizeIntegrationRun({
    files,
    rootDirectory: '/repo',
    events: [
      event(relative, 'échoue', { type: 'fail' }),
      event(relative, 'suite', { type: 'fail', suite: true }),
    ],
  });
  assert.equal(suiteFailure.totals.tests, 1, 'un échec de suite ne double pas le test enfant');
  assert.equal(suiteFailure.totals.fail, 1);
  assert.equal(suiteFailure.suiteFailures.length, 1);
  assert.match(renderIntegrationReport(suiteFailure), /Suites en échec \(hors comptage des tests\)/);

  const missing = summarizeIntegrationRun({ files, rootDirectory: '/repo', events: [] });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, [relative]);

  const wrongConfiguration = summarizeIntegrationRun({ files, rootDirectory: '/repo', events: [event(relative, 'passe')], configurationFailures: ['DATABASE_URL requis'] });
  assert.equal(wrongConfiguration.ok, false);
  assert.ok(wrongConfiguration.failures.includes('DATABASE_URL requis'));
});

test('le rapport par catégorie et le câblage CI sont explicites', () => {
  const relative = 'backend/tests/cloud-storage.integration.test.mjs';
  const result = summarizeIntegrationRun({
    rootDirectory: '/repo',
    files: [
      file(relative, ['PostgreSQL', 'Google']),
      file('backend/tests/stripe-billing.integration.test.mjs', ['PostgreSQL', 'Stripe']),
    ],
    events: [
      event(relative, 'stockage'),
      event('backend/tests/stripe-billing.integration.test.mjs', 'webhook'),
    ],
  });
  const report = renderIntegrationReport(result);
  assert.equal(result.ok, true);
  assert.match(report, /Conclusion : \*\*RÉUSSI\*\*/);
  assert.match(report, /\| PostgreSQL \| 2 \| 2 \| 2 \| 0 \| 0 \|/);
  assert.match(report, /\| Google \| 1 \| 1 \| 1 \| 0 \| 0 \|/);
  assert.match(report, /\| Stripe \| 1 \| 1 \| 1 \| 0 \| 0 \|/);

  const workflow = readFileSync(new URL('../../.github/workflows/aurion-ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /npm run test:integration-gate/);
  assert.match(workflow, /integration-tests-report\.md/);
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.scripts['test:integration-gate'], 'node tools/integration-skip-gate.mjs');
  assert.match(packageJson.scripts['test:smoke'], /integration-skip-gate\.contract\.test\.mjs/);
});
