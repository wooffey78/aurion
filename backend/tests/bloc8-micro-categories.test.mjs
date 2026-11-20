// Bloc 8 — Détection SIRET, activité réelle et calcul des cotisations.
// Niveau 1 : contrat statique (sources + migration) et unitaire sur le build compilé (dist/).
// Niveau 2 (recette d'intégration PostgreSQL réel, rôle applicatif, RLS active) : référentiel
// lisible/non inscriptible par le rôle applicatif, catégorie par ligne/document, ventilation
// comptable sans double comptage et isolation A/B.
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

// ------------------------------------------------------------------ référentiel (sources officielles)
test('bloc8: la migration 078 crée le référentiel versionné avec les taux officiels 2026', () => {
  const mig = read('../migrations/078_micro_activity_categories.sql');
  assert.match(mig, /create table if not exists micro_referential_versions/);
  assert.match(mig, /create table if not exists micro_rates/);
  assert.match(mig, /'2026'/);
  // Taux vérifiés le 14 novembre 2026 (service-public F36232 + impots.gouv) :
  assert.match(mig, /'vente_bic','[^']+',12\.30,0\.10,1\.00/);
  assert.match(mig, /'services_bic','[^']+',21\.20,0\.30,1\.70/);
  assert.match(mig, /'services_bnc','[^']+',25\.60,0\.20,2\.20/);
  assert.match(mig, /'services_bnc_cipav','[^']+',23\.20,0\.20,2\.20/);
  assert.match(mig, /make_date\(2026,11,14\)/);
  // Colonnes de catégorie (document, lignes, catalogue, prestations) :
  for (const col of ['alter table quotes add column if not exists activity_category', 'alter table quote_items add column if not exists activity_category', 'alter table parts add column if not exists activity_category', 'alter table interventions add column if not exists activity_category']) {
    assert.match(mig, new RegExp(col.replace(/ /g, '\\s+')));
  }
  // RLS : lecture seule pour le rôle applicatif (aucune policy d'écriture).
  assert.match(mig, /create policy micro_referential_read on micro_referential_versions for select/);
});

