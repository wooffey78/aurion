// Contrat de schéma — création d'espace et abonnement (correctif 15.4.38).
//
// La 15.4.37 insérait un abonnement 'active' avec trial_started_at/trial_ends_at à null alors
// que la migration 009 les déclarait NOT NULL : PostgreSQL répondait 23502 et annulait toute la
// transaction d'inscription. Ce contrat vérifie l'alignement SQL/schéma et l'unicité du point de
// création de l'abonnement. L'exécution réelle sur PostgreSQL est couverte par
// signup-subscription.postgres.integration.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = path => readFileSync(join(root, path), 'utf8');

test('schéma : les dates d’essai sont facultatives et le statut sans facturation existe (091, 092)', () => {
  const initial = read('backend/migrations/009_accounts_legal_billing.sql');
  assert.match(initial, /trial_started_at timestamptz not null default now\(\)/);
  assert.match(initial, /trial_ends_at timestamptz not null/);

  const fix = read('backend/migrations/091_subscription_optional_trial.sql');
  assert.match(fix, /alter table subscriptions alter column trial_started_at drop not null;/);
  assert.match(fix, /alter table subscriptions alter column trial_ends_at drop not null;/);
  // Les deux dates restent solidaires : jamais une seule des deux.
  assert.match(fix, /check \(\(trial_started_at is null\) = \(trial_ends_at is null\)\)/);

  // 092 : un statut distinct pour « aucune facturation configurée », plus honnête qu'« actif ».
  const status = read('backend/migrations/092_subscription_no_billing_status.sql');
  assert.match(status, /set status='no_billing'/);
  assert.match(status, /check \(status in \('trialing','active','past_due','canceled','expired','no_billing'\)\)/);
  // Seules les lignes synthétiques (aucune formule, aucune date, aucun fournisseur) sont converties.
  for (const condition of ['plan_code is null', 'trial_started_at is null', 'trial_ends_at is null', 'current_period_end is null', 'provider is null']) {
    assert.ok(status.includes(condition), `conversion limitée par ${condition}`);
  }
});

test('un seul point de création d’abonnement, partagé par l’inscription et la lecture d’état', () => {
  const account = read('backend/src/services/account.ts');
  const auth = read('backend/src/routes/auth.ts');

  assert.match(account, /export function billingConfigured\(\)/);
  assert.match(account, /export async function createInitialSubscription\(/);
  assert.match(account, /if \(billingConfigured\(\)\) \{/);

  // L'inscription ne construit plus son propre SQL et ne peut plus diverger du schéma.
  assert.doesNotMatch(auth, /insert into subscriptions/);
  assert.match(auth, /await createInitialSubscription\(client, orgId\);/);

  // La lecture d'état réutilise exactement le même helper.
  assert.match(account, /await createInitialSubscription\(\{ query \}, orgId\);/);
});

test('aucun essai imposé sans facturation : statut actif, dates nulles, branche unique', () => {
  const account = read('backend/src/services/account.ts');
  const withoutBilling = account.slice(account.indexOf('} else {', account.indexOf('export async function createInitialSubscription')));

  assert.match(withoutBilling, /values\(\$1,'no_billing',null,null\)/);
  assert.match(withoutBilling, /on conflict\(organization_id\) do nothing/);
  // Un seul insert 'trialing' dans tout le service, dans la branche de facturation configurée.
  assert.equal((account.match(/,'trialing'/g) || []).length, 1, 'une seule création d’essai');
  assert.ok(
    account.indexOf(",'trialing'") > account.indexOf('if (billingConfigured())'),
    'l’essai reste conditionné à la facturation configurée',
  );
  assert.ok(
    account.indexOf(",'no_billing',null,null") > account.indexOf('} else {'),
    'l’absence de facturation est enregistrée dans la branche sans facturation',
  );
});

test('aucun écran ne présente « no_billing » comme un abonnement payant', () => {
  const screen = read('assets/js/pages/dash/account.js');
  assert.match(screen, /no_billing:\['Sans abonnement'/);
  assert.match(screen, /canSubscribe=!!s\.paymentEnabled/);
  assert.match(screen, /La facturation n’est pas configurée sur cette installation/);
  assert.match(screen, /Aucun moyen de paiement configuré/);

  // Tableau de bord administrateur : catégorie dédiée, jamais comptée comme abonnement payant.
  const admin = read('backend/src/routes/admin.ts');
  assert.match(admin, /when s\.status='no_billing' then 'no_billing'/);
  assert.match(admin, /category='no_billing'/);
  assert.match(admin, /noBilling:Number\(totals\.no_billing/);
  const stats = read('assets/js/pages/dash/other.js');
  assert.match(stats, /Sans facturation \(accès libre\)/);
  assert.match(stats, /Number\(s\.noBilling \|\| 0\)/);

  // Aucun drapeau de résiliation ne peut être posé sur une absence d'abonnement.
  const routes = read('backend/src/routes/account.ts');
  assert.match(routes, /NO_ACTIVE_SUBSCRIPTION/);
  assert.match(routes, /if\(!current\|\|!\['trialing','active'\]\.includes\(current\)\)/);
});

test('les consommateurs des dates d’essai tolèrent null', () => {
  const plugin = read('backend/src/plugins/auth.ts');
  assert.match(plugin, /const trialEnded=!!s\?\.trial_ends_at&&new Date\(s\.trial_ends_at\)\.getTime\(\)<Date\.now\(\);/);
  assert.match(plugin, /s\.status==='trialing'&&trialEnded/);

  const account = read('backend/src/services/account.ts');
  assert.match(account, /const trialEnd = s\.trial_ends_at \? new Date\(s\.trial_ends_at\)\.getTime\(\) : 0;/);

  const business = read('backend/src/routes/business.ts');
  assert.match(business, /sub\?\.trial_ends_at\?Math\.max/);
});

test('l’avis d’accès expiré ne promet pas de souscrire sans moyen de paiement', () => {
  const screen = read('assets/js/pages/dash/account.js');
  const start = screen.indexOf('const expiredNotice=');
  const end = screen.indexOf('const subscriptionNotice=', start);
  assert.ok(start >= 0 && end > start, 'avis d’accès expiré présent');
  const notice = screen.slice(start, end);

  // Le texte « souscrire à tout moment » est réservé à la branche où le paiement est configuré.
  assert.ok(notice.includes('const expiredNotice=canSubscribe'));
  assert.ok(notice.includes('?`${expiredAccess} Vous pouvez souscrire à tout moment.`'));
  const withoutPayment = notice.slice(notice.indexOf('Aucun moyen'));
  assert.ok(withoutPayment.includes('Aucun moyen de paiement n’est configuré sur cette installation'));
  assert.ok(withoutPayment.includes('aucun abonnement ne peut être souscrit'));
  assert.ok(!withoutPayment.includes('Vous pouvez souscrire'), 'aucune promesse sans paiement');

  // L’avis expiré utilise bien la variante conditionnelle, et la promesse n’existe qu’une fois.
  assert.ok(screen.includes("s.status==='expired'?expiredNotice:'Statut de votre abonnement.'"));
  assert.equal((screen.match(/Vous pouvez souscrire à tout moment\./g) || []).length, 1);
});
