// Bloc 7 — Recentrage exclusif sur les micro-entreprises.
// Le compte de l'entrepreneur est exclusivement une entreprise individuelle (micro ou réel).
// Les sociétés (SAS, SASU, SARL, EURL, SA, SNC, SCI, SEL…, associations, formes agricoles) ne sont
// plus proposées ni acceptées pour le PROFIL DU PROPRIÉTAIRE, sans conversion automatique ;
// elles restent acceptées comme tiers professionnels (clients, fournisseurs) — la détection
// fournisseur (GET /suppliers/lookup) n'est pas restreinte.
// Niveau 1 : contrat statique (sources) + unitaire sur le build compilé (dist/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('bloc7: la liste serveur des formes juridiques du propriétaire ne contient que les EI', () => {
  const fiscal = read('../src/services/fiscal-detection.ts');
  assert.match(fiscal, /export const OWNER_LEGAL_FORMS:LegalFormOption\[\]=\[\s*\{code:'EI_MICRO'/s);
  const ownerBlock = fiscal.match(/export const OWNER_LEGAL_FORMS:LegalFormOption\[\]=\[(.*?)\];/s)?.[1] || '';
  assert.doesNotMatch(ownerBlock, /SASU|SARL|EURL|SNC|SCI|ASSOCIATION/);
  const business = read('../src/routes/business.ts');
  assert.match(business, /app\.get\('\/legal-forms',async\(\)=>OWNER_LEGAL_FORMS\)/);
});

test('bloc7: PATCH /organization refuse une société pour le compte de l\'entrepreneur (422, sans conversion)', () => {
  const org = read('../src/routes/organizations.ts');
  assert.match(org, /LEGAL_FORM_OUT_OF_SCOPE/);
  assert.match(org, /isOwnerLegalFormAllowed/);
  assert.match(org, /OWNER_LEGAL_FORM_REFUSAL/);
});

test('bloc7: POST/PATCH /activities refusent également une forme juridique hors périmètre', () => {
  const business = read('../src/routes/business.ts');
  const count = (business.match(/LEGAL_FORM_OUT_OF_SCOPE/g) || []).length;
  assert.equal(count, 2, 'POST /activities et PATCH /activities doivent chacun contrôler le périmètre');
});

test('bloc7: la détection registre du propriétaire est une route dédiée et refusante (out_of_scope)', () => {
  const org = read('../src/routes/organizations.ts');
  assert.match(org, /\/organization\/registry-lookup/);
  assert.match(org, /out_of_scope/);
  assert.match(org, /isEIJuridique/);
  // La détection fournisseurs reste ouverte à toutes les formes juridiques (tiers professionnels).
  const business = read('../src/routes/business.ts');
  assert.match(business, /app\.get\('\/suppliers\/lookup'/);
});

test('bloc7: la détection par nom ne propose plus de forme sociale (aucune conversion)', () => {
  const fiscal = read('../src/services/fiscal-detection.ts');
  assert.match(fiscal, /societyRules/);
  assert.doesNotMatch(fiscal, /\[\/\\b\(eurl\)\\b\/,'EURL — entreprise unipersonnelle à responsabilité limitée'\]/);
  assert.match(fiscal, /OWNER_LEGAL_FORM_REFUSAL/);
});

test('bloc7: le parcours et les Paramètres refusent explicitement une entreprise hors périmètre', () => {
  const detect = read('../../assets/js/core/company-detect.js');
  assert.match(detect, /export function isOutOfScopeCompany/);
  assert.match(detect, /OWNER_SCOPE_REFUSAL/);
  assert.match(detect, /options\?\.owner===true/);
  assert.match(detect, /api\.ownerRegistryLookup/);
  const onboarding = read('../../assets/js/pages/onboarding.js');
  const settings = read('../../assets/js/pages/dash/settings.js');
  for (const [name, src] of [['onboarding', onboarding], ['settings', settings]]) {
    assert.match(src, /isOutOfScopeCompany/, name);
    assert.match(src, /OWNER_SCOPE_REFUSAL/, name);
    assert.match(src, /\{owner:true\}/, name);
    assert.match(src, /status==='out_of_scope'/, name);
  }
  // Les fournisseurs gardent la détection ouverte (aucun restriction owner).
  const suppliers = read('../../assets/js/pages/dash/suppliers.js');
  assert.doesNotMatch(suppliers, /\{owner:true\}/);
});

test('bloc7: API — la méthode ownerRegistryLookup pointe sur la route dédiée', () => {
  const api = read('../../assets/js/core/api.js');
  assert.match(api, /ownerRegistryLookup:identifier=>request\(`\/organization\/registry-lookup\?identifier=/);
});

test('bloc7: unitaire (build) — options EI uniquement, refus société, historique intact', async () => {
  const dist = new URL('../dist/services/fiscal-detection.js', import.meta.url);
  const mod = await import(dist.pathname);
  assert.equal(mod.OWNER_LEGAL_FORMS.length, 2);
  assert.deepEqual(mod.OWNER_LEGAL_FORMS.map(x => x.code), ['EI_MICRO', 'EI_REEL']);
  assert.equal(mod.isOwnerLegalFormAllowed('Entreprise individuelle — micro-entreprise'), true);
  assert.equal(mod.isOwnerLegalFormAllowed('Entreprise individuelle — régime réel'), true);
  assert.equal(mod.isOwnerLegalFormAllowed('micro-entreprise'), true);
  assert.equal(mod.isOwnerLegalFormAllowed('SARL — société à responsabilité limitée'), false);
  assert.equal(mod.isOwnerLegalFormAllowed('SASU — société par actions simplifiée unipersonnelle'), false);
  assert.equal(mod.isOwnerLegalFormAllowed('EURL — entreprise unipersonnelle à responsabilité limitée'), false);
  assert.equal(mod.isOwnerLegalFormAllowed('Association loi 1901'), false);
  // Catégories juridiques INSEE : EI accepté, sociétés refusées.
  assert.equal(mod.isEIJuridique('1000'), true);
  assert.equal(mod.isEIJuridique('1990'), true);
  assert.equal(mod.isEIJuridique('5410'), false);
  assert.equal(mod.isEIJuridique('5710'), false);
  // Détection par nom : micro reconnu, société refusée explicitement sans conversion.
  const okDetect = mod.detectLegalFormFromProfile('Auto-entrepreneur', 'réparation de smartphones à domicile');
  assert.equal(okDetect.legalFormCode, 'EI_MICRO');
  const koDetect = mod.detectLegalFormFromProfile('Groupe Dubois', 'SARL de réparation automobile');
  assert.equal(koDetect.legalForm, null);
  assert.match(koDetect.message, /exclusivement pour les entreprises individuelles/);
  // Le régime des valeurs HISTORIQUES (déjà enregistrées) reste calculable, sans réécriture.
  const legacy = mod.detectFiscalSettings('SARL — société à responsabilité limitée', 'auto', 'Garage Dubois', '');
  assert.match(legacy.socialRegime, /Travailleur indépendant/);
  const legacyMicro = mod.detectFiscalSettings('Entreprise individuelle — micro-entreprise', 'auto', 'Réparation smartphone', '');
  assert.equal(legacyMicro.socialRate, 21.5);
});
