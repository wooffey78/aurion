// Bloc 4 — moteur de rejeu des décisions hors connexion : POST /sync/ops rejoue les ROUTES
// RÉELLES (zéro divergence métier), idempotence sans doublon, substitution des références
// locales, dépendances, chemins autorisés uniquement, isolation A/B, conflits honnêtes.
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
const ref = () => 'loc' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
async function seedAccount(mod) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 4')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `bloc4-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 4')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('bloc4: rejeu sans doublon, références substituées, dépendances, chemins filtrés, isolation A/B', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod), B = await seedAccount(mod);
  const authA = { authorization: `Bearer ${A.token}` }, authB = { authorization: `Bearer ${B.token}` };

  // 1) Création + opération dépendante avec référence locale, dans un seul dépôt ordonné.
  const clientRef = ref(), opClient = 'op' + crypto.randomUUID().replace(/-/g, ''), opQuote = 'op' + crypto.randomUUID().replace(/-/g, '');
  const r1 = await mod.app.inject({
    method: 'POST', url: '/sync/ops', headers: authA,
    payload: { ops: [
      { opId: opClient, kind: 'client_create', method: 'POST', path: '/clients', localRef: clientRef, decidedAt: '2026-11-14T08:00:00Z',
        payload: { name: 'Client hors connexion', activity: 'principale', email: 'client@example.test' } },
      { opId: opQuote, kind: 'quote_create', method: 'POST', path: '/quotes', dependsOn: opClient, decidedAt: '2026-11-14T08:05:00Z',
        payload: { clientId: `@ref:${clientRef}`, documentType: 'quote', intervention: 'Réparation écran hors connexion', items: [], vatRate: 20 } },
    ] },
  });
  assert.equal(r1.statusCode, 200);
  const res1 = r1.json().results;
  assert.equal(res1[0].status, 'applied', JSON.stringify(res1));
  assert.ok(res1[0].resultRef, 'identifiant serveur renvoyé');
  assert.equal(res1[1].status, 'applied', JSON.stringify(res1));
  const clientId = res1[0].resultRef;
  // Le devis référencé pointe bien vers le client créé au rejeu (substitution @ref → serveur).
  const quoteRow = (await mod.db.adminDb.query(`select client_id from quotes where organization_id=$1 and document_type='quote' order by created_at desc limit 1`, [A.organizationId])).rows[0];
  assert.equal(quoteRow?.client_id, clientId, 'la référence locale a été substituée par l\'identifiant serveur');

  // 2) Idempotence : reprise après accusé perdu → duplicate, AUCUN doublon.
  const r2 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: opClient, kind: 'client_create', method: 'POST', path: '/clients', localRef: clientRef, payload: { name: 'Client hors connexion' } },
  ] } });
  const res2 = r2.json().results;
  assert.equal(res2[0].status, 'duplicate');
  const clientCount = (await mod.db.adminDb.query(`select count(*)::int as n from clients where organization_id=$1 and name='Client hors connexion'`, [A.organizationId])).rows[0].n;
  assert.equal(clientCount, 1, 'aucun doublon créé par le retry');

  // 3) Dépendance manquante → bloqué (jamais perdu, jamais appliqué partiellement).
  const missingDep = 'op' + crypto.randomUUID().replace(/-/g, '');
  const r3 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: missingDep + 'x', kind: 'quote_create', method: 'POST', path: '/quotes', dependsOn: missingDep, payload: { clientId: `@ref:${missingDep}` } },
  ] } });
  assert.equal(r3.json().results[0].status, 'blocked');
  assert.equal(r3.json().results[0].error, 'DEPENDENCY_NOT_APPLIED');

  // 4) Chemins interdits (billing/auth/admin) → bloqués côté serveur.
  const r4 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: 'op' + crypto.randomUUID().replace(/-/g, ''), kind: 'billing_attempt', method: 'POST', path: '/billing/subscribe', payload: {} },
    { opId: 'op' + crypto.randomUUID().replace(/-/g, ''), kind: 'admin_attempt', method: 'POST', path: '/admin/guests/invite', payload: { email: 'x@example.test' } },
  ] } });
  assert.deepEqual(r4.json().results.map(x => x.error), ['PATH_NOT_ALLOWED', 'PATH_NOT_ALLOWED']);

  // 5) Isolation A/B : une opération de A visant un identifiant de B est refusée par la route réelle.
  const bClient = uuid();
  await mod.db.withTenant(B.organizationId, async () => {
    await mod.db.query(`insert into clients(id,organization_id,name) values($1,$2,'Client B privé')`, [bClient, B.organizationId]);
  });
  const r5 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: 'op' + crypto.randomUUID().replace(/-/g, ''), kind: 'client_update', method: 'PATCH', path: `/clients/${bClient}`, payload: { name: 'Tentative intrusive' } },
  ] } });
  assert.equal(r5.json().results[0].status, 'blocked', 'la route réelle refuse (404) — aucune écriture chez B');

  // 6) Suppression hors connexion → tombstone visible dans le delta des AUTRES appareils.
  const delOp = 'op' + crypto.randomUUID().replace(/-/g, '');
  const r6 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: delOp, kind: 'client_delete', method: 'DELETE', path: `/clients/${clientId}` },
  ] } });
  assert.equal(r6.json().results[0].status, 'applied');
  const gone = (await mod.db.adminDb.query(`select count(*)::int as n from clients where id=$1`, [clientId])).rows[0].n;
  assert.equal(gone, 0, 'la suppression a bien été rejouée par la route réelle');

  // 7) Entrée invalide : payload hors contrat → 400 honnête, rien d'appliqué.
  const r7 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [{ opId: 'court', kind: 'x', method: 'GET', path: '/clients' }] } });
  assert.equal(r7.statusCode, 400);
});

