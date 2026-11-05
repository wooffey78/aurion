// D4/D5 (15.4.0) : la recherche d'entreprise par nom est retirée partout. Ce fichier remplace l'ancien contrat
// « recherche par nom disponible » par des tests d'absence ; la détection par identifiant (SIRET/SIREN) reste.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('la recherche par nom n’existe plus (outil, menu, API client et route serveur)', () => {
  assert.equal(existsSync(new URL('../../assets/js/pages/company-lookup.js', import.meta.url)), false);
  const dashboard=read('../../assets/js/pages/dashboard.js'),api=read('../../assets/js/core/api.js'),business=read('../src/routes/business.ts'),registry=read('../src/services/public-registry.ts');
  assert.doesNotMatch(dashboard,/companyLookup|Recherche entreprise/);
  assert.doesNotMatch(api,/companySearch|supplierSearch|suppliers\/search/);
  assert.doesNotMatch(business,/'\/suppliers\/search'|searchFrenchCompanies/);
  assert.doesNotMatch(registry,/searchFrenchCompanies/);
  for (const file of ['../../assets/js/pages/onboarding.js','../../assets/js/pages/dash/settings.js','../../assets/js/pages/dash/suppliers.js']) {
    assert.doesNotMatch(read(file),/Détecter par nom|lookup-supplier-name|lookup-company-name|companySearch|supplierSearch/i, file);
  }
});

test('la question « votre entreprise existe-t-elle ? » n’est plus posée (D5)', () => {
  const onboarding=read('../../assets/js/pages/onboarding.js');
  assert.doesNotMatch(onboarding,/existe-t-elle|business_status|to_create|entreprise à créer/i);
});

test('la détection par identifiant reste unique et partagée (parcours + Paramètres)', () => {
  const detect=read('../../assets/js/core/company-detect.js');
  assert.match(detect,/api\.supplierLookup\(check\.digits\)/);
  assert.match(read('../../assets/js/pages/onboarding.js'),/from'\.\.\/core\/company-detect\.js'/);
  assert.match(read('../../assets/js/pages/dash/settings.js'),/from'\.\.\/\.\.\/core\/company-detect\.js'/);
});
