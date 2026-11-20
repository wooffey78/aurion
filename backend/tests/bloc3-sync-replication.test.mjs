// Bloc 3 — APIs de réplication hors connexion : instantané paginé, delta incrémental par
// curseur (journal migration 084), isolation A/B stricte (RLS + filtres), tombstones de
// suppression, reprise et idempotence de la migration. PostgreSQL réel requis (pattern bloc10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 3')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `bloc3-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}
async function insertClient(mod, orgId, name) {
  const id = uuid();
  await mod.db.withTenant(orgId, async () => {
    await mod.db.query(`insert into clients(id,organization_id,name) values($1,$2,$3)`, [id, orgId, name]);
  });
  return id;
}

test('bloc3: instantané paginé, isolation A/B, curseur, delta et tombstone, migration idempotente', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod), B = await seedAccount(mod);
  const authA = { authorization: `Bearer ${A.token}` }, authB = { authorization: `Bearer ${B.token}` };

  // Données : 3 clients chez A, 1 chez B.
  const a1 = await insertClient(mod, A.organizationId, 'Client A1');
  await insertClient(mod, A.organizationId, 'Client A2');
  await insertClient(mod, A.organizationId, 'Client A3');
  await insertClient(mod, B.organizationId, 'Client B1');

  // Registre : clients répliqués, secrets jamais dans le registre.
  const reg = await mod.app.inject({ method: 'GET', url: '/sync/registry', headers: authA });
  assert.equal(reg.statusCode, 200);
  const regBody = reg.json();
  assert.equal(regBody.schemaVersion, 3); // v3 : complétude Bloc 2 (086) — v2 : quote_items, journal, e-reporting (085)
  assert.ok(regBody.entities.includes('clients'));
  assert.ok(!regBody.entities.includes('mail_accounts'), 'mail_accounts (secrets) jamais répliqué');
  assert.ok(!regBody.entities.includes('document_number_sequences'), 'numérotation réglementaire serveur jamais répliquée');
  assert.ok(!regBody.entities.includes('users') && !regBody.entities.includes('subscriptions'), 'domaine compte/abonnement géré par account-sync, jamais le registre métier');
  // Bloc 2 — complétude : configuration et données métier utiles hors connexion.
  for (const e of ['payment_links', 'document_themes', 'email_signatures', 'cloud_documents', 'notification_jobs',
    'activity_forecast_assumptions', 'template_versions', 'support_status_events', 'outgoing_electronic_invoices',
    'supplier_electronic_invoices', 'electronic_invoice_profiles', 'bank_import_configs', 'activity_profile_overrides']) {
    assert.ok(regBody.entities.includes(e), `entité métier manquante au registre : ${e}`);
  }

  // Instantané A : 3 lignes, aucune de B ; limité à 2 → page 2 + hasMore.
  const snap = await mod.app.inject({ method: 'GET', url: '/sync/snapshot/clients?limit=2', headers: authA });
  assert.equal(snap.statusCode, 200);
  const snapBody = snap.json();
  assert.equal(snapBody.rows.length, 2);
  assert.equal(snapBody.hasMore, true);
  assert.equal(snapBody.total, 3);
  const snap2 = await mod.app.inject({ method: 'GET', url: '/sync/snapshot/clients?limit=2&page=2', headers: authA });
  const snap2Body = snap2.json();
  assert.equal(snap2Body.rows.length, 1);
  assert.equal(snap2Body.hasMore, false);
  const names = [...snapBody.rows, ...snap2Body.rows].map(x => x.name);
  assert.deepEqual(names.sort(), ['Client A1', 'Client A2', 'Client A3']);
  assert.ok(!names.some(n => n.includes('Client B')), 'aucune fuite B dans le snapshot A');

  // Curseur : existe et numérique.
  const cur = await mod.app.inject({ method: 'GET', url: '/sync/cursor', headers: authA });
  assert.equal(cur.statusCode, 200);
  const cursor0 = Number(cur.json().cursor);
  assert.ok(Number.isFinite(cursor0));

  // Delta : nouveau client A → upsert avec données ; B ne voit jamais ce changement.
  const aNew = await insertClient(mod, A.organizationId, 'Client A4');
  const delta = await mod.app.inject({ method: 'GET', url: `/sync/delta?since=${cursor0}`, headers: authA });
  assert.equal(delta.statusCode, 200);
  const deltaBody = delta.json();
  const change = deltaBody.changes.find(c => c.entity === 'clients' && c.data?.name === 'Client A4');
  assert.ok(change, 'le nouveau client apparaît dans le delta');
  assert.equal(change.op, 'upsert');
  assert.ok(deltaBody.cursor > cursor0, 'le curseur avance');
  const deltaB = await mod.app.inject({ method: 'GET', url: `/sync/delta?since=${cursor0}`, headers: authB });
  const deltaBBody = deltaB.json();
  assert.ok(!deltaBBody.changes.some(c => c.entity === 'clients' && String(c.data?.name || '').includes('Client A')), 'aucune fuite A dans le delta B');

  // Tombstone : suppression d'un client → op delete, snapshot sans la ligne.
  await mod.db.withTenant(A.organizationId, async () => {
    await mod.db.query('delete from clients where id=$1', [aNew]);
  });
  const delta2 = await mod.app.inject({ method: 'GET', url: `/sync/delta?since=${deltaBody.cursor}`, headers: authA });
  const delta2Body = delta2.json();
  const tombstone = delta2Body.changes.find(c => c.entity === 'clients' && c.entityId === aNew);
  assert.ok(tombstone, 'la suppression apparaît comme tombstone');
  assert.equal(tombstone.op, 'delete');
  assert.equal(tombstone.data, null);
  const snapAfter = await mod.app.inject({ method: 'GET', url: '/sync/snapshot/clients?limit=500', headers: authA });
  assert.ok(!snapAfter.json().rows.some(x => x.id === aNew), 'le client supprimé disparaît du snapshot');

  // Sécurité : entité inconnue, entrées invalides, sans authentification.
  const unknown = await mod.app.inject({ method: 'GET', url: '/sync/snapshot/mail_accounts', headers: authA });
  assert.equal(unknown.statusCode, 404, 'entité hors registre refusée (secrets inaccessibles)');
  const bad = await mod.app.inject({ method: 'GET', url: '/sync/delta?since=-3', headers: authA });
  assert.equal(bad.statusCode, 400);
  const noAuth = await mod.app.inject({ method: 'GET', url: '/sync/registry' });
  assert.ok([401, 403].includes(noAuth.statusCode), 'sans authentification : refus');

  // Idempotence de la migration 084 : réexécution complète sans erreur (phase-H la rejoue aussi ×2).
  // Le DDL est rejoué via la connexion de MIGRATION (compte propriétaire), comme en production :
  // le rôle d'administration applicatif n'est pas propriétaire des tables et ne peut pas
  // porter du DDL (« must be owner » si on l'utilisait par erreur).
  const migrationUrl = process.env.AURION_MIGRATION_DATABASE_URL;
  assert.ok(migrationUrl, 'AURION_MIGRATION_DATABASE_URL requis pour rejouer la migration comme le compte propriétaire');
  const { default: pg } = await import('pg');
  const migrationClient = new pg.Client({ connectionString: migrationUrl });
  await migrationClient.connect();
  try {
    const sql = readFileSync(new URL('../migrations/084_sync_replication.sql', import.meta.url), 'utf8');
    await migrationClient.query(sql);
  } finally {
    await migrationClient.end();
  }
  const recheck = await mod.app.inject({ method: 'GET', url: '/sync/cursor', headers: authA });
  assert.equal(recheck.statusCode, 200);

  // Non-régression : le signal existant (account_sync_versions) réagit toujours à un changement client.
  // Lecture via le pool d'administration : la table est RLS-clos pour le rôle applicatif.
  await insertClient(mod, A.organizationId, 'Client A5');
  const rev = await mod.db.adminDb.query('select revision from account_sync_versions where organization_id=$1', [A.organizationId]);
  assert.ok(Number(rev.rows[0]?.revision ?? 0) >= 1, 'la révision globale 056-059 reste alimentée');
});

