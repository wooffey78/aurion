import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);

const soffice = ['/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/local/bin/soffice'].some(p => existsSync(p))
  || (process.env.AURION_SOFFICE_PATH && existsSync(process.env.AURION_SOFFICE_PATH));
const skip = soffice ? false : 'LibreOffice absent : tests de recalcul du classeur sautés';

const { computePricing } = await import('../dist/services/pricing.js');
const { calculatePricingXlsx, comparePricingResults, pricingToWorkbookInputs } = await import('../dist/services/calc-engine/pricing-adapter.js');
const { getCalculationStatus } = await import('../dist/services/calc-engine/engine.js');

/** Phase A/C du référentiel : bibliothèque de scénarios de référence (ancien moteur = vérité). */
const SCENARIOS = {
  'TTC classique (TVA 20, km en marge)': {
    partCost: 45, shippingCost: 5, mileageKm: 12, mileageInternalRate: 0.35, mileageClientRate: 0.4,
    mileageMode: 'margin', vatRate: 20, urssafRate: 21.2, targetTtc: 1250, driver: 'ttc',
  },
  'TTC avec kilométrage refacturé au client': {
    partCost: 45, shippingCost: 5, mileageKm: 12, mileageInternalRate: 0.35, mileageClientRate: 0.4,
    mileageMode: 'client_price', vatRate: 20, urssafRate: 21.2, targetTtc: 1250, driver: 'ttc',
  },
  'Remise TTC traçable': {
    partCost: 45, shippingCost: 5, mileageKm: 12, mileageInternalRate: 0.35, mileageClientRate: 0.4,
    mileageMode: 'margin', vatRate: 20, urssafRate: 21.2, targetTtc: 1250, discountTtc: 120, driver: 'ttc',
  },
  'Franchise de TVA (0 %)': {
    partCost: 45, shippingCost: 5, mileageKm: 12, mileageInternalRate: 0.35, mileageClientRate: 0.4,
    mileageMode: 'margin', vatRate: 0, urssafRate: 21.2, targetTtc: 980, driver: 'ttc',
  },
  'TVA intermédiaire (10 %)': {
    partCost: 80, shippingCost: 0, mileageKm: 0, mileageInternalRate: 0, mileageClientRate: 0,
    mileageMode: 'margin', vatRate: 10, urssafRate: 21.2, targetTtc: 459.9, driver: 'ttc',
  },
  'Cotisations multi-assiettes (CA HT, marge, résultat)': {
    partCost: 45, shippingCost: 5, mileageKm: 12, mileageInternalRate: 0.35, mileageClientRate: 0.4,
    mileageMode: 'margin', vatRate: 20, targetTtc: 1250, driver: 'ttc',
    contributions: [
      { name: 'Micro-social', rate: 21.2, basis: 'ca_ht', mandatory: true },
      { name: 'CFP', rate: 0.3, basis: 'ca_ht', mandatory: true },
      { name: 'Retraite complémentaire', rate: 8, basis: 'gross_margin', mandatory: false },
      { name: 'Formation', rate: 2, basis: 'profit', mandatory: false },
    ],
  },
  'Driver net — taux agrégé seul': {
    partCost: 45, shippingCost: 5, mileageKm: 12, mileageInternalRate: 0.35, mileageClientRate: 0.4,
    mileageMode: 'margin', vatRate: 20, urssafRate: 21.2, targetNet: 500, driver: 'net',
  },
  'Driver net — cotisations mixtes': {
    partCost: 45, shippingCost: 5, mileageKm: 12, mileageInternalRate: 0.35, mileageClientRate: 0.4,
    mileageMode: 'margin', vatRate: 20, targetNet: 420, driver: 'net',
    contributions: [
      { name: 'Micro-social', rate: 21.2, basis: 'ca_ht', mandatory: true },
      { name: 'Retraite', rate: 6, basis: 'gross_margin', mandatory: false },
    ],
  },
  'Driver net — résultat visé 0 (classeur sans prix)': {
    partCost: 45, shippingCost: 5, mileageKm: 0, mileageInternalRate: 0, mileageClientRate: 0,
    mileageMode: 'margin', vatRate: 20, urssafRate: 21.2, targetNet: 0, driver: 'net',
  },
  'Main-d’œuvre vendue explicite (driver ttc)': {
    partCost: 45, shippingCost: 5, laborSellingHt: 320, laborInternalCostHt: 120, mileageKm: 12,
    mileageInternalRate: 0.35, mileageClientRate: 0.4, mileageMode: 'margin', vatRate: 20,
    urssafRate: 21.2, targetTtc: 1250, driver: 'ttc',
  },
  'Main-d’œuvre explicite sans prix cible': {
    partCost: 45, shippingCost: 5, laborSellingHt: 320, laborInternalCostHt: 120, mileageKm: 0,
    mileageInternalRate: 0, mileageClientRate: 0, mileageMode: 'margin', vatRate: 20,
    urssafRate: 21.2, targetTtc: 0, driver: 'ttc',
  },
  'Coefficient en euros × quantité': {
    partCost: 45, shippingCost: 5, mileageKm: 0, mileageInternalRate: 0, mileageClientRate: 0,
    mileageMode: 'margin', vatRate: 20, urssafRate: 21.2, targetTtc: 350, driver: 'ttc',
    coefficientValue: 7.5, coefficientUnit: 'euro', partQuantity: 3, coefficientBasis: 'purchase',
  },
  'Coefficient en pourcentage du coût d’achat': {
    partCost: 45, shippingCost: 5, mileageKm: 0, mileageInternalRate: 0, mileageClientRate: 0,
    mileageMode: 'margin', vatRate: 20, urssafRate: 21.2, targetTtc: 350, driver: 'ttc',
    coefficientValue: 15, coefficientUnit: 'percent', coefficientBasis: 'purchase',
  },
  'Montants élevés (borne haute réaliste)': {
    partCost: 99999.99, shippingCost: 9999.99, mileageKm: 500, mileageInternalRate: 1.25, mileageClientRate: 1.5,
    mileageMode: 'client_price', vatRate: 20, urssafRate: 21.2, targetTtc: 999999.99, driver: 'ttc',
  },
  'Arrondis sensibles (trois décimales saisies)': {
    partCost: 2.675, shippingCost: 0.145, mileageKm: 12.345, mileageInternalRate: 0.123456, mileageClientRate: 0.654321,
    mileageMode: 'margin', vatRate: 5.5, urssafRate: 21.2, targetTtc: 99.99, driver: 'ttc',
  },
  'Consommables + remise + km client': {
    partCost: 60, shippingCost: 10, consumablesCostHt: 7.5, mileageKm: 24, mileageInternalRate: 0.35,
    mileageClientRate: 0.45, mileageMode: 'client_price', vatRate: 20, urssafRate: 21.2,
    targetTtc: 1450.5, discountTtc: 50, driver: 'ttc',
  },
};

