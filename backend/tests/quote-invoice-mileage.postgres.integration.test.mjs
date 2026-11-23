// Intégration PostgreSQL — conversion devis → facture et kilométrage comptable.
//
// Ce test passe par les routes HTTP réelles (Fastify inject), pas par une copie du SQL :
//   1. un devis déjà envoyé (sent_at non nul) devient une facture dont sent_at doit repartir
//      à null : la facture n'a pas encore été envoyée ;
//   2. deux factures portent le même kilométrage, l'une en mode « client_price » (refacturé),
//      l'autre en mode « margin » (coût interne) ; la comptabilité ne doit additionner que
//      la première.
//
// Prérequis : « npm --prefix backend run build », base de test migrée, DATABASE_URL,
// AURION_ADMIN_DATABASE_URL et AURION_INTEGRATION_TESTS=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'quote-invoice-mileage-integration-secret-0123456789';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const appPath = fileURLToPath(new URL('../dist/app.js', import.meta.url));
const dbPath = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const authPath = fileURLToPath(new URL('../dist/plugins/auth.js', import.meta.url));
const databaseUrl = process.env.DATABASE_URL || process.env.AURION_INTEGRATION_DATABASE_URL;
const ready = existsSync(appPath) && existsSync(dbPath) && Boolean(databaseUrl)
  && process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1, DATABASE_URL ou AURION_ADMIN_DATABASE_URL non défini';

const uuid = () => crypto.randomUUID();

test('devis envoyé → facture avec sent_at null ; comptabilité = kilométrage client_price uniquement', { skip }, async () => {
  const [{ buildApp }, db, auth] = await Promise.all([import(appPath), import(dbPath), import(authPath)]);
  const app = await buildApp();
  const organizationId = uuid();
  const userId = uuid();

  try {
    await db.query(
      "insert into organizations(id,name,activity) values($1,$2,'Intégration kilométrage')",
      [organizationId, `Micro ${organizationId.slice(0, 8)}`],
    );
    await db.query(
      "insert into users(id,email,password_hash) values($1,$2,'x')",
      [userId, `quote-invoice-${uuid()}@example.test`],
    );
    await db.query(
      "insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')",
      [organizationId, userId],
    );
    await db.withTenant(organizationId, async () => {
      await db.query(
        "insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Intégration kilométrage')",
        [organizationId],
      );
      await db.query(
        "insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')",
        [organizationId],
      );
    });

    const sessionVersion = Number((await db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
    const token = await auth.signAccessToken({ userId, organizationId, role: 'owner', sv: sessionVersion });
    const headers = { authorization: `Bearer ${token}` };

    const clientResponse = await app.inject({
      method: 'POST',
      url: '/clients',
      headers,
      payload: { name: `Client kilométrage ${uuid().slice(0, 8)}`, activity: 'principale' },
    });
    assert.equal(clientResponse.statusCode, 201, clientResponse.body);
    const clientId = clientResponse.json().id;

    const createQuote = async (mileageMode, label) => {
      const response = await app.inject({
        method: 'POST',
        url: '/quotes',
        headers,
        payload: {
          clientId,
          documentType: 'quote',
          intervention: label,
          items: [{ label, quantity: 1, unitCost: 0, unitPrice: 100 }],
          vatRate: 0,
          urssafRate: 0,
          finalPriceTtc: 100,
          allowLoss: true,
          mileageKm: 10,
          mileageInternalRate: 1,
          mileageClientRate: 1,
          mileageMode,
        },
      });
      assert.equal(response.statusCode, 201, response.body);
      return response.json().id;
    };

    const convertToInvoice = async (quoteId) => {
      const response = await app.inject({
        method: 'POST',
        url: `/quotes/${quoteId}/invoice`,
        headers,
        payload: { dueAt: '2099-12-31', reminderIntervalDays: 0, sendEmail: false },
      });
      assert.ok([200, 201].includes(response.statusCode), response.body);
      return response.json();
    };

    const readQuote = async (quoteId) => (await db.withTenant(organizationId, () => db.query(
      'select id,document_type,status,number,sent_at,total_ttc,mileage_mode,mileage_total from quotes where id=$1 and organization_id=$2',
      [quoteId, organizationId],
    ))).rows[0];

    // 1) Devis déjà envoyé : la conversion ne doit pas hériter de son sent_at.
    const sentQuoteId = await createQuote('margin', 'Devis déjà envoyé');
    await db.withTenant(organizationId, () => db.query(
      "update quotes set sent_at=now()-interval '2 days' where id=$1 and organization_id=$2",
      [sentQuoteId, organizationId],
    ));
    const sentBefore = await readQuote(sentQuoteId);
    assert.ok(sentBefore.sent_at, 'précondition : le devis source a bien un sent_at non nul');
    assert.equal(sentBefore.document_type, 'quote');

    await convertToInvoice(sentQuoteId);
    const sentInvoice = await readQuote(sentQuoteId);
    assert.equal(sentInvoice.document_type, 'invoice');
    assert.equal(sentInvoice.status, 'issued');
    assert.ok(sentInvoice.number, 'la facture reçoit un numéro définitif');
    assert.equal(sentInvoice.sent_at, null, 'la facture convertie repart non envoyée');

    // 2) Deux factures au même kilométrage : seul client_price est refacturé.
    const clientInvoiceId = await createQuote('client_price', 'Déplacement refacturé');
    const marginInvoiceId = await createQuote('margin', 'Déplacement en marge');
    await convertToInvoice(clientInvoiceId);
    await convertToInvoice(marginInvoiceId);

    const clientInvoice = await readQuote(clientInvoiceId);
    const marginInvoice = await readQuote(marginInvoiceId);
    assert.equal(clientInvoice.sent_at, null);
    assert.equal(marginInvoice.sent_at, null);
    assert.equal(clientInvoice.mileage_mode, 'client_price');
    assert.equal(marginInvoice.mileage_mode, 'margin');
    assert.equal(Number(clientInvoice.mileage_total), 10, 'kilométrage client conservé sur la facture');
    assert.equal(Number(marginInvoice.mileage_total), 10, 'coût kilométrique interne conservé, mais non facturé');

    for (const invoice of [clientInvoice, marginInvoice]) {
      const payment = await app.inject({
        method: 'POST',
        url: `/invoices/${invoice.id}/payments`,
        headers,
        payload: { amount: Number(invoice.total_ttc), paymentMethod: 'transfer' },
      });
      assert.equal(payment.statusCode, 201, payment.body);
    }

    const year = new Date().getFullYear();
    const accounting = await app.inject({
      method: 'GET',
      url: `/accounting/summary?year=${year}`,
      headers,
    });
    assert.equal(accounting.statusCode, 200, accounting.body);
    const summary = accounting.json();
    assert.equal(Number(summary.invoices.mileage_total), 10, 'seul le kilométrage client_price entre dans le total comptable');
    const monthlyMileage = summary.months.reduce((total, month) => total + Number(month.mileage || 0), 0);
    assert.equal(monthlyMileage, 10, 'le détail mensuel exclut le kilométrage en mode margin');
  } finally {
    await db.withTenant(organizationId, () => db.query('delete from organizations where id=$1', [organizationId])).catch(() => {});
    await app.close().catch(() => {});
    await db.db.end().catch(() => {});
    if (db.adminDb) await db.adminDb.end().catch(() => {});
  }
});
