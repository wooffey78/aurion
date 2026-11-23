// V2 (15.4.47) — Cycle de vie du choix de métier retenu, vérifié EN BASE PostgreSQL
// (exigence de conception §11 : « les tests doivent vérifier les résultats réellement
// enregistrés en base, et pas uniquement les réponses affichées par l'API »).
//
// Scénarios couverts (numérotation du développement V2 §11) :
//   8-10  choix manuel → référence retenue ; une nouvelle détection ne l'écrase pas ;
//   11-14 actualisation SIRET/SIREN, NAF, nom et description → choix et origine inchangés ;
//   15-16 modification volontaire → nouvelle décision datée, origine à jour, journalisée ;
//   17-18 persistance relecture (GET) après les écritures : le choix survit à la
//         reconnexion/synchronisation car il est lu en base, jamais recalculé ;
//   19-20 deux modifications concurrentes → aucune destruction, une seule ligne ;
//   21-24 isolation : l'organisation B ne peut ni lire ni écrire le choix de A ;
//         le journal trace le cycle de vie complet (proposé → confirmé/manuel → retiré).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

process.env.NODE_ENV ||= 'test';
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

async function seedAccount(mod, label) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test profil V2')`, [organizationId, `Micro ${label} ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `v2-${label}-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Travaux d''étanchéité','Fixture conservation V2')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}
const authOf = t => ({ authorization: `Bearer ${t}` });
async function activityIdOf(mod, orgId) {
  return (await mod.db.withTenant(orgId, async () => await mod.db.query('select id from activities where organization_id=$1 order by name limit 1', [orgId]))).rows[0].id;
}
async function overrideRow(mod, orgId, activityId) {
  return (await mod.db.withTenant(orgId, async () => await mod.db.query(
    'select profile_code, origin, chosen_from_proposal, chosen_at from activity_profile_overrides where activity_id=$1', [activityId]))).rows[0] || null;
}
async function journalKinds(mod, orgId, activityId) {
  return (await mod.db.withTenant(orgId, async () => await mod.db.query(
    'select kind, profile_code, confidence, reasons, proposal, created_at from profile_proposal_events where activity_id=$1 order by created_at asc, id asc', [activityId]))).rows;
}

