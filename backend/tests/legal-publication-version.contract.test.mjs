import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const account = readFileSync(new URL('../src/services/account.ts', import.meta.url), 'utf8');
const integration = readFileSync(new URL('./stripe-billing.integration.test.mjs', import.meta.url), 'utf8');

test('les documents contractuels opérationnels doivent être publiés en version 5.0 (DPA inclus, 15.4.54)', () => {
  assert.match(account, /legalDocumentsReadyForContracts\(requiredVersion = '5\.0'\)/);
  assert.match(account, /version=\$1/);
  // Cinq catégories contractuelles : CGV, confidentialité, mentions légales, cookies, DPA (art. 28 RGPD).
  assert.match(account, /kind in \('cgv','privacy','legal-notice','cookies','dpa'\)/);
  assert.match(account, /\.size === 5/);
  // Le semis de publication porte la version 5.0 et l'approbation éditeur doit l'accompagner.
  assert.match(account, /values\(\$1,'5\.0',/);
  assert.match(account, /AURION_LEGAL_PUBLICATION_APPROVAL === '5\.0'/);
  // L'acceptation à l'inscription et via /legal/accept couvre le DPA.
  assert.match(account, /kind in \('cgv','privacy','dpa'\)/);
  assert.match(integration, /legalDocumentsReadyForContracts\(ciLegalFixtureVersion\)/);
  assert.match(integration, /ciLegalFixtureVersion = 'ci-fixture-15\.3\.20'/);
  // La fixture CI sème aussi le DPA (cinq catégories satisfaies).
  assert.match(integration, /\['dpa',/);
});
