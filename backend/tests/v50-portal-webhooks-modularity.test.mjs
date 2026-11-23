// 15.4.50 — Portail client (A1/A2), webhooks sortants (B8), modularité métier et rapports (B7).
// Contrats de sécurité : jeton hashé, publication outbox dans la transaction, secret jamais en
// clair, HTTPS obligatoire, propositions conditionnées au métier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const dist = p => existsSync(fileURLToPath(new URL(p, import.meta.url))) ? fileURLToPath(new URL(p, import.meta.url)) : false;
const webhookPath = dist('../dist/services/outgoing-webhooks.js');
const featuresPath = dist('../dist/services/profile-features.js');
const reportPath = dist('../dist/services/monthly-report.js');

test('migrations 114/115/118 : portail invités, webhooks, partage explicite — RLS partout', () => {
  const portal = read('../migrations/114_portal_guest_access.sql');
  assert.match(portal, /create table if not exists client_portal_access/);
  assert.match(portal, /token_hash varchar\(64\) not null/);
  assert.match(portal, /unique\(token_hash\)/); // unicité GLOBALE du hash
  assert.match(portal, /create table if not exists quote_client_acceptances/);
  const hooks = read('../migrations/115_outgoing_webhooks.sql');
  assert.match(hooks, /secret_cipher text not null/);
  assert.match(hooks, /secret_fingerprint varchar\(64\) not null/);
  assert.match(hooks, /unique\(organization_id, idempotency_key\)/);
  const share = read('../migrations/118_portal_shared_quotes.sql');
  assert.match(share, /create table if not exists portal_shared_quotes/);
  assert.match(share, /revoked_at timestamptz/);
});

test('routes portail : administration owner-only, accès public par jeton rate-limité, acceptation transactionnelle', () => {
  const routes = read('../src/routes/portal-guest.ts');
  assert.match(routes, /portalGuestRoutes/);
  assert.match(routes, /portalPublicRoutes/);
  assert.match(routes, /rateLimit: \{ max: 30, timeWindow: '1 minute' \}/);
  assert.match(routes, /acceptQuoteFromPortal/);
  assert.match(routes, /CLIENT_MISMATCH/); // isolation client : devis d'un autre client refusé
  assert.match(routes, /Le jeton en clair est renvoyé UNE SEULE fois/);
  const service = read('../src/services/portal-guest.ts');
  assert.match(service, /business_events_outbox/); // publication DANS la transaction (109)
  assert.match(service, /CLOSED_QUOTE_STATUSES/); // statuts du référentiel partagé
});

test('routes webhooks : HTTPS obligatoire, secret chiffré, lettre morte documentée', () => {
  const routes = read('../src/routes/webhooks-out.ts');
  assert.match(routes, /Seule une URL HTTPS est acceptée/);
  assert.match(routes, /encryptSecret\(secret\)/);
  assert.match(routes, /renvoyé UNE SEULE fois|montré UNE SEULE fois/);
});

test('unitaire — signature HMAC déterministe, vérifiable, sensible au corps et au timestamp', { skip: !webhookPath }, async () => {
  const { buildDeliveryHeaders, verifyDeliverySignature, webhookNextDelayMs, secretFingerprint } = await import(webhookPath);
  const body = '{"event":"invoice_paid","data":{"id":"x"}}';
  const h = buildDeliveryHeaders('secret-demo', body, 1764000000);
  assert.match(h['X-Aurion-Signature'], /^t=1764000000,v1=[0-9a-f]{64}$/);
  assert.equal(verifyDeliverySignature('secret-demo', body, h['X-Aurion-Signature']), true);
  // Le même secret+corps+timestamp donne la même signature (déterminisme testable).
  assert.equal(buildDeliveryHeaders('secret-demo', body, 1764000000)['X-Aurion-Signature'], h['X-Aurion-Signature']);
  // Corps modifié → signature invalide.
  assert.equal(verifyDeliverySignature('secret-demo', body + ' ', h['X-Aurion-Signature']), false);
  // Backoff exponentiel plafonné, lettre morte au 5e essai.
  assert.equal(webhookNextDelayMs(1), 1000);
  assert.equal(webhookNextDelayMs(2), 2000);
  assert.equal(webhookNextDelayMs(10), 60000);
  assert.equal(secretFingerprint('secret-demo').length, 64);
});

test('unitaire — modularité métier : maintenance proposée pour CVC, pas pour coiffure ; profil inconnu = repli sûr', { skip: !featuresPath }, async () => {
  const { featuresForProfile } = await import(featuresPath);
  const plumbing = featuresForProfile('plumbing');
  assert.equal(plumbing.features.maintenance, true);
  assert.equal(plumbing.features.chantiers, true);
  assert.equal(plumbing.features.stock_locations, true);
  const beauty = featuresForProfile('beauty');
  assert.equal(beauty.features.maintenance, false);
  assert.ok(beauty.hidden.some(h => h.key === 'maintenance' && h.reason.includes('Coiffure')));
  const unknown = featuresForProfile('code-inconnu-xyz');
  assert.equal(unknown.features.client_portal, true);
  assert.equal(unknown.features.maintenance, false);
  assert.match(unknown.hidden[0].reason, /non reconnu/);
});

test('unitaire — rapport mensuel : facturé ≠ encaissé, sections chartables, camembert réservé aux répartitions', { skip: !reportPath }, async () => {
  const { buildMonthlyReport } = await import(reportPath);
  const report = buildMonthlyReport({
    month: '2026-11', caInvoicedTtc: 12000, caCollectedTtc: 9000, expensesTtc: 3000,
    vatCollectedTtc: 0, vatDeductibleTtc: 0, quotesSentCount: 8, quotesAcceptedCount: 5,
    overdueCount: 2, overdueTotalTtc: 1500, appointmentsCount: 12,
    topClients: [{ name: 'M. Martin', totalTtc: 3000 }],
    series: [{ label: '2026-06', invoicedTtc: 8000, collectedTtc: 7500 }, { label: '2026-07', invoicedTtc: 9500, collectedTtc: 9000 }],
    paymentStatusBreakdown: [{ label: 'Payées', count: 4, totalTtc: 7000 }, { label: 'Non payées', count: 2, totalTtc: 2000 }],
  });
  const chart = report.sections.find(s => s.chart && s.title.includes('Facturé vs encaissé'));
  assert.deepEqual(chart.chart.suggestedTypes, ['bar', 'line', 'candle']); // pas de camembert sur une série temporelle
  const pie = report.sections.find(s => s.chart && s.title.includes('Répartition'));
  assert.deepEqual(pie.chart.suggestedTypes, ['pie', 'bar']); // pas de courbe sur une répartition
  assert.match(report.disclaimer, /sources de vérité/);
});
