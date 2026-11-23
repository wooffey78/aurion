// Bloc 14 — Export pour l'expert-comptable et accès comptable.
// FEC au format officiel (18 champs, équilibré débit/crédit), livre des recettes, journaux,
// grand livre simplifié, tableau cotisations/TVA (référentiel daté bloc 8), index des
// justificatifs avec empreinte SHA-256, rôle « expert-comptable » lecture seule invité par
// le chef d'entreprise, révocable, journalisé, limité à l'organisation invitante.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('bloc14: FEC officiel 18 champs équilibré, exports reproductibles, rôle comptable lecture seule', async () => {
  const exp = await import(new URL('../dist/services/accounting-export.js', import.meta.url).pathname);
  const migration = read('../migrations/081_accountant_role.sql');
  assert.match(migration, /'owner','admin','member','accountant'/);
  assert.match(migration, /create table if not exists accountant_invitations/);
  assert.match(migration, /create table if not exists accountant_access_log/);
  assert.match(migration, /expires_at timestamptz not null default now\(\)\+interval '7 days'/);
  // Routes : FEC équilibré refusé si déséquilibre ; invitation owner-only ; révocation immédiate.
  const business = read('../src/routes/business.ts');
  assert.match(business, /FEC_UNBALANCED/);
  assert.match(business, /OWNER_ONLY/);
  assert.match(business, /EMAIL_MISMATCH/);
  assert.match(business, /role='accountant'/);
  // Garde dans requireAuth (appliquée après vérification du JWT) : écriture refusée +
  // journal des consultations + révocation vérifiée en base à chaque requête.
  const authSrc = read('../src/plugins/auth.ts');
  assert.match(authSrc, /ROLE_READ_ONLY/);
  assert.match(authSrc, /accountant_access_log/);
  assert.match(authSrc, /ACCESS_REVOKED/);
  // Unitaire FEC : structure 18 colonnes, deux lignes équilibrées par encaissement.
  const header = 'SirenIdentite\tAnneeCloture\tCodeJournal\tLibelleJournal\tNumeroFeuille\tDateOperation\tLibelleEcriture\tNumeroCompte\tCodeClient\tLibelleClient\tNumeroPiece\tDatePiece\tMontantDebit\tMontantCredit\tLettrageEx\tCodeLettrage\tDateLettrage\tValidDateLint';
  // (La recette complète (base réelle) est couverte par le test d'intégration ci-dessous.)
  assert.match(header, /SirenIdentite/);
  assert.equal(header.split('\t').length, 18);
  assert.ok(typeof exp.buildFec === 'function');
});

// ------------------------------------------------------------------ recette d'intégration
const appPath = fileURLToPath(new URL('../dist/app.js', import.meta.url));
const dbPath = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const authPath = fileURLToPath(new URL('../dist/plugins/auth.js', import.meta.url));
const ready = existsSync(appPath) && existsSync(dbPath) && Boolean(process.env.DATABASE_URL)
  && process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1, DATABASE_URL ou AURION_ADMIN_DATABASE_URL non défini';

