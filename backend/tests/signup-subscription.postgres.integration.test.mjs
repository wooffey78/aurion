// Intégration PostgreSQL — création d'espace et abonnement, avec et sans Stripe (correctif 15.4.38).
// Prérequis : « npm run build », base de test migrée (migration 091 incluse) et DATABASE_URL.
// Reproduit le défaut 15.4.37 (insertion avec dates nulles refusée en 23502) et vérifie que
// l'absence de facturation est enregistrée comme 'no_billing', jamais comme un abonnement actif.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';

const databaseUrl = process.env.DATABASE_URL || process.env.AURION_INTEGRATION_DATABASE_URL;
const distAccount = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'services', 'account.js');
// Les scénarios Stripe/abonnement touchent PostgreSQL : ne jamais les lancer sur une URL factice.
const ready = existsSync(distAccount) && Boolean(databaseUrl) && process.env.AURION_INTEGRATION_TESTS === '1';
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1 ou DATABASE_URL non défini : exécuter après « npm run build » sur une base de test migrée';

const createdOrganizations = new Set();

async function createOrganization() {
  const db = await import('../dist/db.js');
  const orgId = crypto.randomUUID();
  await db.query('insert into organizations(id,name,activity) values($1,$2,$3)', [orgId, 'Essai inscription 15.4.38', 'À configurer']);
  createdOrganizations.add(orgId);
  return { db, orgId };
}

test('sans Stripe : aucun abonnement, statut no_billing sans dates, accès complet', { skip }, async () => {
  const { db, orgId } = await createOrganization();
  const account = await import('../dist/services/account.js');
  const previous = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    // Aucune exception : c'est exactement l'insertion qui échouait en 23502 avant la migration 091.
    await db.withTenant(orgId, () => account.createInitialSubscription({ query: db.query }, orgId));

    const row = (await db.withTenant(orgId, () => db.query('select status,trial_started_at,trial_ends_at from subscriptions where organization_id=$1', [orgId]))).rows[0];
    assert.equal(row.status, 'no_billing');
    assert.equal(row.trial_started_at, null);
    assert.equal(row.trial_ends_at, null);

    const state = await account.subscriptionState(orgId);
    assert.equal(state.status, 'no_billing');
    assert.equal(state.planCode, null, 'aucune formule affichée');
    assert.equal(state.readOnly, false, 'aucun accès en lecture seule');
    assert.equal(state.trialStartedAt, null);
    assert.equal(state.trialEndsAt, null);
    assert.equal(state.daysLeft, 0, 'aucune échéance d’essai affichée');
  } finally {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});

test('sans Stripe : subscriptionState() ne crée plus d’essai de 60 jours', { skip }, async () => {
  const { db, orgId } = await createOrganization();
  const account = await import('../dist/services/account.js');
  const previous = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const state = await account.subscriptionState(orgId);
    assert.equal(state.status, 'no_billing');
    assert.equal(state.planCode, null);
    assert.equal(state.readOnly, false);

    const row = (await db.withTenant(orgId, () => db.query('select status,trial_started_at,trial_ends_at from subscriptions where organization_id=$1', [orgId]))).rows[0];
    assert.ok(row, 'un statut explicite existe');
    assert.equal(row.status, 'no_billing');
    assert.equal(row.trial_started_at, null);
    assert.equal(row.trial_ends_at, null);
  } finally {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});

test('un abonnement payant existant reste actif et n’est pas converti en no_billing', { skip }, async () => {
  const { db, orgId } = await createOrganization();
  const account = await import('../dist/services/account.js');
  const periodStart = new Date(Date.now() - 10 * 86400000).toISOString();
  const periodEnd = new Date(Date.now() + 20 * 86400000).toISOString();
  await db.withTenant(orgId, () => db.query(
    `insert into subscriptions(organization_id,status,plan_code,trial_started_at,trial_ends_at,
       current_period_start,current_period_end,provider,provider_customer_id,provider_subscription_id)
     values($1,'active','monthly',null,null,$2,$3,'stripe','cus_15_4_38_existing','sub_15_4_38_existing')`,
    [orgId, periodStart, periodEnd],
  ));
  const before = (await db.withTenant(orgId, () => db.query(
    'select status,plan_code,current_period_start,current_period_end,provider,provider_subscription_id from subscriptions where organization_id=$1',
    [orgId],
  ))).rows[0];

  const state = await account.subscriptionState(orgId);
  assert.equal(state.status, 'active');
  assert.equal(state.planCode, 'monthly');
  assert.equal(state.readOnly, false);
  assert.equal(state.trialStartedAt, null);
  assert.equal(state.trialEndsAt, null);

  const after = (await db.withTenant(orgId, () => db.query(
    'select status,plan_code,current_period_start,current_period_end,provider,provider_subscription_id from subscriptions where organization_id=$1',
    [orgId],
  ))).rows[0];
  assert.deepEqual(after, before, 'un abonnement payant existant ne doit pas être modifié');
  assert.equal(after.status, 'active');
  assert.equal(after.plan_code, 'monthly');
  assert.equal(after.provider_subscription_id, 'sub_15_4_38_existing');
});

test('avec Stripe : l’essai commercial de 60 jours est bien créé', { skip }, async () => {
  const { db, orgId } = await createOrganization();
  const account = await import('../dist/services/account.js');
  const previous = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_15_4_38_not_real';
  try {
    await db.withTenant(orgId, () => account.createInitialSubscription({ query: db.query }, orgId));

    const row = (await db.withTenant(orgId, () => db.query('select status,trial_started_at,trial_ends_at,data_read_only_until from subscriptions where organization_id=$1', [orgId]))).rows[0];
    assert.equal(row.status, 'trialing');
    assert.ok(row.trial_started_at, 'début d’essai renseigné');
    const days = (new Date(row.trial_ends_at).getTime() - Date.now()) / 86400000;
    assert.ok(days > 59 && days <= 60, `fin d’essai à ~60 jours (${days.toFixed(2)})`);
    assert.ok(row.data_read_only_until, 'fenêtre de conservation renseignée');

    const state = await account.subscriptionState(orgId);
    assert.equal(state.status, 'trialing');
    assert.equal(state.readOnly, false);
    assert.ok(state.daysLeft >= 59 && state.daysLeft <= 60);
  } finally {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});

test.after(async () => {
  if (!createdOrganizations.size) return;
  const db = await import('../dist/db.js');
  for (const orgId of createdOrganizations) {
    try { await db.query('delete from organizations where id=$1', [orgId]); } catch { /* base de test jetable */ }
  }
});
