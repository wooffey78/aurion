// Scénarios financiers dorés — moteur de calcul et cycle de paiement, sans base de données.
//
// Conventions verrouillées ici :
//  • une remise commerciale est un prix TTC négocié INFÉRIEUR au prix catalogue ; le moteur
//    ne stocke pas de champ « remise » séparé (le prix final reste la référence) ;
//  • un acompte est la première échéance d'un échéancier, pas une ligne comptable distincte ;
//  • chaque montant est vérifié au centime : HT + TVA = TTC et payé + restant = TTC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computePricing } from '../src/services/pricing.ts';
import {
  allocateInstallmentPayments,
  buildInstallmentPlan,
  calculateInvoicePayment,
} from '../src/services/invoice-workflow.ts';

const euro = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function assertTotals(result, expected, label) {
  assert.equal(euro(result.totalHt), expected.totalHt, `${label} — HT`);
  assert.equal(euro(result.vat), expected.vat, `${label} — TVA`);
  assert.equal(euro(result.totalTtc), expected.totalTtc, `${label} — TTC`);
  assert.equal(euro(result.totalHt + result.vat), euro(result.totalTtc), `${label} — invariant HT + TVA = TTC`);
}

// Coûts communs aux scénarios de déplacement :
// 500 € de pièces, 25 € de livraison, 80 € de main-d’œuvre interne,
// 120 km à 0,45 €/km en coût interne et 0,65 €/km refacturé au client.
const MOBILITE = {
  partCost: 500,
  shippingCost: 25,
  laborInternalCostHt: 80,
  mileageKm: 120,
  mileageInternalRate: 0.45,
  mileageClientRate: 0.65,
  vatRate: 20,
  urssafRate: 0,
};

test('TVA 20 %, 10 % et 0 % — le TTC saisi reste la référence, HT + TVA = TTC', () => {
  const vingt = computePricing({ partCost: 100, shippingCost: 10, laborInternalCostHt: 20, targetTtc: 240, vatRate: 20, urssafRate: 0 });
  assertTotals(vingt, { totalHt: 200, vat: 40, totalTtc: 240 }, 'TVA 20 %');
  assert.equal(euro(vingt.grossMargin), 70, 'marge = 200 − (100 + 10 + 20)');

  const dix = computePricing({ partCost: 50, targetTtc: 165, vatRate: 10, urssafRate: 0 });
  assertTotals(dix, { totalHt: 150, vat: 15, totalTtc: 165 }, 'TVA 10 %');
  assert.equal(euro(dix.grossMargin), 100, 'marge = 150 − 50');

  const zero = computePricing({ laborSellingHt: 90, targetTtc: 90, vatRate: 0, urssafRate: 0 });
  assertTotals(zero, { totalHt: 90, vat: 0, totalTtc: 90 }, 'TVA 0 %');
  assert.equal(euro(zero.grossMargin), 90);
});

test('kilométrage client : le trajet est facturé en plus du prix de base, sans changer la marge de base', () => {
  const client = computePricing({ ...MOBILITE, targetTtc: 1200, mileageMode: 'client_price' });
  assertTotals(client, { totalHt: 1078, vat: 215.6, totalTtc: 1293.6 }, 'Kilométrage client');
  assert.equal(client.baseTtc, 1200, 'prix TTC de base conservé');
  assert.equal(client.mileageTotal, 78, '120 km × 0,65 €/km');
  assert.equal(client.billedMileageHt, 78);
  assert.equal(client.mileageBilledTtc, 93.6, '78 € HT × 1,20');
  assert.equal(euro(client.totalTtc), euro(client.baseTtc + client.mileageBilledTtc));
  assert.equal(client.directCostsHt, 659, 'pièces + livraison + main-d’œuvre interne + 54 € de coût kilométrique interne');
  assert.equal(euro(client.grossMargin), 419, 'marge = 1078 − 659');
});

test('kilométrage en marge : le trajet reste un coût interne, jamais facturé, et n’augmente pas le TTC', () => {
  const marge = computePricing({ ...MOBILITE, targetTtc: 1200, mileageMode: 'margin' });
  assertTotals(marge, { totalHt: 1000, vat: 200, totalTtc: 1200 }, 'Kilométrage en marge');
  assert.equal(marge.baseTtc, 1200);
  assert.equal(marge.totalTtc, 1200, 'aucun supplément kilométrique client');
  assert.equal(marge.mileageTotal, 54, '120 km × 0,45 €/km : coût interne conservé');
  assert.equal(marge.billedMileageHt, 0);
  assert.equal(marge.mileageBilledTtc, 0);
  assert.equal(marge.directCostsHt, 659);
  assert.equal(euro(marge.grossMargin), 341, 'marge = 1000 − 659');
});

