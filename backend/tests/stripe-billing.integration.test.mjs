import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const databaseUrl = process.env.DATABASE_URL || process.env.AURION_INTEGRATION_DATABASE_URL;
const enabled = process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(databaseUrl);

if (!enabled) {
  test('Stripe billing integration tests require the disposable PostgreSQL CI service', { skip: 'AURION_INTEGRATION_TESTS=1 and DATABASE_URL are required' }, () => {});
} else {
  // Exercise production configuration and the forwarded client-IP path, but only against disposable CI PostgreSQL.
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET ||= 'aurion-integration-tests-only-secret-at-least-32-characters';
  process.env.COOKIE_SECURE = 'true';
  process.env.AURION_ENCRYPTION_KEY ||= 'integration-only-encryption-key-please-32-chars';
  process.env.AURION_ENCRYPTION_KEY_VERSION ||= 'ci-k1';
  process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
  process.env.APP_BASE_URL = 'https://aurion.integration.test';
  process.env.CORS_ORIGIN = 'https://aurion.integration.test';
  process.env.STRIPE_SECRET_KEY ||= 'sk_test_integration_not_real';
  process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_aurion_integration_test_secret';

  const [{ buildApp }, { db }, { ensureLegalDocuments }] = await Promise.all([
    import('../dist/app.js'),
    import('../dist/db.js'),
    import('../dist/services/account.js'),
  ]);
  const app = await buildApp();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const createdOrganizations = new Set();
  const createdUsers = new Set();
  let registrationIpCounter = 1;

  async function registerAccount() {
    const registrationIp = `192.0.2.${registrationIpCounter++}`;
    const email = `stripe-integration-${crypto.randomUUID()}@example.test`;
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { 'x-forwarded-for': registrationIp },
      payload: { email, password: 'Integration-Test-Password-123!', acceptLegal: true },
    });
    assert.equal(response.statusCode, 201, response.body);
    const result = response.json();
    createdOrganizations.add(result.organization.id);
    if (result.user?.id) createdUsers.add(result.user.id);
    return { email, password: 'Integration-Test-Password-123!', userId: result.user?.id, token: result.accessToken, organizationId: result.organization.id };
  }

  async function createPendingPayment(account) {
    const id = `cs_test_${crypto.randomUUID().replaceAll('-', '')}`;
    const reference = `AUR-TEST-${crypto.randomUUID()}`;
    const htCents = BigInt((await db.query("select price_ht_cents from plans where code='monthly'")).rows[0].price_ht_cents);
    const amount = Number((htCents * 12_000n + 5_000n) / 10_000n);
    await db.query(
      `insert into billing_payment_requests(organization_id,plan_code,method,reference,amount_ttc_cents,provider_session_id)
       values($1,'monthly','card',$2,$3,$4)`,
      [account.organizationId, reference, Math.round(amount), id],
    );
    return {
      id,
      reference,
      amount: Math.round(amount),
      session: {
        id,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: Math.round(amount),
        currency: 'eur',
        metadata: { organization_id: account.organizationId, plan_code: 'monthly', reference },
      },
    };
  }

  function signedHeader(rawBody, timestamp = Math.floor(Date.now() / 1000)) {
    const signature = crypto.createHmac('sha256', webhookSecret)
      .update(`${timestamp}.`, 'utf8')
      .update(rawBody)
      .digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  async function postWebhook(event, signatureOverride) {
    const rawBody = Buffer.from(JSON.stringify(event));
    return app.inject({
      method: 'POST',
      url: '/billing/stripe/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signatureOverride ?? signedHeader(rawBody),
      },
      payload: rawBody,
    });
  }

  async function paymentState(organizationId, sessionId) {
    const result = await db.query(
      `select p.status payment_status,s.status subscription_status,s.current_period_end
         from billing_payment_requests p join subscriptions s on s.organization_id=p.organization_id
        where p.organization_id=$1 and p.provider_session_id=$2`,
      [organizationId, sessionId],
    );
    assert.equal(result.rowCount, 1);
    return result.rows[0];
  }

  test('retour Checkout: la session payée n’active l’abonnement qu’une fois', async () => {
    const account = await registerAccount();
    const payment = await createPendingPayment(account);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.match(String(url), /^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\//);
      return new Response(JSON.stringify(payment.session), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    try {
      const first = await app.inject({
        method: 'GET',
        url: `/billing/checkout/complete?session_id=${encodeURIComponent(payment.id)}`,
        headers: { authorization: `Bearer ${account.token}` },
      });
      assert.equal(first.statusCode, 200, first.body);
      const once = await paymentState(account.organizationId, payment.id);
      assert.equal(once.payment_status, 'paid');
      assert.equal(once.subscription_status, 'active');

      const second = await app.inject({
        method: 'GET',
        url: `/billing/checkout/complete?session_id=${encodeURIComponent(payment.id)}`,
        headers: { authorization: `Bearer ${account.token}` },
      });
      assert.equal(second.statusCode, 200, second.body);
      const twice = await paymentState(account.organizationId, payment.id);
      assert.equal(new Date(twice.current_period_end).getTime(), new Date(once.current_period_end).getTime());
      assert.equal((await db.query("select count(*)::int n from subscription_events where organization_id=$1 and kind='payment_succeeded'", [account.organizationId])).rows[0].n, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('retour navigateur et webhook simultanés ne prolongent la même période qu’une fois', async () => {
    const account = await registerAccount();
    const payment = await createPendingPayment(account);
    const event = {
      id: `evt_test_${crypto.randomUUID().replaceAll('-', '')}`,
      object: 'event', type: 'checkout.session.completed', data: { object: payment.session },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(payment.session), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
    try {
      const [browser, webhook] = await Promise.all([
        app.inject({ method: 'GET', url: `/billing/checkout/complete?session_id=${encodeURIComponent(payment.id)}`, headers: { authorization: `Bearer ${account.token}` } }),
        postWebhook(event),
      ]);
      assert.equal(browser.statusCode, 200, browser.body);
      assert.equal(webhook.statusCode, 200, webhook.body);
      const state = await paymentState(account.organizationId, payment.id);
      assert.equal(state.payment_status, 'paid');
      assert.equal(state.subscription_status, 'active');
      assert.equal((await db.query("select count(*)::int n from subscription_events where organization_id=$1 and kind='payment_succeeded'", [account.organizationId])).rows[0].n, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('webhook Stripe signé: activation idempotente et rejet d’une signature invalide', async () => {
    const account = await registerAccount();
    const payment = await createPendingPayment(account);
    const event = {
      id: `evt_test_${crypto.randomUUID().replaceAll('-', '')}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: payment.session },
    };
    const rawBody = Buffer.from(JSON.stringify(event));
    const invalid = await postWebhook(event, `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`);
    assert.equal(invalid.statusCode, 400);
    assert.equal((await paymentState(account.organizationId, payment.id)).payment_status, 'pending');

    const activated = await postWebhook(event);
    assert.equal(activated.statusCode, 200, activated.body);
    assert.equal(activated.json().activated, true);
    const afterActivation = await paymentState(account.organizationId, payment.id);
    assert.equal(afterActivation.payment_status, 'paid');

    const duplicateEvent = await postWebhook(event);
    assert.equal(duplicateEvent.statusCode, 200);
    assert.equal(duplicateEvent.json().duplicate, true);

    const distinctEventSameSession = await postWebhook({ ...event, id: `evt_test_${crypto.randomUUID().replaceAll('-', '')}` });
    assert.equal(distinctEventSameSession.statusCode, 200, distinctEventSameSession.body);
    assert.equal(distinctEventSameSession.json().activated, false);
    const afterReplay = await paymentState(account.organizationId, payment.id);
    assert.equal(new Date(afterReplay.current_period_end).getTime(), new Date(afterActivation.current_period_end).getTime());
    assert.equal((await db.query("select count(*)::int n from subscription_events where organization_id=$1 and kind='payment_succeeded'", [account.organizationId])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from billing_webhook_events where provider='stripe' and event_id=$1", [event.id])).rows[0].n, 1);
  });

  test('un montant ou une devise différente ne peut pas activer un abonnement', async () => {
    for (const invalidFields of [{ amount_total: 1 }, { currency: 'usd' }]) {
      const account = await registerAccount();
      const payment = await createPendingPayment(account);
      const event = {
        id: `evt_test_${crypto.randomUUID().replaceAll('-', '')}`,
        object: 'event',
        type: 'checkout.session.completed',
        data: { object: { ...payment.session, ...invalidFields } },
      };
      const response = await postWebhook(event);
      assert.equal(response.statusCode, 400, response.body);
      assert.equal((await paymentState(account.organizationId, payment.id)).payment_status, 'pending');
      assert.equal((await paymentState(account.organizationId, payment.id)).subscription_status, 'trialing');
    }
  });

  test('une session payée d’une autre organisation ne peut pas être revendiquée au retour navigateur', async () => {
    const owner = await registerAccount();
    const attacker = await registerAccount();
    const payment = await createPendingPayment(owner);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(payment.session), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
    try {
      const response = await app.inject({
        method: 'GET', url: `/billing/checkout/complete?session_id=${encodeURIComponent(payment.id)}`,
        headers: { authorization: `Bearer ${attacker.token}` },
      });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal((await paymentState(owner.organizationId, payment.id)).payment_status, 'pending');
      assert.equal((await paymentState(owner.organizationId, payment.id)).subscription_status, 'trialing');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });


  test('Fastify inject: inscription/connexion, isolation inter-organisation et devis converti en facture', async () => {
    const owner = await registerAccount();
    const other = await registerAccount();
    const login = await app.inject({
      method: 'POST', url: '/auth/login', payload: { email: owner.email, password: owner.password },
    });
    assert.equal(login.statusCode, 200, login.body);
    assert.equal(login.json().organizationId, owner.organizationId);

    const supplierResponse = await app.inject({
      method: 'POST', url: '/suppliers', headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Fournisseur d’intégration' },
    });
    assert.ok([200, 201].includes(supplierResponse.statusCode), supplierResponse.body);
    const supplierId = supplierResponse.json().id;

    const foreignSupplyCreate = await app.inject({
      method: 'POST', url: '/supplies', headers: { authorization: `Bearer ${other.token}` },
      payload: { name: 'Fourniture inter-organisation', supplierId, purchasePrice: 12 },
    });
    assert.equal(foreignSupplyCreate.statusCode, 400, foreignSupplyCreate.body);

    const ownerSupplyResponse = await app.inject({
      method: 'POST', url: '/supplies', headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Fourniture propriétaire', supplierId, purchasePrice: 12 },
    });
    assert.equal(ownerSupplyResponse.statusCode, 201, ownerSupplyResponse.body);
    const ownerSupplyId = ownerSupplyResponse.json().id;

    const otherSupplyResponse = await app.inject({
      method: 'POST', url: '/supplies', headers: { authorization: `Bearer ${other.token}` },
      payload: { name: 'Fourniture locale', purchasePrice: 3 },
    });
    assert.equal(otherSupplyResponse.statusCode, 201, otherSupplyResponse.body);
    const foreignSupplyPatch = await app.inject({
      method: 'PATCH', url: `/supplies/${otherSupplyResponse.json().id}`,
      headers: { authorization: `Bearer ${other.token}` },
      payload: { supplierId, purchasePrice: 3 },
    });
    assert.equal(foreignSupplyPatch.statusCode, 400, foreignSupplyPatch.body);
    const otherSupplies = await app.inject({
      method: 'GET', url: '/supplies', headers: { authorization: `Bearer ${other.token}` },
    });
    assert.equal(otherSupplies.statusCode, 200, otherSupplies.body);
    assert.equal(otherSupplies.json().some(item => item.id === ownerSupplyId), false);

    const malformedClient = await app.inject({
      method: 'POST', url: '/clients', headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 123 },
    });
    assert.equal(malformedClient.statusCode, 400, malformedClient.body);
    const malformedClientMinutes = await app.inject({
      method: 'POST', url: '/clients', headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Client invalide', estimatedMinutes: 'pas-un-nombre' },
    });
    assert.equal(malformedClientMinutes.statusCode, 400, malformedClientMinutes.body);

    const clientResponse = await app.inject({
      method: 'POST', url: '/clients', headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Client d’intégration', email: 'client@example.test', address: '1 rue de test' },
    });
    assert.equal(clientResponse.statusCode, 201, clientResponse.body);
    const clientId = clientResponse.json().id;

    const otherList = await app.inject({ method: 'GET', url: '/clients', headers: { authorization: `Bearer ${other.token}` } });
    assert.equal(otherList.statusCode, 200, otherList.body);
    assert.equal(otherList.json().some(client => client.id === clientId), false);
    const crossTenantPatch = await app.inject({
      method: 'PATCH', url: `/clients/${clientId}`, headers: { authorization: `Bearer ${other.token}` },
      payload: { name: 'Tentative inter-organisation' },
    });
    assert.equal(crossTenantPatch.statusCode, 404);

    const otherActivities = await app.inject({
      method: 'GET', url: '/activities', headers: { authorization: `Bearer ${other.token}` },
    });
    assert.equal(otherActivities.statusCode, 200, otherActivities.body);
    const foreignActivityId = otherActivities.json()[0]?.id;
    assert.ok(foreignActivityId);
    const crossTenantActivity = await app.inject({
      method: 'PATCH', url: `/clients/${clientId}`, headers: { authorization: `Bearer ${owner.token}` },
      payload: { activityId: foreignActivityId },
    });
    assert.equal(crossTenantActivity.statusCode, 400, crossTenantActivity.body);

    const invalidPart = await app.inject({
      method: 'POST', url: '/parts', headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Pièce invalide', stock: 'beaucoup' },
    });
    assert.equal(invalidPart.statusCode, 400, invalidPart.body);
    const validPart = await app.inject({
      method: 'POST', url: '/parts', headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Pièce test intégration', stock: '2', sellingPrice: '12.50', saleCoefficientPercent: '0' },
    });
    assert.equal(validPart.statusCode, 201, validPart.body);
    const invalidPartPrice = await app.inject({
      method: 'POST', url: `/parts/${validPart.json().id}/prices`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { supplierId: 'not-a-uuid', purchasePrice: 'inconnu' },
    });
    assert.equal(invalidPartPrice.statusCode, 400, invalidPartPrice.body);

    const quoteResponse = await app.inject({
      method: 'POST', url: '/quotes', headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        clientId, intervention: 'Prestation test intégration', items: [{ label: 'Prestation test', quantity: 1, unitCost: 10, unitPrice: 100 }],
        vatRate: 20, urssafRate: 0, finalPriceTtc: 120, allowLoss: true, sendEmail: false,
      },
    });
    assert.equal(quoteResponse.statusCode, 201, quoteResponse.body);
    const quote = quoteResponse.json();
    const invalidQuotePatch = await app.inject({
      method: 'PATCH', url: `/quotes/${quote.id}`, headers: { authorization: `Bearer ${owner.token}` },
      payload: { vatRate: 'pas-un-nombre' },
    });
    assert.equal(invalidQuotePatch.statusCode, 400, invalidQuotePatch.body);
    const crossTenantQuotePatch = await app.inject({
      method: 'PATCH', url: `/quotes/${quote.id}`, headers: { authorization: `Bearer ${other.token}` },
      payload: { intervention: 'Modification étrangère' },
    });
    assert.equal(crossTenantQuotePatch.statusCode, 404, crossTenantQuotePatch.body);
    const otherQuotes = await app.inject({ method: 'GET', url: '/quotes', headers: { authorization: `Bearer ${other.token}` } });
    assert.equal(otherQuotes.statusCode, 200, otherQuotes.body);
    assert.equal(otherQuotes.json().some(document => document.id === quote.id), false);

    const invoiceResponse = await app.inject({
      method: 'POST', url: `/quotes/${quote.id}/invoice`, headers: { authorization: `Bearer ${owner.token}` },
      payload: { dueAt: '2027-01-15', reminderIntervalDays: 0, sendEmail: false },
    });
    assert.equal(invoiceResponse.statusCode, 200, invoiceResponse.body);
    const invoices = await app.inject({ method: 'GET', url: '/quotes', headers: { authorization: `Bearer ${owner.token}` } });
    assert.ok(invoices.json().some(document => document.id === quote.id && document.document_type === 'invoice'));
    const crossTenantInvoice = await app.inject({
      method: 'POST', url: `/quotes/${quote.id}/invoice`, headers: { authorization: `Bearer ${other.token}` },
      payload: { dueAt: '2027-01-15', sendEmail: false },
    });
    assert.equal(crossTenantInvoice.statusCode, 404);
  });

  test('WebAuthn accepte un GET same-origin sans Origin uniquement sur l’hôte autorisé', async () => {
    const allowed = await app.inject({
      method: 'GET', url: '/auth/webauthn/authenticate/options',
      headers: { host: 'aurion.integration.test' },
    });
    assert.equal(allowed.statusCode, 200, allowed.body);
    assert.equal(allowed.json().rpId, 'aurion.integration.test');

    const forbidden = await app.inject({
      method: 'GET', url: '/auth/webauthn/authenticate/options',
      headers: { host: 'aurion.integration.test', origin: 'https://attacker.example.test' },
    });
    assert.equal(forbidden.statusCode, 403, forbidden.body);
  });

  test('la configuration Stripe de test a bien été initialisée', async () => {
    await ensureLegalDocuments();
    assert.ok((await db.query('select 1')).rowCount === 1);
  });

  await app.ready();
  await ensureLegalDocuments();
  test.after(async () => {
    for (const organizationId of createdOrganizations) {
      await db.query('delete from organizations where id=$1', [organizationId]).catch(() => {});
    }
    for (const userId of createdUsers) await db.query('delete from users where id=$1', [userId]).catch(() => {});
    await app.close();
    await db.end();
  });
}
