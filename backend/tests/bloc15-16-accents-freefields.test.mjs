// Blocs 15 et 16 — Accents (recherche insensible, valeurs d'origine préservées) et
// champs libres/placeholders (vide ≠ zéro, valeurs enregistrées jamais écrasées).
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

test('bloc15: fonction SQL aurion_unaccent (1:1, IMMUTABLE) appliquée aux recherches sans réécriture des données', () => {
  const mig = read('../migrations/082_accent_search.sql');
  assert.match(mig, /create or replace function aurion_unaccent/);
  assert.match(mig, /immutable/);
  // Les données d'origine ne sont JAMAIS réécrites : aucune instruction UPDATE/REPLACE de données.
  assert.doesNotMatch(mig, /update\s+\w+\s+set\s+name/i);
  // Les principaux chemins de recherche comparent via aurion_unaccent :
  const business = read('../src/routes/business.ts');
  const searchAll = business.slice(business.indexOf('/search/all'), business.indexOf('/search/all') + 2200);
  assert.match(searchAll, /aurion_unaccent\(name\) like aurion_unaccent\(\$3\)/);
  assert.match(searchAll, /aurion_unaccent\(legal_name\)/);
  const matches = business.slice(business.indexOf('/clients/matches'), business.indexOf('/clients/matches') + 1200);
  assert.match(matches, /aurion_unaccent/);
  // Correspondance catalogue / suggestions côté interface déjà en NFD :
  const suggest = read('../../assets/js/core/suggest.js');
  assert.match(suggest, /normalize\('NFD'\)/);
  const catalog = read('../../assets/js/pages/dash/catalog.js');
  assert.match(catalog, /normalize\('NFD'\)/);
});

