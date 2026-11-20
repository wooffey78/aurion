// Bloc 9 — Situation fiscale : versement libératoire et périodicité URSSAF.
// Ces options ne sont JAMAIS déduites du SIRET : elles sont déclarées par l'entrepreneur
// (oui / non / inconnu, avec date d'effet, date de changement et vérification), intégrées
// à l'impôt dû (jamais une cotisation sociale, jamais doublées dans l'estimation du revenu)
// et horodatées dans un historique conservé (mise à jour en cours d'année, reconstitution).
// Niveau 1 : contrat statique + migration ; Niveau 2 : recette d'intégration PostgreSQL réel.
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

test('bloc9: la migration 079 enregistre les options déclarées avec historique horodaté', () => {
  const mig = read('../migrations/079_fiscal_options.sql');
  assert.match(mig, /vl_option varchar\(10\) not null default 'inconnu'/);
  assert.match(mig, /check \(vl_option in \('oui','non','inconnu'\)\)/);
  assert.match(mig, /urssaf_periodicity varchar\(20\)/);
  assert.match(mig, /check \(urssaf_periodicity in \('mensuelle','trimestrielle'\)\)/);
  assert.match(mig, /vl_verified boolean not null default false/);
  assert.match(mig, /create table if not exists fiscal_options_history/);
  assert.match(mig, /effective_from date not null/);
  assert.match(mig, /source varchar\(80\) not null default 'déclaration utilisateur'/);
  assert.match(mig, /tenant_isolation on fiscal_options_history/);
});

test('bloc9: PATCH /organization refuse une date d\'effet sans option « oui » et une périodicité sans date', () => {
  const org = read('../src/routes/organizations.ts');
  assert.match(org, /La date d’effet du versement libératoire n’est enregistrée que si l’option est déclarée « oui »/);
  assert.match(org, /Indiquez la date d’effet de la périodicité URSSAF/);
  assert.match(org, /fiscal_options_history/);
  assert.match(org, /vl_option=\$13,vl_verified=\$14/);
});

test('bloc9: le SIRET ne révèle jamais ces options — aucun appel registre dans le circuit fiscal', () => {
  const org = read('../src/routes/organizations.ts');
  // La détection registre (registry-lookup) et la sauvegarde des options fiscales sont des routes distinctes :
  // aucun écriture automatique de vl_option/urssaf_periodicity par le registre.
  const lookup = org.slice(org.indexOf('/organization/registry-lookup'));
  assert.doesNotMatch(lookup, /vl_option|urssaf_periodicity/);
});

