import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/,'');
const read = p => readFileSync(`${root}/${p}`,'utf8');

test('configuration propagates to server, dashboard, quote, and settings', () => {
  const sync = read('backend/src/services/configuration-sync.ts');
  const org = read('backend/src/routes/organizations.ts');
  const dash = read('assets/js/pages/dashboard.js');
  const quote = read('assets/js/pages/dash/quote.js');
  const settings = read('assets/js/pages/dash/settings.js');
  const onboarding = read('assets/js/pages/onboarding.js');

  assert.match(sync, /applyConfigurationQuestionnaire/);
  assert.match(sync, /support:\s*'support'/);
  assert.match(sync, /agenda:\s*'agenda'/);
  assert.match(sync, /accounting:\s*'accounting'/);
  assert.match(sync, /parts:\s*'easyfixit'/);
  assert.match(sync, /stock:\s*'stock'/);
  assert.match(org, /applyConfigurationQuestionnaire\(/);
  assert.doesNotMatch(dash, /renderOnboarding\([^;]*onClose:\(\)=>refresh\(S\.view\)/s);
  assert.match(settings, /3 · Configuration fonctionnelle[\\s\\S]*4 · Activités et calculs métier/);
  assert.match(quote, /configQ=S\.company\?\.configuration_data\?\.questionnaire/);
  assert.match(quote, /itemsEnabled=c\.items!==false&&configQ\.parts!==['"]Non['"]/);
  assert.match(settings, /q=S\.company\?\.configuration_data\?\.questionnaire/);
  assert.match(settings, /contributions==='Non'/);
  assert.match(onboarding, /configurationData/);
});
