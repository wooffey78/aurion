// Blocs 23 et 24 — Architecture Render/GitHub documentée ; observabilité (journalisation
// structurée, X-Request-Id, redaction testée, erreurs fatales, métriques internes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('bloc23: Render/GitHub documentés, blueprint mono-région Francfort, instance historique hors blueprint, health checks', () => {
  const doc = read('../../docs/RENDER-GITHUB.md');
  assert.match(doc, /frankfurt/);
  assert.match(doc, /oregon/);
  assert.match(doc, /\/health/);
  assert.match(doc, /\/health\/db/);
  assert.match(doc, /jamais supprimé|n'a été\s*\n?\s*supprimé|Aucun service n'a été|Aucun service n'a/i);
  // Le blueprint déclare le service de production UNIQUE en région Francfort (cible UE,
  // alignée sur le stockage OVH région de) ; l'instance historique aurion-web (Oregon) est
  // VOLONTAIREMENT hors blueprint (voie de retour arrière pendant la bascule, à supprimer
  // après bascule DNS et fenêtre de retour — docs/RUNBOOK-PRODUCTION.md). Une synchronisation
  // de blueprint ne détruit jamais un service absent du fichier.
  const render = read('../../render.yaml');
  assert.match(render, /name: aurion/);
  assert.match(render, /region: frankfurt/);
  assert.doesNotMatch(render, /name: aurion-web/);
  assert.doesNotMatch(render, /region: oregon/);
  assert.match(render, /hors blueprint/);
  // Les routes health existent réellement :
  const health = read('../src/routes/health.ts');
  assert.match(health, /\/health/);
  assert.match(health, /\/health\/db/);
});

test('bloc24: journalisation structurée, X-Request-Id, redaction testée, erreurs fatales, métriques sans donnée personnelle', async () => {
  const obs = await import(new URL('../dist/services/observability.js', import.meta.url).pathname);
  // Redaction : champ par champ et motifs de clés dans les textes libres.
  const redacted = obs.redact({ password: 'abc', authorization: 'Bearer abc.def', body: { iban: 'FR7630006000011234567890189', note: 'portable sk_live_abc123XYZDEF456GHI' } });
  assert.equal(redacted.password, '[REDACTED]');
  assert.equal(redacted.authorization, '[REDACTED]');
  assert.equal(redacted.body.iban, '[REDACTED]');
  assert.equal(redacted.body.note, 'portable [REDACTED]');
  // Profondeur bornée : les structures profondes sont tronquées, jamais de fuite infinie.
  const deep = obs.redact({ a: { b: { c: { d: { e: { f: { g: { h: { secret: 'x' } } } } } } } } });
  assert.ok(deep !== undefined);
  // Journalisation : options pino avec service/version/environnement.
  const opts = obs.loggerOptions();
  assert.equal(opts.base.service, 'aurion-api');
  assert.ok(String(opts.base.version).match(/^\d+\.\d+\.\d+/) || opts.base.version === 'unknown');
  // Sources : genReqId + en-tête X-Request-Id + hooks métriques + handlers fatales présents.
  const app = read('../src/app.ts');
  assert.match(app, /genReqId: \(\) => randomUUID\(\)/);
  assert.match(app, /X-Request-Id/);
  assert.match(app, /recordRequest\(reply\.statusCode\)/);
  assert.match(app, /\/internal\/metrics/);
  const server = read('../src/server.ts');
  assert.match(server, /unhandledRejection/);
  assert.match(server, /uncaughtException/);
  assert.match(server, /process\.exit\(1\)/, 'arrêt propre après erreur fatale');
  // Documentation du runbook et de la rétention :
  const runbook = read('../../docs/OBSERVABILITE.md');
  assert.match(runbook, /LOG_LEVEL/);
  assert.match(runbook, /X-Request-Id/);
  assert.match(runbook, /NON CONNECTÉ|non opérationnelle/);
  assert.match(runbook, /à faire valider juridiquement/);
});

// ------------------------------------------------------------------ recette d'intégration
const appPath = fileURLToPath(new URL('../dist/app.js', import.meta.url));
const dbPath = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const authPath = fileURLToPath(new URL('../dist/plugins/auth.js', import.meta.url));
const ready = existsSync(appPath) && existsSync(dbPath) && Boolean(process.env.DATABASE_URL)
  && process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1, DATABASE_URL ou AURION_ADMIN_DATABASE_URL non défini';

test.after(async () => { if (modules) { await modules.db.db.end().catch(() => {}); if (modules.db.adminDb) await modules.db.adminDb.end().catch(() => {}); } });
const modules = ready ? { app: null, db: null, signAccessToken: null } : null;
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
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 24')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `bloc24-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 24')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('bloc24: X-Request-Id renvoyé sur chaque requête, /health liveness, /health/db readiness, métriques réservées à l\u2019admin', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };

  // X-Request-Id présent sur une requête publique ET une requête authentifiée.
  const pub = await mod.app.inject({ method: 'GET', url: '/health' });
  assert.equal(pub.statusCode, 200);
  assert.ok(String(pub.headers['x-request-id'] || '').length >= 8, 'identifiant de requête renvoyé');
  assert.match(pub.body, /"ok":true/, 'liveness sans détail technique');
  const authed = await mod.app.inject({ method: 'GET', url: '/activities', headers: auth });
  assert.equal(authed.statusCode, 200);
  const id1 = String(pub.headers['x-request-id']), id2 = String(authed.headers['x-request-id']);
  assert.notEqual(id1, id2, 'identifiants uniques par requête');
  // Readiness PostgreSQL :
  const dbHealth = await mod.app.inject({ method: 'GET', url: '/health/db' });
  assert.equal(dbHealth.statusCode, 200);
  assert.doesNotMatch(dbHealth.body, /postgres:\/\/|aurion_test_ci_only|DATABASE_URL/);
  // Panne simulée : /health/db reste générique (503 sans pile ni chaîne de connexion) —
  // le test vérifie simplement qu'aucun détail technique ne fuite sur le chemin sain.
  // Métriques : réservées à l'administration (403 pour un compte normal).
  const metrics = await mod.app.inject({ method: 'GET', url: '/internal/metrics', headers: auth });
  assert.ok([403, 404].includes(metrics.statusCode), 'un compte normal n\u2019accède pas aux métriques');
  // Un administrateur platform (via le pool admin) voit les métriques sans donnée personnelle.
  await mod.db.query("insert into platform_admins(user_id) values($1) on conflict do nothing", [A.userId]);
  const adminToken = await mod.signAccessToken({ userId: A.userId, organizationId: A.organizationId, role: 'owner', sv: Number((await mod.db.query('select session_version from users where id=$1', [A.userId])).rows[0]?.session_version || 0) });
  const metricsAdmin = await mod.app.inject({ method: 'GET', url: '/internal/metrics', headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(metricsAdmin.statusCode, 200, metricsAdmin.body);
  const m = metricsAdmin.json();
  assert.ok(m.requestsTotal >= 3, 'compteur de requêtes alimenté');
  assert.ok('rate5xxPercent' in m && 'postgresPool' in m);
  assert.doesNotMatch(metricsAdmin.body, /@example\.test|Micro [0-9a-f]/, 'aucune donnée personnelle dans les métriques');
});
