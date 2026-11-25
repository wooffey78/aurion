// Intégration du stockage cloud (cahier des charges 15.4.0, §9) avec un double local de Google et une base PostgreSQL réelle.
// Prérequis : `npm run build` (dist/) et DATABASE_URL pointant vers une base de test migrée. Sinon les tests sont ignorés
// avec la raison affichée (ils ne sont jamais déclarés réussis sans exécution).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Le double Google est chargé dynamiquement : son absence ne doit pas faire échouer la collecte
// des tests unitaires, et l'intégration reste explicitement ignorée tant qu'il n'est pas livré.
let startFakeGoogle;

const distDrive = process.env.AURION_CLOUD_TEST_MODULE || fileURLToPath(new URL('../dist/services/cloud-drive.js', import.meta.url));
const distDb = process.env.AURION_CLOUD_TEST_DB_MODULE || fileURLToPath(new URL('../dist/db.js', import.meta.url));
const helperPath = fileURLToPath(new URL('./helpers/fake-google.mjs', import.meta.url));
const ready = existsSync(distDrive) && existsSync(distDb) && existsSync(helperPath)
  && Boolean(process.env.DATABASE_URL) && process.env.AURION_INTEGRATION_TESTS === '1';
const skip = ready ? false : 'dist/ ou double Google absent, AURION_INTEGRATION_TESTS≠1 ou DATABASE_URL non défini';

let google, drive, db, orgA, orgB, userA, userB;
const uuid = () => crypto.randomUUID();

test.before(async () => {
  if (!ready) return;
  ({ startFakeGoogle } = await import('./helpers/fake-google.mjs'));
  google = await startFakeGoogle();
  process.env.AURION_GOOGLE_API_BASE_FOR_TESTS = google.base;
  process.env.AURION_GOOGLE_TOKEN_URL_FOR_TESTS = `${google.base}/token`;
  process.env.AURION_GOOGLE_REVOKE_URL_FOR_TESTS = `${google.base}/revoke`;
  process.env.GOOGLE_CLIENT_ID ||= 'test-client'; process.env.GOOGLE_CLIENT_SECRET ||= 'test-secret';
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||= 'k'.repeat(48);
  drive = await import(distDrive); db = await import(distDb);
  orgA = uuid(); orgB = uuid(); userA = uuid(); userB = uuid();
  for (const [o, u, mail] of [[orgA, userA, 'a'], [orgB, userB, 'b']]) {
    await db.query(`insert into organizations(id,name,activity) values($1,$2,'Test')`, [o, `Org ${mail}`]);
    await db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [u, `${mail}-${o}@example.test`]);
  }
});
test.after(async () => {
  if (!ready) return;
  for (const o of [orgA, orgB]) await db.query('delete from organizations where id=$1', [o]).catch(() => {});
  for (const u of [userA, userB]) await db.query('delete from users where id=$1', [u]).catch(() => {});
  await google.close(); await db.db?.end?.().catch(() => {});
});

// RLS 074 : les appels directs aux services s'exécutent dans le contexte de leur organisation,
// exactement comme le font les routes HTTP authentifiées (see dist/db.js withTenant).
const connect = async (org, user) => db.withTenant(org, async () => drive.saveConnection(org, user, await drive.exchangeCode('good-code')));

test('connexion : le jeton est chiffré au repos et le périmètre drive.file est exigé', { skip }, async () => {
  await connect(orgA, userA);
  const row = (await db.withTenant(orgA, () => db.query('select access_token_enc,refresh_token_enc,scopes from cloud_connections where organization_id=$1', [orgA]))).rows[0];
  assert.ok(row.access_token_enc && !row.access_token_enc.startsWith('at_'));
  assert.ok(row.refresh_token_enc && !row.refresh_token_enc.startsWith('rt_'));
  assert.match(row.scopes, /drive\.file/);
  await assert.rejects(db.withTenant(orgB, () => drive.saveConnection(orgB, userB, { access_token: 'x', scope: 'openid' })), /drive/i);
  const status = await db.withTenant(orgA, () => drive.cloudStatus(orgA));
  assert.equal(JSON.stringify(status).includes('at_'), false, 'aucun jeton dans le statut renvoyé au client');
});