test('remise : 120 € TTC sous le prix catalogue, avec TVA recalculée au centime', () => {
  const catalogue = computePricing({ ...MOBILITE, targetTtc: 1200, mileageMode: 'client_price' });
  const negocie = computePricing({ ...MOBILITE, targetTtc: 1080, mileageMode: 'client_price' });
  const remiseTtc = euro(catalogue.baseTtc - negocie.baseTtc);

  assert.equal(remiseTtc, 120, 'remise = 1 200 − 1 080');
  assert.equal(euro(remiseTtc * 100 / catalogue.baseTtc), 10, 'remise de 10 % sur le prix catalogue');
  assertTotals(negocie, { totalHt: 978, vat: 195.6, totalTtc: 1173.6 }, 'Prix négocié');
  assert.equal(euro(catalogue.totalTtc - negocie.totalTtc), remiseTtc, 'la remise porte sur le prix de base, pas sur le kilométrage');
  assert.equal(euro(negocie.baseTtc + negocie.mileageBilledTtc), negocie.totalTtc);
  assert.equal(negocie.grossMargin, 319, 'marge après remise = 978 − 659');
});

test('acompte, paiement partiel puis solde — payé + restant = TTC à chaque étape', () => {
  const facture = computePricing({ ...MOBILITE, targetTtc: 1080, mileageMode: 'client_price' });
  const total = facture.totalTtc;
  const plan = buildInstallmentPlan(total, {
    installments: [
      { dueAt: '2026-11-05', amount: 352.08 },
      { dueAt: '2026-12-05', amount: 234.72 },
      { dueAt: '2027-01-05', amount: 586.8 },
    ],
  });

  assert.equal(euro(plan.reduce((sum, row) => sum + row.amount, 0)), total, 'échéancier = TTC');
  assert.equal(plan[0].amount, 352.08, 'acompte de 30 %');
  assert.deepEqual(allocateInstallmentPayments(plan, 0).map(row => row.status), ['pending', 'pending', 'pending']);

  const acompte = calculateInvoicePayment(total, 0, 0, 352.08);
  assert.deepEqual(acompte, { amount: 352.08, dueTotal: 1173.6, paidAmount: 352.08, remaining: 821.52, status: 'partially_paid' });
  assert.equal(euro(acompte.paidAmount + acompte.remaining), total);
  assert.deepEqual(allocateInstallmentPayments(plan, acompte.paidAmount).map(row => ({ paid: row.amountPaid, status: row.status })), [
    { paid: 352.08, status: 'paid' },
    { paid: 0, status: 'pending' },
    { paid: 0, status: 'pending' },
  ]);

  const partiel = calculateInvoicePayment(total, 0, acompte.paidAmount, 200);
  assert.deepEqual(partiel, { amount: 200, dueTotal: 1173.6, paidAmount: 552.08, remaining: 621.52, status: 'partially_paid' });
  assert.equal(euro(partiel.paidAmount + partiel.remaining), total);
  assert.deepEqual(allocateInstallmentPayments(plan, partiel.paidAmount).map(row => ({ paid: row.amountPaid, status: row.status })), [
    { paid: 352.08, status: 'paid' },
    { paid: 200, status: 'partially_paid' },
    { paid: 0, status: 'pending' },
  ]);

  const solde = calculateInvoicePayment(total, 0, partiel.paidAmount, partiel.remaining);
  assert.deepEqual(solde, { amount: 621.52, dueTotal: 1173.6, paidAmount: 1173.6, remaining: 0, status: 'paid' });
  assert.equal(euro(solde.paidAmount + solde.remaining), total);
  assert.deepEqual(allocateInstallmentPayments(plan, solde.paidAmount).map(row => ({ paid: row.amountPaid, status: row.status })), [
    { paid: 352.08, status: 'paid' },
    { paid: 234.72, status: 'paid' },
    { paid: 586.8, status: 'paid' },
  ]);

  // L'invariant documentaire reste vrai pendant tout le cycle de règlement.
  assert.equal(euro(facture.totalHt + facture.vat), euro(facture.totalTtc));
});
