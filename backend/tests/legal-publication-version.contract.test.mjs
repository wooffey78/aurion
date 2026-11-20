import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const account = readFileSync(new URL('../src/services/account.ts', import.meta.url), 'utf8');
const integration = readFileSync(new URL('./stripe-billing.integration.test.mjs', import.meta.url), 'utf8');

test('les documents contractuels opérationnels doivent être publiés en version 4.0', () => {
  assert.match(account, /legalDocumentsReadyForContracts\(requiredVersion = '4\.0'\)/);
  assert.match(account, /version=\$1/);
  assert.match(integration, /legalDocumentsReadyForContracts\(ciLegalFixtureVersion\)/);
  assert.match(integration, /ciLegalFixtureVersion = 'ci-fixture-15\.3\.20'/);
});
