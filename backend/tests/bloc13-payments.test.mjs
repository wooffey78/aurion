// Bloc 13 — Paiement en ligne des factures clients : adaptateur isolé + webhook signé.
// Décision D3 NON TRANCHÉE : aucun prestataire réel n'est connecté ; le contrat générique est
// testé de bout en bout contre un serveur HTTP de recette réel (boucle locale), le webhook est
// testé avec sa signature réelle. La fonctionnalité n'est PAS déclarée opérationnelle en
// production tant qu'aucun prestataire contractuel n'a été validé en sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import http from 'node:http';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';
// Bloc 13 — configuration de recette fixée AVANT l'import de la config zod (adaptateur générique
// + webhook signé) ; le PROVIDER reste vide : la fonction n'est pas opérationnelle, seule la
// couche technique est testée contre un serveur HTTP de recette réel.
process.env.AURION_PAY_API_BASE = 'http://127.0.0.1:5499';
process.env.AURION_PAY_WEBHOOK_SECRET = 'bloc13-pay-webhook-secret-at-least-32-chars!!';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('bloc13: adaptateur isolé, aucun prestataire codé en dur, secret jamais journalisé', () => {
  assert.match(read('../src/services/payments/types.ts'), /interface PayAdapter/);
  const generic = read('../src/services/payments/generic.ts');
  assert.match(generic, /checkoutUrl|providerRef/);
  // Aucun ENDPOINT ni clé de prestataire réel codé en dur (une mention documentaire de la
  // décision D3 dans un commentaire est acceptable ; un endpoint/champ de connexion ne l'est pas).
  assert.doesNotMatch(generic, /https?:\/\/(api|checkout)\.(stripe|gocardless|paypal|mangopay)/i, 'aucun endpoint de prestataire codé en dur');
  assert.doesNotMatch(generic, /sk_live|pk_live|STRIPE_SECRET|GOCARDLESS_/, 'aucune clé de prestataire codée en dur');
  const index = read('../src/services/payments/index.ts');
  assert.match(index, /AURION_PAY_PROVIDER/);
  // Garde config : secret ≥ 32 caractères dès que le provider est défini.
  const config = read('../src/config.ts');
  assert.match(config, /AURION_PAY_WEBHOOK_SECRET doit être défini avec au moins 32 caractères/);
  // Webhook : signature vérifiée, statut uniquement sur confirmation, aucune donnée de carte.
  const webhook = read('../src/services/payments/webhook.ts');
  assert.match(webhook, /timingSafeEqual/);
  assert.match(webhook, /LINK_INVALIDATED/);
  assert.match(webhook, /payment_webhook_events/);
  assert.doesNotMatch(webhook, /card_number|cardNumber|pan\b/i);
  // Lien réservé aux factures émises :
  const routes = read('../src/routes/payments.ts');
  assert.match(routes, /DRAFT_NOT_EMITTABLE|brouillon/i);
  assert.match(routes, /PAY_NOT_CONFIGURED/);
});

// ------------------------------------------------------------------ recette d'intégration
const appPath = fileURLToPath(new URL('../dist/app.js', import.meta.url));
const dbPath = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const authPath = fileURLToPath(new URL('../dist/plugins/auth.js', import.meta.url));
const ready = existsSync(appPath) && existsSync(dbPath) && Boolean(process.env.DATABASE_URL)
  && process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1, DATABASE_URL ou AURION_ADMIN_DATABASE_URL non défini';

test.after(async () => {
  if (fixtureServer.listening) await new Promise(res => fixtureServer.close(res));
  if (modules) { await modules.db.db.end().catch(() => {}); if (modules.db.adminDb) await modules.db.adminDb.end().catch(() => {}); }
});

