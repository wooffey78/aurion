// Bloc 4 — trésorerie prévisionnelle : chaque euro traçable, catégories séparées, sans double comptage.
// POTENTIEL (devis ouverts) ≠ ENGAGÉ (reste dû des factures non soldées) ≠ SORTIES (coûts + notes
// de frais à rembourser). Facture réglée jamais encaissement futur ; devis converti compté une
// seule fois ; devis annulés exclus ; notes de frais remboursées deviennent des flux réalisés.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

process.env.NODE_ENV ||= 'test';
process.env.DATABASE_URL ||= 'postgresql://aurion_runtime:test@127.0.0.1:5432/aurion_it078';
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
async function seedAccount(mod) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 4 trésorerie')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `b4t-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 4 trésorerie')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}
async function createQuote(mod, auth, orgId, { totalTtc = 300 } = {}) {
  const rClient = await mod.app.inject({ method: 'POST', url: '/clients', headers: auth, payload: { name: 'Client ' + uuid().slice(0, 8), activity: 'principale', email: `c${uuid().slice(0, 8)}@example.test` } });
  assert.ok([200, 201].includes(rClient.statusCode), rClient.body);
  const clientId = rClient.json().id;
  const rQuote = await mod.app.inject({ method: 'POST', url: '/quotes', headers: auth, payload: { clientId, documentType: 'quote', vatRate: 20, intervention: 'Prestation test', allowLoss: true, totalTtc, items: [{ label: 'Prestation', quantity: 1, unitCost: 100, unitPrice: 250 }] } });
  assert.ok([200, 201].includes(rQuote.statusCode), rQuote.body);
  const quoteId = rQuote.json().id;
  return { quoteId, clientId };
}
const round2 = n => Math.round(Number(n) * 100) / 100;

test('bloc4: trésorerie — potentiel/engagé/sorties séparés, reste dû exact, sans double comptage', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod), B = await seedAccount(mod);
  const authA = { authorization: `Bearer ${A.token}` }, authB = { authorization: `Bearer ${B.token}` };
  const treasury = async (auth) => (await mod.app.inject({ method: 'GET', url: '/treasury/summary', headers: auth })).json();

  // 1) Un devis ouvert 300 TTC : POTENTIEL uniquement, aucun engagé.
  const q1 = await createQuote(mod, authA, A.organizationId, { totalTtc: 300 });
  let t = await treasury(authA);
  assert.equal(round2(t.potentialIn), 300, 'devis ouvert compté comme potentiel');
  assert.equal(round2(t.committedIn), 0, 'aucune créance tant que la facture n\'existe pas');
  assert.equal(round2(t.forecastEntries), 300, 'compatibilité : entrées identifiées = potentiel + SAV');

  // 2) Conversion en facture puis paiement PARTIEL (150/300) : engagé = reste dû exact (150).
  const rInv = await mod.app.inject({ method: 'POST', url: `/quotes/${q1.quoteId}/invoice`, headers: authA, payload: { reminderIntervalDays: 30, dueAt: '2027-01-31' } });
  assert.ok([200, 201].includes(rInv.statusCode), rInv.body);
  t = await treasury(authA);
  assert.equal(round2(t.potentialIn), 0, 'un devis converti n\'est plus compté comme devis (jamais de double comptage)');
  assert.equal(round2(t.committedIn), 300, 'facture émise impayée : créance totale TTC');
  const rHalf = await mod.app.inject({ method: 'POST', url: `/invoices/${q1.quoteId}/payments`, headers: authA, payload: { amount: 150, paymentMethod: 'transfer' } });
  assert.ok([200, 201].includes(rHalf.statusCode), rHalf.body);
  t = await treasury(authA);
  assert.equal(round2(t.committedIn), 150, 'facture partiellement réglée : SEUL le reste dû est une entrée future');

  // 3) Paiement du solde : la facture réglée disparaît des entrées futures (réalisé, pas prévu).
  const rRest = await mod.app.inject({ method: 'POST', url: `/invoices/${q1.quoteId}/payments`, headers: authA, payload: { amount: 150, paymentMethod: 'cash' } });
  assert.ok([200, 201].includes(rRest.statusCode), rRest.body);
  t = await treasury(authA);
  assert.equal(round2(t.committedIn), 0, 'facture entièrement réglée : plus aucun encaissement futur');

  // 4) Notes de frais : à rembourser = sortie engagée ; remboursée = flux réalisé (plus comptée).
  const rEr1 = await mod.app.inject({ method: 'POST', url: '/expense-reports', headers: authA, payload: { spentOn: '2026-11-10', label: 'Déplacement client', category: 'deplacement', amountTtc: 50, vatAmount: 8.33, status: 'to_reimburse' } });
  assert.equal(rEr1.statusCode, 201, rEr1.body);
  t = await treasury(authA);
  assert.equal(round2(t.committedOut), 50, 'note de frais à rembourser = sortie engagée');
  assert.equal(round2(t.committedNet), -50, 'solde engagé : créances (0) − sorties (50)');
  const erId = rEr1.json().id;
  const rEr2 = await mod.app.inject({ method: 'PATCH', url: `/expense-reports/${erId}`, headers: authA, payload: { spentOn: '2026-11-10', label: 'Déplacement client', category: 'deplacement', amountTtc: 50, vatAmount: 8.33, status: 'reimbursed' } });
  assert.ok([200, 201].includes(rEr2.statusCode), rEr2.body);
  t = await treasury(authA);
  assert.equal(round2(t.committedOut), 0, 'note de frais remboursée : plus une sortie future');

  // 5) Devis annulé : exclu du potentiel.
  const q2 = await createQuote(mod, authA, A.organizationId, { totalTtc: 500 });
  // Aucune route d'annulation n'existe dans cette version : l'exclusion du devis annulé est
  // vérifiée au niveau du filtre moteur (statut posé directement en base, contexte tenant).
  await mod.db.withTenant(A.organizationId, async () => { await mod.db.query("update quotes set status='canceled' where id=$1", [q2.quoteId]); });
  t = await treasury(authA);
  assert.equal(round2(t.potentialIn), 0, 'devis annulé exclu des prévisions');

  // 6) Isolation A/B : les flux de A ne filtrent jamais chez B et réciproquement.
  const qB = await createQuote(mod, authB, B.organizationId, { totalTtc: 777 });
  const tA = await treasury(authA), tB = await treasury(authB);
  assert.equal(round2(tA.potentialIn), 0, 'A ne voit pas les flux de B');
  assert.equal(round2(tB.potentialIn), 777, 'B voit exactement ses propres flux');
});