test('bloc9: les comptabilités expose les options avec la distinction exercée / théorique / non vérifiée', () => {
  const business = read('../src/routes/business.ts');
  assert.match(business, /orgFiscalOptions/);
  assert.match(business, /Éligibilité théorique \(impots\.gouv\)/);
  assert.match(business, /jamais déduite du SIRET|ne déduit JAMAIS cette option du SIRET/);
  assert.match(business, /byCategory,fiscalOptions/);
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
    modules.app = await buildApp();
    modules.db = db;
    modules.signAccessToken = auth.signAccessToken;
  }
  return modules;
}
const uuid = () => crypto.randomUUID();
async function seedAccount(mod) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 9')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `bloc9-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 9')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('bloc9: déclaration VL + périodicité, historique horodaté, validation explicite, isolation A/B', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const B = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };
  const authB = { authorization: `Bearer ${B.token}` };

  // État initial : inconnu, non vérifié (aucune affirmation automatique).
  const initial = (await mod.app.inject({ method: 'GET', url: '/organization', headers: auth })).json();
  assert.equal(initial.vl_option, 'inconnu');
  assert.equal(initial.vl_verified, false);

  // Date d'effet refusée sans option « oui » (aucune valeur inventée).
  const badDate = await mod.app.inject({ method: 'PATCH', url: '/organization', headers: auth, payload: { name: 'Micro A', activity: 'Test', vlOption: 'non', vlEffectiveFrom: '2026-01-15' } });
  assert.equal(badDate.statusCode, 400);
  const badPeriodicity = await mod.app.inject({ method: 'PATCH', url: '/organization', headers: auth, payload: { name: 'Micro A', activity: 'Test', urssafPeriodicity: 'trimestrielle' } });
  assert.equal(badPeriodicity.statusCode, 400);

  // Déclaration complète : option exercée + confirmée + date d'effet ; périodicité trimestrielle.
  const saved = await mod.app.inject({
    method: 'PATCH', url: '/organization', headers: auth,
    payload: { name: 'Micro A', activity: 'Test', vlOption: 'oui', vlVerified: true, vlEffectiveFrom: '2026-01-15', urssafPeriodicity: 'trimestrielle', urssafPeriodicityEffectiveFrom: '2026-01-01' },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  const after = saved.json();
  assert.equal(after.vl_option, 'oui');
  assert.equal(after.vl_verified, true);
  assert.equal(String(after.vl_effective_from).slice(0, 10), '2026-01-15');
  assert.equal(after.urssaf_periodicity, 'trimestrielle');

  // Historique : une ligne par CHAMP changé (vl_option, urssaf_periodicity) — jamais réécrit.
  let hist = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select field,value,effective_from from fiscal_options_history where organization_id=$1 order by field', [A.organizationId]))).rows;
  assert.equal(hist.length, 2);
  assert.ok(hist.find(h => h.field === 'vl_option' && h.value === 'oui'));
  assert.ok(hist.find(h => h.field === 'urssaf_periodicity' && h.value === 'trimestrielle'));

  // Enregistrement IDENTIQUE répété : aucune ligne d'historique supplémentaire.
  await mod.app.inject({ method: 'PATCH', url: '/organization', headers: auth, payload: { name: 'Micro A', activity: 'Test', vlOption: 'oui', vlVerified: true, vlEffectiveFrom: '2026-01-15', urssafPeriodicity: 'trimestrielle', urssafPeriodicityEffectiveFrom: '2026-01-01' } });
  hist = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select count(*)::int n from fiscal_options_history where organization_id=$1', [A.organizationId]))).rows;
  assert.equal(hist[0].n, 2);

  // Changement en cours d'année : trimestrielle → mensuelle, horodaté.
  await mod.app.inject({ method: 'PATCH', url: '/organization', headers: auth, payload: { name: 'Micro A', activity: 'Test', urssafPeriodicity: 'mensuelle', urssafPeriodicityEffectiveFrom: '2026-07-01' } });
  const changed = (await mod.app.inject({ method: 'GET', url: '/organization', headers: auth })).json();
  assert.equal(changed.urssaf_periodicity, 'mensuelle');
  assert.ok(changed.urssaf_periodicity_changed_at);
  const periodHistory = (await mod.db.withTenant(A.organizationId, () => mod.db.query("select effective_from from fiscal_options_history where organization_id=$1 and field='urssaf_periodicity' order by recorded_at", [A.organizationId]))).rows;
  assert.equal(periodHistory.length, 2);
  const lastEffective = periodHistory[1].effective_from instanceof Date ? periodHistory[1].effective_from.toISOString().slice(0, 10) : String(periodHistory[1].effective_from).slice(0, 10);
  assert.equal(lastEffective, '2026-07-01');

  // Comptabilité : les options déclarées sont exposées avec la note d'éligibilité (distinct impôt/cotisations).
  const summary = (await mod.app.inject({ method: 'GET', url: `/accounting/summary?year=${new Date().getFullYear()}`, headers: auth })).json();
  assert.equal(summary.fiscalOptions.vlOption, 'oui');
  assert.equal(summary.fiscalOptions.vlVerified, true);
  assert.match(summary.fiscalOptions.vlEligibilityNote, /effectivement exercée/);
  const byCat = (await mod.app.inject({ method: 'GET', url: `/accounting/by-category?year=${new Date().getFullYear()}`, headers: auth })).json();
  assert.equal(byCat.fiscalOptions.urssafPeriodicity, 'mensuelle');
  // Impôt (VL) jamais confondu avec les cotisations : deux totaux distincts.
  assert.ok('taxTotal' in byCat && 'contributionsTotal' in byCat);

  // Isolation A/B : l'organisation B reste inconnue et n'a AUCUN accès à l'historique de A.
  const initialB = (await mod.app.inject({ method: 'GET', url: '/organization', headers: authB })).json();
  assert.equal(initialB.vl_option, 'inconnu');
  // Dans le tenant de B, l'historique de A est invisible (RLS, bloc 2).
  const countB = await mod.db.withTenant(B.organizationId, () => mod.db.query('select count(*)::int n from fiscal_options_history'));
  assert.equal(countB.rows[0].n, 0);
});
