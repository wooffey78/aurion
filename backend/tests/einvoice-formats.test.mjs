// Bloc 4 — tests de contrat des formats d'émission électronique (UBL 2.1 / CII D16B
// profil Factur-X BASIC) et du validateur interne.
//
// Ces tests valident la GÉNÉRATION et la VALIDATION STRUCTURELLE des documents : mentions
// françaises du 1er septembre 2026 (BT-23 LB/PS/LBPS, SIREN client BT-47, note TVA sur les
// débits, adresse de livraison BT-79/80), arithmétique EN 16931 (BR-CO-10/11/13/14/15/16/17),
// catégorie E (franchise en base) avec motif d'exonération, et détection de falsification.
// Ils ne contactent aucune PA : c'est le périmètre « génération conforme » — la transmission
// est testée séparément (einvoice-outgoing.integration.test.mjs) et n'est PAS déclarée
// opérationnelle en production tant qu'aucune PA contractuelle n'a été validée en sandbox.
// Prérequis : « npm run build » ; sinon ignorés avec la raison affichée.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const ublPath = fileURLToPath(new URL('../dist/services/electronic-invoice-ubl.js', import.meta.url));
const ciiPath = fileURLToPath(new URL('../dist/services/electronic-invoice-cii.js', import.meta.url));
const validatePath = fileURLToPath(new URL('../dist/services/electronic-invoice-validate.js', import.meta.url));
const ready = existsSync(ublPath) && existsSync(ciiPath) && existsSync(validatePath);
const skip = ready ? false : 'dist/ absent : exécuter après « npm run build »';

const { generateUblInvoice, VAT_ON_PAYMENT_NOTICE, VAT_EXEMPTION_REASON, OPERATION_CATEGORIES } = await import(pathToFileURL(ublPath).href);
const { generateCiiInvoice, CII_GUIDELINE_ID } = await import(pathToFileURL(ciiPath).href);
const { validateUbl, validateCii } = await import(pathToFileURL(validatePath).href);

// SIREN de test (format 9 chiffres ; la validité du registre SIRENE est affaire de PA/INSEE).
const SIREN_SELLER = '123456789';
const SIREN_BUYER = '987654321';
const SIRET_SELLER = '12345678900011';

const baseDoc = () => ({
  number: 'FAC-2026-0101',
  issueDate: '2026-09-02T10:00:00.000Z',
  dueDate: '2026-10-02T10:00:00.000Z',
  currency: 'EUR',
  operationCategory: 'PS',
  vatOnPayment: false,
  deliveryAddress: null,
  seller: { name: 'Atelier Aurion SARL', siren: SIREN_SELLER, siret: SIRET_SELLER, address: '12 rue des Lilas\n75011 Paris', email: null },
  buyer: { name: 'Client Exemple', siren: SIREN_BUYER, address: '8 avenue du Test\n69003 Lyon', email: 'client@example.test' },
  lines: [
    { label: 'Pièces et fournitures', quantity: 1, unitPrice: 100, net: 100 },
    { label: 'Main-d’œuvre', quantity: 1, unitPrice: 150, net: 150 },
  ],
  vatRate: 20,
  vatAmount: 50,
  netTotal: 250,
  grossTotal: 300,
});

const expectationsOf = doc => ({
  operationCategory: doc.operationCategory, buyerSiren: doc.buyer.siren,
  vatOnPayment: doc.vatOnPayment, deliveryAddress: doc.deliveryAddress,
  netTotal: doc.netTotal, vatAmount: doc.vatAmount, grossTotal: doc.grossTotal,
  vatRate: doc.vatRate, lineCount: doc.lines.length,
});

test('UBL : document valide avec les quatre mentions, arithmétique EN 16931 correcte', { skip }, () => {
  const doc = baseDoc();
  doc.vatOnPayment = true;
  doc.deliveryAddress = 'Atelier n°2\n24 rue de la Livraison\n69007 Lyon';
  const xml = generateUblInvoice(doc);
  const result = validateUbl(xml, expectationsOf(doc));
  assert.deepEqual(result.issues, [], JSON.stringify(result.issues));
  assert.ok(xml.includes('<cbc:ProfileID>PS</cbc:ProfileID>'), 'BT-23 porté par cbc:ProfileID');
  assert.ok(xml.includes(`<cbc:CompanyID schemeID="0002">${SIREN_BUYER}</cbc:CompanyID>`), 'SIREN client BT-47 (schéma 0002)');
  assert.ok(xml.includes(`<cbc:CompanyID schemeID="0002">${SIREN_SELLER}</cbc:CompanyID>`), 'SIREN vendeur BT-30');
  assert.ok(xml.includes(`schemeID="0009">${SIRET_SELLER}`), 'SIRET vendeur BT-29');
  assert.ok(xml.includes(VAT_ON_PAYMENT_NOTICE), 'note TVA sur les débits présente');
  assert.ok(xml.includes('<cac:Delivery>'), 'bloc livraison présent si adresse différente');
  assert.ok(xml.includes('urn:cen.eu:en16931:2017'), 'BT-24 EN 16931');
});

test('UBL : sans option TVA sur les débits ni adresse de livraison, aucune mention parasite', { skip }, () => {
  const doc = baseDoc();
  const xml = generateUblInvoice(doc);
  const result = validateUbl(xml, expectationsOf(doc));
  assert.deepEqual(result.issues, [], JSON.stringify(result.issues));
  assert.ok(!xml.includes(VAT_ON_PAYMENT_NOTICE), 'note absente quand option non exercée');
  assert.ok(!xml.includes('<cac:Delivery>'), 'pas de bloc livraison sans adresse distincte');
});

