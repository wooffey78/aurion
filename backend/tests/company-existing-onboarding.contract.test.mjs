import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('la création de compte recueille le nom complet et le transmet au serveur', () => {
  const auth = read('../../assets/js/pages/auth.js');
  const api = read('../../assets/js/core/api.js');
  assert.match(auth, /id="full-name-field"/);
  assert.match(auth, /id="full-name"/);
  assert.match(auth, /fullName\.required=registration/);
  assert.match(auth, /api\.register\(emailValue,password,true,fullName\)/);
  assert.match(api, /register:async\(email,password,acceptLegal,fullName=''/);
  assert.match(api, /fullName:String\(fullName\|\|'\'\)\.trim\(\)/);
});

test('la première connexion ouvre la configuration entreprise et ne redirige plus vers les formalités', () => {
  const main = read('../../assets/js/main.js');
  assert.match(main, /import\{renderOnboarding\}from'\.\/pages\/onboarding\.js'/);
  assert.match(main, /if\(r==='\/onboarding'\)[\s\S]*?return renderOnboarding\(\)/);
  assert.doesNotMatch(main, /renderGuidedOnboarding|journeyEntryState/);
  const onboarding = read('../../assets/js/pages/onboarding.js');
  assert.match(onboarding, /SIRET/);
  assert.match(onboarding, /SIREN/);
  assert.match(onboarding, /api\.supplierLookup\(id\)/);
});

test('le parcours guidé de configuration est accessible depuis l’accueil', () => {
  const home = read('../../assets/js/pages/dash/other.js');
  assert.match(home, /onboarding-guide-panel/);
  assert.match(home, /href="#\/onboarding"/);
  assert.match(home, /Configuration et paramètres d’Aurion/);
});

test('la détection société dans les paramètres reste centrée sur les identifiants SIRET/SIREN', () => {
  const settings = read('../../assets/js/pages/dash/settings.js');
  assert.match(settings, /id="lookup-company-siret"/);
  assert.doesNotMatch(settings, /lookup-company-name|supplierSearch/);
  assert.match(settings, /api\.supplierLookup\(identifier\)/);
  assert.match(settings, /\['#ssiret','#ssiren'\]/);
});
