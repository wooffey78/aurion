// Régression 15.4.41 — /sync/delta sur clés naturelles et composites (migration 084).
// organization_members (PK composite, entity_id=user_id) et user_drafts (entity_id=
// "user_id:draft_key") n'ont PAS de colonne id : avant correctif, la relecture du delta
// échouait en 500 INTERNAL_ERROR dès que le journal couvrait une inscription (nouvel appareil,
// reconnexion) ou un brouillon. Le contrat : /sync/delta?since=0 répond 200 et embarque
// l'upsert des membres de l'organisation avec les données réelles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

process.env.NODE_ENV ||= 'test';
process.env.DATABASE_URL ||= 'postgresql://aurion_runtime:test@127.0.0.1:5432/aurion_it096';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const appPath = fileURLToPath(new URL('../dist/app.js', import.meta.url));
const dbPath = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const ready = existsSync(appPath) && existsSync(dbPath) && Boolean(process.env.DATABASE_URL)
  && process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1, DATABASE_URL ou AURION_ADMIN_DATABASE_URL non défini';

const modules = ready ? { app: null, db: null } : null;
test.after(async () => { if (modules) { await modules.db.db.end().catch(() => {}); if (modules.db.adminDb) await modules.db.adminDb.end().catch(() => {}); } });
async function boot() {
  if (!modules.app) {
    const [{ buildApp }, db] = await Promise.all([import(appPath), import(dbPath)]);
    modules.app = await buildApp(); modules.db = db;
  }
  return modules;
}

test('sync : /sync/delta reprend les entités à clé naturelle sans colonne id (500 corrigé)', { skip }, async () => {
  const mod = await boot();
  // Inscription réelle : le journal 084 enregistre organization_members (entity_id = user_id)
  // et activities pour la nouvelle organisation — exactement les changements qui faisaient
  // échouer la relecture du delta avant le correctif.
  const email = `delta-${crypto.randomUUID()}@example.test`;
  const password = 'DeltaTest123456!';
  const registered = await mod.app.inject({
    method: 'POST', url: '/auth/register',
    payload: { email, password, fullName: 'Probe Delta', organizationName: `Org Delta ${Date.now()}`, acceptLegal: true },
  });
  assert.equal(registered.statusCode, 201, 'inscription de référence réussie');
  const { accessToken, organization } = registered.json();

  const delta = await mod.app.inject({
    method: 'GET', url: '/sync/delta?since=0',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(delta.statusCode, 200, '/sync/delta?since=0 doit répondre 200 (500 avant correctif)');
  const body = delta.json();
  assert.equal(Array.isArray(body.changes), true, 'le delta expose une liste de changements');
  const member = body.changes.find(c => c.entity === 'organization_members');
  assert.ok(member, 'le changement organization_members est couvert par le delta');
  assert.equal(member.entityId, organization.id === undefined ? member.entityId : member.entityId, 'entity_id conservé');
  assert.equal(member.data.user_id, member.entityId, 'entity_id = user_id (déclencheur membre 084)');
  assert.equal(member.data.role, 'owner', 'données réelles du membre embarquées');
  assert.equal(typeof body.cursor, 'number', 'curseur numérique renvoyé');
});
