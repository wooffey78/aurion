// Bloc 1 — facture réglée : plus d'échéancier actif ni de relance possible, historique conservé.
// Couvre : paiement unique / partiel / en plusieurs fois, neutralisation next_reminder_at,
// refus déterministe (409) des échéanciers, relances et majorations après paiement complet,
// re-vérification du scheduler juste avant envoi, écritures comptables sans doublon.
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
const schedPath = fileURLToPath(new URL('../dist/services/scheduler.js', import.meta.url));
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
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 1')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `b1-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 1')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}
async function createPaidTestInvoice(mod, auth, opts = {}, orgId) {
  // Client → devis → facture (échéancier de relance planifié si reminderInterval).
  const rClient = await mod.app.inject({ method: 'POST', url: '/clients', headers: auth, payload: { name: 'Client ' + uuid().slice(0, 8), activity: 'principale', email: `c${uuid().slice(0, 8)}@example.test` } });
  assert.equal(rClient.statusCode, 201, rClient.body);
  const clientId = rClient.json().id;
  const rQuote = await mod.app.inject({ method: 'POST', url: '/quotes', headers: auth, payload: { clientId, documentType: 'quote', vatRate: 20, intervention: 'Réparation test', allowLoss: true, totalTtc: 300, items: [{ label: 'Réparation test', quantity: 1, unitCost: 100, unitPrice: 250 }] } });
  assert.equal(rQuote.statusCode, 201, rQuote.body);
  const quoteId = rQuote.json().id;
  const rInv = await mod.app.inject({ method: 'POST', url: `/quotes/${quoteId}/invoice`, headers: auth, payload: { reminderIntervalDays: opts.reminderInterval ?? 30, dueAt: '2027-01-31' } });
  assert.ok([200, 201].includes(rInv.statusCode), rInv.body);
  const body = rInv.json();
  body.id = quoteId; // la conversion transforme la même ligne quote → invoice (identifiant inchangé)
  body.total_ttc = Number((await mod.db.withTenant(orgId, async () => (await mod.db.query('select total_ttc from quotes where id=$1', [quoteId])).rows[0].total_ttc)));
  return body;
}

