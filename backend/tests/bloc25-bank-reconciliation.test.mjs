// Bloc 25 — Rapprochement bancaire (optionnel, décision D5 : défaut = IMPORT DE FICHIERS).
// Import CSV/OFX avec mapping sauvegardé, dédoublonnage au réimport, suggestions
// montant/date/libellé jamais appliquées automatiquement, rapprochement validé par
// l'utilisateur et annulable, écarts listés (jamais résolus silencieusement), aucun
// agrégateur bancaire, aucun ordre de paiement sortant.
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

test('bloc25: unitaire — OFX, CSV (mapping auto), empreinte stable, suggestions jamais automatiques', async () => {
  const br = await import(new URL('../dist/services/bank-reconciliation.js', import.meta.url).pathname);
  // OFX déterministe (dates 8 chiffres, TRNAMT signé, FITID).
  const ofx = `OFXHEADER:100
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261113<TRNAMT>250.00<FITID>FT001<NAME>VIREMENT CLIENT
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261112<TRNAMT>-45.50<NAME>FOURNISSEUR PIECES`;
  const ofxRows = br.parseOfx(ofx);
  assert.equal(ofxRows.length, 2);
  assert.equal(ofxRows[0].valueDate, '2026-11-13');
  assert.equal(ofxRows[0].amount, 250);
  assert.equal(ofxRows[1].amount, -45.5);
  assert.equal(ofxRows[0].externalRef, 'FT001');
  // Empreinte stable : réimport identique → même empreinte (dédoublonnage).
  assert.equal(br.fingerprint(ofxRows[0]), br.fingerprint({ ...ofxRows[0] }));
  assert.notEqual(br.fingerprint(ofxRows[0]), br.fingerprint({ ...ofxRows[0], amount: 251 }));
  // CSV : détection automatique des colonnes françaises (accents normalisés).
  const csv = `Date;Libellé opération;Montant;Référence
14/11/2026;VIREMENT FAC-2026-0001;250,00;VIR001
13/11/2026;CB FOURNISSEUR;-45,50;CB002`;
  const parsed = br.parseCsvStatement(csv, null);
  assert.ok(parsed.mapping && parsed.mapping.valueDate !== undefined);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].valueDate, '2026-11-26' === '' ? '' : '2026-11-14');
  assert.equal(parsed.rows[0].amount, 250);
  assert.equal(parsed.rows[1].amount, -45.5);
  // Suggestions : montant exact + numéro de facture dans le libellé → forte, JAMAIS appliquée.
  const payments = [{ id: 'p1', amount: 250, paidAt: '2026-11-13', invoiceNumber: 'FAC-2026-0001', clientName: 'Client', reference: '' }];
  const suggestions = br.suggestMatches({ valueDate: '2026-11-14', amount: 250, label: 'VIREMENT FAC-2026-0001', externalRef: '' }, payments);
  assert.equal(suggestions.length, 1);
  assert.ok(suggestions[0].score >= 6);
  assert.deepEqual(suggestions[0].reasons.includes('numéro de facture dans le libellé'), true);
  // Aucun agrégateur / aucun paiement sortant dans le code :
  const src = read('../src/services/bank-reconciliation.ts');
  assert.doesNotMatch(src, /plaid|tink|budgetinsight|aggregator/i);
  const routes = read('../src/routes/bank.ts');
  assert.doesNotMatch(routes, /outgoing|payment order|sepa.*debit|initiate/i);
  assert.match(routes, /jamais résolus silencieusement/);
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
async function seedAccount(mod) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 25')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `bloc25-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 25')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

