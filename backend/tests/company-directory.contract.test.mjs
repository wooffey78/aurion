import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('la recherche par nom est disponible hors paramètres et hors configuration initiale', () => {
  const dashboard=read('../../assets/js/pages/dashboard.js');
  const page=read('../../assets/js/pages/company-lookup.js');
  const settings=read('../../assets/js/pages/dash/settings.js');
  const onboarding=read('../../assets/js/pages/onboarding.js');
  assert.match(dashboard,/companyLookup/);
  assert.match(page,/api\.companySearch\(query\)/);
  assert.match(page,/mergeRegistryFields/);
  assert.match(page,/api\.updateOrganization\(/);
  assert.doesNotMatch(settings,/lookup-company-name/);
  assert.doesNotMatch(onboarding,/companySearch|supplierSearch|Détecter par nom/i);
});

test('la recherche par nom ne remplace jamais automatiquement les données déjà renseignées', () => {
  const page=read('../../assets/js/pages/company-lookup.js');
  assert.match(page,/mergeRegistryFields\(currentValues,candidate,\{\}\)/);
  assert.match(page,/Seuls les champs vides ou non renseignés/);
  assert.match(page,/askConfirm/);
});
