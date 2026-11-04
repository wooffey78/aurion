import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('la création de compte recueille le nom complet et le transmet au serveur', () => {
  const auth=read('../../assets/js/pages/auth.js'),api=read('../../assets/js/core/api.js');
  assert.match(auth,/id="full-name-field"/); assert.match(auth,/id="full-name"/);
  assert.match(auth,/fullName\.required=registration/); assert.match(auth,/api\.register\(emailValue,password,true,fullName\)/);
  assert.match(api,/register:async\(email,password,acceptLegal,fullName=''/);
});
test('la première connexion ouvre le configurateur entreprise et laisse le dashboard autonome', () => {
  const main=read('../../assets/js/main.js'),onboarding=read('../../assets/js/pages/onboarding.js');
  assert.match(main,/renderOnboarding/); assert.doesNotMatch(main,/renderGuidedOnboarding|journeyEntryState/);
  assert.match(onboarding,/SIRET/); assert.match(onboarding,/SIREN/); assert.match(onboarding,/api\.supplierLookup\(id\)/);
});
test('le parcours de configuration est accessible depuis l’accueil', () => {
  const home=read('../../assets/js/pages/dash/other.js');
  assert.match(home,/onboarding-guide-panel/); assert.match(home,/href="#\/onboarding"/); assert.match(home,/Configuration et paramètres d’Aurion/);
});
test('la détection par nom est absente des paramètres et de la configuration initiale, mais disponible dans son outil dédié', () => {
  const settings=read('../../assets/js/pages/dash/settings.js'),onboarding=read('../../assets/js/pages/onboarding.js'),directory=read('../../assets/js/pages/company-lookup.js');
  assert.match(settings,/id="lookup-company-siret"/); assert.doesNotMatch(settings,/lookup-company-name/);
  assert.match(settings,/api\.supplierLookup\(identifier\)/);
  assert.doesNotMatch(onboarding,/Détecter par nom|supplierSearch|companySearch/i);
  assert.match(directory,/api\.companySearch\(query\)/);
});
