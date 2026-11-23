// Bloc 5 — recette d'intégration réelle de l'E-REPORTING : PostgreSQL réel, rôle applicatif,
// RLS active, serveur HTTP de recette réel (boucle locale) implémentant le contrat sortant
// « generic » documenté dans docs/PLATEFORME-AGREEE.md (§ 8 pour le transport, § 10 pour le
// flux e-reporting).
//
// IMPORTANT : ces tests valident le CONTRAT GÉNÉRIQUE de transmission (adaptateur de référence),
// PAS une PA contractuelle. Aucune plateforme agréée réelle n'est connectée : la transmission
// e-reporting n'est pas déclarée opérationnelle en production tant qu'aucune PA n'a été validée
// en sandbox (bloc 5 du cahier des charges). Ce qui est prouvé ici : matrice de classification
// appliquée aux données réelles (B2C domestique, B2B international, B2B domestique exclu),
// rapport d'écarts bloquant, idempotence, absence de doublon côté PA, accusés signés
// obligatoires, états traçables, succès/rejet/timeout/re-tentative, corrections sans réécriture
// de l'originale, archivage sans altération des flux et des accusés, isolation RLS des
// nouvelles tables.
//
// Prérequis : « npm run build », DATABASE_URL (rôle applicatif), AURION_ADMIN_DATABASE_URL
// (membre de « aurion_admin »), AURION_INTEGRATION_TESTS=1 ; sinon ignorés avec la raison
// affichée — jamais déclarés réussis sans exécution.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const pathJoin = path.join;

process.env.NODE_ENV ||= 'test';
process.env.AURION_INTEGRATION_TESTS ||= '1';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_ENCRYPTION_KEY ||= 'integration-test-encryption-key-32chars!!';
process.env.AURION_PA_PROVIDER ||= 'generic';
process.env.AURION_PA_WEBHOOK_SECRET ||= 'pa-integration-test-secret-at-least-32-chars!!';
process.env.AURION_PA_OUT_TIMEOUT_MS ||= '1000';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const appPath = fileURLToPath(new URL('../dist/app.js', import.meta.url));
const dbPath = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const authPath = fileURLToPath(new URL('../dist/plugins/auth.js', import.meta.url));
const storagePath = fileURLToPath(new URL('../dist/services/storage.js', import.meta.url));
const ready = existsSync(appPath) && existsSync(dbPath) && Boolean(process.env.DATABASE_URL)
  && process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1, DATABASE_URL ou AURION_ADMIN_DATABASE_URL non défini';

test.after(async () => {
  if (modules) {
    await modules.db.db.end().catch(() => {});
    if (modules.db.adminDb) await modules.db.adminDb.end().catch(() => {});
    fixtureServer.close();
  }
});

const modules = ready ? { app: null, db: null, storage: null, signAccessToken: null } : null;

async function boot() {
  if (!modules.app) {
    const [{ buildApp }, db, storage, auth] = await Promise.all([import(appPath), import(dbPath), import(storagePath), import(authPath)]);
    modules.app = await buildApp();
    modules.db = db;
    modules.storage = storage;
    modules.signAccessToken = auth.signAccessToken;
  }
  return modules;
}

const uuid = () => crypto.randomUUID();
const sha256 = v => createHash('sha256').update(v).digest('hex');
// Secret du point d'entrée de recette : le serveur de recette signe ses accusés avec LE MÊME
// secret (contrat generic : secret partagé, comme le webhook entrant).
const OUT_SECRET = 'integration-test-endpoint-secret-32chars!!';
// Période de recette principale : octobre 2026 (mensuelle, mois civil exact).
const PERIOD = { periodStart: '2026-10-01', periodEnd: '2026-10-31', periodicity: 'monthly' };

// Les factures de recette sont créées puis antidatées en base (created_at dans la période) :
// les paiements de recette sont ensuite encaissés dans la même période (dates passées).
async function backdateInvoice(mod, account, invoiceId, isoDate) {
  await mod.db.withTenant(account.organizationId, () => mod.db.query(
    `update quotes set created_at=$2::timestamptz where id=$1 and organization_id=$3`,
    [invoiceId, `${isoDate}T10:00:00Z`, account.organizationId],
  ));
}

