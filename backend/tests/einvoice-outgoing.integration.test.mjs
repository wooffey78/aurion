// Bloc 4 — recette d'intégration réelle de l'émission électronique : PostgreSQL réel, rôle
// applicatif, RLS active, serveur HTTP de recette réel (boucle locale) implémentant le contrat
// sortant « generic » documenté dans docs/PLATEFORME-AGREEE.md § 8.
//
// IMPORTANT : ces tests valident le CONTRAT GÉNÉRIQUE de transmission (adaptateur de référence),
// PAS une PA contractuelle. Aucune plateforme agréée réelle n'est connectée : la transmission
// n'est pas déclarée opérationnelle en production tant qu'aucune PA n'a été validée en sandbox
// (bloc 4 du cahier des charges). Ce qui est prouvé ici : idempotence, absence de doublon côté
// PA, accusés signés obligatoires, états traçables, succès/rejet/timeout/re-tentative, archivage
// sans altération des documents et des accusés, isolation RLS des nouvelles tables.
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

// Secret du point d'entrée d'émission configuré dans les tests : le serveur de recette signe
// ses accusés avec LE MÊME secret (contrat generic : secret partagé, comme le webhook entrant).
const OUT_SECRET = 'integration-test-endpoint-secret-32chars!!';
async function configureEndpoint(mod, account, mode) {
  const response = await mod.app.inject({
    method: 'POST', url: '/pa/outgoing-endpoints', headers: { authorization: `Bearer ${account.token}` },
    payload: { baseUrl: `http://127.0.0.1:${fixturePort}/${mode}`, secret: OUT_SECRET },
  });
  assert.ok([200, 201].includes(response.statusCode), response.body);
}

// ------------------------------------------------------------------ serveur PA de recette
// Implémente le contrat sortant generic : POST signé (X-Aurion-PA-Signature sur le corps),
// accusé JSON signé (même schéma, miroir). Déduplication par X-Aurion-PA-Transmission-Id :
// le premier verdict est conservé et ré-acquitté à l'identique, quel que soit le nombre de
// re-tentatives (miroir de l'idempotence attendue d'une PA réelle).
const paLedger = new Map(); // transmissionId -> { verdict: Buffer; signature: string; payloads: Set<string> }
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
      response.writeHead(200, { 'content-type': 'application/json', 'x-aurion-pa-signature': entry.signature });
      response.end(entry.verdict);
      return;
    }
    const answer = (verdict) => {
      const { body, signature } = fixtureAck(verdict);
      paLedger.set(transmissionId, { verdict: body, signature, payloads: new Set([sha256(payload)]) });
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
    if (mode === 'reject') answer({ status: 'rejected', code: 'PPF_FORMAT_INVALID', message: 'Document refusé par la PA de recette.' });
    else if (mode === 'unsigned') {
      // Accusé NON signé : l'adaptateur doit refuser de conclure (invalid_ack => « issue non confirmée »).
      paLedger.set(transmissionId, { verdict: Buffer.from('{}'), signature: '', payloads: new Set([sha256(payload)]) });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'accepted', paReference: 'PA-FORGERY' }));
    } else answer({ status: 'accepted', paReference: `PA-ACK-${transmissionId.slice(0, 8)}` });
  });
});

// ------------------------------------------------------------------ fixtures de comptes
const createdOrganizations = new Set();

