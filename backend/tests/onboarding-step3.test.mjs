import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const onboarding = fs.readFileSync(new URL('../../assets/js/pages/onboarding.js', import.meta.url), 'utf8');

test('étape 3: le popup de configuration avance réellement de l’étape 2 à l’étape 3', () => {
  assert.match(onboarding, /function renderFinalStep\(/);
  assert.match(onboarding, /if\(await save\(true\)\)renderQuestionnaire\(onClose,modal\)/);
  assert.match(onboarding, /renderFinalStep\(onClose,modal\)/);
  assert.match(onboarding, /id="finish-config"/);
});

test('étape 3: la dernière étape mène ensuite au tableau de bord', () => {
  assert.match(onboarding, /finish-config.*go\('\/dashboard'\)/s);
});
