// 15.4.50 — Coffre d'intégrité (B5), dérive devis→facture (B6), prix matériaux (B4) :
// fonctions pures déterministes, chaîne append-only détectant toute altération.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const dist = p => existsSync(fileURLToPath(new URL(p, import.meta.url))) ? fileURLToPath(new URL(p, import.meta.url)) : false;
const chainPath = dist('../dist/services/integrity-chain.js');
const devPath = dist('../dist/services/deviation-guard.js');
const pricePath = dist('../dist/services/price-history.js');

test('migration 113 : chaîne append-only (RLS lecture seule runtime)', () => {
  const m = read('../migrations/113_document_integrity_chain.sql');
  assert.match(m, /create table if not exists document_integrity_chain/);
  assert.match(m, /unique\(organization_id, document_id\)/);
});

test('unitaire — chaîne d\u2019intégrité : liaisons correctes, altération détectée à l\u2019entrée exacte', { skip: !chainPath }, async () => {
  const { computeChainEntry, verifyChain } = await import(pathToFileURL(chainPath).href);
  const e1 = computeChainEntry('11111111-1111-4111-8111-111111111111', 'invoice', 'FA-2026-001', 'a'.repeat(64), '2026-01-10T08:00:00.000Z', null);
  const e2 = computeChainEntry('22222222-2222-4222-8222-222222222222', 'invoice', 'FA-2026-002', 'b'.repeat(64), '2026-01-12T08:00:00.000Z', e1.chainHash);
  const e3 = computeChainEntry('33333333-3333-4333-8333-333333333333', 'quote', 'DE-2026-010', 'c'.repeat(64), '2026-01-15T08:00:00.000Z', e2.chainHash);
  const ok = verifyChain([e1, e2, e3]);
  assert.equal(ok.valid, true);
  assert.equal(ok.checked, 3);
  // Altération d'une empreinte passée : la chaîne se casse à CETTE entrée.
  const tampered = [e1, { ...e2, sha256: 'd'.repeat(64) }, e3];
  const broken = verifyChain(tampered);
  assert.equal(broken.valid, false);
  assert.equal(broken.brokenAtDocumentId, '22222222-2222-4222-8222-222222222222');
  // Liaison manquante : détectée aussi.
  const unlinked = verifyChain([e1, e3]);
  assert.equal(unlinked.valid, false);
  // Empreinte non hexadécimale : refus, jamais d'entrée fausse.
  assert.throws(() => computeChainEntry('x', 'invoice', 'FA-1', 'zz', '2026-01-01', null), /hexadécimale/);
});

test('unitaire — dérive devis→facture : compensation non masquée, seuils et niveaux', { skip: !devPath }, async () => {
  const { detectDeviation } = await import(pathToFileURL(devPath).href);
  const quote = [{ label: 'Main-d\u2019œuvre', amountHt: 500 }, { label: 'Matériel', amountHt: 300 }];
  const invoice = [{ label: 'Main-d\u2019oeuvre', amountHt: 500 }, { label: 'Matériel', amountHt: 300 }]; // accents normalisés
  assert.equal(detectDeviation(quote, invoice, 10).level, 'none');
  // Écart de total : +50 % → major.
  const r = detectDeviation(quote, [{ label: 'Main-d\u2019œuvre', amountHt: 500 }, { label: 'Matériel', amountHt: 300 }, { label: 'Imprévus', amountHt: 400 }], 10);
  assert.equal(r.requiresJustification, true);
  assert.ok(['notable', 'major'].includes(r.level));
  assert.equal(r.addedRubrics.includes('Imprévus'), true);
  // Une compensation hausse/baisse sur rubriques appariées ne masque pas la dérive locale.
  const compensated = detectDeviation(
    [{ label: 'Matériel', amountHt: 300 }],
    [{ label: 'Matériel', amountHt: 600 }, { label: 'Remise exceptionnelle', amountHt: -300 }],
    10,
  );
  assert.equal(compensated.requiresJustification, true);
  assert.match(compensated.reasons.join(' '), /Matériel/);
});

test('unitaire — tendance de prix : hausse au-delà du seuil → alerte motivée, pas de tendance inventée', { skip: !pricePath }, async () => {
  const { analyzePriceTrend } = await import(pathToFileURL(pricePath).href);
  const up = analyzePriceTrend([
    { observedAt: '2026-01-01', unitCostCents: 1000 },
    { observedAt: '2026-03-01', unitCostCents: 1150 },
  ], 10);
  assert.equal(up.variationPct, 15);
  assert.equal(up.alert, true);
  assert.match(up.reason, /recotation du prix plancher proposée, à confirmer/);
  const flat = analyzePriceTrend([{ observedAt: '2026-01-01', unitCostCents: 1000 }], 10);
  assert.equal(flat.alert, false);
  assert.match(flat.reason, /trop courte/);
  const empty = analyzePriceTrend([], 10);
  assert.equal(empty.count, 0);
  assert.match(empty.reason, /aucune tendance inventée/);
});

test('routes : chaîne consultable, prix scopés, alerte journalisée — jamais de scraping', () => {
  const routes = read('../src/routes/maintenance.ts');
  assert.match(routes, /app\.get\('\/integrity\/chain'/);
  assert.match(routes, /app\.get\('\/price-history\/:partId'/);
  assert.match(routes, /emitOrgEvent/);
  const service = read('../src/services/price-history.ts');
  assert.match(service, /aucun scraping|AUCUN scraping|achats réels/i);
});
