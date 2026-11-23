// Bloc 5 — conflits multi-appareils : concurrence optimiste déterministe, deux valeurs
// préservées (serveur + décision locale), suppression vs modification, indépendance d'ordre,
// comportement historique préservé sans baseUpdatedAt.
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
async function seedAccount(mod, suffix) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 5 conflits')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `b5-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 5')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}
const round2 = n => Math.round(Number(n) * 100) / 100;

test('bloc5: conflits champ par champ — deux sessions concurrentes, suppression vs modification, ordre indépendant', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod, 'A');
  const authA = { authorization: `Bearer ${A.token}` };

  // Création du client partagé (appareil 1).
  const rC = await mod.app.inject({ method: 'POST', url: '/clients', headers: authA, payload: { name: 'Client conflit', activity: 'principale', email: 'c1@example.test', phone: '0102030405' } });
  assert.ok([200, 201].includes(rC.statusCode), rC.body);
  const clientId = rC.json().id;
  const v0 = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select to_char(updated_at,\'YYYY-MM-DD"T"HH24:MI:SS\') as u from clients where id=$1', [clientId])).rows[0])).u;
  await new Promise(r => setTimeout(r, 1100)); // garde seconde : v0 doit differer de v1 (to_char sans millisecondes)

  // Session 1 (appareil A) modifie le téléphone en connaissant v0.
  const rA = await mod.app.inject({ method: 'PATCH', url: `/clients/${clientId}`, headers: authA, payload: { name: 'Client conflit', email: 'c1@example.test', phone: '0600000001', baseUpdatedAt: v0 } });
  assert.equal(rA.statusCode, 200, rA.body);
  const v1 = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select to_char(updated_at,\'YYYY-MM-DD"T"HH24:MI:SS\') as u from clients where id=$1', [clientId])).rows[0])).u;

  // Session 2 (appareil B) modifie l'e-mail en croyant toujours v0 → refus déterministe 409
  // avec LES DEUX valeurs (serveur actuel + référence de la décision), aucune écriture silencieuse.
  const rB = await mod.app.inject({ method: 'PATCH', url: `/clients/${clientId}`, headers: authA, payload: { email: 'depuis-appareil-b@example.test', baseUpdatedAt: v0 } });
  assert.equal(rB.statusCode, 409, rB.body);
  assert.equal(rB.json().error, 'CONFLICT_VERSION');
  assert.equal(rB.json().server.phone, '0600000001', 'valeur serveur exposée pour comparaison champ par champ');
  assert.equal(rB.json().client.updated_at, v0, 'référence de la décision conservée');
  const afterB = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select email,phone from clients where id=$1', [clientId])).rows[0]));
  assert.equal(afterB.email, 'c1@example.test', `aucune écriture silencieuse du champ refusé — email=${afterB.email}, phone=${afterB.phone}`);

  // Conflit résolu par comparaison : l'appareil B rejoue avec la nouvelle base v1 (fusion volontaire).
  const rB2 = await mod.app.inject({ method: 'PATCH', url: `/clients/${clientId}`, headers: authA, payload: { name: 'Client conflit', email: 'depuis-appareil-b@example.test', phone: '0600000001', baseUpdatedAt: v1 } });
  assert.equal(rB2.statusCode, 200, rB2.body);
  const merged = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select email,phone from clients where id=$1', [clientId])).rows[0]));
  assert.equal(merged.email, 'depuis-appareil-b@example.test');
  assert.equal(merged.phone, '0600000001', 'le champ non conflictuel de A est conservé');

  // Suppression vs modification : modifier un client supprimé donne un 404 précis (et jamais
  // une résurrection silencieuse) ; l'opération reste identifiable pour l'utilisateur.
  const rD = await mod.app.inject({ method: 'DELETE', url: `/clients/${clientId}`, headers: authA });
  assert.equal(rD.statusCode, 200, rD.body);
  const rUp = await mod.app.inject({ method: 'PATCH', url: `/clients/${clientId}`, headers: authA, payload: { phone: '0700000000' } });
  assert.equal(rUp.statusCode, 404, 'modification d\\\'un client supprimé = 404 précis');

  // Indépendance d'ordre sans base de référence : la sémantique historique est « formulaire
  // complet, dernière écriture gagnante » — deux écritures complètes dans un ordre quelconque
  // produisent un état DÉTERMINISTE et cohérent (jamais d'état mi-écrasé).
  const rC2 = await mod.app.inject({ method: 'POST', url: '/clients', headers: authA, payload: { name: 'Client ordre', activity: 'principale' } });
  const c2 = rC2.json().id;
  const r1 = await mod.app.inject({ method: 'PATCH', url: `/clients/${c2}`, headers: authA, payload: { name: 'Client ordre', email: 'ordre1@example.test', phone: '0111111111' } });
  const r2 = await mod.app.inject({ method: 'PATCH', url: `/clients/${c2}`, headers: authA, payload: { name: 'Client ordre', email: 'ordre2@example.test', phone: '0222222222' } });
  assert.ok([200, 201].includes(r1.statusCode) && [200, 201].includes(r2.statusCode));
  const both = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select email,phone from clients where id=$1', [c2])).rows[0]));
  assert.equal(both.email, 'ordre2@example.test'); assert.equal(both.phone, '0222222222');
  // La fusion champ par champ entre DEUX appareils passe par baseUpdatedAt (409 → comparaison →
  // renvoi du formulaire fusionné), comme validé plus haut — jamais par écrasement silencieux.
});