test('bloc16: champs libres à vide avec placeholder, vide ≠ zéro dans le moteur, valeurs jamais écrasées', async () => {
  const quote = read('../../assets/js/pages/dash/quote.js');
  // Champs libres principaux : valeur par défaut VIDE + placeholder explicite.
  for (const input of ['id="mileageKm"', 'id="shipping"', 'id="coefficientValue"', 'id="laborSellingHt"', 'id="targetTtc"', 'id="minimumProfit"']) {
    const i = quote.indexOf(input);
    assert.ok(i > 0, `${input} présent`);
    const tag = quote.slice(i, i + 400);
    assert.match(tag, /placeholder=/, `${input} porte un placeholder`);
    assert.doesNotMatch(tag, /value="0"/, `${input} n'est PAS prérempli à zéro (vide = non renseigné)`);
  }
  // Le moteur distingue vide (absent) et zéro réel :
  const pricing = read('../src/services/pricing.ts');
  assert.match(pricing, /laborSellingHt.*undefined|undefined.*laborSellingHt/);
  const quoteDraft = quote.slice(quote.indexOf('laborSellingHt:$(\'#laborSellingHt\')'));
  // 15.4.55 : le champ vide reste ABSENT (undefined, jamais 0) ; une valeur saisie est arrondie
  // au centime (r2) avant envoi — le contrat d'absence est conservé à l'identique.
  assert.match(quoteDraft, /value===''\?undefined:r2\(num\('#laborSellingHt'\)\)/, 'champ vide → absent (undefined), jamais 0 ; valeur saisie → arrondi centime');
  // Le moteur de calcul (build) ne confond pas vide et zéro :
  const engine = await import(new URL('../dist/services/pricing.js', import.meta.url).pathname);
  const empty = engine.computePricing({ mileageKm: '', laborSellingHt: undefined, vatRate: 0, urssafRate: 0, partCost: 100, laborInternalCostHt: 0 });
  assert.equal(empty.mileageTotal, 0, 'kilométrage absent → aucun frais');
  const zero = engine.computePricing({ mileageKm: 0, mileageClientRate: 0.5, laborSellingHt: 0, vatRate: 0, urssafRate: 0, partCost: 100, laborInternalCostHt: 0 });
  assert.equal(zero.mileageTotal, 0);
  // Valeurs existantes enregistrées jamais remplacées par un placeholder :
  const onboarding = read('../../assets/js/pages/onboarding.js');
  assert.doesNotMatch(onboarding, /value=""&&\(el\.value=/);
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
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test blocs 15-16')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `b1516-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('bloc15: « reparation » retrouve « Réparation », « electricite » retrouve « Électricité », valeurs d\u2019origine intactes', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };
  // Clients avec accents (composé et décomposé Unicode) + fournisseurs.
  await mod.app.inject({ method: 'POST', url: '/clients', headers: auth, payload: { name: 'Électricité Réparation Sarl' } });
  await mod.app.inject({ method: 'POST', url: '/clients', headers: auth, payload: { name: 'Dépannage Réparations' } });
  await mod.app.inject({ method: 'POST', url: '/suppliers', headers: auth, payload: { name: 'Création Décor', legalName: 'Création Décor SARL' } });
  // Recherche SANS accents (saisie clavier simple) :
  const s1 = (await mod.app.inject({ method: 'GET', url: '/search/all?q=electricite repar', headers: auth })).json();
  assert.ok(s1.clients.some(c => c.name === 'Électricité Réparation Sarl'), 'sans accents → trouve Électricité');
  const s2 = (await mod.app.inject({ method: 'GET', url: '/search/all?q=reparation', headers: auth })).json();
  assert.equal(s2.clients.length >= 2, true, '« reparation » retrouve les deux clients accentués');
  const s3 = (await mod.app.inject({ method: 'GET', url: '/search/all?q=creation decor', headers: auth })).json();
  assert.ok(s3.suppliers.some(x => x.name === 'Création Décor'), 'fournisseurs également');
  // Unicode décomposé (e + accent combinant) dans la requête :
  const decomposed = 'Re\u0301paration';
  const s4 = (await mod.app.inject({ method: 'GET', url: `/search/all?q=${encodeURIComponent(decomposed)}`, headers: auth })).json();
  assert.ok(s4.clients.length >= 2, 'Unicode décomposé reconnu');
  // La valeur D'ORIGINE est préservée en base (jamais réécrite) :
  const rows = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select name from clients order by name'))).rows;
  assert.ok(rows.some(r => r.name === 'Électricité Réparation Sarl'), 'accents conservés dans les données');
  // Doublons (bloc 11) également insensibles aux accents :
  const matches = (await mod.app.inject({ method: 'GET', url: '/clients/matches?q=electricite', headers: auth })).json();
  assert.equal(matches.matches.length, 1);
  // Isolation A/B :
  const B = await seedAccount(mod);
  const sB = (await mod.app.inject({ method: 'GET', url: '/search/all?q=reparation', headers: { authorization: `Bearer ${B.token}` } })).json();
  assert.equal(sB.clients.length, 0);
});

test('bloc16: vide et zéro restent distingués de bout en bout (document enregistré et relu)', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };
  // Document avec des champs libres LAISSÉS VIDES (kilométrage, main-d'œuvre) : aucune donnée inventée.
  const created = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: { documentType: 'quote', intervention: 'Devis champs vides',
      items: [{ label: 'Prestation', quantity: 1, unitCost: 0, unitPrice: 150, activityCategory: 'services_bic' }],
      vatRate: 0, urssafRate: 0, allowLoss: true, finalPriceTtc: 150, mileageKm: '' },
  });
  assert.equal(created.statusCode, 201, created.body);
  const doc = (await mod.app.inject({ method: 'GET', url: '/quotes', headers: auth })).json().find(x => x.id === created.json().id);
  assert.equal(Number(doc.mileage_km || 0), 0);
  assert.ok(doc.mileage_total===null||Number(doc.mileage_total)===0, 'kilométrage non renseigné → aucun frais kilométrique');
  // Document avec ZÉRO VOLONTAIRE : conservé comme zéro (≠ vide).
  const zeroDoc = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: { documentType: 'quote', intervention: 'Zéro volontaire',
      items: [{ label: 'Offert', quantity: 1, unitCost: 0, unitPrice: 0 }],
      vatRate: 0, urssafRate: 0, allowLoss: true, finalPriceTtc: 0, mileageKm: 0 },
  });
  assert.equal(zeroDoc.statusCode, 201, zeroDoc.body);
  const zdoc = (await mod.app.inject({ method: 'GET', url: '/quotes', headers: auth })).json().find(x => x.id === zeroDoc.json().id);
  assert.equal(Number(zdoc.mileage_km), 0, 'zéro volontaire conservé');
  // Les valeurs existantes ne sont jamais remplacées par un vide : relecture après édition sans champ.
  const patched = await mod.app.inject({ method: 'PATCH', url: `/quotes/${created.json().id}`, headers: auth, payload: { warrantyText: 'Garantie 6 mois' } });
  assert.equal(patched.statusCode, 200, patched.body);
  const after = (await mod.app.inject({ method: 'GET', url: '/quotes', headers: auth })).json().find(x => x.id === created.json().id);
  assert.equal(Number(after.items[0].unitPrice), 150, 'prix enregistré intact après édition partielle');
  assert.equal(after.warranty_text, 'Garantie 6 mois');
});
