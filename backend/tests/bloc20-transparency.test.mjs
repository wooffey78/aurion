// Bloc 20 — Transparence, sécurité documentée et réversibilité.
// La page publique « Sécurité et contrôles » est alimentée par la matrice du code, avec
// cohérence AUTOMATIQUEMENT vérifiée : chaque preuve citée existe, chaque sous-traitant
// actif correspond à une configuration réelle, l'export complet n'inclut aucun secret.
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

test('bloc20: la matrice de contrôles est cohérente avec le code (preuves existantes, états honnêtes)', () => {
  const tr = read('../src/services/transparency.ts');
  // Les deux capacités NON opérationnelles sont déclarées comme telles (honnêteté) :
  assert.match(tr, /'absente'[\s\S]*?Suivi d\\'erreurs externe|id: 'observability'[\s\S]*?'absente'/);
  assert.match(tr, /'non vérifiée'/);
  // Chaque emplacement cité dans la matrice existe réellement dans l'arbre livré :
  const locations = [...tr.matchAll(/location: '([^']+)'/g)].map(m => m[1]).join(' · ');
  for (const ref of locations.split(' · ')) {
    const files = ref.split(/\s*·\s*/);
    for (const f of files) {
      if (f === '—') continue;
      // Le premier segment du chemin uniquement (les annotations entre parenthèses ne sont pas des fichiers).
      const clean = f.trim().replace(/\s*\(.*$/, '');
      assert.ok(existsSync(new URL(`../../${clean}`, import.meta.url).pathname), `emplacement cité introuvable : ${clean}`);
    }
  }
  // La page publique existe et est routée :
  const legal = read('../../assets/js/pages/legal.js');
  assert.match(legal, /export async function renderTransparency/);
  assert.match(legal, /Transparence & réversibilité/);
  const main = read('../../assets/js/main.js');
  assert.match(main, /'\/transparence'/);
  // Modèle de clauses de sous-traitance : explicitement NON présenté comme conforme RGPD.
  const st = read('../../docs/SOUS-TRAITANTS.md');
  assert.match(st, /n'est PAS présentée comme conforme RGPD|n'est PAS présenté comme conforme RGPD/);
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
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 20')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `bloc20-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 20')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('bloc20: /transparency publique (sans compte), sous-traitants = configuration réelle, export sans secret, isolation', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };

  // 1) Public : aucune session requise.
  const pub = await mod.app.inject({ method: 'GET', url: '/transparency' });
  assert.equal(pub.statusCode, 200, pub.body);
  const data = pub.json();
  assert.ok(Array.isArray(data.subprocessors) && data.subprocessors.length >= 4);
  assert.ok(Array.isArray(data.controls) && data.controls.length >= 8);
  // Sous-traitants = configuration RÉELLE : l'état « actif » reflète exactement les variables
  // d'environnement (la recette exporte AURION_PA_PROVIDER=generic pour les tests blocs 3-5).
  const pa = data.subprocessors.find(x => x.name.includes('Plateforme agréée'));
  assert.equal(pa.active, Boolean(process.env.AURION_PA_PROVIDER), 'état PA = configuration réelle');
  const pay = data.subprocessors.find(x => x.name.startsWith('Prestataire de paiement'));
  assert.equal(pay.active, Boolean(process.env.AURION_PAY_PROVIDER), 'état paiement = configuration réelle (D3 non tranchée → vide en production)');
  const render = data.subprocessors.find(x => x.name === 'Render');
  assert.equal(render.active, true, 'hébergement permanent');
  // 2) Cohérence : aucun SECRET RÉEL (valeur) dans la réponse publique — le mot « secret »
  //    dans la prose descriptive est bien sûr autorisé ; on cherche des motifs de clés réelles.
  const body = pub.body;
  assert.doesNotMatch(body, /sk_(live|test)_[A-Za-z0-9]+|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20}|xox[baprs]-[A-Za-z0-9-]{10}|-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  // 3) Export complet (réversibilité) : inclut les données de l'organisation, AUCUN secret,
  //    aucune donnée d'une autre organisation (isolation bloc 2).
  await mod.app.inject({ method: 'POST', url: '/clients', headers: auth, payload: { name: 'Client Exporté' } });
  const exportRes = await mod.app.inject({ method: 'GET', url: '/documents/export-all.zip', headers: auth });
  assert.equal(exportRes.statusCode, 200, String(exportRes.body));
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(exportRes.rawPayload);
  const manifest = JSON.parse(zip.readAsText('export-manifest.json'));
  assert.equal(manifest.security.secretsIncluded, false);
  assert.equal(manifest.security.oauthTokensIncluded, false);
  assert.equal(manifest.security.crossOrganizationDataIncluded, false);
  const identity = zip.readAsText('entreprise/identite-legale.json');
  assert.match(identity, /Micro /, 'les données de l\u2019organisation sont incluses');
  // Index des justificatifs présent (bloc 14).
  assert.ok(zip.getEntry('comptabilite/justificatifs-index.csv'));
  // 4) Isolation A/B : l'export de B ne contient pas les données de A.
  const B = await seedAccount(mod);
  const exportB = await mod.app.inject({ method: 'GET', url: '/documents/export-all.zip', headers: { authorization: `Bearer ${B.token}` } });
  assert.equal(exportB.statusCode, 200, String(exportB.body));
  assert.ok(exportB.rawPayload && exportB.rawPayload.length > 1000, 'export B est un ZIP réel');
  const zipB = new AdmZip(exportB.rawPayload);
  const allTextB = zipB.getEntries().map(e => e.getData().toString('utf8')).join('');
  assert.doesNotMatch(allTextB, /Client Exporté/, 'aucune donnée de A dans l\u2019export de B');
});