test('v2 intégration: conservation du choix manuel vérifiée en base — détection, SIRET, NAF/description, re-choix, changement, retrait', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod, 'A');
  const auth = authOf(A.token);
  const id = await activityIdOf(mod, A.organizationId);

  // (8) L'utilisateur sélectionne manuellement son métier : référence retenue en base.
  const rChoice = await mod.app.inject({ method: 'POST', url: `/activities/${id}/profile-choice`, headers: auth, payload: { profileCode: 'plumbing' } });
  assert.equal(rChoice.statusCode, 200, rChoice.body);
  const row0 = await overrideRow(mod, A.organizationId, id);
  assert.equal(row0.profile_code, 'plumbing');
  assert.equal(row0.origin, 'manual');
  assert.equal(row0.chosen_from_proposal, null);
  assert.ok(row0.chosen_at, 'date de décision manquante');
  const t0 = new Date(row0.chosen_at).getTime();

  // (9-10) Une nouvelle détection propose un autre métier → le choix manuel reste inchangé,
  // la proposition est journalisée ('proposed') mais n'écrit JAMAIS la sélection.
  const rDetect = await mod.app.inject({ method: 'POST', url: '/activities/detect-profile', headers: auth, payload: { activityId: id, nafCode: '43.21Z', name: 'Travaux d\'étanchéité', description: 'électricité et mise aux normes' } });
  assert.equal(rDetect.statusCode, 200, rDetect.body);
  assert.ok(rDetect.json().proposals.length >= 1, 'liste classée attendue');
  assert.equal(rDetect.json().code, 'electrical', 'le moteur propose le métier du NAF…');
  const row1 = await overrideRow(mod, A.organizationId, id);
  assert.equal(row1.profile_code, 'plumbing', 'la détection a écrasé le choix manuel');
  assert.equal(row1.origin, 'manual');
  assert.equal(new Date(row1.chosen_at).getTime(), t0, 'la date de décision a bougé sans action utilisateur');

  // (11-14) Actualisation SIRET/SIREN puis nom et description → choix et origine inchangés.
  const rOrg = await mod.app.inject({ method: 'PATCH', url: '/organization', headers: auth, payload: { name: `Micro A ${A.organizationId.slice(0, 8)}`, activity: 'Travaux d\'étanchéité', siren: '123456789', siret: '12345678901234' } });
  assert.equal(rOrg.statusCode, 200, rOrg.body);
  const rAct = await mod.app.inject({ method: 'PATCH', url: `/activities/${id}`, headers: auth, payload: { name: 'Étanchéité et plomberie du bâti', description: 'plomberie, salle de bains, chauffe-eau' } });
  assert.equal(rAct.statusCode, 200, rAct.body);
  const row2 = await overrideRow(mod, A.organizationId, id);
  assert.equal(row2.profile_code, 'plumbing');
  assert.equal(row2.origin, 'manual');
  assert.equal(new Date(row2.chosen_at).getTime(), t0, 'mise à jour des données a réinitialisé la sélection (effet de bord interdit)');

  // Re-choix du MÊME métier (16) : aucune rétrogradation, date de décision conservée.
  const rSame = await mod.app.inject({ method: 'POST', url: `/activities/${id}/profile-choice`, headers: auth, payload: { profileCode: 'plumbing' } });
  assert.equal(rSame.statusCode, 200, rSame.body);
  const row3 = await overrideRow(mod, A.organizationId, id);
  assert.equal(row3.profile_code, 'plumbing');
  assert.equal(row3.origin, 'manual');
  assert.equal(new Date(row3.chosen_at).getTime(), t0, 'ré-enregistrer le même métier ne crée pas une nouvelle décision');

  // (15-16) Modification volontaire vers un autre métier, en confirmant une proposition :
  // nouvelle décision datée, origine 'confirmed', proposition d'origine conservée.
  const rChange = await mod.app.inject({ method: 'POST', url: `/activities/${id}/profile-choice`, headers: auth, payload: { profileCode: 'electrical', confirmProposalId: 'electrical' } });
  assert.equal(rChange.statusCode, 200, rChange.body);
  assert.equal(rChange.json().origin, 'confirmed');
  const row4 = await overrideRow(mod, A.organizationId, id);
  assert.equal(row4.profile_code, 'electrical');
  assert.equal(row4.origin, 'confirmed');
  assert.equal(row4.chosen_from_proposal, 'electrical');
  assert.ok(new Date(row4.chosen_at).getTime() >= t0, 'nouvelle décision non datée');

  // Relire via l'API (17-18) : le triplet retenu/origine/date est servi depuis la base.
  const rGet = await mod.app.inject({ method: 'GET', url: `/activities/${id}/profile`, headers: auth });
  assert.equal(rGet.statusCode, 200, rGet.body);
  assert.equal(rGet.json().retainedCode, 'electrical');
  assert.equal(rGet.json().origin, 'confirmed');

  // (5) Retrait volontaire : suppression effective et journalisée (aucun autre chemin).
  const rRemove = await mod.app.inject({ method: 'POST', url: `/activities/${id}/profile-choice`, headers: auth, payload: { remove: true } });
  assert.equal(rRemove.statusCode, 200, rRemove.body);
  assert.equal(await overrideRow(mod, A.organizationId, id), null, 'surcharge encore présente après retrait volontaire');

  // Traçabilité (critère 6) : le journal reconstruit le cycle de vie complet, daté —
  // choix manuel initial, proposition calculée, re-choix, confirmation, retrait.
  const events = await journalKinds(mod, A.organizationId, id);
  const kinds = events.map(e => e.kind);
  assert.deepEqual(kinds, ['manual_change', 'proposed', 'manual_change', 'confirmed', 'removed'], `séquence inattendue : ${kinds.join(',')}`);
  const proposed = events[1];
  assert.equal(proposed.confidence, 'eleve');
  assert.ok(JSON.parse(JSON.stringify(proposed.reasons)).length >= 1, 'raisons non journalisées');
  const proposal = JSON.parse(JSON.stringify(proposed.proposal));
  assert.ok(Array.isArray(proposal.proposals) && proposal.proposals.length >= 1, 'contenu affiché non journalisé');
  const confirmed = events.find(e => e.kind === 'confirmed');
  assert.equal(confirmed.profile_code, 'electrical');
});

