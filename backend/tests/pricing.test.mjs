import test from 'node:test';
import assert from 'node:assert/strict';
import { computePricing as browser } from '../../assets/js/core/pricing.js';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
const { computePricing: server } = await import('../dist/services/pricing.js');

const base = { partCost: 45, shippingCost: 5, vatRate: 20, urssafRate: 22 };

test('prix TTC fixé : la marge s\'adapte quand le prix baisse', () => {
  const a = server({ ...base, targetTtc: 120, driver: 'ttc' });
  const b = server({ ...base, targetTtc: 90, driver: 'ttc' });
  assert.equal(a.totalHt, 100); assert.equal(a.vat, 20); assert.equal(a.laborHt, 50); assert.equal(a.urssafEstimate, 22); assert.equal(a.netMargin, 28);
  assert.equal(b.totalHt, 75); assert.equal(b.laborHt, 25); assert.ok(b.netMargin < a.netMargin);
});
test('marge nette voulue : le prix TTC est retrouvé exactement', () => {
  const r = server({ ...base, targetNet: 28, driver: 'net' });
  assert.equal(r.totalTtc, 120); assert.equal(r.netMargin, 28);
  const back = server({ ...base, targetTtc: r.totalTtc, driver: 'ttc' });
  assert.equal(back.netMargin, 28);
});
test('vente à perte signalée, jamais masquée', () => {
  const r = server({ ...base, targetTtc: 48, driver: 'ttc' });
  assert.ok(r.laborHt < 0); assert.equal(r.loss, true);
});
test('sans TVA ni cotisations', () => {
  const r = server({ partCost: 10, shippingCost: 0, vatRate: 0, urssafRate: 0, targetTtc: 50, driver: 'ttc' });
  assert.equal(r.vat, 0); assert.equal(r.laborHt, 40); assert.equal(r.netMargin, 40);
});

test("coefficient 0 est conservé et le coefficient s'applique aux pièces avant livraison et taxes", () => {
  const zero = server({ ...base, coefficientPercent: 0, targetTtc: 120, driver: 'ttc' });
  assert.equal(zero.purchaseHt, 45);
  const ten = server({ ...base, coefficientPercent: 10, targetTtc: 132, driver: 'ttc' });
  assert.equal(ten.purchaseHt, 45);
  assert.equal(ten.minimumSellingHt, 54.5);
  assert.equal(ten.totalHt, 110);
  assert.equal(ten.vat, 22);
});

test('coefficient sur marge : les achats restent intacts et la marge est majorée', () => {
  const r = server({ ...base, coefficientBasis:'margin', coefficientPercent:10, targetTtc:120, driver:'ttc' });
  assert.equal(r.purchaseHt,45);
  assert.equal(r.grossMargin,50);
  assert.equal(r.urssafEstimate,22);
  assert.equal(r.netMargin,28);
});
test('valeurs invalides refusées', () => {
  assert.throws(() => server({ ...base, targetTtc: -1 }));
  assert.throws(() => server({ ...base, urssafRate: 100, targetTtc: 10 }));
});
test('copie navigateur identique au serveur (200 cas)', () => {
  for (let i = 0; i < 200; i++) {
    const inp = { partCost: (i * 7.31) % 300, shippingCost: (i * 1.7) % 20, vatRate: [0, 5.5, 10, 20][i % 4], urssafRate: [0, 12.3, 22, 24.6][i % 4], targetTtc: 20 + ((i * 13.37) % 900), targetNet: (i * 3.1) % 200, driver: i % 2 ? 'net' : 'ttc' };
    assert.deepEqual(browser(inp), server(inp));
  }
});

test('frais kilométriques : marge déduite, TTC de base inchangé', () => {
  const r = server({ partCost: 100, shippingCost: 0, mileageKm: 50, mileageInternalRate: 1, mileageClientRate: 1, vatRate: 0, urssafRate: 0, targetTtc: 200, driver: 'ttc', mileageMode: 'margin' });
  assert.equal(r.totalTtc, 200);
  assert.equal(r.grossMargin, 50);
  assert.equal(r.mileageBilledTtc, 0);
});

test('frais kilométriques : surcharge client en plus du TTC de base', () => {
  const r = server({ partCost: 100, shippingCost: 0, mileageKm: 50, mileageInternalRate: 1, mileageClientRate: 1, vatRate: 0, urssafRate: 0, targetTtc: 200, driver: 'ttc', mileageMode: 'client_price' });
  assert.equal(r.baseTtc, 200);
  assert.equal(r.totalTtc, 250);
  assert.equal(r.grossMargin, 100);
});

test('frais kilométriques : calcul inverse en pilotage net', () => {
  const r = server({ partCost: 20, shippingCost: 0, mileageKm: 50, mileageRate: 0.60, vatRate: 20, urssafRate: 20, targetNet: 30, driver: 'net', mileageMode: 'margin' });
  assert.equal(r.mileageTotal, 30);
  assert.equal(r.netMargin, 30);
});
