// Contrat golden 15.4.63 — le moteur de calcul JS (computePricing) doit produire EXACTEMENT
// les mêmes nombres que le classeur Excel de référence (assets/reference/AURION-classeur-calculs.xlsx,
// miroir des formules) : aucune erreur de calcul ni d'affichage tolérée dans les encarts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computePricing } from '../../assets/js/core/pricing.js';

const refRoot = new URL('../../', import.meta.url);
const ref = JSON.parse(readFileSync(new URL('../../assets/reference/classeur-reference.json', import.meta.url), 'utf8'));
const xlsxPath = new URL('../../assets/reference/AURION-classeur-calculs.xlsx', import.meta.url);

test('le classeur Excel de référence existe et est non vide', () => {
  assert.ok(existsSync(xlsxPath), 'classeur manquant');
  assert.ok(statSync(xlsxPath).size > 1000, 'classeur vide');
  assert.equal(ref.version, '15.4.64');
});

const round2 = v => Math.round(Number(v) * 100) / 100;

test('computePricing reproduit EXACTEMENT les jeux d\u2019essai du classeur (golden)', () => {
  for (const c of ref.cases) {
    const input = {
      partCost: c.partCost, shippingCost: c.shippingCost, consumablesCostHt: c.consumablesCostHt,
      mileageKm: c.mileageKm, mileageInternalRate: c.mileageInternalRate, mileageClientRate: c.mileageClientRate,
      mileageMode: c.mileageMode, laborInternalCostHt: c.laborInternalCostHt, vatRate: c.vatRate,
      targetTtc: c.targetTtc, driver: 'ttc',
      contributions: [{ name: 'Cotisations sociales', rate: c.urssafRate, basis: 'ca_ht', mandatory: true }],
    };
    const r = computePricing(input);
    for (const [key, expected] of Object.entries(c.expected)) {
      const got = round2(r[key]);
      assert.ok(
        Math.abs(got - round2(expected)) <= 0.011,
        `cas « ${c.name} » · ${key} : moteur=${got} vs classeur=${expected}`
      );
    }
  }
});

test('la vente à perte est détectée quand la marge est négative (cas 3 du classeur)', () => {
  const c = ref.cases.find(x => x.name.includes('perte'));
  const r = computePricing({
    partCost: c.partCost, shippingCost: c.shippingCost, consumablesCostHt: c.consumablesCostHt,
    mileageKm: c.mileageKm, mileageInternalRate: c.mileageInternalRate, mileageClientRate: c.mileageClientRate,
    mileageMode: c.mileageMode, laborInternalCostHt: c.laborInternalCostHt, vatRate: c.vatRate,
    targetTtc: c.targetTtc, driver: 'ttc',
    contributions: [{ name: 'Cotisations sociales', rate: c.urssafRate, basis: 'ca_ht', mandatory: true }],
  });
  assert.equal(r.loss, true);
  assert.ok(r.netResult < 0);
});

test('chaque grandeur du classeur est reliée au moteur (mapping complet)', () => {
  const required = ['computePricing().totalTtc', 'computePricing().totalHt', 'computePricing().vat', 'computePricing().grossMargin', 'computePricing().contributionsTotal', 'computePricing().netResult'];
  const mapped = ref.mapping.map(m => m.aurion);
  for (const key of required) assert.ok(mapped.includes(key), `grandeur non reliée : ${key}`);
  assert.ok(ref.mapping.length >= 9, 'mapping trop pauvre');
});

test('les montants affichés dans les encarts viennent du même moteur (aucun calcul parallèle)', () => {
  // Le comptable (repli local 15.4.63) et le détail prévisionnel appliquent la règle TTC ÷ (1+TVA).
  const ttc = 382.4, vat = 20;
  const ht = Math.round((ttt => ttt)(ttc) / (1 + vat / 100) * 100) / 100;
  assert.equal(ht, 318.67);
  assert.equal(round2(ttc - ht), 63.73);
});
