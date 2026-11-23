// Bloc 12 (partie anticipée, prompt §2.2-10 et §4-BLOC 12) — attribution VIP à un compte
// DÉJÀ EXISTANT : plus de 409 ACCOUNT_EXISTS ; l'entitlement est posé sur le compte existant,
// sans doublon de compte ni de ligne, sans rôle platform_admin, sans droit inter-tenant ;
// traçage via les structures existantes (invitation acceptée immédiatement). Le flux d'invitation
// classique est préservé pour une adresse sans compte.
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

test('bloc12: VIP accordé à un compte existant (sans doublon, sans platform_admin, tracé)', { skip }, async () => {
  const mod = await boot();
  // Administrateur plateforme (inviteur).
  const adminId = uuid(), adminOrg = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Plateforme')`, [adminOrg, `Admin ${adminOrg.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [adminId, `b12admin-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [adminOrg, adminId]);
  await mod.db.query(`insert into platform_admins(user_id) values($1)`, [adminId]);
  const svA = Number((await mod.db.query('select session_version from users where id=$1', [adminId])).rows[0]?.session_version || 0);
  const adminToken = await mod.signAccessToken({ userId: adminId, organizationId: adminOrg, role: 'owner', sv: svA });

  // Compte utilisateur EXISTANT (propre organisation).
  const existingId = uuid(), existingOrg = uuid(), existingEmail = `b12existing-${crypto.randomUUID()}@example.test`;
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test')`, [existingOrg, `Micro ${existingOrg.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [existingId, existingEmail]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [existingOrg, existingId]);

  const H = { authorization: `Bearer ${adminToken}` };
  // 1) Attribution sur compte existant → 200 ok + existingAccount (plus de 409).
  const r1 = await mod.app.inject({ method: 'POST', url: '/admin/guests/invite', headers: H, payload: { email: existingEmail } });
  assert.equal(r1.statusCode, 200, r1.body);
  const b1 = r1.json();
  assert.equal(b1.ok, true); assert.equal(b1.existingAccount, true);
  // 2) L'entitlement est posé exactement une fois (pas de doublon au 2e appel).
  const r2 = await mod.app.inject({ method: 'POST', url: '/admin/guests/invite', headers: H, payload: { email: existingEmail } });
  assert.equal(r2.statusCode, 200);
  const vipRows = (await mod.db.query('select user_id from vip_guest_accounts where user_id=$1', [existingId])).rows;
  assert.equal(vipRows.length, 1, 'une seule ligne vip_guest_accounts (clé primaire, on conflict do nothing)');
  // 3) Traçage : invitation créée puis acceptée immédiatement pour cet e-mail.
  const trace = (await mod.db.query('select accepted_user_id, accepted_at from admin_guest_invites where lower(email)=lower($1) order by created_at desc limit 1', [existingEmail])).rows[0];
  assert.equal(trace?.accepted_user_id, existingId);
  assert.ok(trace?.accepted_at, 'acceptation tracée');
  // 4) Le VIP n'a AUCUN droit plateforme ni inter-tenant : pas de platform_admins, pas de nouvelle organisation.
  assert.equal((await mod.db.query('select 1 from platform_admins where user_id=$1', [existingId])).rowCount, 0);
  assert.equal((await mod.db.query('select count(*)::int as n from organization_members where user_id=$1', [existingId])).rows[0].n, 1);
  // 5) Flux d'invitation CLASSIQUE préservé pour une adresse sans compte.
  const freshEmail = `b12fresh-${crypto.randomUUID()}@example.test`;
  const r3 = await mod.app.inject({ method: 'POST', url: '/admin/guests/invite', headers: H, payload: { email: freshEmail } });
  // Flux classique : soit l'invitation part (200 ok, sans existingAccount), soit — en
  // environnement de test SANS messagerie configurée — elle échoue explicitement à l'ENVOI
  // (MAIL_NOT_CONFIGURED). Les deux prouvent que le refus ACCOUNT_EXISTS n'est plus déclenché
  // et que le flux d'invitation poursuit jusqu'à l'étape e-mail.
  const classic = r3.statusCode === 200 || /MAIL_NOT_CONFIGURED/.test(r3.body);
  assert.equal(classic, true, 'flux invitation classique cassé : ' + r3.statusCode + ' ' + r3.body);
  if (r3.statusCode === 200) assert.equal(r3.json().existingAccount, undefined, 'invitation classique : pas de compte existant');
  assert.equal((await mod.db.query('select 1 from vip_guest_accounts v join users u on u.id=v.user_id where lower(u.email)=lower($1)', [freshEmail])).rowCount, 0);
});