test('bloc8: unitaire (build) — taux, dates d\'effet, validation et ventilation sans double comptage', async () => {
  const ref = await import(new URL('../dist/services/micro-referential.js', import.meta.url).pathname);
  const det = await import(new URL('../dist/services/micro-detection.js', import.meta.url).pathname);
  const v2026 = ref.BUILTIN_REFERENTIAL_2026;
  assert.equal(v2026.version, '2026');
  assert.equal(v2026.effectiveFrom, '2026-01-01');
  const vente = v2026.rates.find(r => r.category === 'vente_bic');
  assert.equal(vente.socialRate, 12.3); assert.equal(vente.cfpRate, 0.1); assert.equal(vente.taxRate, 1.0);
  const bic = v2026.rates.find(r => r.category === 'services_bic');
  assert.equal(bic.socialRate, 21.2); assert.equal(bic.cfpRate, 0.3); assert.equal(bic.taxRate, 1.7);
  const bnc = v2026.rates.find(r => r.category === 'services_bnc');
  assert.equal(bnc.socialRate, 25.6); assert.equal(bnc.taxRate, 2.2);
  const cipav = v2026.rates.find(r => r.category === 'services_bnc_cipav');
  assert.equal(cipav.socialRate, 23.2); assert.equal(cipav.taxRate, 2.2);
  // Date d'effet : avant le 1er janvier 2026 → aucune version (le taux historique du document reste la règle).
  assert.equal(ref.referentialForDate([v2026], '2025-12-31'), null);
  assert.equal(ref.referentialForDate([v2026], '2026-01-01')?.version, '2026');
  assert.equal(ref.referentialForDate([v2026], '2027-06-30')?.version, '2026');
  // Validation : vide = non renseigné, inconnu = refus explicite (jamais de valeur inventée).
  assert.equal(ref.normalizeCategoryInput(''), null);
  assert.equal(ref.normalizeCategoryInput(null), null);
  assert.equal(ref.normalizeCategoryInput('services_bic'), 'services_bic');
  assert.throws(() => ref.normalizeCategoryInput('inconnu'), /Catégorie d'activité inconnue/);
  // Ventilation (activité mixte) : vente + services + une ligne sans catégorie.
  const split = ref.splitByCategory(
    [{ amountHt: 1000, category: 'vente_bic' }, { amountHt: 500, category: 'services_bic' }, { amountHt: 250, category: null }],
    'services_bnc', [v2026], '2026-03-15',
  );
  assert.equal(split.version, '2026');
  const total = split.rows.reduce((t, r) => t + r.caHt, 0);
  assert.equal(Math.round(total * 100) / 100, 1750, 'aucun double comptage : la somme des catégories égale le CA');
  const venteRow = split.rows.find(r => r.category === 'vente_bic');
  assert.equal(venteRow.caHt, 1000);
  assert.equal(venteRow.socialAmount, Math.round(1000 * 12.3) / 100);
  // La ligne sans catégorie retombe sur la catégorie du DOCUMENT (fallback explicite), pas sur un hasard.
  const bncRow = split.rows.find(r => r.category === 'services_bnc');
  assert.equal(bncRow.caHt, 250);
  // Impôt (versement libératoire) distinct des cotisations :
  assert.ok(Math.abs(split.taxTotal - (1000 * 0.01 + 500 * 0.017 + 250 * 0.022)) < 0.01);
  assert.ok(Math.abs(split.contributionsTotal - (venteRow.contributionsTotal + bic.contributionsTotal)) < 0.02 || split.contributionsTotal > 0);
  // Sans catégorie nulle part → « unassigned » signalé, jamais affecté silencieusement :
  const split2 = ref.splitByCategory([{ amountHt: 100, category: null }], null, [v2026], '2026-03-15');
  assert.equal(split2.unassignedHt, 100);
  assert.ok(split2.rows.find(r => r.category === 'unassigned'));
  assert.equal(split2.contributionsTotal, 0, 'aucune cotisation calculée sur du CA non affecté');
});

test('bloc8: proposition APE/NAF — indicatrice, jamais appliquée automatiquement', async () => {
  const det = await import(new URL('../dist/services/micro-detection.js', import.meta.url).pathname);
  const p62 = det.proposeCategoryFromNaf('62.01Z');
  assert.equal(p62.category, 'services_bnc');
  assert.equal(p62.confidence, 'code-level');
  assert.match(p62.note, /à confirmer|BNC/);
  assert.match(p62.source, /jamais une preuve/);
  const p95 = det.proposeCategoryFromNaf('95.11Z');
  assert.equal(p95.category, 'services_bic');
  const p47 = det.proposeCategoryFromNaf('47.11A');
  assert.equal(p47.category, 'vente_bic');
  // 15.4.35 : le code 47.11 est couvert au niveau CODE (plus précis), la catégorie est inchangée.
  assert.equal(p47.confidence, 'code-level');
  assert.match(p47.note, /BIC vente/);
  const pInvalid = det.proposeCategoryFromNaf('bogus-code');
  assert.equal(pInvalid, null);
  // La proposition ne modifie AUCUNE donnée : fonction pure, sans effet de bord.
  const p1 = det.proposeCategoryFromNaf('86.23A');
  assert.equal(p1.category, 'services_bnc_cipav');
  assert.deepEqual(det.proposeCategoryFromNaf('86.23A'), p1, 'déterministe');
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
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 8')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `bloc8-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 8')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('bloc8: référentiel lisible par le rôle applicatif, non inscriptible (RLS)', { skip }, async () => {
  const mod = await boot();
  const versions = await mod.db.query('select version,effective_from from micro_referential_versions order by version');
  assert.equal(versions.rowCount >= 1, true);
  const rates = await mod.db.query('select count(*)::int n from micro_rates');
  assert.ok(Number(rates.rows[0].n) >= 5);
  await assert.rejects(
    () => mod.db.query("insert into micro_rates(id,version_id,category,label,social_rate,cfp_rate,basis) select gen_random_uuid(),id,'vente_bic','x',1,0,'ca' from micro_referential_versions limit 1"),
    undefined,
    'le rôle applicatif ne doit pas pouvoir écrire le référentiel',
  );
});

test('bloc8: catégorie par ligne et par document + ventilation comptable sans double comptage + isolation A/B', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const B = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };
  const authB = { authorization: `Bearer ${B.token}` };
  const actA = (await mod.app.inject({ method: 'GET', url: '/activities', headers: auth })).json();
  const activityIdA = actA[0].id;

  // Devis→facture d'activité MIXTE : 2 lignes catégorisées + 1 ligne sans catégorie (fallback document).
  const created = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: {
      documentType: 'invoice', intervention: 'Vente pièce + réparation',
      activityCategory: 'services_bic',
      items: [
        { label: 'Écran vendu', quantity: 1, unitCost: 40, unitPrice: 1000, activityCategory: 'vente_bic' },
        { label: 'Main-d’œuvre', quantity: 2, unitCost: 0, unitPrice: 250, activityCategory: 'services_bic' },
        { label: 'Nettoyage', quantity: 1, unitCost: 0, unitPrice: 250, activityCategory: '' },
      ],
      vatRate: 0, urssafRate: 0, allowLoss: true,
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const invoiceId = created.json().id;

  // Catégorie inconnue refusée explicitement (jamais de valeur inventée).
  const rejected = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: { documentType: 'quote', intervention: 'x', activityCategory: 'catégorie_inventée', items: [], vatRate: 0, urssafRate: 0 },
  });
  assert.equal(rejected.statusCode, 400);
  assert.match(rejected.body, /Catégorie d'activité inconnue/);

  // La catégorie du document et des lignes est persistée et relue.
  const listA = (await mod.app.inject({ method: 'GET', url: '/quotes', headers: auth })).json();
  const doc = listA.find(x => x.id === invoiceId);
  assert.equal(doc.activity_category, 'services_bic');
  assert.equal(doc.items[0].activityCategory, 'vente_bic');
  assert.equal(doc.items[2].activityCategory, null, 'vide = non renseigné');
  assert.ok(doc.category_snapshot, 'instantané du référentiel enregistré');
  assert.equal(doc.category_snapshot.docCategory, 'services_bic');

  // Ventilation par catégorie : CA 1000 (vente) + 500+250 (BIC fallback) — aucun doublon.
  const byCat = (await mod.app.inject({ method: 'GET', url: `/accounting/by-category?year=${new Date().getFullYear()}`, headers: auth })).json();
  assert.equal(byCat.version, '2026');
  const totalCa = byCat.rows.reduce((t, r) => t + r.caHt, 0);
  assert.equal(Math.round(totalCa * 100) / 100, 1750);
  const venteRow = byCat.rows.find(r => r.category === 'vente_bic');
  assert.equal(venteRow.caHt, 1000);
  assert.equal(Math.round(venteRow.socialAmount * 100) / 100, Math.round(1000 * 0.123 * 100) / 100);
  assert.ok(byCat.taxTotal > 0, 'versement libératoire estimé séparément des cotisations');
  assert.equal(byCat.unassignedHt, 0, 'le fallback document élimine le non-affecté');

  // Ventilation reflétée dans /accounting/summary (tableau de bord).
  const summary = (await mod.app.inject({ method: 'GET', url: `/accounting/summary?year=${new Date().getFullYear()}`, headers: auth })).json();
  assert.ok(summary.byCategory && Array.isArray(summary.byCategory.rows));

  // Isolation A/B : l'organisation B ne voit aucune donnée de A.
  const byCatB = (await mod.app.inject({ method: 'GET', url: `/accounting/by-category?year=${new Date().getFullYear()}`, headers: authB })).json();
  assert.equal(byCatB.rows.reduce((t, r) => t + r.caHt, 0), 0);
  const listB = (await mod.app.inject({ method: 'GET', url: '/quotes', headers: authB })).json();
  assert.equal(listB.some(x => x.id === invoiceId), false);

  // La proposition APE est disponible sans écriture (indicative).
  const proposal = (await mod.app.inject({ method: 'GET', url: '/micro/category-proposal?naf=62.01Z', headers: auth })).json();
  assert.equal(proposal.proposal.category, 'services_bnc');
  const referential = (await mod.app.inject({ method: 'GET', url: '/micro/referential', headers: auth })).json();
  assert.equal(referential.version, '2026');
  assert.ok(referential.rates.length >= 5);
  assert.ok(referential.source.includes('service-public'));
});