function csvBody(boundary, csv, filename = 'releve.csv') {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`),
    Buffer.from(csv, 'utf8'),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

test('bloc25: import CSV + réimport sans duplication, suggestions non appliquées, rapprochement validé et annulable, écarts listés, isolation', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };

  // Facture payée de référence.
  const inv = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: { documentType: 'invoice', intervention: 'Réparation', newClient: { name: 'Client Banque' },
      items: [{ label: 'Réparation', quantity: 1, unitCost: 0, unitPrice: 250, activityCategory: 'services_bic' }],
      vatRate: 0, urssafRate: 0, allowLoss: true, finalPriceTtc: 250 },
  });
  assert.equal(inv.statusCode, 201, inv.body);
  const invoiceId = inv.json().id;
  const payment = await mod.app.inject({ method: 'POST', url: `/invoices/${invoiceId}/payments`, headers: auth, payload: { amount: 250, paymentMethod: 'transfer', paidAt: '2026-11-13' } });
  assert.equal(payment.statusCode, 201, payment.body);

  // 1) Import CSV : mapping auto détecté, 2 opérations insérées.
  const csv = `Date;Libellé opération;Montant;Référence
14/11/2026;VIREMENT FAC-2026-0001;250,00;VIR001
13/11/2026;CB FOURNISSEUR PIECES;-45,50;CB002`;
  let boundary = `----b25${crypto.randomUUID().replace(/-/g, '')}`;
  let res = await mod.app.inject({ method: 'POST', url: '/bank/import?config=releve-banque', headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: csvBody(boundary, csv) });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json().inserted, 2);
  assert.ok(res.json().mapping && res.json().mapping.valueDate !== undefined);

  // 2) Réimport IDENTIQUE : zéro duplication (dédoublonnage par empreinte).
  res = await mod.app.inject({ method: 'POST', url: '/bank/import?config=releve-banque', headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: csvBody(boundary, csv) });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().inserted, 0, 'réimport sans duplication');
  assert.equal(res.json().duplicates, 2);

  // 3) Suggestions : proposées, JAMAIS appliquées automatiquement.
  const txs1 = (await mod.app.inject({ method: 'GET', url: '/bank/transactions', headers: auth })).json();
  const virement = txs1.find(t => t.label.includes('FAC-2026-0001'));
  assert.equal(virement.status, 'unmatched', 'aucun rapprochement automatique');
  assert.ok(virement.suggestions.length >= 1, 'suggestion proposée');
  assert.equal(virement.suggestions[0].payment.invoiceNumber, 'FAC-2026-0001');

  // 4) Rapprochement VALIDÉ par l'utilisateur, puis ANNULÉ, puis re-validé.
  const paymentId = payment.body && JSON.parse(payment.body).id ? JSON.parse(payment.body).id : (await mod.db.withTenant(A.organizationId, () => mod.db.query('select id from invoice_payments where quote_id=$1', [invoiceId]))).rows[0].id;
  const match = await mod.app.inject({ method: 'POST', url: `/bank/transactions/${virement.id}/match`, headers: auth, payload: { paymentId } });
  assert.equal(match.statusCode, 200, match.body);
  const doubleMatch = await mod.app.inject({ method: 'POST', url: `/bank/transactions/${virement.id}/match`, headers: auth, payload: { paymentId } });
  assert.equal(doubleMatch.statusCode, 409, 'déjà rapprochée → refus');
  const unmatch = await mod.app.inject({ method: 'POST', url: `/bank/transactions/${virement.id}/unmatch`, headers: auth });
  assert.equal(unmatch.statusCode, 200);
  const rematched = await mod.app.inject({ method: 'POST', url: `/bank/transactions/${virement.id}/match`, headers: auth, payload: { paymentId } });
  assert.equal(rematched.statusCode, 200);

  // 5) Écarts listés : le virement fournisseurs (-45,50) reste sans règlement → « unmatched ».
  const gaps = (await mod.app.inject({ method: 'GET', url: '/bank/gaps', headers: auth })).json();
  assert.equal(gaps.unmatchedTransactions.count, 1);
  assert.equal(Number(gaps.unmatchedTransactions.total), -45.5);
  assert.ok(gaps.note.includes('jamais résolus silencieusement'));

  // 6) Mapping sauvegardé : réimport avec la configuration enregistrée fonctionne.
  res = await mod.app.inject({ method: 'POST', url: '/bank/import?config=releve-banque', headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: csvBody(boundary, csv + '\n15/11/2026;ESPECES CLIENT;80,00;ESP003\n') });
  assert.equal(res.json().inserted, 1, 'mapping sauvegardé réutilisé');

  // 7) Aucun ordre de paiement sortant possible : aucune route ne crée de débit bancaire.
  //    Le seul chemin d'écriture passe par l'import (statuts unmatched/matched/ignored).
  // Isolation A/B : B ne voit ni les transactions ni les écarts de A.
  const B = await seedAccount(mod);
  const txsB = (await mod.app.inject({ method: 'GET', url: '/bank/transactions', headers: { authorization: `Bearer ${B.token}` } })).json();
  assert.equal(txsB.length, 0);
  const gapsB = (await mod.app.inject({ method: 'GET', url: '/bank/gaps', headers: { authorization: `Bearer ${B.token}` } })).json();
  assert.equal(gapsB.unmatchedTransactions.count, 0);
});
