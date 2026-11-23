// Blocs 6-bis & 7 — ETag/If-None-Match : téléchargement de justificatifs (304 = copie locale
// déjà à jour) et référentiel micro daté versionné (fraîcheur sans retéléchargement, cache
// hors connexion possible côté client). Auth obligatoire, isolation tenant inchangée.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

process.env.NODE_ENV ||= 'test';
process.env.DATABASE_URL ||= 'postgresql://aurion_runtime:test@127.0.0.1:5432/aurion_it078';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const appPath = fileURLToPath(new URL('../dist/app.js', import.meta.url));
const dbPath = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const authPath = fileURLToPath(new URL('../dist/plugins/auth.js', import.meta.url));
const ready = existsSync(appPath) && existsSync(dbPath) && Boolean(process.env.DATABASE_URL)
  && process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1, DATABASE_URL ou AURION_ADMIN_DATABASE_URL non défini';

const modules = ready ? { app: null, db: null, signAccessToken: null } : null;
test.after(async () => { if (modules) { await modules.db.db.end().catch(() => {}); if (modules.db.adminDb) await modules.db.adminDb.end().catch(() => {}); } });
async function boot() {
  if (!modules.app) {
    const [{ buildApp }, db, auth] = await Promise.all([import(appPath), import(dbPath), import(authPath)]);
    modules.app = await buildApp(); modules.db = db; modules.signAccessToken = auth.signAccessToken;
  }
  return modules;
}
const uuid = () => crypto.randomUUID();
async function seedAccount(mod) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 6bis/7')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `b67-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 6bis/7')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('bloc6bis: ETag du téléchargement — 200 avec ETag, If-None-Match → 304, contenu inchangé', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const authA = { authorization: `Bearer ${A.token}` };
  // Upload d'un justificatif via l'API réelle.
  // Node 24 : File et FormData sont globaux.
  const form = new FormData();
  form.append('file', new File(['%PDF-1.4 fixture bloc 6bis'], 'justificatif.pdf', { type: 'application/pdf' }));
  const up = await mod.app.inject({ method: 'POST', url: '/documents/upload', headers: authA, payload: form });
  assert.ok([200, 201].includes(up.statusCode), up.body);
  const docId = up.json().document?.id || up.json().id;
  assert.ok(docId, 'document créé');

  const r1 = await mod.app.inject({ method: 'GET', url: `/documents/${docId}/download`, headers: authA });
  assert.equal(r1.statusCode, 200);
  const etag = r1.headers.etag;
  assert.ok(etag && String(etag).startsWith('W/'), `ETag faible présent : ${etag}`);
  assert.ok(String(r1.body).includes('%PDF-1.4'), 'contenu servi intact');

  const r2 = await mod.app.inject({ method: 'GET', url: `/documents/${docId}/download`, headers: { ...authA, 'if-none-match': etag } });
  assert.equal(r2.statusCode, 304, 'If-None-Match connu → 304 sans corps (copie locale déjà à jour)');

  // Nouvelle version du justificatif → ETag différent (le client retélécharge).
  await mod.db.withTenant(A.organizationId, async () => {
    await mod.db.query(`update documents set created_at=now()+interval '1 second' where id=$1`, [docId]);
  });
  const r3 = await mod.app.inject({ method: 'GET', url: `/documents/${docId}/download`, headers: { ...authA, 'if-none-match': etag } });
  assert.equal(r3.statusCode, 200, 'version changée → 200 (la copie locale est périmée)');
  assert.notEqual(r3.headers.etag, etag, 'ETag différencié par version');
});

test('bloc7: référentiel micro daté — version, historique, ETag/304, auth requise', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const authA = { authorization: `Bearer ${A.token}` };
  const r1 = await mod.app.inject({ method: 'GET', url: '/micro/referential', headers: authA });
  assert.equal(r1.statusCode, 200);
  const body = r1.json();
  assert.ok(Array.isArray(body.rates) && Array.isArray(body.categories), 'rates et catégories servis');
  assert.ok(Array.isArray(body.history), 'historique des versions datées servi');
  const etag = r1.headers.etag;
  assert.ok(etag, 'ETag de version présent');
  const r2 = await mod.app.inject({ method: 'GET', url: '/micro/referential', headers: { ...authA, 'if-none-match': etag } });
  assert.equal(r2.statusCode, 304, 'version inchangée → 304');
  const noAuth = await mod.app.inject({ method: 'GET', url: '/micro/referential' });
  assert.equal(noAuth.statusCode, 401, 'authentification requise');
});