const MONEY_FIELDS = ['purchaseHt', 'coefficientMarkupHt', 'shippingHt', 'directCostsHt', 'consumablesCostHt',
  'internalLaborCostHt', 'mileageInternalRate', 'mileageClientRate', 'mileageTotal', 'billedMileageHt',
  'mileageBilledTtc', 'totalHt', 'vat', 'totalTtc', 'listPriceTtc', 'discountTtc', 'baseTargetTtc', 'baseTtc',
  'baseRevenueHt', 'laborHt', 'laborSellingHt', 'grossMargin', 'contributionsTotal', 'urssafEstimate',
  'netMargin', 'netResult', 'minimumSellingHt'];

test('statut du moteur classeur : modèle présent, LibreOffice disponible, version conforme', { skip }, async () => {
  const status = await getCalculationStatus();
  assert.equal(status.workbookPresent, true);
  assert.ok(status.libreOfficePath, 'LibreOffice doit être disponible');
  assert.equal(status.workbookVersion, status.engineRequires);
});

test('parité exacte ancien moteur ↔ classeur recalculé (scénarios de référence)', { skip }, async t => {
  const divergencesReport = [];
  for (const [name, input] of Object.entries(SCENARIOS)) {
    await t.test(name, async () => {
      const legacy = computePricing(input);
      const { result, raw } = await calculatePricingXlsx(input);
      const divergences = comparePricingResults(legacy, result);
      for (const field of MONEY_FIELDS) {
        assert.equal(result[field], legacy[field], `${name} · ${field} : classeur=${result[field]} moteur=${legacy[field]} (trace ${raw.traceId})`);
      }
      assert.equal(result.mileageKm, legacy.mileageKm, `${name} · mileageKm`);
      for (const field of ['grossMarginRate', 'markupRate', 'marginRate', 'netResultRate']) {
        assert.equal(result[field], legacy[field], `${name} · ${field} : classeur=${result[field]} moteur=${legacy[field]}`);
      }
      assert.equal(result.belowMinimumPrice, legacy.belowMinimumPrice, `${name} · belowMinimumPrice`);
      assert.equal(result.loss, legacy.loss, `${name} · loss`);
      assert.equal(result.driver, legacy.driver, `${name} · driver`);
      assert.equal(result.mileageMode, legacy.mileageMode, `${name} · mileageMode`);
      const legacyRows = legacy.contributions || [];
      const engineRows = result.contributions || [];
      assert.equal(engineRows.length, legacyRows.length, `${name} · nombre de cotisations`);
      legacyRows.forEach((row, i) => {
        assert.equal(engineRows[i].amount, row.amount, `${name} · cotisation ${i + 1} (${row.name}) : classeur=${engineRows[i].amount} moteur=${row.amount}`);
        assert.equal(engineRows[i].rate, row.rate, `${name} · taux cotisation ${i + 1}`);
        assert.equal(engineRows[i].basis, row.basis, `${name} · assiette cotisation ${i + 1}`);
        assert.equal(engineRows[i].name, row.name, `${name} · nom cotisation ${i + 1}`);
      });
      if (divergences.length) divergencesReport.push({ name, divergences });
    });
  }
  assert.deepEqual(divergencesReport, [], 'aucune divergence de rapport');
});