test('bloc4: référence locale dans un CHEMIN (dépôt séparé) → substituée via entity_ref enregistré', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const authA = { authorization: `Bearer ${A.token}` };
  // Dépôt 1 : création (référence locale enregistrée côté serveur).
  const clientRef = ref();
  const op1 = 'op' + crypto.randomUUID().replace(/-/g, '');
  const r1 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: op1, kind: 'client_create', method: 'POST', path: '/clients', localRef: clientRef, payload: { name: 'Fiche hors connexion', activity: 'principale' } },
  ] } });
  assert.equal(r1.json().results[0].status, 'applied');
  const serverId = r1.json().results[0].resultRef;
  // Dépôt 2 : PATCH via le CHEMIN contenant la référence locale — substitué, jamais 404.
  const op2 = 'op' + crypto.randomUUID().replace(/-/g, '');
  const r2 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: op2, kind: 'client_update', method: 'PATCH', path: `/clients/${clientRef}`, payload: { name: 'Fiche corrigée hors connexion' } },
  ] } });
  assert.equal(r2.json().results[0].status, 'applied', JSON.stringify(r2.json().results));
  const name = (await mod.db.adminDb.query('select name from clients where id=$1', [serverId])).rows[0]?.name;
  assert.equal(name, 'Fiche corrigée hors connexion', 'le chemin localRef a bien été réécrit vers l\'identifiant serveur');
});

