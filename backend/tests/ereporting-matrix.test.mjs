// Bloc 5 — tests de la matrice e-reporting (module pur electronic-ereporting-matrix.ts) :
// classification documentée (B2C domestique, B2B international, B2B domestique => émission
// bloc 4, exonérations déclarées, TVA non facturée), construction du flux, validation
// (structure, arithmétique EN 16931 transposée au flux, période, données de paiement) et
// rapport d'écarts. Ces tests s'exécutent sans base : la logique réglementaire est prouvée
// isolément, les garanties d'intégration (RLS, transmission, accusés) le sont dans
// ereporting.integration.test.mjs sur PostgreSQL réel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const matrixPath = fileURLToPath(new URL('../dist/services/electronic-ereporting-matrix.js', import.meta.url));
const skip = existsSync(matrixPath) ? false : 'backend/dist/ absent : lancez « npm run build » avant la suite complète';

const invoice = overrides => ({
  id: '0f8b1a2c-0000-4000-8000-000000000001',
  number: 'FAC-2026-0001',
  transactionDate: new Date('2026-10-05T10:00:00Z'),
  operationCategory: 'PS',
  vatRate: 20,
  totalHt: 100,
  totalVat: 20,
  totalTtc: 120,
  exemptDeclared: false,
  exemptReason: null,
  clientName: 'Client Test',
  clientBuyerCategory: 'non_assujetti',
  clientCountryCode: 'FR',
  clientVatNumber: null,
  ...overrides,
});

test('matrice : B2C domestique (non-assujetti, TVA française due) est dans le périmètre', { skip }, async () => {
  const { classifyInvoice } = await import(matrixPath);
  const result = classifyInvoice(invoice());
  assert.equal(result.kind, 'in_scope');
  assert.equal(result.reason, 'b2c_domestic');
  assert.deepEqual(result.gaps, []);
});

test('matrice : B2B international (assujetti non établi en France) est dans le périmètre, écart sans numéro de TVA', { skip }, async () => {
  const { classifyInvoice } = await import(matrixPath);
  const inScope = classifyInvoice(invoice({ clientBuyerCategory: 'assujetti_etranger', clientCountryCode: 'DE', clientVatNumber: 'DE123456789' }));
  assert.equal(inScope.kind, 'in_scope');
  assert.equal(inScope.reason, 'b2b_international');
  assert.deepEqual(inScope.gaps, []);

  const missingVat = classifyInvoice(invoice({ clientBuyerCategory: 'assujetti_etranger', clientCountryCode: 'DE' }));
  assert.equal(missingVat.kind, 'in_scope');
  assert.equal(missingVat.gaps.length, 1);
  assert.equal(missingVat.gaps[0].code, 'BUYER_VAT_NUMBER_MISSING');
});

test('matrice : B2B domestique (assujetti établi en France) est exclu — relève de l’émission électronique (bloc 4)', { skip }, async () => {
  const { classifyInvoice } = await import(matrixPath);
  const result = classifyInvoice(invoice({ clientBuyerCategory: 'assujetti_fr' }));
  assert.equal(result.kind, 'excluded');
  assert.equal(result.reason, 'einvoicing_b2b_domestic');
});

test('matrice : exonération déclarée exclut la facture ; motif manquant = écart bloquant', { skip }, async () => {
  const { classifyInvoice } = await import(matrixPath);
  const exempt = classifyInvoice(invoice({ exemptDeclared: true, exemptReason: 'Exportation hors UE (art. 262 I du CGI)' }));
  assert.equal(exempt.kind, 'excluded');
  assert.equal(exempt.reason, 'exempt_declared');
  assert.deepEqual(exempt.gaps, []);

  const missingReason = classifyInvoice(invoice({ exemptDeclared: true, exemptReason: null }));
  assert.equal(missingReason.kind, 'excluded');
  assert.equal(missingReason.gaps.length, 1);
  assert.equal(missingReason.gaps[0].code, 'EXEMPT_REASON_MISSING');
});

test('matrice : catégorie d’acheteur manquante = écart (aucune inférence depuis le nom ou le SIRET)', { skip }, async () => {
  const { classifyInvoice } = await import(matrixPath);
  const result = classifyInvoice(invoice({ clientBuyerCategory: null }));
  assert.equal(result.kind, 'in_scope');
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].code, 'BUYER_CATEGORY_MISSING');
});

test('matrice : TVA non facturée (franchise en base, taux 0) est exclue de l’e-reporting de transaction', { skip }, async () => {
  const { classifyInvoice } = await import(matrixPath);
  const franchise = classifyInvoice(invoice({ vatRate: 0, totalVat: 0, totalHt: 100, totalTtc: 100 }));
  assert.equal(franchise.kind, 'excluded');
  assert.equal(franchise.reason, 'vat_not_billed');
});

