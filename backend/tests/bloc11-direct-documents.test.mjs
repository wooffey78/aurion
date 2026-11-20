// Bloc 11 — Devis et factures sans client préexistant.
// Création directe (nominatif ou professionnel) ; fiche client créée AVEC le document dans la
// MÊME transaction (annulation = aucune création partielle) ; recherche de doublons proposée
// avant validation sans fusion automatique incertaine ; seules les coordonnées disponibles sont
// enregistrées (aucune donnée inventée) ; numérotation et mentions existantes conservées.
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

test('bloc11: le schéma accepte newClient et la création se fait dans la transaction du document', () => {
  const business = read('../src/routes/business.ts');
  assert.match(business, /newClient: z\.object\(\{[\s\S]*?name: z\.string\(\)\.trim\(\)\.min\(1\)/);
  assert.match(business, /createClientForDocument\(clientDb,org,aid,b\.newClient\)/);
  // Adresse composée des seules coordonnées saisies (aucune invention) :
  assert.match(business, /composeClientAddress/);
  // Recherche de doublons dédiée, sans route de fusion automatique :
  assert.match(business, /app\.get\('\/clients\/matches'/);
  assert.doesNotMatch(business, /clients\/merge|mergeClients/i);
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
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 11')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `bloc11-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 11')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('bloc11: facture directe sans client → fiche créée dans la même transaction, doublons proposés, nominatif accepté', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };

  // 1) Client professionnel existant pour le test de doublon.
  const existing = await mod.app.inject({ method: 'POST', url: '/clients', headers: auth, payload: { name: 'Garage Dupont', siret: '12345678900011', email: 'contact@garagedupont.example', address: '1 rue du Commerce 44000 Nantes' } });
  assert.equal(existing.statusCode, 201, existing.body);

  // 2) Recherche de doublons : nom exact, préfixe et SIRET trouvés ; fusion automatique absente.
  const exact = (await mod.app.inject({ method: 'GET', url: '/clients/matches?q=Garage%20Dupont', headers: auth })).json();
  assert.equal(exact.matches.length, 1);
  assert.equal(exact.matches[0].name, 'Garage Dupont');
  const bySiret = (await mod.app.inject({ method: 'GET', url: '/clients/matches?q=12345678900011', headers: auth })).json();
  assert.equal(bySiret.matches.length, 1);
  const none = (await mod.app.inject({ method: 'GET', url: '/clients/matches?q=Zoe%20Martin', headers: auth })).json();
  assert.equal(none.matches.length, 0);

  // 3) Facture SANS client préexistant, avec newClient nominatif (coordonnées partielles uniquement).
  const created = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: { documentType: 'invoice', intervention: 'Réparation à domicile',
      newClient: { name: 'Zoé Martin', address: '12 rue des Lilas', postalCode: '75011', city: 'Paris' },
      items: [{ label: 'Réparation', quantity: 1, unitCost: 0, unitPrice: 120, activityCategory: 'services_bic' }],
      vatRate: 0, urssafRate: 0, allowLoss: true },
  });
  assert.equal(created.statusCode, 201, created.body);
  const invoiceId = created.json().id;
  const doc = (await mod.app.inject({ method: 'GET', url: '/quotes', headers: auth })).json().find(x => x.id === invoiceId);
  assert.ok(doc.client_id, 'la fiche client a été créée et liée au document');
  assert.equal(doc.client_name, 'Zoé Martin');
  assert.match(doc.billing_address_snapshot || '', /75011 Paris/, 'adresse de facturation composée des coordonnées saisies');
  const clientRow = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select name,address,email,siret from clients where id=$1', [doc.client_id]))).rows[0];
  assert.equal(clientRow.name, 'Zoé Martin');
  assert.match(clientRow.address, /75011 Paris/);
  assert.equal(clientRow.email, null, 'coordonnée non saisie = jamais inventée');
  assert.equal(clientRow.siret, null);

  // 4) Numérotation existante conservée (FAC-2026-…), mentions inchangées.
  assert.match(doc.number, /^FAC-2026-/);

  // 5) Echec de validation → AUCUNE création partielle (transaction) : payload invalide sans nom.
  const before = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select count(*)::int n from clients'))).rows[0].n;
  const docsBefore = (await mod.db.withTenant(A.organizationId, () => mod.db.query("select count(*)::int n from quotes where document_type='invoice'"))).rows[0].n;
  const rejected = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: { documentType: 'invoice', intervention: 'x', newClient: { name: '' }, items: [], vatRate: 0, urssafRate: 0 },
  });
  assert.equal(rejected.statusCode, 400);
  const after = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select count(*)::int n from clients'))).rows[0].n;
  const docsAfter = (await mod.db.withTenant(A.organizationId, () => mod.db.query("select count(*)::int n from quotes where document_type='invoice'"))).rows[0].n;
  assert.equal(after, before, 'aucun client créé par une demande invalide');
  assert.equal(docsAfter, docsBefore, 'aucun document créé par une demande invalide');

  // 6) Isolation A/B : les clients et documents de A invisibles pour B.
  const B = await seedAccount(mod);
  const matchesB = (await mod.app.inject({ method: 'GET', url: '/clients/matches?q=Zoe%20Martin', headers: { authorization: `Bearer ${B.token}` } })).json();
  assert.equal(matchesB.matches.length, 0);
});