test('arborescence : créée une seule fois, même après une seconde connexion', { skip }, async () => {
  const first = await db.withTenant(orgA, () => drive.ensureFolderTree(orgA));
  await connect(orgA, userA);
  const second = await db.withTenant(orgA, () => drive.ensureFolderTree(orgA));
  assert.deepEqual(second, first);
  const folders = [...google.state.files.values()].filter(f => f.mimeType === 'application/vnd.google-apps.folder' && String(f.appProperties?.aurionRoot || f.appProperties?.aurionFolder || '').includes(orgA));
  assert.equal(folders.length, 10);
  assert.ok(folders.some(f => f.name === 'Aurion — Mon entreprise'));
  assert.ok(folders.some(f => f.name === '07_Notes_de_frais'));
});

test('transfert : confirmé par le fournisseur, rejouable sans doublon, relisible', { skip }, async () => {
  const bytes = Buffer.from('%PDF-1.4 facture test');
  const input = { organizationId: orgA, userId: userA, clientRef: 'ref-' + uuid().slice(0, 8), sourceKind: 'file', fileName: 'FAC-2026-0001_Client-Dupont.pdf', mimeType: 'application/pdf', bytes };
  const a = await db.withTenant(orgA, () => drive.uploadDocument(input));
  assert.equal(a.document.status, 'synced');
  const b = await db.withTenant(orgA, () => drive.uploadDocument(input));
  assert.equal(b.replay, true);
  assert.equal([...google.state.files.values()].filter(f => f.appProperties?.aurionClientRef === input.clientRef).length, 1);
  const back = await db.withTenant(orgA, () => drive.downloadDocument(orgA, a.document.id));
  assert.deepEqual(back.bytes, bytes);
});

test('reprise : réponse perdue après création distante, aucun doublon au nouvel essai', { skip }, async () => {
  const input = { organizationId: orgA, userId: userA, clientRef: 'lost-' + uuid().slice(0, 8), sourceKind: 'file', fileName: 'perdu.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.4 perdu') };
  google.state.dropNextUploadResponse = true;
  await assert.rejects(db.withTenant(orgA, () => drive.uploadDocument(input)));
  const row = (await db.withTenant(orgA, () => db.query('select status from cloud_documents where organization_id=$1 and client_ref=$2', [orgA, input.clientRef]))).rows[0];
  assert.equal(row.status, 'error', 'jamais « synchronisé » sans confirmation');
  const retry = await db.withTenant(orgA, () => drive.uploadDocument(input));
  assert.equal(retry.document.status, 'synced');
  assert.equal([...google.state.files.values()].filter(f => f.appProperties?.aurionClientRef === input.clientRef).length, 1);
});

test('jeton expiré : renouvellement transparent ; révocation : état explicite sans plantage', { skip }, async () => {
  google.state.expireAccessTokens = true;
  const ok = await db.withTenant(orgA, () => drive.uploadDocument({ organizationId: orgA, userId: userA, clientRef: 'exp-' + uuid().slice(0, 8), sourceKind: 'file', fileName: 'x.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.4 exp') }));
  assert.equal(ok.document.status, 'synced');
  for (const t of google.state.refresh.keys()) google.state.revoked.add(t);
  google.state.expireAccessTokens = true;
  await assert.rejects(db.withTenant(orgA, () => drive.uploadDocument({ organizationId: orgA, userId: userA, clientRef: 'rev-' + uuid().slice(0, 8), sourceKind: 'file', fileName: 'y.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.4 rev') })), e => e.code === 'CLOUD_REVOKED');
  assert.equal((await db.withTenant(orgA, () => drive.cloudStatus(orgA))).status, 'revoked');
  google.state.revoked.clear(); await connect(orgA, userA);
});

