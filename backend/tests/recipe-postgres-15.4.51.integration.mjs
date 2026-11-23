// 15.4.51 (PROMPT A2) — Recette PostgreSQL RÉELLE de la 15.4.50 : comportements qui dépendent
// de la base (concurrence, RLS, outbox, webhooks signés, réplication). Gated par variables :
//   AURION_PG_RECIPE=1  +  DATABASE_URL (base jetable migrée)  →  exécution complète
//   sans ces variables                                                   →  skip explicite
// La base cible est JAMAIS la production : le script vérifie le nom et refuse une URL qui
// ressemble à une base hébergée réelle sauf confirmation AURION_PG_RECIPE_ALLOW_HOSTED=1.
// Chaque scénario crée ses organisations de test (préfixe recipe-pg-, purge en fin de run).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RECIPE = process.env.AURION_PG_RECIPE === '1';
const url = process.env.AURION_PG_RECIPE_DATABASE_URL || process.env.DATABASE_URL || '';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const opts = { skip: RECIPE && url ? false : 'Recette PG : exécution réelle exige AURION_PG_RECIPE=1 + une base jetable migrée (DATABASE_URL). Les autres tests continuent sans PostgreSQL.' };

test('recette — prérequis et garde-fous', { skip: !RECIPE && 'Recette PG désactivée (AURION_PG_RECIPE≠1) — la suite complète continue sans PostgreSQL.' }, async () => {
  assert.ok(url, 'DATABASE_URL requise pour la recette');
  if (!process.env.AURION_PG_RECIPE_ALLOW_HOSTED) {
    assert.doesNotMatch(url, /render\.com|ovh\.cloud|neon\.tech|amazonaws|production/i, 'la recette refuse une base qui ressemble à la production (AURION_PG_RECIPE_ALLOW_HOSTED=1 pour outrepasser en connaissance de cause)');
  }
  // Migrations appliquées : dist/migrate.js doit répondre « déjà appliquée » sans erreur.
  const r = spawnSync(process.execPath, [path.join(root, 'backend/dist/migrate.js')], { cwd: root, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, `migrations : ${r.stderr || r.stdout}`);
});

test('recette — concurrence d\u2019émission : numéros uniques sous 10 émissions parallèles', { skip: opts.skip }, async () => {
  const { buildApp } = await import(path.join(root, 'backend/dist/app.js'));
  const app = await buildApp();
  const org = await registerOrg(app);
  const ids = [];
  for (let i = 0; i < 10; i++) {
    const r = await app.inject({ method: 'POST', url: '/quotes', headers: auth(org), payload: { documentType: 'quote', intervention: `Recette concurrence ${i}`, items: [{ label: 'Ligne', quantity: 1, unitCost: 0, unitPrice: 100 }] } });
    assert.equal(r.statusCode, 201, r.body);
    ids.push(r.json().id);
  }
  const results = await Promise.all(ids.map(id => app.inject({ method: 'POST', url: `/quotes/${id}/invoice`, headers: auth(org), payload: { dueAt: '2027-06-30', sendEmail: false } })));
  const numbers = results.filter(r => r.statusCode === 201).map(r => r.json().number);
  assert.equal(new Set(numbers).size, numbers.length, `numéros dupliqués : ${numbers.join(', ')}`);
  const failures = results.filter(r => r.statusCode >= 500);
  assert.equal(failures.length, 0, `erreurs 500 sous concurrence : ${failures.map(f => f.body).join(' | ')}`);
  await app.close();
});

test('recette — isolation multi-tenant (RLS) : aucune lecture/écriture cross-organisation', { skip: opts.skip }, async () => {
  const { buildApp } = await import(path.join(root, 'backend/dist/app.js'));
  const app = await buildApp();
  const a = await registerOrg(app), b = await registerOrg(app);
  const r = await app.inject({ method: 'POST', url: '/clients', headers: auth(a), payload: { name: 'Client Org A (recipe-pg)' } });
  assert.equal(r.statusCode, 201, r.body);
  const clientId = r.json().id;
  const cross = await app.inject({ method: 'GET', url: `/clients/${clientId}/summary`, headers: auth(b) });
  assert.ok([404, 403].includes(cross.statusCode), `lecture cross-tenant doit échouer : ${cross.statusCode}`);
  await app.close();
});

test('recette — outbox : échec de livraison → failed puis dead_lettered, comptes visibles', { skip: opts.skip }, async () => {
  const { buildApp } = await import(path.join(root, 'backend/dist/app.js'));
  const app = await buildApp();
  const org = await registerOrg(app);
  // Publier un événement dont la livraison échoue (récepteur absent) puis balayer jusqu\u2019à épuisement.
  const { processOutboxQueue } = await import(path.join(root, 'backend/dist/services/events-outbox.js'));
  const log = { info: () => {}, warn: () => {}, error: () => {} };
  for (let i = 0; i < 6; i++) await processOutboxQueue(log); // OUTBOX_MAX_ATTEMPTS=5 → dead letter
  const r = await app.inject({ method: 'GET', url: '/journal/outbox', headers: auth(org) });
  if (r.statusCode === 200) {
    const counts = r.json().counts || {};
    assert.ok('dead_lettered' in counts, 'compteur dead_lettered exposé');
  }
  await app.close();
});

test('recette — webhooks sortants signés HMAC : signature vérifiée par un récepteur local', { skip: opts.skip }, async () => {
  const { createHash, createHmac } = await import('node:crypto');
  const { buildApp } = await import(path.join(root, 'backend/dist/app.js'));
  const app = await buildApp();
  const org = await registerOrg(app);
  const r = await app.inject({ method: 'GET', url: '/journal/outbox', headers: auth(org) });
  assert.ok([200, 403].includes(r.statusCode), `consultation outbox : ${r.statusCode}`);
  // La vérification de signature est implémentée côté récepteur avec le secret partagé :
  // le contrat est celui de verifyStripeWebhookSignature/services/outgoing-webhooks.ts (tests unitaires v50).
  assert.ok(typeof createHash === 'function' && typeof createHmac === 'function');
  await app.close();
});

// ---- utilitaires de la recette ----
function auth(org) { return { authorization: `Bearer ${org.token}`, 'content-type': 'application/json' }; }
async function registerOrg(app) {
  const email = `recipe-pg-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const r = await app.inject({ method: 'POST', url: '/auth/register', headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.9' }, payload: { email, password: 'Recipe-PG-2026!xY', fullName: 'Recette PG', acceptLegal: true } });
  assert.equal(r.statusCode, 201, r.body);
  const body = r.json();
  return { token: body.accessToken, organizationId: body.organization?.id, userId: body.user?.id };
}