test('invariants financiers vérifiés sur chaque recalcul du classeur', { skip }, async () => {
  for (const input of Object.values(SCENARIOS)) {
    const { result, raw } = await calculatePricingXlsx(input);
    assert.equal(raw.controls.status, 'OK', `contrôles du classeur (trace ${raw.traceId})`);
    assert.ok(Math.abs(result.totalHt + result.vat - result.totalTtc) < 0.005, 'HT + TVA = TTC');
  }
});

test('écriture des entrées : valeurs uniquement, aucune interprétation de formule', { skip }, async () => {
  // Les entrées sont écrites comme valeurs (inlineStr/nombres) : une saisie malveillante ne
  // peut pas injecter une formule dans le classeur. Les champs numériques refusent une chaîne
  // « =1+1 » comme le moteur applicatif ; le champ texte (driver) la traite comme du texte.
  const legacy = computePricing({ partCost: 45, shippingCost: 5, mileageKm: 12, mileageInternalRate: 0.35, mileageClientRate: 0.4, mileageMode: 'margin', vatRate: 20, urssafRate: 21.2, targetTtc: 1250, driver: 'ttc' });
  const { result } = await calculatePricingXlsx({
    partCost: 45, shippingCost: 5, mileageKm: 12, mileageInternalRate: 0.35, mileageClientRate: 0.4,
    mileageMode: 'margin', vatRate: 20, urssafRate: 21.2, targetTtc: 1250,
    driver: '=1+1", "net")&IF(TRUE,', // tentative d'injection dans un champ texte
  });
  assert.equal(result.driver, 'ttc', 'l’injection reste une valeur inerte : le driver reste ttc');
  assert.equal(result.totalTtc, legacy.totalTtc);
});

test('isolation des calculs simultanés : aucune collision entre instances', { skip }, async () => {
  const a = { partCost: 45, shippingCost: 5, mileageKm: 12, mileageInternalRate: 0.35, mileageClientRate: 0.4, mileageMode: 'margin', vatRate: 20, urssafRate: 21.2, targetTtc: 1250, driver: 'ttc' };
  const b = { partCost: 800, shippingCost: 25, mileageKm: 60, mileageInternalRate: 0.5, mileageClientRate: 0.6, mileageMode: 'client_price', vatRate: 10, urssafRate: 12.3, targetTtc: 5250.75, driver: 'ttc' };
  const [ra, rb] = await Promise.all([calculatePricingXlsx(a), calculatePricingXlsx(b)]);
  assert.equal(ra.result.totalTtc, computePricing(a).totalTtc, 'calcul A inchangé par le calcul B');
  assert.equal(rb.result.totalTtc, computePricing(b).totalTtc, 'calcul B inchangé par le calcul A');
  assert.equal(ra.result.contributionsTotal, computePricing(a).contributionsTotal);
  assert.equal(rb.result.contributionsTotal, computePricing(b).contributionsTotal);
});

test('mappage des entrées : normalisation identique au moteur (virgules, quantité min, repli URSSAF)', { skip: false }, () => {
  const inputs = pricingToWorkbookInputs({
    partCost: '45,5', shippingCost: 5, mileageKm: 12, vatRate: 20, urssafRate: 21.2, targetTtc: 1250,
    driver: 'net', mileageMode: 'client_price',
  });
  assert.equal(inputs.IN_DOC_PART_COST, 45.5);
  assert.equal(inputs.IN_DOC_DRIVER, 'net');
  assert.equal(inputs.IN_DOC_MILEAGE_MODE, 'client_price');
  assert.equal(inputs.IN_CONTRIBUTION_1_NAME, 'Cotisations sociales');
  assert.equal(inputs.IN_CONTRIBUTION_1_RATE, 21.2);
  assert.equal(inputs.IN_CONTRIBUTION_1_BASIS, 'ca_ht');
  const invalid = () => pricingToWorkbookInputs({ partCost: -5, targetTtc: 100 });
  assert.throws(invalid, /Valeur invalide/, 'une entrée hors plage est refusée comme par le moteur');
});