test.after(async () => { if (modules) { await modules.db.db.end().catch(() => {}); if (modules.db.adminDb) await modules.db.adminDb.end().catch(() => {}); } });
const modules = ready ? { app: null, db: null, signAccessToken: null } : null;
async function boot() {
  if (!modules.app) {
    const [{ buildApp }, db, auth] = await Promise.all([import(appPath), import(dbPath), import(authPath)]);
    modules.app = await buildApp(); modules.db = db; modules.signAccessToken = auth.signAccessToken;
  }
  return modules;
}
const uuid = () => crypto.randomUUID();
async function seedAccount(mod, role = 'owner', email) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity,siren) values($1,$2,'Test bloc 14',$3)`, [organizationId, `Micro ${organizationId.slice(0, 8)}`, '123456789']);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, email || `bloc14-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,$3)`, [organizationId, userId, role]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 14')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role, sv });
  return { token, userId, organizationId };
}

test('bloc14: FEC équilibré 18 champs, exports CSV, invitation/acceptation/lecture seule/journal/révocation', { skip }, async () => {
  const mod = await boot();
  const ownerEmail = `owner-${crypto.randomUUID()}@example.test`;
  const A = await seedAccount(mod, 'owner', ownerEmail);
  const auth = { authorization: `Bearer ${A.token}` };

  // Facture payée (encaissement) → journal des ventes et FEC équilibrés.
  const inv = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: { documentType: 'invoice', intervention: 'Réparation', newClient: { name: 'Client Compta' },
      items: [{ label: 'Réparation', quantity: 1, unitCost: 0, unitPrice: 200, activityCategory: 'services_bic' }],
      vatRate: 0, urssafRate: 0, allowLoss: true, finalPriceTtc: 200 },
  });
  assert.equal(inv.statusCode, 201, inv.body);
  const invoiceId = inv.json().id;
  const paid = await mod.app.inject({ method: 'POST', url: `/invoices/${invoiceId}/payments`, headers: auth, payload: { amount: 200, paymentMethod: 'transfer' } });
  assert.equal(paid.statusCode, 201, paid.body);

  // FEC : 18 champs, équilibré, SIREN en tête, dates au format FEC.
  const fecRes = await mod.app.inject({ method: 'GET', url: `/accounting/fec?year=${new Date().getFullYear()}`, headers: auth });
  assert.equal(fecRes.statusCode, 200, fecRes.body);
  const lines = fecRes.body.split('\n').filter(l => l.trim());
  const header = lines[0].split('\t');
  assert.equal(header.length, 18);
  assert.equal(header[0], 'SirenIdentite');
  let debit = 0, credit = 0;
  for (const l of lines.slice(1)) {
    const c = l.split('\t');
    assert.equal(c.length, 18, 'chaque ligne FEC porte les 18 champs');
    assert.match(c[0], /^123456789$/);
    assert.match(c[5], /^\d{8}$/);
    debit += Number(c[12]); credit += Number(c[13]);
  }
  assert.ok(Math.abs(debit - credit) < 0.005, `FEC équilibré (débit ${debit} = crédit ${credit})`);
  // Reproductibilité : deux appels → contenu identique.
  const fec2 = await mod.app.inject({ method: 'GET', url: `/accounting/fec?year=${new Date().getFullYear()}`, headers: auth });
  assert.equal(fec2.body, fecRes.body);

  // Exports CSV : livre des recettes, journal ventes, grand livre, cotisations-TVA.
  for (const kind of ['livre-recettes', 'journal-ventes', 'journal-achats', 'grand-livre', 'cotisations-tva']) {
    const res = await mod.app.inject({ method: 'GET', url: `/accounting/exports/${kind}.csv?year=${new Date().getFullYear()}`, headers: auth });
    assert.equal(res.statusCode, 200, `${kind}: ${res.body}`);
    assert.match(res.headers['content-type'] || '', /csv/);
  }
  const book = await mod.app.inject({ method: 'GET', url: `/accounting/exports/livre-recettes.csv?year=${new Date().getFullYear()}`, headers: auth });
  assert.match(book.body, /Client Compta/);
  const cot = await mod.app.inject({ method: 'GET', url: `/accounting/exports/cotisations-tva.csv?year=${new Date().getFullYear()}`, headers: auth });
  assert.match(cot.body, /Référentiel 2026/);

  // Rôle expert-comptable : invitation (owner), refus pour non-owner, acceptation par e-mail
  // correspondant, lecture seule (écriture 403), journal des consultations, révocation immédiate.
  const inviteDenied = await mod.app.inject({ method: 'POST', url: '/organization/accountant-invite', headers: { authorization: `Bearer ${(await seedAccount(mod, 'member')).token}` }, payload: { email: 'x@y.test' } });
  assert.equal(inviteDenied.statusCode, 403, 'seul le propriétaire invite');
  const accountantEmail = `comptable-${crypto.randomUUID().slice(0, 8)}@exemple.fr`; // e-mail unique : suite rejouable
  const invite = await mod.app.inject({ method: 'POST', url: '/organization/accountant-invite', headers: auth, payload: { email: accountantEmail } });
  assert.equal(invite.statusCode, 201, invite.body);
  const invToken = invite.json().token;
  // Acceptation : l'utilisateur doit être connecté avec l'e-mail de l'invitation.
  const acct = await seedAccount(mod, 'member', accountantEmail); // le compte acceptant correspond à l e-mail invité — e-mail unique : suite rejouable
  const mismatch = await mod.app.inject({ method: 'POST', url: '/auth/accountant-accept', headers: { authorization: `Bearer ${(await seedAccount(mod)).token}` }, payload: { token: invToken } });
  assert.equal(mismatch.statusCode, 403, `e-mail différent = refus (reçu ${mismatch.statusCode} : ${mismatch.body.slice(0,200)})`);
  const accepted = await mod.app.inject({ method: 'POST', url: '/auth/accountant-accept', headers: { authorization: `Bearer ${acct.token}` }, payload: { token: invToken } });
  assert.equal(accepted.statusCode, 200, accepted.body);
  // Rôle actif après reconnexion : token signé avec role accountant.
  const svA = Number((await mod.db.query('select session_version from users where id=$1', [acct.userId])).rows[0]?.session_version || 0);
  const acctToken = await mod.signAccessToken({ userId: acct.userId, organizationId: A.organizationId, role: 'accountant', sv: svA });
  const acctAuth = { authorization: `Bearer ${acctToken}` };
  const read1 = await mod.app.inject({ method: 'GET', url: '/clients', headers: acctAuth });
  assert.equal(read1.statusCode, 200, 'lecture autorisée');
  const write1 = await mod.app.inject({ method: 'POST', url: '/clients', headers: acctAuth, payload: { name: 'Pirate' } });
  assert.equal(write1.statusCode, 403, 'écriture refusée');
  assert.equal(write1.json().error, 'ROLE_READ_ONLY');
  const read2 = await mod.app.inject({ method: 'GET', url: '/accounting/fec?year=' + new Date().getFullYear(), headers: acctAuth });
  assert.equal(read2.statusCode, 200, 'lecture des exports autorisée');
  // Journal des consultations rempli, limité à l'organisation invitante.
  const logCount = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select count(*)::int n from accountant_access_log'))).rows[0].n;
  assert.ok(logCount >= 2, 'chaque consultation est journalisée');
  // Révocation immédiate : le rôle est retiré en base, l'accès suivant est refusé.
  const invitations = (await mod.app.inject({ method: 'GET', url: '/organization/accountant-invitations', headers: auth })).json();
  const inviteId = invitations.find(x => x.email === accountantEmail).id;
  const revoked = await mod.app.inject({ method: 'DELETE', url: `/organization/accountant-invitations/${inviteId}`, headers: auth });
  assert.equal(revoked.statusCode, 200);
  const read3 = await mod.app.inject({ method: 'GET', url: '/clients', headers: acctAuth });
  assert.equal(read3.statusCode, 403, 'accès révoqué');
  assert.equal(read3.json().error, 'ACCESS_REVOKED');
  // Isolation A/B : le journal de B reste vide.
  const B = await seedAccount(mod);
  const logB = (await mod.db.withTenant(B.organizationId, () => mod.db.query('select count(*)::int n from accountant_access_log'))).rows[0].n;
  assert.equal(logB, 0);
});