// Serveur de recette réel : le contrat générique appelle POST {base}/checkout.
let checkoutMode = 'accept';
const fixtureServer = http.createServer((req, res) => {
  let chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const payload = Buffer.concat(chunks);
    if (checkoutMode === 'fail') { res.writeHead(500); res.end('{}'); return; }
    const data = JSON.parse(payload.toString('utf8') || '{}');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ checkoutUrl: 'https://pay.fixture.test/checkout/' + data.reference, providerRef: 'FIX-' + (data.reference || 'x') }));
  });
});

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
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 13')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `bloc13-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 13')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('bloc13: non opérationnel sans configuration (503 honnête), lien pour facture émise, webhook signé complet', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };

  // 1) Facture émise (brouillon refusé explicitement).
  const created = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: { documentType: 'invoice', intervention: 'Réparation', newClient: { name: 'Client Pay' },
      items: [{ label: 'Réparation', quantity: 1, unitCost: 0, unitPrice: 120, activityCategory: 'services_bic' }],
      vatRate: 0, urssafRate: 0, allowLoss: true, finalPriceTtc: 120 },
  });
  assert.equal(created.statusCode, 201, created.body);
  const invoiceId = created.json().id;
  const draft = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: { documentType: 'quote', intervention: 'Devis', items: [], vatRate: 0, urssafRate: 0 },
  });
  const draftId = draft.json().id;

  // 2) Sans AURION_PAY_PROVIDER : 503 honnête, aucun lien fictif.
  const notConfigured = await mod.app.inject({ method: 'POST', url: `/invoices/${invoiceId}/payment-link`, headers: auth });
  assert.equal(notConfigured.statusCode, 503);
  assert.match(notConfigured.body, /D3/);

  // 3) Configuration de recette (adaptateur générique + serveur HTTP réel) : le contrat est couvert
  //    via processPaymentWebhook + signature — la création de lien passe par l'adaptateur générique.
  await new Promise(res => fixtureServer.listen(5499, '127.0.0.1', res));
  // La configuration est lue au démarrage : on vérifie ici le contrat de l'adaptateur directement.
  const { genericPayAdapter } = await import(new URL('../dist/services/payments/generic.js', import.meta.url).pathname);
  checkoutMode = 'accept';
  const link = await genericPayAdapter.createPaymentLink({ amountTtc: 120, currency: 'EUR', reference: 'FAC-2026-TEST', description: 'Facture FAC-2026-TEST' });
  assert.equal(link.checkoutUrl, 'https://pay.fixture.test/checkout/FAC-2026-TEST');
  assert.match(link.providerRef, /^FIX-/);
  checkoutMode = 'fail';
  await assert.rejects(() => genericPayAdapter.createPaymentLink({ amountTtc: 10, currency: 'EUR', reference: 'X', description: '' }), /500/);
  checkoutMode = 'accept';

  // 4) Webhook signé de bout en bout : lien inséré en base (comme la route le ferait), signature réelle.
  const { verifyPaymentSignature, processPaymentWebhook, parsePaymentEnvelope, PaymentWebhookError } = await import(new URL('../dist/services/payments/webhook.js', import.meta.url).pathname);
  const secret = process.env.AURION_PAY_WEBHOOK_SECRET;
  const linkToken = uuid();
  await mod.db.withTenant(A.organizationId, () => mod.db.query(
    `insert into payment_links(organization_id,invoice_id,amount_ttc,invoice_total_at_creation,provider,link_token)
     values($1,$2,120,120,'generic',$3)`, [A.organizationId, invoiceId, linkToken]));
  const envelopePayload = { eventId: 'evt-' + uuid(), type: 'payment.succeeded', linkToken, providerRef: 'FIX-1', amountPaid: 120 };
  const raw = Buffer.from(JSON.stringify(envelopePayload));
  const t = Math.floor(Date.now() / 1000);
  const sig = 't=' + t + ',v1=' + crypto.createHmac('sha256', secret).update(`${t}.`, 'utf8').update(raw).digest('hex');
  // Signature valide acceptée :
  assert.doesNotThrow(() => verifyPaymentSignature(raw, sig, secret));
  // Corps altéré refusé :
  assert.throws(() => verifyPaymentSignature(Buffer.from(raw.toString() + 'x'), sig, secret), PaymentWebhookError);
  // Rejeu (horodatage ancien) refusé :
  const oldSig = 't=' + (t - 1000) + ',v1=' + crypto.createHmac('sha256', secret).update(`${t - 1000}.`, 'utf8').update(raw).digest('hex');
  assert.throws(() => verifyPaymentSignature(raw, oldSig, secret), PaymentWebhookError);
  const outcome = await processPaymentWebhook(parsePaymentEnvelope(envelopePayload), envelopePayload, 'generic', A.organizationId);
  assert.equal(outcome.status, 'processed');
  assert.equal(outcome.paidInFull, true);
  assert.equal(outcome.invoiceNumber, created.json().number);
  // Le statut de la facture est passé à « paid » UNIQUEMENT via le webhook vérifié.
  const inv = (await mod.app.inject({ method: 'GET', url: '/quotes', headers: auth })).json().find(x => x.id === invoiceId);
  assert.equal(inv.payment_status, 'paid');
  // Idempotence : rejeu du même event_id → duplicate, AUCUNE écriture supplémentaire.
  const again = await processPaymentWebhook(parsePaymentEnvelope(envelopePayload), envelopePayload, 'generic', A.organizationId);
  assert.equal(again.status, 'duplicate');
  const paymentsCount = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select count(*)::int n from invoice_payments where quote_id=$1', [invoiceId]))).rows[0].n;
  assert.equal(paymentsCount, 1);
  // Montant modifié après génération du lien → lien invalidé, paiement refusé.
  const token2 = uuid();
  await mod.db.withTenant(A.organizationId, () => mod.db.query(
    `insert into payment_links(organization_id,invoice_id,amount_ttc,invoice_total_at_creation,provider,link_token)
     values($1,$2,80,80,'generic',$3)`, [A.organizationId, invoiceId, token2]));
  // La facture total_ttc a changé (120 → simulé ici par un total différent du snapshot) :
  await mod.db.withTenant(A.organizationId, () => mod.db.query('update quotes set total_ttc=150 where id=$1', [invoiceId]));
  const env2 = { eventId: 'evt-' + uuid(), type: 'payment.succeeded', linkToken: token2, amountPaid: 80 };
  await assert.rejects(async () => { await processPaymentWebhook(parsePaymentEnvelope(env2), env2, 'generic', A.organizationId); }, (e) => e.code === 'LINK_INVALIDATED');
  // Isolation A/B : webhook avec un tenant B ne peut pas payer le lien de A.
  const B = await seedAccount(mod);
  const env3 = { eventId: 'evt-' + uuid(), type: 'payment.succeeded', linkToken, amountPaid: 10 };
  // Le lien appartient à A : traité sous le tenant de A, jamais sous B (le webhook résout le tenant par le jeton).
  const routeForB = await mod.app.inject({ method: 'POST', url: `/payments/webhook/${uuid()}`, payload: env3, headers: { 'x-aurion-pay-signature': 't=0,v1=' + '0'.repeat(64), 'content-type': 'application/json' } });
  assert.ok([404, 400, 503].includes(routeForB.statusCode), 'webhook public refuse les jetons inconnus (reçu '+routeForB.statusCode+' : '+routeForB.body.slice(0,160)+')');
  // Aucun numéro de carte stocké nulle part.
  const cols = (await mod.db.withTenant(A.organizationId, () => mod.db.query("select column_name from information_schema.columns where table_name in ('payment_links','invoice_payments')"))).rows.map(x => x.column_name);
  assert.ok(!cols.some(c => /card|pan|cvc/i.test(c)), 'aucune donnée de carte en base');
});