test('UBL : franchise en base (taux 0) => catégorie E avec motif art. 293 B', { skip }, () => {
  const doc = baseDoc();
  doc.vatRate = 0; doc.vatAmount = 0; doc.grossTotal = doc.netTotal;
  const xml = generateUblInvoice(doc);
  const result = validateUbl(xml, expectationsOf(doc));
  assert.deepEqual(result.issues, [], JSON.stringify(result.issues));
  assert.ok(xml.includes('<cbc:ID>E</cbc:ID>'), 'catégorie E');
  assert.ok(xml.includes(VAT_EXEMPTION_REASON), 'motif d’exonération art. 293 B');
});

test('UBL : quantités décimales et arrondis au centime exacts (BR-CO-10)', { skip }, () => {
  const doc = baseDoc();
  doc.lines = [
    { label: 'Ligne 1', quantity: 2.5, unitPrice: 19.99, net: 49.98 },
    { label: 'Ligne 2', quantity: 1, unitPrice: 0.01, net: 0.01 },
    { label: 'Ligne 3', quantity: 3, unitPrice: 33.34, net: 100.01 },
  ];
  doc.netTotal = 150; doc.vatRate = 20; doc.vatAmount = 30; doc.grossTotal = 180;
  const xml = generateUblInvoice(doc);
  const result = validateUbl(xml, expectationsOf(doc));
  assert.deepEqual(result.issues, [], JSON.stringify(result.issues));
});

test('validateur UBL : falsification d’un montant détectée (BR-CO-10)', { skip }, () => {
  const doc = baseDoc();
  let xml = generateUblInvoice(doc);
  xml = xml.replace('<cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>', '<cbc:LineExtensionAmount currencyID="EUR">110.00</cbc:LineExtensionAmount>');
  const result = validateUbl(xml, expectationsOf(doc));
  assert.ok(!result.ok, 'le document falsifié est refusé');
  assert.ok(result.issues.some(i => i.rule === 'BR-CO-10'), JSON.stringify(result.issues));
});

test('validateur UBL : SIREN client attendu absent => mention manquante détectée', { skip }, () => {
  const doc = baseDoc();
  doc.buyer.siren = null;
  const xml = generateUblInvoice(doc);
  const result = validateUbl(xml, { ...expectationsOf(doc), buyerSiren: SIREN_BUYER });
  assert.ok(!result.ok);
  assert.ok(result.issues.some(i => i.rule === 'FR-MENTION-SIREN-CLIENT'), JSON.stringify(result.issues));
});

test('validateur UBL : XML mal formé refusé (aucune transmission possible)', { skip }, () => {
  const result = validateUbl('<Invoice><cbc:ID>', expectationsOf(baseDoc()));
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].rule, 'XML_WELL_FORMED');
});

test('CII : document valide profil Factur-X BASIC, mentions et arithmétique correctes', { skip }, () => {
  const doc = baseDoc();
  doc.vatOnPayment = true;
  doc.deliveryAddress = '24 rue de la Livraison\n69007 Lyon';
  const xml = generateCiiInvoice(doc);
  const result = validateCii(xml, expectationsOf(doc));
  assert.deepEqual(result.issues, [], JSON.stringify(result.issues));
  assert.ok(xml.includes('<ram:ID>PS</ram:ID>'), 'BT-23 dans BusinessProcess');
  assert.ok(xml.includes(`<ram:ID schemeIdentifier="0002">${SIREN_BUYER}</ram:ID>`), 'SIREN client (schéma 0002)');
  assert.ok(xml.includes(`urn:factur-x.eu:1p0:facturx`), 'guideline profil Factur-X');
  assert.ok(xml.includes(VAT_ON_PAYMENT_NOTICE), 'note TVA sur les débits');
  assert.ok(xml.includes('ram:ShipToTradeParty'), 'adresse de livraison');
  assert.ok(xml.includes('<ram:TypeCode>380</ram:TypeCode>'), 'type 380');
  assert.ok(xml.includes('DateTimeString format="102">20260902'), 'date au format 102');
});

test('CII : franchise en base => catégorie E + motif art. 293 B ; falsification détectée', { skip }, () => {
  const doc = baseDoc();
  doc.vatRate = 0; doc.vatAmount = 0; doc.grossTotal = doc.netTotal;
  const xml = generateCiiInvoice(doc);
  const result = validateCii(xml, expectationsOf(doc));
  assert.deepEqual(result.issues, [], JSON.stringify(result.issues));
  assert.ok(xml.includes('<ram:CategoryCode>E</ram:CategoryCode>'), 'catégorie E');
  assert.ok(xml.includes(VAT_EXEMPTION_REASON), 'motif d’exonération');
  const tampered = xml.replace('<ram:LineTotalAmount>100.00</ram:LineTotalAmount>', '<ram:LineTotalAmount>105.00</ram:LineTotalAmount>');
  const tamperedResult = validateCii(tampered, expectationsOf(doc));
  assert.ok(!tamperedResult.ok);
  assert.ok(tamperedResult.issues.some(i => i.rule === 'BR-CO-10'), JSON.stringify(tamperedResult.issues));
});

test('les codes de catégorie d’opération sont exactement ceux des spécifications DGFiP (LB/PS/LBPS)', { skip }, () => {
  assert.deepEqual([...OPERATION_CATEGORIES], ['LB', 'PS', 'LBPS']);
  const guideline = String(CII_GUIDELINE_ID);
  assert.ok(guideline.startsWith('urn:factur-x.eu:1p0:facturx-basic'));
});