test('v2 intégration: écritures concurrentes — aucune destruction, une seule ligne, origine jamais rétrogradée', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod, 'C');
  const auth = authOf(A.token);
  const id = await activityIdOf(mod, A.organizationId);

  const rFirst = await mod.app.inject({ method: 'POST', url: `/activities/${id}/profile-choice`, headers: auth, payload: { profileCode: 'electrical', confirmProposalId: 'electrical' } });
  assert.equal(rFirst.statusCode, 200, rFirst.body);
  const tConfirmed = new Date((await overrideRow(mod, A.organizationId, id)).chosen_at).getTime();

  // (19-20) Deux écritures volontaires simultanées, dont un re-confirm du même métier :
  // upsert atomique → une seule ligne, aucun crash, 'confirmed' ne régresse jamais.
  const [rA, rB] = await Promise.all([
    mod.app.inject({ method: 'POST', url: `/activities/${id}/profile-choice`, headers: auth, payload: { profileCode: 'electrical' } }),
    mod.app.inject({ method: 'POST', url: `/activities/${id}/profile-choice`, headers: auth, payload: { profileCode: 'building' } }),
  ]);
  assert.ok([200, 201].includes(rA.statusCode), rA.body);
  assert.ok([200, 201].includes(rB.statusCode), rB.body);
  const rows = (await mod.db.withTenant(A.organizationId, async () => await mod.db.query(
    'select count(*)::int n from activity_profile_overrides where activity_id=$1', [id]))).rows[0].n;
  assert.equal(rows, 1, 'écritures concurrentes destructrices : plusieurs lignes');
  const final = await overrideRow(mod, A.organizationId, id);
  assert.ok(['electrical', 'building'].includes(final.profile_code), `état final incohérent : ${final.profile_code}`);
  assert.ok(['manual', 'confirmed'].includes(final.origin), `origine illégale : ${final.origin}`);
  // Même métier re-confirmé en concurrence avec un autre choix : si le même métier a gagné,
  // l'origine 'confirmed' et la date restent (non-régression) ; sinon nouvelle décision datée.
  if (final.profile_code === 'electrical') {
    assert.equal(final.origin, 'confirmed', 'origine rétrogradée par un traitement concurrent');
    assert.equal(new Date(final.chosen_at).getTime(), tConfirmed, 'date de décision rétrogradée');
  }
  // Une mise à jour d'activité SIMULTANÉE ne touche jamais la sélection.
  const [rPatch] = await Promise.all([
    mod.app.inject({ method: 'PATCH', url: `/activities/${id}`, headers: auth, payload: { description: 'maçonnerie et carrelage' } }),
    mod.app.inject({ method: 'POST', url: `/activities/${id}/profile-choice`, headers: auth, payload: { profileCode: final.profile_code } }),
  ]);
  const after = await overrideRow(mod, A.organizationId, id);
  assert.ok(after, 'la surcharge a disparu après mise à jour concurrente');
  assert.equal(after.profile_code, final.profile_code);
});

test('v2 intégration: isolation A/B — une organisation ne peut ni lire ni écrire le choix d\'une autre', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod, 'D');
  const B = await seedAccount(mod, 'E');
  const idA = await activityIdOf(mod, A.organizationId);
  const rSetup = await mod.app.inject({ method: 'POST', url: `/activities/${idA}/profile-choice`, headers: authOf(A.token), payload: { profileCode: 'cleaning' } });
  assert.equal(rSetup.statusCode, 200, rSetup.body);

  // B tente d'écrire puis de lire le choix de A : échec fermé (404, style 074).
  const rWrite = await mod.app.inject({ method: 'POST', url: `/activities/${idA}/profile-choice`, headers: authOf(B.token), payload: { profileCode: 'beauty' } });
  assert.equal(rWrite.statusCode, 404, `écriture inter-organisation possible : ${rWrite.statusCode}`);
  const rRead = await mod.app.inject({ method: 'GET', url: `/activities/${idA}/profile`, headers: authOf(B.token) });
  assert.equal(rRead.statusCode, 404, `lecture inter-organisation possible : ${rRead.statusCode}`);
  // Et en base : le choix de A n'a pas bougé (aucun effet de bord).
  const rowA = await overrideRow(mod, A.organizationId, idA);
  assert.equal(rowA.profile_code, 'cleaning');
  assert.equal(rowA.origin, 'manual');
  // Le journal de A ne contient aucune écriture venant de B.
  const events = await journalKinds(mod, A.organizationId, idA);
  assert.deepEqual(events.map(e => e.kind), ['manual_change']);
});