test('quota : seuils, notification unique mise à jour, saturation jamais présentée comme un succès', { skip }, async () => {
  google.state.quota = { limit: '1000', usage: '850', usageInDrive: '800', usageInDriveTrash: '10' };
  let snap = await db.withTenant(orgA, () => drive.refreshQuota(orgA, { force: true }));
  assert.equal(snap.level, 'warning'); assert.equal(snap.availableBytes, 150);
  google.state.quota.usage = '960'; snap = await db.withTenant(orgA, () => drive.refreshQuota(orgA, { force: true }));
  assert.equal(snap.level, 'critical');
  const events = (await db.withTenant(orgA, () => db.query(`select title,severity,is_read from dashboard_journal_events where organization_id=$1 and dedupe_key='cloud-quota'`, [orgA]))).rows;
  assert.equal(events.length, 1); assert.match(events[0].title, /critique/);
  google.state.quotaFull = true;
  await assert.rejects(db.withTenant(orgA, () => drive.uploadDocument({ organizationId: orgA, userId: userA, clientRef: 'full-' + uuid().slice(0, 8), sourceKind: 'file', fileName: 'z.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.4 full') })), e => e.code === 'CLOUD_QUOTA_EXCEEDED');
  google.state.quotaFull = false;
  assert.match((await db.query(`select title from dashboard_journal_events where organization_id=$1 and dedupe_key='cloud-quota'`, [orgA])).rows[0].title, /saturé/);
  google.state.quota = { usage: '10' }; snap = await db.withTenant(orgA, () => drive.refreshQuota(orgA, { force: true }));
  assert.equal(snap.totalKnown, false, 'capacité non communiquée : aucune valeur inventée');
});

test('versions : conflit détecté sans écrasement ; facture émise protégée', { skip }, async () => {
  const sourceId = uuid();
  const base = { organizationId: orgA, userId: userA, sourceKind: 'expense_receipt', sourceId, fileName: 'NDF.pdf', mimeType: 'application/pdf' };
  const v1 = await db.withTenant(orgA, () => drive.uploadDocument({ ...base, clientRef: 'v1-' + uuid().slice(0, 8), bytes: Buffer.from('%PDF-1.4 v1') }));
  const v2 = await db.withTenant(orgA, () => drive.uploadDocument({ ...base, clientRef: 'v2-' + uuid().slice(0, 8), bytes: Buffer.from('%PDF-1.4 v2'), baseVersion: 1 }));
  assert.equal(v2.document.version, 2);
  const stale = await db.withTenant(orgA, () => drive.uploadDocument({ ...base, clientRef: 'v3-' + uuid().slice(0, 8), bytes: Buffer.from('%PDF-1.4 autre appareil'), baseVersion: 1 }));
  assert.equal(stale.conflict, true); assert.match(stale.document.file_name, /_conflit_/);
  assert.ok(google.state.files.get(v1.document.remote_id), 'la version 1 est conservée');
  const inv = { organizationId: orgA, userId: userA, sourceKind: 'invoice', sourceId: uuid(), fileName: 'FAC-2026-0002.pdf', mimeType: 'application/pdf' };
  await db.withTenant(orgA, () => drive.uploadDocument({ ...inv, clientRef: 'i1-' + uuid().slice(0, 8), bytes: Buffer.from('%PDF-1.4 facture') }));
  await assert.rejects(db.withTenant(orgA, () => drive.uploadDocument({ ...inv, clientRef: 'i2-' + uuid().slice(0, 8), bytes: Buffer.from('%PDF-1.4 facture modifiée') })), e => e.code === 'ISSUED_DOCUMENT_LOCKED');
  const explicit = await db.withTenant(orgA, () => drive.uploadDocument({ ...inv, clientRef: 'i3-' + uuid().slice(0, 8), bytes: Buffer.from('%PDF-1.4 facture modifiée'), allowNewVersion: true }));
  assert.match(explicit.document.file_name, /_v2\.pdf$/);
});

test('cloisonnement : une entreprise ne lit jamais les documents d’une autre', { skip }, async () => {
  const doc = (await db.query(`select id from cloud_documents where organization_id=$1 and status='synced' limit 1`, [orgA])).rows[0];
  await assert.rejects(db.withTenant(orgB, () => drive.downloadDocument(orgB, doc.id)), e => e.statusCode === 404);
  assert.equal((await db.withTenant(orgB, () => drive.cloudStatus(orgB))).status, 'not_connected');
});

test('déconnexion : secrets effacés, fichiers du cloud conservés', { skip }, async () => {
  const before = google.state.files.size;
  const r = await db.withTenant(orgA, () => drive.disconnect(orgA, userA));
  assert.equal(r.ok, true);
  const row = (await db.withTenant(orgA, () => db.query('select status,access_token_enc,refresh_token_enc from cloud_connections where organization_id=$1', [orgA]))).rows[0];
  assert.equal(row.status, 'disconnected'); assert.equal(row.access_token_enc, null); assert.equal(row.refresh_token_enc, null);
  assert.equal(google.state.files.size, before);
});
