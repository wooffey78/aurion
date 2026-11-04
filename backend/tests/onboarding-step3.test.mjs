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

test('étape 2: le questionnaire transmet aussi les champs obligatoires et les données entreprise existantes au PATCH', () => {
  assert.match(onboarding, /api\.updateOrganization\(\{name:company\.name\|\|'Mon entreprise',activity:company\.activity\|\|'À configurer'/);
  for (const field of ['customActivity:company.custom_activity','siren:company.siren','siret:company.siret','legalForm:company.legal_form','address:company.address','postalCode:company.postal_code','city:company.city','website:company.website']) {
    assert.ok(onboarding.includes(field), `le champ entreprise doit être préservé : ${field}`);
  }
  assert.match(onboarding, /configurationData,configurationIncomplete:false/);
});

test('étape 3: la dernière étape mène ensuite au tableau de bord', () => {
  assert.match(onboarding, /finish-config.*go\('\/dashboard'\)/s);
});
