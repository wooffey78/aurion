// Prompt 03 — extensions du moteur de calcul (15.4.49) : taux de marque, consommables dans
// les coûts directs et le prix plancher, remise TTC tracée. Tests aux limites et PARITÉ
// navigateur/serveur (miroir généré), sur le modèle de pricing.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computePricing as browser } from '../../assets/js/core/pricing.js';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
const { computePricing: server } = await import('../dist/services/pricing.js');

const base = { partCost: 45, shippingCost: 5, vatRate: 20, urssafRate: 22, targetTtc: 120, driver: 'ttc' };

test('comportement historique inchangé : sans les nouveaux champs, aucun écart', () => {
  const r = server(base);
  assert.equal(r.totalHt, 100); assert.equal(r.vat, 20); assert.equal(r.totalTtc, 120);
  assert.equal(r.directCostsHt, 50); // pièces 45 + livraison 5
  assert.equal(r.consumablesCostHt, 0);
  assert.equal(r.discountTtc, 0);
  assert.equal(r.listPriceTtc, 120);
  assert.equal(r.markupRate, 50); // marge 50 / PV HT 100
});

test('taux de marque : marge brute / prix de vente HT (≠ taux de marge assis sur le CA)', () => {
  const r = server({ ...base, targetTtc: 132, coefficientPercent: 10 });
  // PV HT 110, marge 55.5 → taux de marque = 55.5/110 = 50.45 % (arrondi demi-vers-le-haut)
  assert.equal(r.grossMarginRate, 50.45);
  assert.equal(r.markupRate, 50.45);
  const zero = server({ partCost: 0, shippingCost: 0, vatRate: 0, targetTtc: 0 });
  assert.equal(zero.markupRate, 0); // jamais NaN sur PV nul
});

test('consommables : intégrés aux coûts directs et au prix plancher, 0 par défaut', () => {
  const withC = server({ ...base, consumablesCostHt: 60 });
  assert.equal(withC.consumablesCostHt, 60);
  assert.equal(withC.directCostsHt, 110); // 45 + 5 + 60
  // Prix plancher : 45 + 5 + 60 = 110 HT — vendre 120 TTC (100 HT HT-base) est sous le plancher.
  assert.equal(withC.belowMinimumPrice, true);
  assert.equal(withC.minimumSellingHt, 110);
});

test('remise TTC : tracée (listPriceTtc − discountTtc), le TTC cible est réduit avant calcul', () => {
  const r = server({ ...base, targetTtc: 120, discountTtc: 20 });
  assert.equal(r.listPriceTtc, 120);
  assert.equal(r.discountTtc, 20);
  assert.equal(r.baseTargetTtc, 100);
  assert.equal(r.totalTtc, 100);
  assert.equal(r.totalHt, 83.33); // 100 / 1.2, arrondi demi-vers-le-haut au centime
  assert.equal(r.listPriceTtc - r.discountTtc, r.totalTtc);
});

test('remise refusée : au-delà du prix cible, et sur le calcul inverse (driver net)', () => {
  assert.throws(() => server({ ...base, discountTtc: 121 }), /dépasse le prix TTC cible/);
  assert.throws(() => server({ ...base, discountTtc: 10, driver: 'net', targetNet: 28 }), /driver/);
  // remise nulle : acceptée partout, aucun effet
  const r = server({ ...base, discountTtc: 0 });
  assert.equal(r.totalTtc, 120);
});

test('parité navigateur/serveur : les extensions donnent des résultats identiques', () => {
  const scenarios = [
    { ...base, consumablesCostHt: 7.35 },
    { ...base, discountTtc: 13.33 },
    { ...base, consumablesCostHt: 2.5, discountTtc: 5.05 },
    { partCost: 0.01, shippingCost: 0, vatRate: 5.5, urssafRate: 0, targetTtc: 0.02, driver: 'ttc', consumablesCostHt: 0.01 },
    { ...base, targetTtc: 90000, consumablesCostHt: 1234.56, discountTtc: 456.78 },
  ];
  for (const s of scenarios) {
    const a = server(s), b = browser(s);
    for (const key of ['totalHt', 'vat', 'totalTtc', 'directCostsHt', 'consumablesCostHt', 'discountTtc', 'listPriceTtc', 'markupRate', 'grossMargin', 'minimumSellingHt']) {
      assert.equal(b[key], a[key], `parité ${key} sur scénario ${JSON.stringify(s)}`);
    }
  }
});

test('valeurs invalides refusées (jamais de négatif silencieux)', () => {
  assert.throws(() => server({ ...base, consumablesCostHt: -1 }), /Valeur invalide/);
  assert.throws(() => server({ ...base, discountTtc: -5 }), /Valeur invalide/);
});
