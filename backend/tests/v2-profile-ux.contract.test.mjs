// V2 (chantier 2, suite) — Propositions de métiers dans les écrans, intégrations standard
// du journal et non-régression de l'origine. Ce que cette itération rend vérifiable :
// l'utilisateur VOIT la liste classée (niveau de confiance + raisons) et choisit d'un clic ;
// l'origine du choix ne régresse jamais (même métier ré-enregistré = 'confirmed' conservé) ;
// le journal suit les conventions du dépôt (FK cascade 001-004, réplication orgkey 086) ;
// l'exploitation peut exporter le journal (CSV console d'administration).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const migration = read('../migrations/094_profile_selection_integration.sql');
const business = read('../src/routes/business.ts');
const admin = read('../src/routes/admin.ts');
const apijs = read('../../assets/js/core/api.js');
const settings = read('../../assets/js/pages/dash/settings.js');
const onboarding = read('../../assets/js/pages/onboarding.js');
const css = read('../../assets/css/app.css');

// ── Migration 094 : conventions standard du dépôt ───────────────────────────────────
test('v2: migration 094 — le journal suit le cycle de vie de l\'espace (FK cascade 001-004)', () => {
  assert.match(migration, /add constraint profile_proposal_events_org_fk/);
  assert.match(migration, /foreign key \(organization_id\) references organizations\(id\) on delete cascade/);
  // Nettoyage défensif avant la pose (idempotence, aucun orphelin).
  assert.match(migration, /delete from profile_proposal_events\s+where organization_id not in/);
});

test('v2: migration 094 — réplication orgkey (086), même traitement que support_status_events', () => {
  assert.match(migration, /create trigger aurion_sync_journal_trigger after insert or update or delete on public\.profile_proposal_events/);
  assert.match(migration, /execute function aurion_sync_journal_write_orgkey\(\)/);
});

// ── Non-régression de l'origine (invariant V2 étendu) ───────────────────────────────
test('v2: ré-enregistrer le même métier ne rétrograde jamais l\'origine ni la décision', () => {
  // La règle SQL de non-régression est dans le helper d'écriture (un seul point d'écriture).
  assert.match(business, /origin=case when activity_profile_overrides\.profile_code=excluded\.profile_code/);
  assert.match(business, /and activity_profile_overrides\.origin in \('confirmed','manual'\)/);
  assert.match(business, /then activity_profile_overrides\.origin else excluded\.origin end/);
  // La date de décision est conservée dans le même cas, sinon nouvelle décision datée.
  assert.match(business, /then activity_profile_overrides\.chosen_at else now\(\) end/);
  // Invariant inchangé : un seul insert, un seul delete volontaire.
  assert.equal((business.match(/insert into activity_profile_overrides/g) || []).length, 1);
  assert.equal((business.match(/delete from activity_profile_overrides/g) || []).length, 1);
});

test('v2: GET /activities expose le triplet retenu/origine/décision pour les écrans', () => {
  assert.match(business, /\) profile_code,\(select origin from activity_profile_overrides/);
  assert.match(business, /\) profile_origin,\(select chosen_at from activity_profile_overrides/);
  assert.match(business, /\) profile_chosen_at,\(select chosen_from_proposal from activity_profile_overrides/);
});

// ── Export d'exploitation du journal (console d'administration) ─────────────────────
test('v2: export CSV du journal réservé à la console d\'administration, daté et plafonné', () => {
  assert.match(admin, /app\.get\('\/admin\/profile-proposal-journal\.csv'/);
  assert.match(admin, /text\/csv; charset=utf-8/);
  assert.match(admin, /aurion-journal-propositions-metiers\.csv/);
  assert.match(admin, /order by p\.created_at desc limit 5000/);
  // Filtre facultatif par organisation (requête paramétrée, jamais concaténée).
  assert.match(admin, /where p\.organization_id=\$1/);
});

// ── Écrans : la liste classée est visible et actionnable ────────────────────────────
test('v2: api — méthode profileChoice vers la route de choix explicite', () => {
  assert.match(apijs, /profileChoice:\(id,b\)=>request\(`\/activities\/\$\{encodeURIComponent\(id\)\}\/profile-choice`/);
});

test('v2: paramètres — propositions classées affichées avec confiance, raisons et « Utiliser »', () => {
  // 15.4.45 : la variante locale est renommée renderProfileProposals — un même nom que
  // l'import renderProposals (company-detect) cassait le chargement du module (boot).
  assert.match(settings, /const renderProfileProposals=\(r=\{\}\)=>\{/);
  assert.match(settings, /data-profile-use="\$\{e\(p\.profile\)\}"/);
  assert.match(settings, /Propositions de métier/);
  assert.match(settings, /Correspondance incertaine : précisez la description/);
  // Confirmation explicite via la route dédiée (origine 'confirmed', journalisée).
  assert.match(settings, /api\.profileChoice\(a\.id,\{profileCode:code,confirmProposalId:code\}\)/);
  // La détection transmet l'activité pour la traçabilité du journal (jamais d'écriture de sélection).
  assert.match(settings, /activityId:a\.id\|\|undefined\}/);
  // Métier retenu + origine affichés (triplet exposé par GET /activities).
  assert.match(settings, /Métier retenu : \$\{e\(originLabel\(a\.profile_origin\)\)/);
  assert.match(settings, /const originLabel=origin=>origin==='confirmed'\?'proposition confirmée'/);
  // Une proposition « Utiliser » ne modifie que la sélection explicite, jamais l'inverse.
  assert.doesNotMatch(settings, /api\.detectProfile[\s\S]{0,400}saveActivityProfileOverride/);
});

test('v2: parcours guidé — liste classée proposée, choix enregistré à la validation seulement', () => {
  assert.match(onboarding, /id="ob-proposals"/);
  assert.match(onboarding, /data-profile-use="\$\{esc\(p\.profile\)\}"/);
  assert.match(onboarding, /Métier sélectionné : il sera enregistré avec votre activité\./);
  assert.match(onboarding, /activityId:a\.id\|\|undefined\}/);
  // Le parcours ne confirme pas immédiatement : le clic « Utiliser » ne fait que
  // sélectionner ; la confirmation explicite n'est journalisée qu'à la validation
  // (15.4.45), comme dernière écriture de l'origine après la mise à jour de l'activité.
  assert.doesNotMatch(onboarding, /addEventListener\('click'[\s\S]{0,320}profileChoice/);
  assert.match(onboarding, /await api\.updateActivity[\s\S]{0,400}await api\.profileChoice/);
});

test('v2: affichage responsive — la liste reste lisible sur mobile (640px et moins)', () => {
  assert.match(css, /\.profile-proposal-row\{[^}]*var\(--border/);
  assert.match(css, /@media \(max-width:640px\)\{[^}]*\.profile-proposal-row\{flex-direction:column/);
  assert.match(css, /\.profile-proposal-row small\{display:block;overflow-wrap:anywhere\}/);
});