async function seedAccount(mod) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test Émission')`, [organizationId, `Entreprise Émission ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`update organizations set siren=$2, siret=$3, address=$4, postal_code=$5, city=$6 where id=$1`, [organizationId, '123456789', '12345678900011', '12 rue des Lilas', '75011', 'Paris']);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `out-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture émission')`, [organizationId]);
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

async function createInvoice(mod, account, overrides = {}) {
  const response = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: { authorization: `Bearer ${account.token}` },
    payload: {
      documentType: 'invoice',
      intervention: 'Réparation électronique',
      laborSellingHt: 150,
      vatRate: 20,
      mileageKm: 0,
      mileageInternalRate: 0,
      mileageClientRate: 0,
      einvoiceOperationCategory: 'PS',
      einvoiceBuyerSiren: '987654321',
      ...overrides,
    },
  });
  return response;
}

async function prepare(mod, account, invoiceId, payload = {}) {
  return mod.app.inject({
    method: 'POST', url: `/pa/outgoing/prepare/${invoiceId}`, headers: { authorization: `Bearer ${account.token}` },
    payload: { format: 'ubl', operationCategory: 'PS', buyerSiren: '987654321', vatOnPayment: false, deliveryAddress: null, ...payload },
  });
}

async function transmit(mod, account, transmissionId) {
  return mod.app.inject({
    method: 'POST', url: `/pa/outgoing/${transmissionId}/transmit`, headers: { authorization: `Bearer ${account.token}` }, payload: {},
  });
}

test('Émission électronique : configuration du point d’entrée, préparation, transmission, accusés, reprises, RLS', { skip, serial: true }, async t => {
  const mod = await boot();
  await new Promise(resolve => fixtureServer.listen(0, '127.0.0.1', resolve));
  fixturePort = fixtureServer.address().port;
  const base = `http://127.0.0.1:${fixturePort}`;

  const account = await seedAccount(mod);
  const other = await seedAccount(mod);
  t.after(async () => { await cleanupOrganizations(mod); });
  await configureEndpoint(mod, account, 'accept');

  // RLS : les trois nouvelles tables portent la politique tenant_isolation.
  const policies = Number((await mod.db.query(`
    select count(*)::int n from pg_policies where tablename in
      ('pa_outgoing_endpoints','outgoing_electronic_invoices','outgoing_transmission_events')
      and policyname='tenant_isolation'`)).rows[0]?.n);
  assert.equal(policies, 3, '3 politiques tenant_isolation pour les tables du bloc 4');

  await t.test('endpoint d’émission : secret trop court et URL non HTTPS refusés, configuration valide acceptée', async () => {
    const badSecret = await mod.app.inject({ method: 'POST', url: '/pa/outgoing-endpoints', headers: { authorization: `Bearer ${account.token}` }, payload: { baseUrl: `${base}/accept`, secret: 'court' } });
    assert.equal(badSecret.statusCode, 400);
    const badUrl = await mod.app.inject({ method: 'POST', url: '/pa/outgoing-endpoints', headers: { authorization: `Bearer ${account.token}` }, payload: { baseUrl: 'ftp://example.invalid/x', secret: OUT_SECRET } });
    assert.equal(badUrl.statusCode, 400);
    const ok = await mod.app.inject({ method: 'POST', url: '/pa/outgoing-endpoints', headers: { authorization: `Bearer ${account.token}` }, payload: { baseUrl: `${base}/accept`, secret: OUT_SECRET } });
    assert.equal(ok.statusCode, 201, ok.body);
    assert.equal(ok.json().configured, true);
    // Le secret n'apparaît ni dans la réponse ni en clair en base.
    assert.ok(!JSON.stringify(ok.json()).includes('integration-test-endpoint-secret'), 'secret jamais renvoyé');
    const row = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select secret_encrypted from pa_outgoing_endpoints where organization_id=$1 and active=true`, [account.organizationId]))).rows[0];
    assert.ok(row.secret_encrypted.startsWith('v2.'), 'secret chiffré au repos (AES-256-GCM v2)');
    const view = await mod.app.inject({ method: 'GET', url: '/pa/outgoing-endpoints', headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(view.json().configured, true);
  });

  let invoiceId, transmissionId;
  await t.test('préparation : mentions obligatoires exigées, document archivé et scellé', async () => {
    const created = await createInvoice(mod, account);
    assert.equal(created.statusCode, 201, created.body);
    invoiceId = created.json().id;

    const missingCategory = await prepare(mod, account, invoiceId, { operationCategory: '' });
    assert.equal(missingCategory.statusCode, 422);
    assert.equal(missingCategory.json().error, 'EINVOICE_MENTION_MISSING');
    const badSiren = await prepare(mod, account, invoiceId, { buyerSiren: '12345' });
    assert.equal(badSiren.statusCode, 422);
    assert.equal(badSiren.json().error, 'EINVOICE_MENTION_MISSING');

    const ok = await prepare(mod, account, invoiceId);
    assert.equal(ok.statusCode, 201, ok.body);
    assert.equal(ok.json().status, 'prepared');
    transmissionId = ok.json().id;
    const digest = ok.json().payloadSha256;
    assert.match(digest, /^[0-9a-f]{64}$/);
    // Le fichier archivé est exactement le document scellé.
    const file = await mod.app.inject({ method: 'GET', url: `/pa/outgoing/${transmissionId}/file`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(file.statusCode, 200);
    assert.equal(sha256(file.rawPayload), digest, 'archive = sceau SHA-256');
    assert.ok(file.rawPayload.toString('utf8').includes('<cbc:ProfileID>PS</cbc:ProfileID>'), 'BT-23 présent dans l’archive');
    assert.ok(file.rawPayload.toString('utf8').includes('<cbc:CompanyID schemeID="0002">987654321</cbc:CompanyID>'), 'SIREN client dans l’archive');

    // Préparation identique : idempotente (même transmission, aucune régénération).
    const again = await prepare(mod, account, invoiceId);
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().regenerated, false);
    assert.equal(again.json().id, transmissionId);
    // Régénération dans un autre format : même identifiant d'idempotence PA, nouvelle archive.
    const cii = await prepare(mod, account, invoiceId, { format: 'cii' });
    assert.equal(cii.statusCode, 200);
    assert.equal(cii.json().regenerated, true);
    assert.equal(cii.json().id, transmissionId);
    const ciiFile = await mod.app.inject({ method: 'GET', url: `/pa/outgoing/${transmissionId}/file`, headers: { authorization: `Bearer ${account.token}` } });
    assert.ok(ciiFile.rawPayload.toString('utf8').includes('rsm:CrossIndustryInvoice'), 'archive remplacée par le CII');
  });

  await t.test('transmission acceptée : accusé signé archivé, états traçables, pas de double transmission', async () => {
    const result = await transmit(mod, account, transmissionId);
    assert.equal(result.statusCode, 200, result.body);
    const body = result.json();
    assert.equal(body.kind, 'accepted');
    assert.ok(body.paReference.startsWith('PA-ACK-'), body.paReference);
    // L'accusé est archivé sans altération et scellé.
    const detail = await mod.app.inject({ method: 'GET', url: `/pa/outgoing/${transmissionId}`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(detail.statusCode, 200);
    const info = detail.json().transmission;
    assert.equal(info.status, 'accepted');
    assert.ok(info.ack_sha256, 'accusé scellé');
    const ack = await mod.app.inject({ method: 'GET', url: `/pa/outgoing/${transmissionId}/ack`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(ack.statusCode, 200);
    assert.equal(sha256(ack.rawPayload), info.ack_sha256, 'accusé archivé = sceau');
    assert.ok(JSON.parse(ack.rawPayload.toString('utf8')).status === 'accepted');
    // La facture est marquée acceptée (accusé réel requis).
    const q = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select electronic_status from quotes where id=$1`, [invoiceId]))).rows[0];
    assert.equal(q.electronic_status, 'accepted');
    // Deuxième transmission : refusée (pas de doublon).
    const second = await transmit(mod, account, transmissionId);
    assert.equal(second.statusCode, 409);
    assert.equal(second.json().error, 'EINVOICE_ALREADY_ACCEPTED');
    // Journal traçable : préparation, démarrage, accusé.
    const events = detail.json().events.map(e => e.kind);
    assert.ok(events.includes('outgoing.prepared'));
    assert.ok(events.includes('outgoing.transmission_started'));
    assert.ok(events.includes('outgoing.ack_accepted'));
    // Un seul verdict PA : aucun doublon côté PA.
    const ledgerEntry = paLedger.get((await mod.db.withTenant(account.organizationId, () => mod.db.query(`select pa_transmission_id from outgoing_electronic_invoices where id=$1`, [transmissionId]))).rows[0].pa_transmission_id);
    assert.equal(ledgerEntry.payloads.size, 1, 'la PA n’a reçu qu’une charge utile pour ce document');
  });

  let rejectedInvoice, rejectedTransmission;
  await t.test('transmission rejetée : accusé archivé, statut rejeté, re-tentative idempotente sans doublon', async () => {
    paRoutesFixture.set('/reject', 'reject');
    await configureEndpoint(mod, account, 'reject');
    const created = await createInvoice(mod, account);
    rejectedInvoice = created.json().id;
    const prep = await prepare(mod, account, rejectedInvoice);
    rejectedTransmission = prep.json().id;
    // Régénère en UBL (précédent test a basculé le format CII pour cette autre facture non : nouvelle facture => UBL par défaut).
    const result = await transmit(mod, account, rejectedTransmission);
    assert.equal(result.statusCode, 200, result.body);
    const body = result.json();
    assert.equal(body.kind, 'rejected');
    assert.equal(body.code, 'PPF_FORMAT_INVALID');
    const q = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select electronic_status from quotes where id=$1`, [rejectedInvoice]))).rows[0];
    assert.equal(q.electronic_status, 'rejected', 'statut réglementaire : rejeté');
    const ack = await mod.app.inject({ method: 'GET', url: `/pa/outgoing/${rejectedTransmission}/ack`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(ack.statusCode, 200);
    // Re-tentative : le MÊME identifiant PA est réutilisé ; la PA ré-acquitte le premier verdict.
    const retry = await transmit(mod, account, rejectedTransmission);
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().kind, 'rejected');
    const row = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select pa_transmission_id,attempts,status from outgoing_electronic_invoices where id=$1`, [rejectedTransmission]))).rows[0];
    assert.equal(row.attempts, 2, 'deux tentatives tracées');
    assert.equal(row.status, 'rejected');
    const ledgerEntry = paLedger.get(row.pa_transmission_id);
    assert.equal(ledgerEntry.payloads.size, 1, 'la re-tentative n’a pas créé de doublon côté PA (même verdict ré-acquitté)');
    paRoutesFixture.delete('/reject');
  });

  let timeoutInvoice, timeoutTransmission;
  await t.test('délai dépassé : issue NON confirmée, la facture reste non transmise, reprise réussie avec le même identifiant', async () => {
    paRoutesFixture.set('/slow', 'slow');
    await configureEndpoint(mod, account, 'slow');
    const created = await createInvoice(mod, account);
    timeoutInvoice = created.json().id;
    const prep = await prepare(mod, account, timeoutInvoice);
    timeoutTransmission = prep.json().id;
    const result = await transmit(mod, account, timeoutTransmission);
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().kind, 'unconfirmed');
    assert.equal(result.json().errorCode, 'PA_OUT_TIMEOUT');
    const row = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select status,error_code from outgoing_electronic_invoices where id=$1`, [timeoutTransmission]))).rows[0];
    assert.equal(row.status, 'timeout');
    assert.equal(row.error_code, 'PA_OUT_TIMEOUT');
    // La facture réglementaire n'est PAS marquée transmise/acceptée/rejetée : reste « ready ».
    const q = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select electronic_status from quotes where id=$1`, [timeoutInvoice]))).rows[0];
    assert.notEqual(q.electronic_status, 'accepted');
    assert.notEqual(q.electronic_status, 'rejected');
    assert.notEqual(q.electronic_status, 'sent');
    assert.equal(q.electronic_status, 'ready', 'état réglementaire inchangé (document préparé, non transmis)');
    // Aucun accusé archivé.
    const noAck = await mod.app.inject({ method: 'GET', url: `/pa/outgoing/${timeoutTransmission}/ack`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(noAck.statusCode, 404);
    // Reprise : la PA de recette ré-acquitte le premier verdict (timeout => réponse différée déjà
    // envoyée) ; l'identifiant PA reste le même et la PA n'a toujours qu'une charge utile.
    paRoutesFixture.set('/slow', 'accept');
    // Le serveur de recette renvoie maintenant immédiatement l'accusé mémorisé (déduplication).
    const retry = await transmit(mod, account, timeoutTransmission);
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().kind, 'accepted');
    const retryRow = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select pa_transmission_id,attempts,status from outgoing_electronic_invoices where id=$1`, [timeoutTransmission]))).rows[0];
    assert.equal(retryRow.attempts, 2);
    assert.equal(retryRow.status, 'accepted');
    const ledgerEntry = paLedger.get(retryRow.pa_transmission_id);
    assert.equal(ledgerEntry.payloads.size, 1, 'aucun doublon transmis à la PA malgré le timeout initial');
    paRoutesFixture.delete('/slow');
  });

  await t.test('accusé non signé refusé : l’émission refuse de conclure sans authentification', async () => {
    paRoutesFixture.set('/unsigned', 'unsigned');
    await configureEndpoint(mod, account, 'unsigned');
    const created = await createInvoice(mod, account);
    const invoice = created.json().id;
    const prep = await prepare(mod, account, invoice);
    const id = prep.json().id;
    const result = await transmit(mod, account, id);
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().kind, 'unconfirmed');
    assert.equal(result.json().errorCode, 'PA_OUT_INVALID_ACK');
    const row = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select status from outgoing_electronic_invoices where id=$1`, [id]))).rows[0];
    assert.equal(row.status, 'timeout');
    const q = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select electronic_status from quotes where id=$1`, [invoice]))).rows[0];
    assert.equal(q.electronic_status, 'ready', 'jamais de statut transmis sans accusé authentifié');
    paRoutesFixture.delete('/unsigned');
  });

  await t.test('intégrité du document scellé : altération de l’archive => transmission refusée', async () => {
    const created = await createInvoice(mod, account);
    const invoice = created.json().id;
    const prep = await prepare(mod, account, invoice);
    const id = prep.json().id;
    const key = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select payload_storage_key from outgoing_electronic_invoices where id=$1`, [id]))).rows[0].payload_storage_key;
    // Altère le fichier archivé (stockage local de recette).
    const { writeFileSync } = await import('node:fs');
    writeFileSync(pathJoin(mod.storage.STORAGE_BASE, key), Buffer.from('<Invoice>TAMPERED</Invoice>', 'utf8'));
    const result = await transmit(mod, account, id);
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().kind, 'unconfirmed');
    assert.equal(result.json().errorCode, 'EINVOICE_PAYLOAD_TAMPERED');
    const row = (await mod.db.withTenant(account.organizationId, () => mod.db.query(`select status from outgoing_electronic_invoices where id=$1`, [id]))).rows[0];
    assert.equal(row.status, 'timeout');
  });

  await t.test('isolation RLS : aucune fuite entre organisations, échec fermé sans contexte', async () => {
    // Org B ne voit ni les transmissions ni les endpoints d'org A.
    const foreign = await mod.app.inject({ method: 'GET', url: `/pa/outgoing/${transmissionId}`, headers: { authorization: `Bearer ${other.token}` } });
    assert.equal(foreign.statusCode, 404);
    const foreignList = await mod.app.inject({ method: 'GET', url: '/pa/outgoing', headers: { authorization: `Bearer ${other.token}` } });
    assert.deepEqual(foreignList.json().transmissions, []);
    const foreignEndpoint = await mod.app.inject({ method: 'POST', url: '/pa/outgoing-endpoints', headers: { authorization: `Bearer ${other.token}` }, payload: { baseUrl: `${base}/accept`, secret: 'other-org-endpoint-secret-32chars!!!' } });
    assert.equal(foreignEndpoint.statusCode, 201);
    // Sans contexte tenant : échec fermé sur les tables protégées.
    const closed = await mod.db.query(`select count(*)::int n from outgoing_electronic_invoices`);
    assert.equal(closed.rows[0].n, 0, 'aucune ligne visible sans contexte tenant');
    const writeClosed = await mod.db.query(`insert into outgoing_electronic_invoices(organization_id,quote_id,format,pa_transmission_id,payload_storage_key,payload_filename,payload_sha256) values($1,$2,'ubl',$3,'k','f',$4)`, [other.organizationId, uuid(), uuid(), 'a'.repeat(64)]).catch(e => e);
    assert.equal(writeClosed.code, '42501', 'écriture sans contexte refusée par WITH CHECK (RLS)');
    // Le rôle applicatif ne peut pas consulter le secret chiffré d'une autre organisation.
    const secrets = await mod.db.query(`select count(*)::int n from pa_outgoing_endpoints where organization_id=$1`, [account.organizationId]);
    assert.equal(secrets.rows[0].n, 0, 'endpoints d’A invisibles sans contexte tenant');
    await mod.db.query(`delete from pa_outgoing_endpoints where organization_id=$1`, [other.organizationId]).catch(() => {});
  });

  await t.test('liste et filtres : transmissions consultables avec leur journal', async () => {
    const list = await mod.app.inject({ method: 'GET', url: '/pa/outgoing', headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(list.statusCode, 200);
    const rows = list.json().transmissions;
    assert.ok(rows.length >= 4, 'au moins une transmission par cas de test');
    const filtered = await mod.app.inject({ method: 'GET', url: `/pa/outgoing?invoiceId=${invoiceId}`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(filtered.json().transmissions.length, 1);
    const byStatus = await mod.app.inject({ method: 'GET', url: '/pa/outgoing?status=accepted', headers: { authorization: `Bearer ${account.token}` } });
    assert.ok(byStatus.json().transmissions.every(x => x.status === 'accepted'));
    const detail = await mod.app.inject({ method: 'GET', url: `/pa/outgoing/${rows[0].id}`, headers: { authorization: `Bearer ${account.token}` } });
    assert.ok(detail.json().events.length >= 1);
    assert.ok(detail.json().transmission.invoice_number, 'numéro de facture joint au détail');
  });
});