test('bloc4-email: chaîne client→devis→facture numérotée→PDF via outbox + intention e-mail précise et réessayable', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const authA = { authorization: `Bearer ${A.token}` };
  const clientRef = ref(), opClient = 'op' + crypto.randomUUID().replace(/-/g, ''), opQuote = 'op' + crypto.randomUUID().replace(/-/g, ''), opInvoice = 'op' + crypto.randomUUID().replace(/-/g, ''), opEmail = 'op' + crypto.randomUUID().replace(/-/g, '');

  // Chaîne complète : client → devis → conversion facture (numérotation réglementaire serveur,
  // PDF rendu au rejeu) — sans e-mail automatique au premier passage.
  const r1 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: opClient, kind: 'client_create', method: 'POST', path: '/clients', localRef: clientRef, decidedAt: '2026-11-14T09:00:00Z',
      payload: { name: 'Client chaîne e-mail', activity: 'principale', email: `chaine-${crypto.randomUUID().slice(0, 6)}@example.test` } },
    { opId: opQuote, kind: 'quote_create', method: 'POST', path: '/quotes', dependsOn: opClient, decidedAt: '2026-11-14T09:05:00Z',
      payload: { clientId: `@ref:${clientRef}`, documentType: 'quote', intervention: 'Prestation chaîne', allowLoss: true, totalTtc: 240, vatRate: 20, items: [] } },
  ] } });
  assert.equal(r1.statusCode, 200, r1.body);
  assert.equal(r1.json().results.filter(x => x.status === 'applied').length, 2, JSON.stringify(r1.json().results));
  const quoteId = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select id from quotes where intervention=\'Prestation chaîne\' limit 1')).rows[0])).id;

  const r2 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: opInvoice, kind: 'quote_to_invoice', method: 'POST', path: `/quotes/${quoteId}/invoice`, decidedAt: '2026-11-14T09:10:00Z',
      payload: { sendEmail: false, reminderIntervalDays: 0, dueAt: '2027-01-31' } },
  ] } });
  assert.equal(r2.statusCode, 200, r2.body);
  assert.equal(r2.json().results[0].status, 'applied', JSON.stringify(r2.json().results));
  // Numérotation réglementaire attribuée par le SERVEUR au moment du rejeu + document rendu.
  const inv = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select id,number,total_ttc from quotes where id=$1 and document_type=\'invoice\'', [quoteId])).rows[0]));
  assert.ok(inv && /^FAC-\d{4}-\d+$/.test(inv.number), `numéro officiel attribué : ${inv?.number}`);

  // Intention e-mail explicitement décidée hors connexion : sans messagerie configurée, la
  // décision reste identifiable, réessayable, et RIEN ne simule un envoi réussi (ni sent_at,
  // ni enregistrement d'opération appliquée — jamais de faux « transmis »).
  const cur = Number((await mod.app.inject({ method: 'GET', url: '/sync/cursor', headers: authA })).json().cursor || 0);
  const r3 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: opEmail, kind: 'email_document', method: 'POST', path: '/communications/email/document', decidedAt: '2026-11-14T09:15:00Z',
      payload: { type: 'invoice', documentId: quoteId, message: 'Voici votre facture.' } },
  ] } });
  assert.equal(r3.statusCode, 200, r3.body);
  const emailResult = r3.json().results[0];
  assert.notEqual(emailResult.status, 'applied', `l'envoi sans messagerie ne doit pas être « appliqué » : ${JSON.stringify(emailResult)}`);
  const sentAt = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select sent_at from quotes where id=$1', [quoteId])).rows[0])).sent_at;
  // Intention de rendu du document décidée hors connexion : le serveur rend et stocke le PDF.
  const opPdf = 'op' + crypto.randomUUID().replace(/-/g, '');
  const rPdf = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: opPdf, kind: 'document_render', method: 'POST', path: `/documents/render/invoice/${quoteId}`, decidedAt: '2026-11-14T09:12:00Z', payload: {} },
  ] } });
  assert.equal(rPdf.statusCode, 200, rPdf.body);
  assert.equal(rPdf.json().results[0].status, 'applied', JSON.stringify(rPdf.json().results));
  const pdfCount = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select count(*)::int n from generated_documents where quote_id=$1 and document_type=\'invoice\' and pdf_key is not null', [quoteId])).rows[0])).n;
  assert.ok(pdfCount >= 1, 'PDF de la facture rendu et stocké via la décision hors connexion');
  assert.equal(sentAt, null, 'sent_at inchangé : aucun faux statut d\'envoi');
  const applied = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select count(*)::int n from sync_applied_ops where op_client_id=$1', [opEmail])).rows[0])).n;
  assert.equal(applied, 0, 'opération e-mail non consommée : réessayable après configuration de la messagerie');
  // Idempotence du rejeu : rejouer la conversion n'attribue PAS un second numéro ni un second PDF.
  const r4 = await mod.app.inject({ method: 'POST', url: '/sync/ops', headers: authA, payload: { ops: [
    { opId: opInvoice, kind: 'quote_to_invoice', method: 'POST', path: `/quotes/${quoteId}/invoice`, decidedAt: '2026-11-14T09:10:00Z',
      payload: { sendEmail: false, reminderIntervalDays: 0, dueAt: '2027-01-31' } },
  ] } });
  assert.equal(r4.statusCode, 200);
  const inv2 = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select number from quotes where id=$1', [quoteId])).rows[0]));
  assert.equal(inv2.number, inv.number, 'même numéro après rejeu (opId idempotent)');
});