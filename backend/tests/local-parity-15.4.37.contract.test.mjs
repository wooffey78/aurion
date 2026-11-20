// Contrats de parité local / déployé (15.4.37).
// 1) Une organisation sans forme juridique déclarée ne perd pas la détection : le régime micro
//    est supposé et signalé, avec cotisations et TVA cohérentes.
// 2) Le code NAF oriente la catégorie micro (vente / services).
// 3) Aucune période d'essai n'est imposée quand la facturation n'est pas configurée en local.
// 4) L'administration locale s'amorce sans casser une instance multi-entreprises.
// 5) L'horloge est unique, dans la topbar, aux couleurs Aurion.
// 6) Le calendrier fiscal n'est plus affiché, mais l'alerte interne à 7 jours persiste au journal
//    et ne disparaît que par un clic explicite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectFiscalSettings } from '../dist/services/fiscal-detection.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = path => readFileSync(join(root, path), 'utf8');

test('forme juridique absente : détection micro supposée, cotisations présentes', () => {
  const detected = detectFiscalSettings('', 'repair', 'Réparation de smartphones', '');
  assert.equal(detected.legalFormAssumed, true);
  assert.equal(detected.legalFormCode, 'EI_MICRO');
  assert.ok(detected.contributions.length > 0, 'des cotisations sont détectées');
  assert.ok(Number(detected.socialRate) > 0, 'un taux de cotisations est proposé');
  assert.equal(detected.vatRate, 20, 'la TVA par défaut reste 20 %');
  assert.match(detected.reason, /supposé/i);
});

test('le code NAF oriente la catégorie micro et le taux de cotisations', () => {
  const retail = detectFiscalSettings('EI_MICRO', '', 'Boutique', '', { nafCode: '47.91Z' });
  assert.equal(retail.microCategory, 'vente_bic');
  const repair = detectFiscalSettings('EI_MICRO', '', 'Atelier', '', { nafCode: '95.12Z' });
  assert.equal(repair.microCategory, 'services_bic');
  assert.notEqual(repair.socialRate, retail.socialRate, 'vente et service n’ont pas le même taux');
});

test('aucun essai de 60 jours imposé sans facturation configurée', () => {
  const account = read('backend/src/services/account.ts');
  const auth = read('backend/src/routes/auth.ts');
  // La règle vit dans un seul helper, utilisé par l'inscription comme par la lecture d'état.
  assert.match(account, /export async function createInitialSubscription\(/);
  assert.match(account, /if \(billingConfigured\(\)\) \{/);
  assert.match(account, /now\(\)\+interval '60 days'/);
  assert.match(account, /,'no_billing',null,null\)/);
  assert.doesNotMatch(auth, /insert into subscriptions/);
  assert.match(auth, /await createInitialSubscription\(client, orgId\);/);
  const trialInserts = account.match(/,'trialing'/g) || [];
  assert.equal(trialInserts.length, 1, 'un seul point de création d’essai');
  assert.ok(
    account.indexOf(",'trialing'") > account.indexOf('if (billingConfigured())'),
    'l’essai est créé uniquement dans la branche de facturation configurée',
  );
  // Le schéma accepte l'absence d'essai (migration additive 091) : plus de conflit NOT NULL.
  const fix = read('backend/migrations/091_subscription_optional_trial.sql');
  assert.match(fix, /alter column trial_ends_at drop not null/);
});

test('amorçage admin local borné à une instance mono-entreprise', () => {
  const support = read('backend/src/routes/support.ts');
  assert.match(support, /not exists\(select 1 from platform_admins\)/);
  assert.match(support, /\(select count\(\*\) from organizations\)=1/);
  assert.match(support, /om\.role='owner'/);
});

test('horloge unique dans la topbar, couleurs Aurion, absente de l’accueil', () => {
  const shell = read('assets/js/pages/dashboard.js');
  const home = read('assets/js/pages/dash/other.js');
  const css = read('assets/css/app.css');
  assert.match(shell, /class="pill shell-clock" id="local-clock"/);
  assert.match(shell, /startLocalClock\(document\.getElementById\('local-clock'\)\)/);
  assert.doesNotMatch(home, /id="local-clock"/);
  assert.doesNotMatch(home, /startLocalClock/);
  assert.match(css, /\.shell-clock\{[^}]*var\(--accent\)/);
});

test('calendrier fiscal masqué, alerte interne 7 jours, suppression par clic seulement', () => {
  const accounting = read('assets/js/pages/dash/other.js');
  assert.doesNotMatch(accounting, /Calendrier fiscal et seuils/);
  assert.doesNotMatch(accounting, /api\.fiscalCalendar/);
  assert.match(accounting, /fiscal_deadline/);
  assert.match(accounting, /Supprimer l’alerte/);

  const service = read('backend/src/services/fiscal-calendar.ts');
  assert.match(service, /recordUpcomingFiscalDeadlines/);
  assert.match(service, /7 \* 86400000/);
  assert.match(service, /on conflict \(organization_id,dedupe_key\) do nothing/);
  const app = read('backend/src/routes/business.ts');
  assert.match(app, /recordUpcomingFiscalDeadlines\(org\)/);
  assert.match(app, /app\.get\('\/fiscal-calendar'/);
});

test('une pièce de catalogue porte la nature « bien » (vente BIC)', () => {
  const quote = read('assets/js/pages/dash/quote.js');
  assert.match(quote, /l\.activityCategory='vente_bic';l\.categoryAuto=true/);
  assert.match(quote, /if\(l\.categoryAuto\)\{l\.activityCategory=null/);
});