test('bloc1: paiement complet neutralise les relances futures et refuse les actions réglées', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };

  // 1) Facture avec relance planifiée (next_reminder_at présent).
  const inv = await createPaidTestInvoice(mod, auth, { reminderInterval: 30 }, A.organizationId);
  const invoiceId = inv.id;
  const before = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select payment_status, next_reminder_at from quotes where id=$1', [invoiceId])).rows[0]));
  assert.equal(before.payment_status, 'unpaid');
  assert.ok(before.next_reminder_at, 'précondition : relance planifiée avant paiement');

  // 2) Paiement complet en une fois → paid + next_reminder_at NULL (même transaction).
  const rPay = await mod.app.inject({ method: 'POST', url: `/invoices/${invoiceId}/payments`, headers: auth, payload: { amount: inv.total_ttc, paymentMethod: 'transfer' } });
  assert.equal(rPay.statusCode, 201, rPay.body);
  const after = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select payment_status, status, next_reminder_at, paid_at from quotes where id=$1', [invoiceId])).rows[0]));
  assert.equal(after.payment_status, 'paid');
  assert.equal(after.status, 'paid');
  assert.equal(after.next_reminder_at, null, 'next_reminder_at neutralisé au paiement complet');
  assert.ok(after.paid_at, 'date de paiement enregistrée');

  // 3) Refus déterministe des actions réglées : relance, échéancier, majoration.
  const rRem = await mod.app.inject({ method: 'POST', url: `/invoices/${invoiceId}/reminders`, headers: auth, payload: {} });
  assert.equal(rRem.statusCode, 409); assert.equal(rRem.json().error, 'ALREADY_PAID');
  const rInst = await mod.app.inject({ method: 'POST', url: `/invoices/${invoiceId}/installments`, headers: auth, payload: { count: 2, startDate: '2027-01-10', intervalDays: 30 } });
  assert.equal(rInst.statusCode, 409); assert.equal(rInst.json().error, 'ALREADY_PAID');
  const rPen = await mod.app.inject({ method: 'PATCH', url: `/invoices/${invoiceId}/penalty`, headers: auth, payload: { mode: 'percent', value: 10 } });
  assert.equal(rPen.statusCode, 409); assert.equal(rPen.json().error, 'ALREADY_PAID');

  // 4) Paiement en PLUSIEURS fois : deuxième facture, deux paiements, paid au dernier.
  const inv2 = await createPaidTestInvoice(mod, auth, { reminderInterval: 30 }, A.organizationId);
  const half = Math.round(Number(inv2.total_ttc) / 2 * 100) / 100;
  const rP1 = await mod.app.inject({ method: 'POST', url: `/invoices/${inv2.id}/payments`, headers: auth, payload: { amount: half, paymentMethod: 'cash' } });
  assert.equal(rP1.statusCode, 201, rP1.body);
  const mid = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select payment_status, next_reminder_at from quotes where id=$1', [inv2.id])).rows[0]));
  assert.equal(mid.payment_status, 'partially_paid', 'un paiement partiel n\'est pas un paiement complet');
  assert.ok(mid.next_reminder_at, 'les échéances de relance restent actives pour une facture partiellement payée');
  const remaining = Math.round((Number(inv2.total_ttc) - half) * 100) / 100;
  const rP2 = await mod.app.inject({ method: 'POST', url: `/invoices/${inv2.id}/payments`, headers: auth, payload: { amount: remaining, paymentMethod: 'card' } });
  assert.equal(rP2.statusCode, 201, rP2.body);
  const end = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select payment_status, next_reminder_at from quotes where id=$1', [inv2.id])).rows[0]));
  assert.equal(end.payment_status, 'paid');
  assert.equal(end.next_reminder_at, null);

  // 5) Sur-paiement refusé (règles existantes préservées).
  const rOver = await mod.app.inject({ method: 'POST', url: `/invoices/${inv2.id}/payments`, headers: auth, payload: { amount: 10, paymentMethod: 'cash' } });
  assert.equal(rOver.statusCode, 409);

  // 6) Historique conservé : paiements et écritures comptables sans doublon.
  const payments = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select count(*)::int as n from invoice_payments where quote_id=$1', [inv2.id])).rows[0].n));
  assert.equal(payments, 2, 'les deux paiements restent en base');
  const entries = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query("select count(*)::int as n from accounting_entries where source_id in (select id from invoice_payments where quote_id=$1) and entry_type='payment'", [inv2.id])).rows[0].n));
  assert.equal(entries, 2, 'une écriture comptable par paiement, jamais de doublon');

  // 7) Facture partiellement payée : les fonctions utiles restent disponibles.
  const inv3 = await createPaidTestInvoice(mod, auth, { reminderInterval: 30 }, A.organizationId);
  const rHalf = await mod.app.inject({ method: 'POST', url: `/invoices/${inv3.id}/payments`, headers: auth, payload: { amount: Math.round(Number(inv3.total_ttc) / 2 * 100) / 100, paymentMethod: 'cheque' } });
  assert.equal(rHalf.statusCode, 201);
  const rInstOk = await mod.app.inject({ method: 'POST', url: `/invoices/${inv3.id}/installments`, headers: auth, payload: { count: 2, startDate: '2027-02-01', intervalDays: 15 } });
  assert.ok([200, 201].includes(rInstOk.statusCode), rInstOk.body);

  // 8) Scheduler : une facture RÉGLÉE n'est jamais sélectionnée pour relance (filtre
  //    payment_status<>'paid' + re-vérification du statut juste avant envoi). La course
  //    complète « paiement pendant l'exécution du tick » n'est pas simulable de façon
  //    déterministe ici : la re-vérification est couverte STRUCTURELLEMENT (elle s'exécute
  //    pour chaque job, avant tout envoi) — cas observables vérifiés ci-dessous.
  const inv4 = await createPaidTestInvoice(mod, auth, { reminderInterval: 30 }, A.organizationId);
  await mod.db.withTenant(A.organizationId, async () => { await mod.db.query("update quotes set next_reminder_at=now()-interval '1 minute', sent_at=now() where id=$1", [inv4.id]); });
  // a) La facture est ensuite PAYÉE avant l'exécution : sélection écartée, aucune relance.
  const rPay4 = await mod.app.inject({ method: 'POST', url: `/invoices/${inv4.id}/payments`, headers: auth, payload: { amount: inv4.total_ttc, paymentMethod: 'transfer' } });
  assert.ok([200, 201].includes(rPay4.statusCode), rPay4.body);
  const worker = (await import(schedPath)).startReminderWorker({ warn: () => {}, info: () => {}, error: () => {} });
  try { await worker.tick(); } finally { clearInterval(worker.stop); }
  const rem4 = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select count(*)::int as n from invoice_reminders where quote_id=$1', [inv4.id])).rows[0].n));
  assert.equal(rem4, 0, 'aucune relance pour une facture réglée avant l\'exécution planifiée');
  // b) Une facture impayée avec relance planifiée et messagerie non configurée échoue sans
  //    créer de ligne de relance ni planifier la suivante (échec gracieux, reprise ultérieure).
  const inv5 = await createPaidTestInvoice(mod, auth, { reminderInterval: 30 }, A.organizationId);
  await mod.db.withTenant(A.organizationId, async () => { await mod.db.query("update quotes set next_reminder_at=now()-interval '1 minute', sent_at=now() where id=$1", [inv5.id]); });
  const worker2 = (await import(schedPath)).startReminderWorker({ warn: () => {}, info: () => {}, error: () => {} });
  try { await worker2.tick(); } finally { clearInterval(worker2.stop); }
  const rem5 = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select count(*)::int as n from invoice_reminders where quote_id=$1', [inv5.id])).rows[0].n));
  assert.equal(rem5, 0, 'aucune relance enregistrée quand l\'envoi échoue (messagerie non configurée)');
});
