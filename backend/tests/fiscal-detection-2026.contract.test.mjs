// Contrats P0 (15.4.36) — TVA et cotisations micro-sociales.
// 1) La franchise en base de TVA n'est JAMAIS déduite du seul statut micro :
//    elle se constate sur le chiffre d'affaires de l'année précédente ou sur une option.
//    Seuils 2026 : 85 000 / 93 500 € (vente) et 37 500 / 41 250 € (services).
// 2) La CFP suit le caractère commercial (0,10 %) ou artisanal (0,30 %) de l'activité BIC.
// 3) Les professions CIPAV relèvent de 23,20 %, jamais de la branche BNC générique à 25,60 %.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFiscalSettings,
  detectContributionPresets,
  detectVatRegime,
  microCategoryFor,
  VAT_FRANCHISE_THRESHOLDS_2026,
  PROFILE_MICRO_CATEGORY,
} from '../dist/services/fiscal-detection.js';
import { PROFILE_CODES } from '../dist/services/profiles.js';

const ratesOf = result => Object.fromEntries(result.contributions.map(x => [x.name, x.rate]));

test('TVA 2026 : le régime micro n’implique pas la franchise en base', () => {
  const unknownRevenue = detectFiscalSettings('EI_MICRO', 'plumbing', 'Dépannage plomberie', '');
  assert.equal(unknownRevenue.vatFranchise, false, 'aucun taux 0 % sans preuve de franchise');
  assert.equal(unknownRevenue.vatRate, 20, 'la TVA est due par défaut, jamais 0 %');
  assert.equal(unknownRevenue.vatToConfirm, true);
  assert.match(unknownRevenue.vatRegime, /À CONFIRMER/);
  assert.match(unknownRevenue.vatReason, /régime micro-social ne suffit pas/);
});

test('TVA 2026 : seuils services 37 500 € / 41 250 €', () => {
  assert.deepEqual(VAT_FRANCHISE_THRESHOLDS_2026.services, { base: 37500, majore: 41250, label: 'prestations de services' });
  assert.equal(detectVatRegime({ category: 'services', annualRevenueHt: 30000 }).rate, 0);
  assert.equal(detectVatRegime({ category: 'services', annualRevenueHt: 41250 }).rate, 0);
  assert.equal(detectVatRegime({ category: 'services', annualRevenueHt: 41251 }).rate, 20);
  // Entre le seuil de base et le seuil majoré : franchise maintenue pour l'année en cours.
  const tolerance = detectVatRegime({ category: 'services', annualRevenueHt: 40000 });
  assert.equal(tolerance.rate, 0);
  assert.equal(tolerance.toConfirm, false);
  assert.match(tolerance.regime, /franchise maintenue/);
});

test('TVA 2026 : seuils vente 85 000 € / 93 500 €', () => {
  assert.deepEqual(VAT_FRANCHISE_THRESHOLDS_2026.vente, { base: 85000, majore: 93500, label: 'vente de marchandises et fourniture de logement' });
  assert.equal(detectVatRegime({ category: 'vente', annualRevenueHt: 60000 }).rate, 0);
  assert.equal(detectVatRegime({ category: 'vente', annualRevenueHt: 90000 }).rate, 0);
  assert.equal(detectVatRegime({ category: 'vente', annualRevenueHt: 100000 }).rate, 20);
});

test('TVA 2026 : option et assujettissement explicites priment, une option volontaire n’est jamais 0 %', () => {
  assert.equal(detectVatRegime({ category: 'services', vatRegime: 'franchise' }).rate, 0);
  assert.equal(detectVatRegime({ category: 'services', vatRegime: 'franchise' }).toConfirm, false);
  assert.equal(detectVatRegime({ category: 'services', vatRegime: 'assujetti_option' }).rate, 20);
  assert.equal(detectFiscalSettings('EI_MICRO', 'consulting', 'Conseil', '', { vatRegime: 'assujetti' }).vatRate, 20);
});

test('cotisations : CFP commerçant 0,10 % pour la vente, artisan 0,30 % pour les services BIC', () => {
  const sale = detectContributionPresets('EI_MICRO', 'retail', 'Boutique de détail', '');
  assert.equal(sale.category, 'vente_bic');
  assert.equal(sale.socialRate, 12.3);
  assert.equal(sale.cfpRate, 0.1);

  const artisan = detectContributionPresets('EI_MICRO', 'plumbing', 'Dépannage plomberie', '');
  assert.equal(artisan.category, 'services_bic');
  assert.equal(artisan.socialRate, 21.2);
  assert.equal(artisan.cfpRate, 0.3, 'artisan : CFP 0,30 %');

  const commercial = detectContributionPresets('EI_MICRO', 'plumbing', 'Dépannage plomberie', '', null, true);
  assert.equal(commercial.category, 'services_bic');
  assert.equal(commercial.cfpRate, 0.1, 'activité commerciale : CFP 0,10 % même en services BIC');
});

test('cotisations : CIPAV à 23,20 %, BNC générique à 25,60 %', () => {
  const cipav = detectContributionPresets('EI_MICRO', 'consulting', 'Avocat en droit des affaires', '');
  assert.equal(cipav.category, 'services_bnc_cipav');
  assert.equal(cipav.socialRate, 23.2);
  assert.equal(cipav.cfpRate, 0.2);
  assert.equal(ratesOf(cipav)['Cotisations sociales micro-social'], 23.2);

  const bnc = detectContributionPresets('EI_MICRO', 'consulting', 'Consultant en organisation', '');
  assert.equal(bnc.category, 'services_bnc');
  assert.equal(bnc.socialRate, 25.6);
  assert.equal(bnc.cfpRate, 0.2);
});

test('cotisations : catégorie déduite du code APE quand les mots-clés ne tranchent pas', () => {
  assert.equal(microCategoryFor('generic-services', 'Prestation de service', '62.01'), 'services_bnc');
  assert.equal(microCategoryFor('handcraft', 'Création artisanale', '47.91'), 'vente_bic');
  assert.equal(microCategoryFor('consulting', 'Activité libérale', '69.10'), 'services_bnc_cipav');
});

test('cotisations : chaque métier reçoit des lignes cohérentes (aucune activité sans cotisations)', () => {
  for (const code of PROFILE_CODES) {
    const category = PROFILE_MICRO_CATEGORY[code];
    assert.ok(category, `catégorie micro manquante pour ${code}`);
    const result = detectContributionPresets('EI_MICRO', code, '', '');
    assert.ok(result.contributions.length >= 2, `cotisations absentes pour ${code}`);
    if (category === 'specific') {
      assert.equal(result.socialRate, null, `${code} : un régime spécifique ne reçoit pas de faux taux fixe`);
      assert.ok(result.contributions.every(x => x.variable === true), `${code} : cotisations variables attendues`);
    } else {
      assert.ok(result.contributions.every(x => typeof x.rate === 'number'), `${code} : taux manquant`);
      assert.ok(result.contributions.some(x => /formation professionnelle/i.test(x.name)), `${code} : CFP manquante`);
    }
  }
});

test('les quatre taux de référence restent ceux du référentiel 2026', () => {
  assert.equal(detectContributionPresets('EI_MICRO', 'retail', '', '').socialRate, 12.3);
  assert.equal(detectContributionPresets('EI_MICRO', 'plumbing', '', '').socialRate, 21.2);
  assert.equal(detectContributionPresets('EI_MICRO', 'consulting', '', '').socialRate, 25.6);
  assert.equal(detectContributionPresets('EI_MICRO', 'consulting', 'Médecin libéral', '').socialRate, 23.2);
});