test('bloc2-completeness: journal et instantanés des entités ajoutées (directes, clé naturelle, enfants), isolation A/B', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod), B = await seedAccount(mod);
  const authA = { authorization: `Bearer ${A.token}` }, authB = { authorization: `Bearer ${B.token}` };
  const cur0 = Number((await mod.app.inject({ method: 'GET', url: '/sync/cursor', headers: authA })).json().cursor || 0);

  // Données A : une hypothèse de prévision (clé naturelle activity_id), un thème, un lien de
  // paiement, une version de modèle (enfant via document_templates), un événement de statut
  // (enfant via support_tickets). B : un thème distinct (isolation).
  // Le seed de ce fichier ne crée pas d'activité : elle est créée ici (fixtures isolées du test).
  const aid = uuid();
  await mod.db.withTenant(A.organizationId, async () => {
    await mod.db.query(`insert into activities(id,organization_id,code,name,description) values($1,$2,'principale','Activité principale','Fixture bloc2-completeness')`, [aid, A.organizationId]);
  });
  await mod.db.withTenant(A.organizationId, async () => {
    await mod.db.query(`insert into activity_forecast_assumptions(activity_id,organization_id,potential_clients_per_month,average_ticket_ttc,variable_cost_per_repair,fixed_monthly_costs) values($1,$2,20,120,30,300) on conflict (activity_id) do update set average_ticket_ttc=excluded.average_ticket_ttc`, [aid, A.organizationId]);
    await mod.db.query(`insert into document_themes(organization_id,accent,dark) values($1,'#4477ff','#223366') on conflict (organization_id) do update set accent=excluded.accent`, [A.organizationId]);
  });
  const qId = uuid(), cId = uuid();
  await mod.db.withTenant(A.organizationId, async () => {
    await mod.db.query(`insert into clients(id,organization_id,name) values($1,$2,'Client PL')`, [cId, A.organizationId]);
    // Devis minimal (schéma 001) pour porter un lien de paiement.
    await mod.db.query(`insert into quotes(id,organization_id,client_id,activity_id,number,intervention) values($1,$2,$3,$4,'DEV-BLOC2-0001','Prestation test')`, [qId, A.organizationId, cId, aid]);
    await mod.db.query(`insert into payment_links(id,organization_id,invoice_id,amount_ttc,invoice_total_at_creation,provider) values($1,$2,$3,120,120,'manual') on conflict do nothing`, [uuid(), A.organizationId, qId]);
  });
  await mod.db.withTenant(B.organizationId, async () => {
    await mod.db.query(`insert into document_themes(organization_id,accent,dark) values($1,'#88aa44','#334422') on conflict (organization_id) do update set accent=excluded.accent`, [B.organizationId]);
  });

  // 1) Delta : les entités ajoutées apparaissent dans le journal avec la bonne op.
  const delta = (await mod.app.inject({ method: 'GET', url: `/sync/delta?since=${cur0}`, headers: authA })).json();
  const ents = new Set(delta.changes.map(c => c.entity));
  for (const e of ['activity_forecast_assumptions', 'document_themes', 'payment_links']) {
    assert.ok(ents.has(e), `entité absente du delta : ${e}`);
  }
  const faEntry = delta.changes.find(c => c.entity === 'activity_forecast_assumptions');
  assert.ok(faEntry && faEntry.data && faEntry.data.activity_id === aid, 'clé naturelle activity_id résolue dans le delta');

  // 2) Snapshot de la clé naturelle : ligne A visible, B invisible.
  const snapFA = (await mod.app.inject({ method: 'GET', url: '/sync/snapshot/activity_forecast_assumptions', headers: authA })).json();
  assert.equal(snapFA.rows.length, 1, 'hypothèse de prévision A visible');
  const snapFAB = (await mod.app.inject({ method: 'GET', url: '/sync/snapshot/activity_forecast_assumptions', headers: authB })).json();
  assert.equal(snapFAB.rows.length, 0, 'A ne voit pas les données de B (et B n\'en a pas ici)');

  // 3) Snapshot enfant : template_versions joint au parent document_templates.
  const tid = uuid();
  await mod.db.withTenant(A.organizationId, async () => {
    await mod.db.query(`insert into document_templates(id,organization_id,document_type,name,mime_type,storage_key) values($1,$2,'quote','Modèle bloc2','application/pdf','test/bloc2/modele.pdf')`, [tid, A.organizationId]);
    await mod.db.query(`insert into template_versions(id,template_id,version,storage_key) values($1,$2,1,'test/bloc2/modele-v1.pdf') on conflict do nothing`, [uuid(), tid]);
  });
  const snapTV = (await mod.app.inject({ method: 'GET', url: '/sync/snapshot/template_versions', headers: authA })).json();
  assert.ok(snapTV.rows.some(r => r.template_id === tid), 'enfant template_versions joint au parent tenant');
  const snapTVB = (await mod.app.inject({ method: 'GET', url: '/sync/snapshot/template_versions', headers: authB })).json();
  assert.ok(!snapTVB.rows.some(r => r.template_id === tid), 'isolation A/B sur l\'enfant');

  // 4) Suppression journalisée comme tombstone (thème B supprimé).
  const dBefore = Number((await mod.app.inject({ method: 'GET', url: '/sync/cursor', headers: authB })).json().cursor || 0);
  await mod.db.withTenant(B.organizationId, async () => {
    await mod.db.query(`delete from document_themes where organization_id=$1`, [B.organizationId]);
  });
  const deltaB = (await mod.app.inject({ method: 'GET', url: `/sync/delta?since=${dBefore}`, headers: authB })).json();
  assert.ok(deltaB.changes.some(c => c.entity === 'document_themes' && c.op === 'delete'), 'tombstone document_themes journalisé');
});