// ------------------------------------------------------------------ serveur PA de recette
// Implémente le contrat sortant generic : POST signé (X-Aurion-PA-Signature sur le corps),
// accusé JSON signé (même schéma, miroir). Déduplication par X-Aurion-PA-Transmission-Id :
// le premier verdict est conservé et ré-acquitté à l'identique, quel que soit le nombre de
// re-tentatives (miroir de l'idempotence attendue d'une PA réelle).
const paLedger = new Map(); // transmissionId -> { verdict: Buffer; signature: string; payloads: Set<string>; formats: Set<string> }
const paRoutesFixture = new Map(); // path -> 'accept' | 'reject' | 'slow' | 'unsigned'

function fixtureAck(verdict, secret = OUT_SECRET) {
  const body = Buffer.from(JSON.stringify(verdict));
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.`, 'utf8').update(body).digest('hex');
  return { body, signature: `t=${t},v1=${v1}` };
}

let fixturePort = 0;
const fixtureServer = http.createServer((request, response) => {
  let chunks = [];
  request.on('data', c => chunks.push(c));
  request.on('end', async () => {
    const url = String(request.url || '/').split('?')[0];
    const mode = paRoutesFixture.get(url) || 'accept';
    const transmissionId = String(request.headers['x-aurion-pa-transmission-id'] || '');
    const payload = Buffer.concat(chunks);
    const entry = paLedger.get(transmissionId);
    if (entry) {
      // Idempotence PA : même identifiant => même verdict, AUCUN nouveau traitement.
      entry.payloads.add(sha256(payload));
      entry.formats.add(String(request.headers['x-aurion-pa-format'] || ''));
      response.writeHead(200, { 'content-type': 'application/json', 'x-aurion-pa-signature': entry.signature });
      response.end(entry.verdict);
      return;
    }
    const answer = (verdict) => {
      const { body, signature } = fixtureAck(verdict);
      paLedger.set(transmissionId, { verdict: body, signature, payloads: new Set([sha256(payload)]), formats: new Set([String(request.headers['x-aurion-pa-format'] || '')]) });
      if (mode === 'slow') {
        setTimeout(() => {
          response.writeHead(200, { 'content-type': 'application/json', 'x-aurion-pa-signature': signature });
          response.end(body);
        }, 2000);
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json', 'x-aurion-pa-signature': signature });
      response.end(body);
    };
    if (mode === 'reject') answer({ status: 'rejected', code: 'PPF_EREPORTING_INVALID', message: 'Déclaration refusée par la PA de recette.' });
    else if (mode === 'unsigned') {
      // Accusé NON signé : l'adaptateur doit refuser de conclure (invalid_ack => « issue non confirmée »).
      paLedger.set(transmissionId, { verdict: Buffer.from('{}'), signature: '', payloads: new Set([sha256(payload)]), formats: new Set([String(request.headers['x-aurion-pa-format'] || '')]) });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'accepted', paReference: 'PA-FORGERY' }));
    } else answer({ status: 'accepted', paReference: `PA-ACK-${transmissionId.slice(0, 8)}` });
  });
});

// ------------------------------------------------------------------ fixtures de comptes
const createdOrganizations = new Set();

async function seedAccount(mod, label = 'Ereporting') {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test E-reporting')`, [organizationId, `Entreprise ${label} ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`update organizations set siren=$2, siret=$3, address=$4, postal_code=$5, city=$6 where id=$1`, [organizationId, '123456789', '12345678900011', '12 rue des Lilas', '75011', 'Paris']);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `erep-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture e-reporting')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  createdOrganizations.add(organizationId);
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

async function cleanupOrganizations(mod) {
  for (const org of createdOrganizations) {
    try { rmSync(pathJoin(mod.storage.PRIVATE_BASE, org), { recursive: true, force: true }); } catch {}
    await mod.db.query('delete from organizations where id=$1', [org]).catch(() => {});
    await mod.db.query(`delete from users where id in (select user_id from organization_members where organization_id=$1)`, [org]).catch(() => {});
  }
  createdOrganizations.clear();
}

async function configureEndpoint(mod, account, mode) {
  const response = await mod.app.inject({
    method: 'POST', url: '/pa/outgoing-endpoints', headers: { authorization: `Bearer ${account.token}` },
    payload: { baseUrl: `http://127.0.0.1:${fixturePort}/${mode}`, secret: OUT_SECRET },
  });
  assert.ok([200, 201].includes(response.statusCode), response.body);
}

async function createClient(mod, account, overrides = {}) {
  const response = await mod.app.inject({
    method: 'POST', url: '/clients', headers: { authorization: `Bearer ${account.token}` },
    payload: { name: 'Client Particulier', estimatedMinutes: 0, ...overrides },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().id;
}

async function createInvoice(mod, account, { clientId = null, overrides = {}, issuedOn = '2026-10-05' } = {}) {
  const response = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: { authorization: `Bearer ${account.token}` },
    payload: {
      documentType: 'invoice',
      clientId,
      intervention: 'Prestation de réparation',
      laborSellingHt: 100,
      vatRate: 20,
      mileageKm: 0,
      mileageInternalRate: 0,
      mileageClientRate: 0,
      einvoiceOperationCategory: 'PS',
      ...overrides,
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  const invoiceId = response.json().id;
  await backdateInvoice(mod, account, invoiceId, issuedOn);
  return invoiceId;
}

async function payInvoice(mod, account, invoiceId, { amount, paidAt = '2026-10-15', paymentMethod = 'card' } = {}) {
  return mod.app.inject({
    method: 'POST', url: `/invoices/${invoiceId}/payments`, headers: { authorization: `Bearer ${account.token}` },
    payload: { amount: String(amount), paymentMethod, paidAt: `${paidAt}T09:30:00Z` },
  });
}

async function preview(mod, account, payload = {}) {
  return mod.app.inject({
    method: 'POST', url: '/pa/ereporting/preview', headers: { authorization: `Bearer ${account.token}` },
    payload: { ...PERIOD, ...payload },
  });
}

async function prepare(mod, account, payload = {}) {
  return mod.app.inject({
    method: 'POST', url: '/pa/ereporting/declarations', headers: { authorization: `Bearer ${account.token}` },
    payload: { ...PERIOD, ...payload },
  });
}

async function transmit(mod, account, declarationId) {
  return mod.app.inject({
    method: 'POST', url: `/pa/ereporting/declarations/${declarationId}/transmit`, headers: { authorization: `Bearer ${account.token}` }, payload: {},
  });
}

// ------------------------------------------------------------------ tests

test('E-reporting : matrice réelle, préparation scellée, transmission, accusés, reprises, corrections, RLS', { skip, serial: true }, async t => {
  const mod = await boot();
  await new Promise(resolve => fixtureServer.listen(0, '127.0.0.1', resolve));
  fixturePort = fixtureServer.address().port;

  const account = await seedAccount(mod, 'A');
  const other = await seedAccount(mod, 'B');
  t.after(async () => { await cleanupOrganizations(mod); });
  await configureEndpoint(mod, account, 'accept');

  // RLS : les trois nouvelles tables portent la politique tenant_isolation.
  const policies = Number((await mod.db.query(`
    select count(*)::int n from pg_policies where tablename in
      ('ereporting_declarations','ereporting_lines','ereporting_events')
      and policyname='tenant_isolation'`)).rows[0]?.n);
  assert.equal(policies, 3, '3 politiques tenant_isolation pour les tables du bloc 5');

  // Données de recette : une cliente particulière (B2C), un client assujetti établi en France
  // (B2B domestique => émission bloc 4, exclu de l'e-reporting avec motif), un assujetti
  // étranger (B2B international) et un client sans classification déclarée (écart).
  const b2cClient = await createClient(mod, account, { name: 'Particulier Dupont', buyerCategory: 'non_assujetti', countryCode: 'FR' });
  const b2bFrClient = await createClient(mod, account, { name: 'SAS Martin', buyerCategory: 'assujetti_fr', countryCode: 'FR' });
  const b2bForeignClient = await createClient(mod, account, { name: 'GmbH Schmidt', buyerCategory: 'assujetti_etranger', countryCode: 'DE', vatNumber: 'DE123456789' });
  const unclassifiedClient = await createClient(mod, account, { name: 'Client sans classification' });
  const foreignNoVatClient = await createClient(mod, account, { name: 'GmbH Ohne', buyerCategory: 'assujetti_etranger', countryCode: 'DE' });

  let unclassifiedInvoice;   // octobre — servira de preuve d'écart puis de transaction reclassee
  let b2cInvoice;            // octobre — transaction principale + paiement encaissé
  let b2bFrInvoice;          // octobre — exclu (einvoicing_b2b_domestic)
  let b2bForeignInvoice;     // octobre — b2b_international
  let foreignNoVatInvoice;   // octobre — écart BUYER_VAT_NUMBER_MISSING puis reclassé
  let exemptInvoice;         // octobre — exclu (exempt_declared)
  let octoberDeclaration;    // déclaration initiale d'octobre (préparée puis acceptée)

  await t.test('aperçu : rapport d\'écarts bloquant quand la classification déclarative manque', async () => {
    unclassifiedInvoice = await createInvoice(mod, account, { clientId: unclassifiedClient });
    const response = await preview(mod, account);
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(body.gaps.some(gap => gap.code === 'BUYER_CATEGORY_MISSING' && gap.quoteId === unclassifiedInvoice), 'écart BUYER_CATEGORY_MISSING signalé');
    const blocked = await prepare(mod, account);
    assert.equal(blocked.statusCode, 422);
    assert.equal(blocked.json().error, 'EREPORTING_CLASSIFICATION_INCOMPLETE');
    assert.ok(Array.isArray(blocked.json().detail?.gaps), 'rapport d\'écarts joint au refus');
    // Aucune donnée inventée : le client reste non classé en base tant que l'utilisateur ne déclare pas.
    const row = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select buyer_category from clients where id=$1`, [unclassifiedClient]))).rows[0];
    assert.equal(row.buyer_category, null);
    // L'utilisateur classe ensuite le client (déclaration explicite) : l'écart disparaît.
    const patch = await mod.app.inject({ method: 'PATCH', url: `/clients/${unclassifiedClient}`, headers: { authorization: `Bearer ${account.token}` }, payload: { buyerCategory: 'non_assujetti', countryCode: 'FR' } });
    assert.equal(patch.statusCode, 200, patch.body);
  });

  await t.test('classification réelle : B2C déclaré, B2B domestique exclu avec motif, paiements portés', async () => {
    b2cInvoice = await createInvoice(mod, account, { clientId: b2cClient, issuedOn: '2026-10-05' });
    b2bFrInvoice = await createInvoice(mod, account, { clientId: b2bFrClient, overrides: { einvoiceOperationCategory: 'LB' }, issuedOn: '2026-10-06' });
    const paid = await payInvoice(mod, account, b2cInvoice, { amount: 60, paidAt: '2026-10-15' });
    assert.equal(paid.statusCode, 201, paid.body);

    const response = await preview(mod, account);
    assert.equal(response.statusCode, 200);
    const body = response.json();
    // Deux transactions B2C d'octobre : la facture reclassee + la facture principale.
    assert.equal(body.transactionLines.length, 2);
    const transaction = body.transactionLines.find(line => line.quoteId === b2cInvoice);
    assert.ok(transaction, 'la facture B2C est dans les lignes de transaction');
    assert.equal(transaction.inclusionReason, 'b2c_domestic_transaction');
    assert.equal(transaction.buyerCategory, 'non_assujetti');
    assert.equal(transaction.amountTtc, 120);
    const payment = body.paymentLines.find(line => line.quoteId === b2cInvoice);
    assert.ok(payment, 'le paiement encaissé est porté en données de paiement');
    assert.equal(payment.paymentDate, '2026-10-15');
    assert.equal(payment.inclusionReason, 'b2c_domestic_payment');
    const excludedRow = body.excluded.find(item => item.quoteId === b2bFrInvoice);
    assert.ok(excludedRow, 'la facture B2B domestique est exclue');
    assert.equal(excludedRow.reason, 'einvoicing_b2b_domestic');
    assert.equal(body.totals.ht, 200);
    assert.equal(body.totals.vat, 40);
    assert.equal(body.totals.ttc, 240);
    assert.equal(body.totals.payments, 60);
  });

  await t.test('préparation : flux scellé (SHA-256), lignes figées, validation avant archivage', async () => {
    const response = await prepare(mod, account);
    assert.equal(response.statusCode, 201, response.body);
    const body = response.json();
    assert.equal(body.status, 'prepared');
    assert.equal(body.kind, 'initial');
    assert.match(body.payloadSha256, /^[0-9a-f]{64}$/);
    octoberDeclaration = body.id;
    assert.equal(body.transactionCount, 2);
    assert.equal(body.paymentCount, 1);
    assert.equal(body.totalHt, 200);
    assert.equal(body.totalTtc, 240);
    assert.equal(body.totalPayments, 60);

    const file = await mod.app.inject({ method: 'GET', url: `/pa/ereporting/declarations/${octoberDeclaration}/file`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(file.statusCode, 200);
    assert.equal(sha256(file.rawPayload), body.payloadSha256, 'archive = sceau SHA-256');
    const payload = JSON.parse(file.rawPayload.toString('utf8'));
    assert.equal(payload.schema, 'aurion.ereporting/1');
    assert.equal(payload.period.start, '2026-10-01');
    assert.equal(payload.periodicity, 'monthly');
    assert.equal(payload.emitter.siren, '123456789');
    assert.ok(payload.excluded.some(item => item.reason === 'einvoicing_b2b_domestic'), 'exclusions documentées dans le flux');
    assert.deepEqual(payload.gapReport, [], 'aucun écart dans un flux préparé');

    const detail = await mod.app.inject({ method: 'GET', url: `/pa/ereporting/declarations/${octoberDeclaration}`, headers: { authorization: `Bearer ${account.token}` } });
    const lines = detail.json().lines;
    assert.equal(lines.length, 3, 'deux lignes de transaction + une ligne de paiement figées');

    // Re-préparation de la même période : refusée tant que la déclaration est ouverte (pas de doublon).
    const duplicate = await prepare(mod, account);
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.json().error, 'EREPORTING_ALREADY_OPEN');
  });

  await t.test('transmission acceptée : accusé signé archivé, journal complet, pas de double transmission', async () => {
    const result = await transmit(mod, account, octoberDeclaration);
    assert.equal(result.statusCode, 200, result.body);
    const body = result.json();
    assert.equal(body.kind, 'accepted');
    assert.ok(body.paReference.startsWith('PA-ACK-'), body.paReference);

    const detail = await mod.app.inject({ method: 'GET', url: `/pa/ereporting/declarations/${octoberDeclaration}`, headers: { authorization: `Bearer ${account.token}` } });
    const info = detail.json().declaration;
    assert.equal(info.status, 'accepted');
    assert.ok(info.ack_sha256, 'accusé scellé');
    const ack = await mod.app.inject({ method: 'GET', url: `/pa/ereporting/declarations/${octoberDeclaration}/ack`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(ack.statusCode, 200);
    assert.equal(sha256(ack.rawPayload), info.ack_sha256, 'accusé archivé = sceau');
    assert.equal(JSON.parse(ack.rawPayload.toString('utf8')).status, 'accepted');

    const events = detail.json().events.map(e => e.kind);
    assert.ok(events.includes('ereporting.prepared'));
    assert.ok(events.includes('ereporting.transmission_started'));
    assert.ok(events.includes('ereporting.ack_accepted'));

    // Le format transmis à la PA est bien « ereporting » (X-Aurion-PA-Format).
    const stableId = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select pa_transmission_id from ereporting_declarations where id=$1`, [octoberDeclaration]))).rows[0].pa_transmission_id;
    const ledgerEntry = paLedger.get(stableId);
    assert.ok(ledgerEntry.formats.has('ereporting'), 'X-Aurion-PA-Format: ereporting reçu par la PA');

    const second = await transmit(mod, account, octoberDeclaration);
    assert.equal(second.statusCode, 409);
    assert.equal(second.json().error, 'EREPORTING_ALREADY_ACCEPTED');
  });

  await t.test('B2B international : dans le périmètre avec numéro de TVA, écart bloquant sans', async () => {
    b2bForeignInvoice = await createInvoice(mod, account, { clientId: b2bForeignClient, issuedOn: '2026-10-07' });
    const ok = await preview(mod, account);
    assert.equal(ok.statusCode, 200);
    const line = ok.json().transactionLines.find(item => item.quoteId === b2bForeignInvoice);
    assert.ok(line, 'transaction B2B internationale présente');
    assert.equal(line.inclusionReason, 'b2b_international_transaction');
    assert.equal(line.buyerVatNumber, 'DE123456789');

    foreignNoVatInvoice = await createInvoice(mod, account, { clientId: foreignNoVatClient, issuedOn: '2026-10-08' });
    const blocked = await prepare(mod, account);
    assert.equal(blocked.statusCode, 422);
    assert.ok(blocked.json().detail?.gaps.some(gap => gap.code === 'BUYER_VAT_NUMBER_MISSING' && gap.quoteId === foreignNoVatInvoice), 'écart BUYER_VAT_NUMBER_MISSING signalé');
    // L'utilisateur complète la déclaration : la facture rejoint le périmètre.
    const patch = await mod.app.inject({ method: 'PATCH', url: `/clients/${foreignNoVatClient}`, headers: { authorization: `Bearer ${account.token}` }, payload: { vatNumber: 'DE987654321' } });
    assert.equal(patch.statusCode, 200, patch.body);
  });

  await t.test('exonération déclarée : exclue avec motif, refus sans motif', async () => {
    exemptInvoice = await createInvoice(mod, account, { clientId: b2cClient, overrides: { ereportingExempt: true, ereportingExemptReason: 'Exportation hors UE (art. 262 I du CGI)' }, issuedOn: '2026-10-09' });
    const response = await preview(mod, account);
    assert.equal(response.statusCode, 200);
    assert.ok(response.json().excluded.some(item => item.quoteId === exemptInvoice && item.reason === 'exempt_declared'), 'exonération documentée dans les exclusions');
    assert.ok(!response.json().transactionLines.some(line => line.quoteId === exemptInvoice), 'facture exonérée absente des lignes');

    // Sans motif : refus explicite à la saisie (blocage clair, jamais de valeur inventée).
    const noReason = await mod.app.inject({
      method: 'POST', url: '/quotes', headers: { authorization: `Bearer ${account.token}` },
      payload: { documentType: 'invoice', clientId: b2cClient, intervention: 'Prestation', laborSellingHt: 50, vatRate: 20, mileageKm: 0, mileageInternalRate: 0, mileageClientRate: 0, einvoiceOperationCategory: 'PS', ereportingExempt: true },
    });
    assert.equal(noReason.statusCode, 400);
  });

  await t.test('rejet puis re-tentative idempotente : même identifiant PA, aucun doublon', async () => {
    paRoutesFixture.set('/reject-erep', 'reject');
    await configureEndpoint(mod, account, 'reject-erep');
    const invoiceId = await createInvoice(mod, account, { clientId: b2cClient, issuedOn: '2026-11-02' });
    const novPeriod = { periodStart: '2026-11-01', periodEnd: '2026-11-30', periodicity: 'monthly' };
    const prep = await mod.app.inject({ method: 'POST', url: '/pa/ereporting/declarations', headers: { authorization: `Bearer ${account.token}` }, payload: novPeriod });
    assert.equal(prep.statusCode, 201, prep.body);
    const rejectedId = prep.json().id;
    const first = await transmit(mod, account, rejectedId);
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().kind, 'rejected');
    assert.equal(first.json().code, 'PPF_EREPORTING_INVALID');

    const stableId = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select pa_transmission_id from ereporting_declarations where id=$1`, [rejectedId]))).rows[0].pa_transmission_id;
    // La PA de recette rejette toujours ce point d'entrée : re-tentative => même verdict, MÊME identifiant.
    const retry = await transmit(mod, account, rejectedId);
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().kind, 'rejected');
    const ledgerEntry = paLedger.get(stableId);
    assert.equal(ledgerEntry.payloads.size, 1, 'la PA n’a reçu qu’une charge utile (idempotence)');
  });

  await t.test('timeout : issue non confirmée, reprise réussie avec le même identifiant PA', async () => {
    paRoutesFixture.set('/slow-erep', 'slow');
    await configureEndpoint(mod, account, 'slow-erep');
    await createInvoice(mod, account, { clientId: b2cClient, issuedOn: '2026-09-02' });
    const sepPeriod = { periodStart: '2026-09-01', periodEnd: '2026-09-30', periodicity: 'monthly' };
    const prep = await mod.app.inject({ method: 'POST', url: '/pa/ereporting/declarations', headers: { authorization: `Bearer ${account.token}` }, payload: sepPeriod });
    assert.equal(prep.statusCode, 201, prep.body);
    const declarationIdSlow = prep.json().id;
    const stableId = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select pa_transmission_id from ereporting_declarations where id=$1`, [declarationIdSlow]))).rows[0].pa_transmission_id;

    const first = await transmit(mod, account, declarationIdSlow);
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().kind, 'unconfirmed');
    assert.equal(first.json().errorCode, 'PA_OUT_TIMEOUT', 'délai dépassé : aucune conclusion');
    const afterTimeout = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select status from ereporting_declarations where id=$1`, [declarationIdSlow]))).rows[0];
    assert.equal(afterTimeout.status, 'timeout', 'état « issue non confirmée » — jamais « transmise »');

    paRoutesFixture.delete('/slow-erep');
    await configureEndpoint(mod, account, 'accept');
    const retry = await transmit(mod, account, declarationIdSlow);
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().kind, 'accepted');
    const ledgerEntry = paLedger.get(stableId);
    assert.equal(ledgerEntry.payloads.size, 1, 're-tentative : la PA n’a reçu qu’une charge utile');
    const finalStatus = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select status,attempts from ereporting_declarations where id=$1`, [declarationIdSlow]))).rows[0];
    assert.equal(finalStatus.status, 'accepted');
    assert.ok(Number(finalStatus.attempts) >= 2, 're-tentatives tracées');
  });

  await t.test('accusé non signé : refusé (« issue non confirmée »), jamais accepté', async () => {
    paRoutesFixture.set('/unsigned-erep', 'unsigned');
    await configureEndpoint(mod, account, 'unsigned-erep');
    await createInvoice(mod, account, { clientId: b2cClient, issuedOn: '2026-08-02' });
    const augPeriod = { periodStart: '2026-08-01', periodEnd: '2026-08-31', periodicity: 'monthly' };
    const prep = await mod.app.inject({ method: 'POST', url: '/pa/ereporting/declarations', headers: { authorization: `Bearer ${account.token}` }, payload: augPeriod });
    assert.equal(prep.statusCode, 201, prep.body);
    const unsignedId = prep.json().id;
    const result = await transmit(mod, account, unsignedId);
    assert.equal(result.statusCode, 200);
    assert.equal(result.json().kind, 'unconfirmed');
    assert.equal(result.json().errorCode, 'PA_OUT_INVALID_ACK');
    const status = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select status from ereporting_declarations where id=$1`, [unsignedId]))).rows[0];
    assert.equal(status.status, 'timeout');
  });

  await t.test('intégrité scellée : altération de l\'archive détectée avant tout envoi', async () => {
    await createInvoice(mod, account, { clientId: b2cClient, issuedOn: '2026-07-02' });
    const julPeriod = { periodStart: '2026-07-01', periodEnd: '2026-07-31', periodicity: 'monthly' };
    const prep = await mod.app.inject({ method: 'POST', url: '/pa/ereporting/declarations', headers: { authorization: `Bearer ${account.token}` }, payload: julPeriod });
    assert.equal(prep.statusCode, 201, prep.body);
    const tamperedId = prep.json().id;
    const row = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select payload_storage_key,payload_sha256,pa_transmission_id from ereporting_declarations where id=$1`, [tamperedId]))).rows[0];
    // Altération du flux archivé (simulation d'une corruption de stockage).
    await mod.storage.writePrivateObject(String(row.payload_storage_key), Buffer.from('{"schema":"aurion.ereporting/1","falsified":true}', 'utf8'), 'application/json');
    const result = await transmit(mod, account, tamperedId);
    assert.equal(result.statusCode, 200);
    assert.equal(result.json().kind, 'unconfirmed');
    assert.equal(result.json().errorCode, 'EREPORTING_PAYLOAD_TAMPERED');
    assert.equal(paLedger.get(String(row.pa_transmission_id)), undefined, 'rien n’a été transmis à la PA pour un flux altéré');
  });

  await t.test('correction : nouvelle déclaration référencée, originale intacte, lignes recalculées', async () => {
    // Point d'entrée de recette conforme pour transmettre la correction.
    await configureEndpoint(mod, account, 'accept');
    const before = await mod.app.inject({ method: 'GET', url: `/pa/ereporting/declarations/${octoberDeclaration}`, headers: { authorization: `Bearer ${account.token}` } });
    const originalSha = before.json().declaration.payload_sha256;
    const originalStatus = before.json().declaration.status;
    await mod.db.withTenant(account.organizationId, () => mod.db.query(
      `update clients set name='Particulier Dupont-Corrigé' where id=$1 and organization_id=$2`,
      [b2cClient, account.organizationId],
    ));

    const correction = await mod.app.inject({ method: 'POST', url: `/pa/ereporting/declarations/${octoberDeclaration}/corrections`, headers: { authorization: `Bearer ${account.token}` }, payload: {} });
    assert.equal(correction.statusCode, 201, correction.body);
    const corrected = correction.json();
    assert.equal(corrected.kind, 'correction');
    assert.equal(corrected.status, 'prepared');

    const after = await mod.app.inject({ method: 'GET', url: `/pa/ereporting/declarations/${octoberDeclaration}`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(after.json().declaration.payload_sha256, originalSha, 'l’originale reste scellée sans altération');
    assert.equal(after.json().declaration.status, originalStatus);

    const correctedDetail = await mod.app.inject({ method: 'GET', url: `/pa/ereporting/declarations/${corrected.id}`, headers: { authorization: `Bearer ${account.token}` } });
    const correctedLine = correctedDetail.json().lines.find(line => line.quote_id === b2cInvoice && line.source_kind === 'transaction');
    assert.ok(correctedLine, 'ligne de transaction B2C retrouvée dans la correction');
    assert.equal(correctedLine.buyer_name, 'Particulier Dupont-Corrigé', 'lignes recalculées à partir des données corrigées');
    const payload = JSON.parse((await mod.app.inject({ method: 'GET', url: `/pa/ereporting/declarations/${corrected.id}/file`, headers: { authorization: `Bearer ${account.token}` } })).rawPayload.toString('utf8'));
    assert.equal(payload.kind, 'correction');
    assert.equal(payload.correctsDeclarationId, octoberDeclaration);
    assert.ok(payload.corrections[0].correctedTransmissionId, 'référence PA de l’originale tracée');

    // Correction transmise et acceptée à son tour.
    const correctionTransmit = await transmit(mod, account, corrected.id);
    assert.equal(correctionTransmit.statusCode, 200);
    assert.equal(correctionTransmit.json().kind, 'accepted');
  });

  await t.test('RLS A/B : aucune fuite de déclarations entre organisations', async () => {
    // L'organisation B ne voit aucune déclaration de l'organisation A (échec fermé + filtre).
    const cross = await mod.app.inject({ method: 'GET', url: `/pa/ereporting/declarations/${octoberDeclaration}`, headers: { authorization: `Bearer ${other.token}` } });
    assert.equal(cross.statusCode, 404, 'détail inaccessible depuis une autre organisation');
    const list = await mod.app.inject({ method: 'GET', url: '/pa/ereporting/declarations', headers: { authorization: `Bearer ${other.token}` } });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(list.json().declarations, [], 'liste vide pour l\'organisation B');

    // Sans contexte tenant (accès direct au pool applicatif) : échec fermé de la RLS.
    const raw = await mod.db.query(`select count(*)::int n from ereporting_declarations`);
    assert.equal(Number(raw.rows[0].n), 0, 'aucune ligne lisible sans contexte tenant');
    // Le contenu est bien là, vérifié via le contexte tenant explicite.
    const viaTenant = await mod.db.withTenant(account.organizationId, () => mod.db.query(`select count(*)::int n from ereporting_declarations`));
    assert.ok(Number(viaTenant.rows[0].n) >= 5, 'déclarations de l\'organisation A présentes dans son périmètre');
  });

  await t.test('périodes : mois/trimestre civils exacts exigés, périodicité contrôlée', async () => {
    const badMonth = await preview(mod, account, { periodStart: '2026-10-05', periodEnd: '2026-10-31' });
    assert.equal(badMonth.statusCode, 400);
    const badQuarter = await preview(mod, account, { periodStart: '2026-10-01', periodEnd: '2026-10-31', periodicity: 'quarterly' });
    assert.equal(badQuarter.statusCode, 400);
    const goodQuarter = await preview(mod, account, { periodStart: '2026-10-01', periodEnd: '2026-12-31', periodicity: 'quarterly' });
    assert.equal(goodQuarter.statusCode, 200);
    const inverted = await preview(mod, account, { periodStart: '2026-10-31', periodEnd: '2026-10-01' });
    assert.equal(inverted.statusCode, 400);
  });

  await t.test('droits : seul owner/admin prépare et transmet une déclaration', async () => {
    const userId = uuid();
    await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `member-${crypto.randomUUID()}@example.test`]);
    await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'member')`, [account.organizationId, userId]);
    const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
    const memberToken = await mod.signAccessToken({ userId, organizationId: account.organizationId, role: 'member', sv });
    const forbidden = await mod.app.inject({ method: 'POST', url: '/pa/ereporting/declarations', headers: { authorization: `Bearer ${memberToken}` }, payload: PERIOD });
    assert.equal(forbidden.statusCode, 403);
    const read = await mod.app.inject({ method: 'GET', url: '/pa/ereporting/declarations', headers: { authorization: `Bearer ${memberToken}` } });
    assert.equal(read.statusCode, 200);
  });
});