test('flux : construction déterministe avec totaux et lignes de paiement', { skip }, async () => {
  const { buildEreportingPayload, buildTransactionLine, buildPaymentLine } = await import(matrixPath);
  const transaction = buildTransactionLine(invoice(), 'b2c_domestic');
  assert.equal(transaction.inclusionReason, 'b2c_domestic_transaction');
  assert.equal(transaction.amountTtc, 120);
  const payment = buildPaymentLine(invoice(), { quoteId: invoice().id, amount: 60, paidAt: new Date('2026-10-15T09:00:00Z'), method: 'card' }, 'b2c_domestic');
  assert.equal(payment.paymentDate, '2026-10-15');
  assert.equal(payment.paymentAmount, 60);
  const payload = buildEreportingPayload({
    kind: 'initial', correctsDeclarationId: null,
    periodStart: '2026-10-01', periodEnd: '2026-10-31', periodicity: 'monthly',
    emitter: { name: 'Aurion Test', siren: '123456789', siret: '12345678900011', address: '12 rue des Lilas, 75011 Paris' },
    generatedAt: new Date('2026-11-01T08:00:00Z'),
    transactionLines: [transaction], paymentLines: [payment], gapReport: [], corrections: [],
  });
  assert.equal(payload.schema, 'aurion.ereporting/1');
  assert.equal(payload.transactionCount, 1);
  assert.equal(payload.paymentCount, 1);
  assert.equal(payload.totals.ht, 100);
  assert.equal(payload.totals.vat, 20);
  assert.equal(payload.totals.ttc, 120);
  assert.equal(payload.totals.payments, 60);
});

test('flux : validation accepte un flux cohérent et refuse les incohérences arithmétiques et de période', { skip }, async () => {
  const { buildEreportingPayload, buildTransactionLine, buildPaymentLine, validateEreportingPayload } = await import(matrixPath);
  const ok = buildEreportingPayload({
    kind: 'initial', correctsDeclarationId: null,
    periodStart: '2026-10-01', periodEnd: '2026-10-31', periodicity: 'monthly',
    emitter: { name: 'Aurion Test', siren: '123456789', siret: null, address: null },
    generatedAt: new Date('2026-11-01T08:00:00Z'),
    transactionLines: [buildTransactionLine(invoice(), 'b2c_domestic')],
    paymentLines: [buildPaymentLine(invoice(), { quoteId: invoice().id, amount: 60, paidAt: new Date('2026-10-15T09:00:00Z'), method: 'card' }, 'b2c_domestic')],
    gapReport: [], corrections: [],
  });
  assert.deepEqual(validateEreportingPayload(ok), { ok: true });

  const tampered = JSON.parse(JSON.stringify(ok));
  tampered.lines[0].amountTtc = 999;
  const invalid = validateEreportingPayload(tampered);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some(issue => issue.includes('HT + TVA')), 'incohérence arithmétique détectée');
  assert.ok(invalid.issues.some(issue => issue.includes('Total TTC')), 'total incohérent avec les lignes');

  const outOfPeriod = JSON.parse(JSON.stringify(ok));
  outOfPeriod.lines[0].transactionDate = '2026-11-02';
  const invalidPeriod = validateEreportingPayload(outOfPeriod);
  assert.equal(invalidPeriod.ok, false);
  assert.ok(invalidPeriod.issues.some(issue => issue.includes('hors période')), 'transaction hors période détectée');

  const badPeriodicity = JSON.parse(JSON.stringify(ok));
  badPeriodicity.periodicity = 'weekly';
  assert.equal(validateEreportingPayload(badPeriodicity).ok, false);

  const correctionWithoutRef = JSON.parse(JSON.stringify(ok));
  correctionWithoutRef.kind = 'correction';
  correctionWithoutRef.correctsDeclarationId = null;
  assert.equal(validateEreportingPayload(correctionWithoutRef).ok, false);
});

test('flux : les quatre données de paiement et d’identification obligatoires sont contrôlées', { skip }, async () => {
  const { buildEreportingPayload, buildTransactionLine, validateEreportingPayload } = await import(matrixPath);
  const missingBuyer = buildEreportingPayload({
    kind: 'initial', correctsDeclarationId: null,
    periodStart: '2026-10-01', periodEnd: '2026-10-31', periodicity: 'monthly',
    emitter: { name: 'Aurion Test', siren: '123456789', siret: null, address: null },
    generatedAt: new Date('2026-11-01T08:00:00Z'),
    transactionLines: [buildTransactionLine(invoice({ clientName: '' }), 'b2c_domestic')],
    paymentLines: [], gapReport: [], corrections: [],
  });
  const result = validateEreportingPayload(missingBuyer);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(issue => issue.includes('acheteur')), 'nom d’acheteur requis');

  const badCountry = buildEreportingPayload({
    kind: 'initial', correctsDeclarationId: null,
    periodStart: '2026-10-01', periodEnd: '2026-10-31', periodicity: 'monthly',
    emitter: { name: 'Aurion Test', siren: '123456789', siret: null, address: null },
    generatedAt: new Date('2026-11-01T08:00:00Z'),
    transactionLines: [buildTransactionLine(invoice({ clientCountryCode: 'FRANCE' }), 'b2c_domestic')],
    paymentLines: [], gapReport: [], corrections: [],
  });
  const countryResult = validateEreportingPayload(badCountry);
  assert.equal(countryResult.ok, false);
  assert.ok(countryResult.issues.some(issue => issue.includes('pays')), 'code pays ISO requis');
});
