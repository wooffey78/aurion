// Test fonctionnel des six sections d'administration (prompt maître §11 « Administration ») :
// chaque endpoint doit répondre 200 avec la FORME EXPLICITE de son état (liste/tableau attendu,
// jamais d'erreur serveur ni de payload ambigu), puis refléter les données réelles insérées.
// Les inserts passent par le pool d'administration : les tables métier sont RLS-clos pour le
// rôle applicatif (074) — exactement comme la console en production. La base d'intégration est
// partagée entre tests : les assertions portent sur des lignes à marqueurs uniques, jamais sur
// un contenu global supposé vide.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

process.env.NODE_ENV ||= 'test';
process.env.DATABASE_URL ||= 'postgresql://aurion_runtime:test@127.0.0.1:5432/aurion_it082';
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

async function adminContext() {
  const mod = await boot();
  const adminId = uuid(), adminOrg = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Plateforme')`, [adminOrg, `Admin ${adminOrg.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [adminId, `adm-${adminId.slice(0, 8)}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [adminOrg, adminId]);
  await mod.db.query(`insert into platform_admins(user_id) values($1)`, [adminId]);
  const svA = Number((await mod.db.query('select session_version from users where id=$1', [adminId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId: adminId, organizationId: adminOrg, role: 'owner', sv: svA });
  return { mod, adminId, adminOrg, token, auth: { authorization: `Bearer ${token}` } };
}

const get = async (mod, url, headers) => mod.app.inject({ method: 'GET', url, headers });

test('admin : les six sections répondent 200 avec une forme d état explicite (aucune erreur serveur)', { skip }, async () => {
  const { mod, auth } = await adminContext();
  // Statistiques : indicateurs numériques présents, calculés sur les données réelles.
  const stats = await get(mod, '/admin/stats', auth);
  assert.equal(stats.statusCode, 200, '/admin/stats doit répondre 200');
  const statsBody = stats.json();
  assert.equal(typeof statsBody.users, 'number', 'indicateur users numérique');
  assert.equal(typeof statsBody.organizations, 'number', 'indicateur organizations numérique');
  assert.equal(typeof statsBody.trial, 'number', 'indicateur trial numérique');
  // Tickets : liste explicite (Array) — un état sans ticket est représenté par un tableau vide,
  // jamais par une erreur serveur ni un payload manquant.
  const tickets = await get(mod, '/admin/tickets', auth);
  assert.equal(tickets.statusCode, 200);
  assert.equal(Array.isArray(tickets.json()), true, '/admin/tickets renvoie une liste explicite');
  // Invités VIP : invités et invitations listés séparément.
  const guests = await get(mod, '/admin/guests', auth);
  assert.equal(guests.statusCode, 200);
  const guestsBody = guests.json();
  assert.equal(Array.isArray(guestsBody.invites), true, '/admin/guests liste les invitations');
  assert.equal(Array.isArray(guestsBody.guests), true, '/admin/guests liste les invités');
  // Virements en attente.
  const pending = await get(mod, '/admin/billing/pending', auth);
  assert.equal(pending.statusCode, 200);
  assert.equal(Array.isArray(pending.json().requests), true, '/admin/billing/pending liste les demandes');
  // Demandes de rétractation.
  const withdrawals = await get(mod, '/admin/withdrawals', auth);
  assert.equal(withdrawals.statusCode, 200);
  assert.equal(Array.isArray(withdrawals.json().requests), true, '/admin/withdrawals liste les demandes');
  // Demandes de suppression de compte.
  const deletions = await get(mod, '/admin/account-deletions', auth);
  assert.equal(deletions.statusCode, 200);
  assert.equal(Array.isArray(deletions.json().requests), true, '/admin/account-deletions liste les demandes');
});

test('admin : les six sections reflètent les données réelles insérées', { skip }, async () => {
  const { mod, adminId, adminOrg, auth } = await adminContext();
  const stamp = Date.now();
  const orgId = uuid(), userId = uuid(), guestId = uuid();
  const orgName = `Org Console ${stamp}`;
  const ticketEmail = `tk-${stamp}@example.test`;
  const guestEmail = `g-${stamp}@example.test`;
  const withdrawalEmail = `retract-${stamp}@example.test`;
  const deletionEmail = `del-${stamp}@example.test`;
  const paymentRef = `VIR-${stamp}`;
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Réparation téléphones')`, [orgId, orgName]);
  await mod.db.query(`insert into users(id,email,password_hash,full_name) values($1,$2,'x',$3)`, [userId, ticketEmail, 'Utilisateur Ticket']);
  await mod.db.query(`insert into users(id,email,password_hash,full_name) values($1,$2,'x',$3)`, [guestId, guestEmail, 'Invité VIP']);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [orgId, userId]);

  // Ticket utilisateur réel (contrat POST /support/tickets : statut ouvert par défaut).
  await mod.db.adminDb.query(
    `insert into support_tickets(id,organization_id,user_id,number,category,message,status) values($1,$2,$3,$4,'question','Le devis ne s affiche pas','open')`,
    [uuid(), orgId, userId, `T-${stamp}`]
  );
  // Invité VIP.
  await mod.db.query(`insert into vip_guest_accounts(user_id,invited_by) values($1,$2)`, [guestId, adminId]);
  // Virement en attente.
  await mod.db.adminDb.query(
    `insert into billing_payment_requests(organization_id,plan_code,method,reference,amount_ttc_cents,status) values($1,'monthly','bank_transfer',$2,4900,'pending')`,
    [orgId, paymentRef]
  );
  // Demande de rétractation.
  await mod.db.adminDb.query(
    `insert into contract_withdrawal_requests(first_name,last_name,email,contract_reference,contract_date,declaration_text) values($1,$2,$3,$4,now(),$5)`,
    ['Claire', 'Dumas', withdrawalEmail, `CT-${stamp}`, 'Je me rétracte dans le délai légal.']
  );
  // Demande de suppression de compte.
  await mod.db.adminDb.query(
    `insert into account_deletion_requests(user_id,email,status) values($1,$2,'pending')`,
    [guestId, deletionEmail]
  );

  const tickets = await get(mod, '/admin/tickets', auth);
  assert.equal(tickets.statusCode, 200);
  const ticketRows = tickets.json().filter(t => t.user_email === ticketEmail);
  assert.equal(ticketRows.length, 1, 'le ticket inséré apparaît dans la console');
  assert.equal(ticketRows[0].organization_name, orgName, 'jointure organisation correcte');

  const guests = await get(mod, '/admin/guests', auth);
  assert.equal(guests.statusCode, 200);
  const guestRows = guests.json().guests.filter(g => g.user_id === guestId);
  assert.equal(guestRows.length, 1, 'l invité VIP apparaît');
  assert.equal(guestRows[0].email, guestEmail);

  const pending = await get(mod, '/admin/billing/pending', auth);
  assert.equal(pending.statusCode, 200);
  const pendingRows = pending.json().requests.filter(r => r.reference === paymentRef);
  assert.equal(pendingRows.length, 1, 'le virement en attente apparaît');
  assert.equal(pendingRows[0].organization_name, orgName);

  const withdrawals = await get(mod, '/admin/withdrawals', auth);
  assert.equal(withdrawals.statusCode, 200);
  assert.equal(withdrawals.json().requests.filter(r => r.email === withdrawalEmail).length, 1, 'la rétractation apparaît');

  const deletions = await get(mod, '/admin/account-deletions', auth);
  assert.equal(deletions.statusCode, 200);
  assert.equal(deletions.json().requests.filter(r => r.email === deletionEmail).length, 1, 'la demande de suppression apparaît');

  const stats = await get(mod, '/admin/stats', auth);
  assert.equal(stats.statusCode, 200);
  assert.equal(Number(stats.json().users) >= 2, true, 'les utilisateurs créés alimentent l indicateur');
  assert.equal(Number(stats.json().organizations) >= 1, true, 'les organisations créées alimentent l indicateur');
});
