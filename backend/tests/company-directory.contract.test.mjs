// D4/D5 (15.4.0) : la recherche d'entreprise par nom est retirée partout. Ce fichier remplace l'ancien contrat
// « recherche par nom disponible » par des tests d'absence ; la détection par identifiant (SIRET/SIREN) reste.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('la recherche par nom revient (15.4.5) par la route lookup unique, sans outil ni route dédiés', () => {
  assert.equal(existsSync(new URL('../../assets/js/pages/company-lookup.js', import.meta.url)), false);
  const dashboard=read('../../assets/js/pages/dashboard.js'),api=read('../../assets/js/core/api.js'),business=read('../src/routes/business.ts'),registry=read('../src/services/public-registry.ts');
  // Aucun outil ni menu dédié hérité : le nom passe par la détection existante au clic.
  assert.doesNotMatch(dashboard,/companyLookup|Recherche entreprise/);
  assert.doesNotMatch(api,/companySearch|supplierSearch|suppliers\/search/);
  // Route unique : l'identifiant (SIRET/SIREN) et le nom sont servis par GET /suppliers/lookup.
  assert.doesNotMatch(business,/'\/suppliers\/search'/);
  assert.match(business,/searchFrenchCompaniesByName/);
  assert.match(registry,/searchFrenchCompaniesByName/);
  assert.match(registry,/api\.gouv\.fr\/search/);
  for (const file of ['../../assets/js/pages/onboarding.js','../../assets/js/pages/dash/settings.js','../../assets/js/pages/dash/suppliers.js']) {
    const source=read(file);
    assert.doesNotMatch(source,/lookup-supplier-name|lookup-company-name|companySearch|supplierSearch/i, file);
    assert.match(source,/renderCompanyChoices/, file);
  }
});

test('la question « votre entreprise existe-t-elle ? » n’est plus posée (D5)', () => {
  const onboarding=read('../../assets/js/pages/onboarding.js');
  assert.doesNotMatch(onboarding,/existe-t-elle|business_status|to_create|entreprise à créer/i);
});

test('la détection par identifiant reste unique et partagée (parcours + Paramètres)', () => {
  const detect=read('../../assets/js/core/company-detect.js');
  // Bloc 7 (15.4.6) : le module unique route vers /suppliers/lookup (fournisseurs, toutes formes)
  // ou /organization/registry-lookup (compte de l'entrepreneur, EI uniquement) selon options.owner.
  assert.match(detect,/api\.supplierLookup\(id\)/);
  assert.match(detect,/api\.ownerRegistryLookup\(id\)/);
  // 15.4.5 : la saisie non numérique route vers la recherche par nom dans le même module.
  assert.match(detect,/lookup\(check\.digits\)/);
  assert.match(read('../../assets/js/pages/onboarding.js'),/from'\.\.\/core\/company-detect\.js'/);
  assert.match(read('../../assets/js/pages/dash/settings.js'),/from'\.\.\/\.\.\/core\/company-detect\.js'/);
});
