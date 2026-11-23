// Bloc 3 — boîte de réception des factures fournisseurs : recette d'intégration réelle
// (PostgreSQL réel, rôle applicatif, RLS active, adaptateur « generic » signé).
//
// IMPORTANT (bloc 3 du cahier des charges) : ces tests valident le socle de réception contre
// le CONTRAT GÉNÉRIQUE documenté (adaptateur de référence). Aucune plateforme agréée réelle
// n'est connectée : la réception n'est pas déclarée opérationnelle en production tant qu'une
// PA contractuelle n'a pas été validée en sandbox.
//
// Prérequis : « npm run build », DATABASE_URL (rôle applicatif), AURION_ADMIN_DATABASE_URL
// (membre de « aurion_admin »), AURION_INTEGRATION_TESTS=1 ; sinon ignorés avec la raison
// affichée — jamais déclarés réussis sans exécution.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const pathJoin = path.join;

process.env.NODE_ENV ||= 'test';
process.env.AURION_INTEGRATION_TESTS ||= '1';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_PA_PROVIDER ||= 'generic';
process.env.AURION_PA_WEBHOOK_SECRET ||= 'pa-integration-test-secret-at-least-32-chars!!';
process.env.AURION_PA_MAX_FILE_BYTES ||= '1048576';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const appPath = fileURLToPath(new URL('../dist/app.js', import.meta.url));
const dbPath = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const authPath = fileURLToPath(new URL('../dist/plugins/auth.js', import.meta.url));
const storagePath = fileURLToPath(new URL('../dist/services/storage.js', import.meta.url));
const ready = existsSync(appPath) && existsSync(dbPath) && Boolean(process.env.DATABASE_URL)
  && process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1, DATABASE_URL ou AURION_ADMIN_DATABASE_URL non défini';

test.after(async () => { if (modules) { await modules.db.db.end().catch(() => {}); if (modules.db.adminDb) await modules.db.adminDb.end().catch(() => {}); } });

const modules = ready ? {
  app: null, db: null, storage: null, signAccessToken: null,
} : null;

async function boot() {
  if (!modules.app) {
    const [{ buildApp }, db, storage, auth] = await Promise.all([import(appPath), import(dbPath), import(storagePath), import(authPath)]);
    modules.app = await buildApp();
    modules.db = db;
    modules.storage = storage;
    modules.signAccessToken = auth.signAccessToken;
  }
  return modules;
}

const SECRET = () => process.env.AURION_PA_WEBHOOK_SECRET;
const uuid = () => crypto.randomUUID();

// ------------------------------------------------------------------ fixtures
const createdOrganizations = new Set();

/**
 * Fixture de compte : organisation + utilisateur propriétaire + activité + abonnement d'essai,
 * créés directement en base (même contenu que /auth/register) avec un JWT signé par le plugin
 * d'authentification. Évite la limite d'inscription HTTP (5/IP/15 min) pour cette recette qui
 * exige de nombreuses organisations ; AUCUN contournement production : les routes publiques
 * restent inchangées et leur garde est couverte par les autres suites.
 */
async function seedAccount(mod) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test PA')`, [organizationId, `Entreprise PA ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `pa-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture PA')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  createdOrganizations.add(organizationId);
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

const pdfBytes = Buffer.from('%PDF-1.7\nFacture fournisseur originale — bloc 3 Aurion\n', 'utf8');

function paEnvelope(overrides = {}) {
  return {
    eventId: `evt-${uuid()}`,
    type: 'invoice.received',
    occurredAt: new Date().toISOString(),
    invoice: {
      invoiceId: `PA-INV-${uuid().slice(0, 8)}`,
      number: 'FA-2026-0142',
      issueDate: '2026-11-13',
      dueDate: '2026-12-13',
      currency: 'EUR',
      supplier: { name: 'Dupont Réparation', siren: '123456789', siret: '12345678900011', email: 'compta@dupont.example', vatNumber: null },
      totals: { net: 100, tax: 20, gross: 120 },
      items: [{ label: 'Pièce détachée', quantity: 1, unitPrice: 40, total: 40 }, { label: 'Main-d’œuvre', quantity: 1, unitPrice: 60, total: 60 }],
      document: { filename: 'facture-FA-2026-0142.pdf', contentType: 'application/pdf', contentBase64: pdfBytes.toString('base64') },
    },
    ...overrides,
  };
}

function signedHeader(rawBody, timestamp = Math.floor(Date.now() / 1000), secret = SECRET()) {
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.`, 'utf8').update(rawBody).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function provisionEndpoint(mod, account) {
  const response = await mod.app.inject({
    method: 'POST', url: '/pa/endpoints', headers: { authorization: `Bearer ${account.token}` }, payload: {},
  });
  assert.ok([200, 201].includes(response.statusCode), response.body);
  const body = response.json();
  assert.equal(body.configured, true);
  const token = body.webhookUrl.split('/').pop();
  assert.match(token, /^[0-9a-f-]{36}$/, 'le jeton de webhook est un UUID');
  return { token, webhookUrl: body.webhookUrl };
}

async function deliverWebhook(mod, token, event, options = {}) {
  const rawBody = Buffer.from(JSON.stringify(event));
  return mod.app.inject({
    method: 'POST',
    url: `/pa/webhook/${token}`,
    headers: { 'content-type': 'application/json', 'x-aurion-pa-signature': options.signature ?? signedHeader(rawBody, options.timestamp) },
    ...(options.rawPayload ? { payload: options.rawPayload } : { payload: rawBody }),
  });
}

async function cleanupOrganizations(mod) {
  for (const org of createdOrganizations) {
    // Fichiers archivés de l'organisation, puis données (cascade) ; best-effort.
    try { rmSync(pathJoin(mod.storage.PRIVATE_BASE, org), { recursive: true, force: true }); } catch {}
    await mod.db.query('delete from organizations where id=$1', [org]).catch(() => {});
    // Les utilisateurs sont liés par organization_members (cascade côté org) mais restent possesseurs
    // d'autres organisations : suppression explicite par jointure.
    await mod.db.query(`delete from users where id in (select user_id from organization_members where organization_id=$1)`, [org]).catch(() => {});
  }
  createdOrganizations.clear();
}

// ------------------------------------------------------------------ tests

test('RLS 075 : les quatre nouvelles tables portent la politique tenant_isolation', { skip }, async () => {
  const mod = await boot();
  const policies = await mod.db.query("select tablename from pg_policies where schemaname='public' and policyname='tenant_isolation' order by tablename");
  const names = policies.rows.map(r => r.tablename);
  for (const expected of ['pa_webhook_endpoints', 'pa_webhook_events', 'supplier_electronic_invoices', 'supplier_electronic_invoice_events']) {
    assert.ok(names.includes(expected), `politique manquante sur ${expected}`);
  }
});

test('provisionnement du point d’entrée webhook : URL stable sans rotation, jeton secret', { skip }, async () => {
  const mod = await boot();
  const account = await seedAccount(mod);
  try {
    const denied = await mod.app.inject({ method: 'POST', url: '/pa/endpoints', payload: {} });
    assert.equal(denied.statusCode, 401, 'sans session : refusé');

    const first = await provisionEndpoint(mod, account);
    const again = await provisionEndpoint(mod, account);
    assert.equal(first.token, again.token, 'sans rotation, le même point d’entrée est renvoyé');
    assert.ok(first.webhookUrl.startsWith(process.env.APP_BASE_URL), 'l’URL est construite sur APP_BASE_URL');
  } finally { await cleanupOrganizations(mod); }
});

test('réception signée : stockage idempotent, rapprochement fournisseur, archivage original intact', { skip }, async () => {
  const mod = await boot();
  const account = await seedAccount(mod);
  try {
    // Fournisseur existant : nom identique aux accents près, email exact → rapprochement attendu.
    await mod.db.withTenant(account.organizationId, async () => {
      await mod.db.query(`insert into activities(id,organization_id,code,name) values($1,$2,'pa','Activité PA')`, [uuid(), account.organizationId]);
      const act = (await mod.db.query('select id from activities where organization_id=$1 limit 1', [account.organizationId])).rows[0].id;
      await mod.db.query(`insert into suppliers(id,organization_id,activity_id,name,email) values($1,$2,$3,'Dupont Réparation','compta@dupont.example')`, [uuid(), account.organizationId, act]);
    });

    const { token } = await provisionEndpoint(mod, account);
    const event = paEnvelope();
    const response = await deliverWebhook(mod, token, event);
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.received, true);
    assert.equal(body.duplicate, undefined, 'première livraison : pas un doublon');
    assert.equal(body.status, 'received');

    // Ligne boîte de réception : rapprochement réussi (accents/casse ignorés) + montants exacts.
    const detail = await mod.app.inject({ method: 'GET', url: `/pa/inbox/${body.invoiceId}`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(detail.statusCode, 200);
    const invoice = detail.json().invoice;
    assert.equal(invoice.supplier_match_status, 'matched', 'rapprochement par nom normalisé (accents/casse)');
    assert.ok(invoice.supplier_id, 'fournisseur rattaché');
    assert.equal(Number(invoice.total_ttc), 120);
    assert.equal(invoice.invoice_number, 'FA-2026-0142');
    assert.equal(invoice.status, 'received');
    assert.equal(invoice.payload.invoice.document.bytes, undefined, 'le fichier n’est pas dupliqué dans le payload conservé');

    // Journal : réception + stockage, avec mention explicite d’absence d’écriture automatique.
    const journal = detail.json().journal.map(j => j.kind);
    assert.ok(journal.includes('invoice.stored'), 'journal de stockage présent');
    const storedEntry = detail.json().journal.find(j => j.kind === 'invoice.stored');
    assert.match(storedEntry.detail.notice, /aucune écriture comptable/i);

    // Archivage de l’original : octets strictement identiques (sans altération), SHA-256 scellé.
    const fileResponse = await mod.app.inject({ method: 'GET', url: `/pa/inbox/${body.invoiceId}/file`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(fileResponse.statusCode, 200);
    assert.equal(fileResponse.headers['content-type'], 'application/pdf');
    const received = fileResponse.rawPayload;
    assert.equal(received.toString('utf8'), pdfBytes.toString('utf8'), 'original restitué à l’identique');
    const expectedDigest = crypto.createHash('sha256').update(pdfBytes).digest('hex');
    assert.equal(invoice.content_sha256, expectedDigest, 'SHA-256 de l’original scellé en base');

    // Registre d’idempotence : un seul événement, traité.
    const ledger = await mod.db.withTenant(account.organizationId, () => mod.db.query('select status,processed_at from pa_webhook_events'));
    assert.equal(ledger.rows.length, 1);
    assert.equal(ledger.rows[0].status, 'processed');
    assert.ok(ledger.rows[0].processed_at, 'horodatage de traitement présent');
  } finally { await cleanupOrganizations(mod); }
});

test('idempotence : rejeu du même event_id acquitté sans nouvelle écriture ; même contenu sous un autre event_id → doublon de contenu', { skip }, async () => {
  const mod = await boot();
  const account = await seedAccount(mod);
  try {
    const { token } = await provisionEndpoint(mod, account);
    const event = paEnvelope();
    const first = await deliverWebhook(mod, token, event);
    assert.equal(first.statusCode, 200);
    const invoiceId = first.json().invoiceId;

    // Rejeu EXACT (même event_id, mêmes octets) : acquittement, aucune nouvelle ligne.
    const replay = await deliverWebhook(mod, token, event);
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().duplicate, true, 'rejeu d’événement reconnu');
    const rowsAfterReplay = await mod.db.withTenant(account.organizationId, () => mod.db.query('select count(*)::int n from supplier_electronic_invoices'));
    assert.equal(rowsAfterReplay.rows[0].n, 1, 'aucune ligne supplémentaire après rejeu');

    // Même fichier, autre event_id (PA re-tentative avec nouvel identifiant) : doublon de contenu détecté.
    const second = await deliverWebhook(mod, token, paEnvelope({ eventId: `evt-${uuid()}`, invoice: { ...event.invoice, invoiceId: 'PA-INV-OTHER' } }));
    assert.equal(second.statusCode, 200);
    const secondBody = second.json();
    assert.equal(secondBody.duplicate, true, 'doublon de contenu détecté');
    assert.equal(secondBody.duplicateOf, invoiceId, 'rattaché à la facture originale');

    const dupDetail = await mod.app.inject({ method: 'GET', url: `/pa/inbox/${secondBody.invoiceId}`, headers: { authorization: `Bearer ${account.token}` } });
    const dup = dupDetail.json().invoice;
    assert.equal(dup.status, 'duplicate');
    assert.equal(dup.duplicate_of, invoiceId);
    assert.equal(dup.original_storage_key, null, 'le fichier du doublon n’est pas re-archivé');
    const dupJournal = dupDetail.json().journal.map(j => j.kind);
    assert.ok(dupJournal.includes('invoice.duplicate_detected'));

    // Une copie de doublon n’est pas modifiable : agir sur l’original.
    const patchDup = await mod.app.inject({ method: 'PATCH', url: `/pa/inbox/${secondBody.invoiceId}`, headers: { authorization: `Bearer ${account.token}` }, payload: { status: 'approved' } });
    assert.equal(patchDup.statusCode, 409, 'doublon : modification refusée (409)');
  } finally { await cleanupOrganizations(mod); }
});

test('sécurité du webhook : signature altérée journalisée, jeton inconnu en 404, rotation active', { skip }, async () => {
  const mod = await boot();
  const account = await seedAccount(mod);
  try {
    const first = await provisionEndpoint(mod, account);

    // Signature incorrecte : 400, aucune donnée stockée, événement journalisé côté organisation.
    const event = paEnvelope();
    const badSignature = await deliverWebhook(mod, first.token, event, { signature: 't=1,v1=deadbeef' });
    assert.equal(badSignature.statusCode, 400);
    assert.equal(badSignature.json().error, 'INVALID_WEBHOOK_SIGNATURE');
    const storedAfterBad = await mod.db.withTenant(account.organizationId, () => mod.db.query('select count(*)::int n from supplier_electronic_invoices'));
    assert.equal(storedAfterBad.rows[0].n, 0, 'aucune facture stockée après signature invalide');
    const sigJournal = await mod.db.withTenant(account.organizationId, () => mod.db.query("select kind from supplier_electronic_invoice_events where kind='webhook.signature_invalid'"));
    assert.ok(sigJournal.rowCount >= 1, 'tentative invalide journalisée');

    // Jeton inconnu et jeton mal formé : 404 générique (pas d’énumération).
    const unknown = await deliverWebhook(mod, uuid(), event);
    assert.equal(unknown.statusCode, 404);
    const malformed = await mod.app.inject({ method: 'POST', url: '/pa/webhook/not-a-uuid', headers: { 'content-type': 'application/json' }, payload: Buffer.from('{}') });
    assert.equal(malformed.statusCode, 404);

    // Rotation : ancien jeton désactivé (404), nouveau jeton opérationnel.
    const rotate = await mod.app.inject({ method: 'POST', url: '/pa/endpoints', headers: { authorization: `Bearer ${account.token}` }, payload: { rotate: true } });
    assert.equal(rotate.statusCode, 201);
    const newToken = rotate.json().webhookUrl.split('/').pop();
    assert.notEqual(newToken, first.token, 'la rotation change le jeton');
    const afterRotate = await deliverWebhook(mod, first.token, paEnvelope());
    assert.equal(afterRotate.statusCode, 404, 'ancien jeton désactivé');
    const delivered = await deliverWebhook(mod, newToken, paEnvelope());
    assert.equal(delivered.statusCode, 200, 'nouveau jeton opérationnel');
  } finally { await cleanupOrganizations(mod); }
});

test('charge utile non conforme : 422, événement conservé en erreur, reprise manuelle tracée', { skip }, async () => {
  const mod = await boot();
  const account = await seedAccount(mod);
  try {
    const { token } = await provisionEndpoint(mod, account);
    const badEvent = paEnvelope({ invoice: { ...paEnvelope().invoice, supplier: { ...paEnvelope().invoice.supplier, siren: 'pas-un-siren' } } });
    const response = await deliverWebhook(mod, token, badEvent);
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().error, 'INVALID_WEBHOOK_PAYLOAD');

    const inbox = await mod.app.inject({ method: 'GET', url: '/pa/inbox', headers: { authorization: `Bearer ${account.token}` } });
    const errors = inbox.json().pendingErrors;
    assert.equal(errors.length, 1, 'l’événement en erreur est visible pour reprise');
    assert.equal(errors[0].error_code, 'INVALID_WEBHOOK_PAYLOAD');
    assert.equal(inbox.json().invoices.length, 0, 'aucune facture créée');

    // Reprise manuelle : la charge utile conservée est re-validée (ici toujours invalide → 422 tracé).
    const reprocess = await mod.app.inject({ method: 'POST', url: `/pa/events/${errors[0].id}/reprocess`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(reprocess.statusCode, 422);
    assert.equal(reprocess.json().error, 'INVALID_WEBHOOK_PAYLOAD');
    const journalKinds = await mod.db.withTenant(account.organizationId, () => mod.db.query("select kind from supplier_electronic_invoice_events order by created_at"));
    assert.ok(journalKinds.rows.some(r => r.kind === 'invoice.reprocessed'), 'la tentative de reprise est journalisée');

    // Reprise d’un événement déjà traité ou inconnu : refus net.
    const unknownReprocess = await mod.app.inject({ method: 'POST', url: `/pa/events/${uuid()}/reprocess`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(unknownReprocess.statusCode, 404);
  } finally { await cleanupOrganizations(mod); }
});

test('type d’événement inconnu : acquitté sans traitement, journalisé pour audit', { skip }, async () => {
  const mod = await boot();
  const account = await seedAccount(mod);
  try {
    const { token } = await provisionEndpoint(mod, account);
    const response = await deliverWebhook(mod, token, { eventId: `evt-${uuid()}`, type: 'invoice.status.changed', occurredAt: new Date().toISOString(), detail: { status: 'rejected' } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().ignored, true);
    const stored = await mod.db.withTenant(account.organizationId, () => mod.db.query('select count(*)::int n from supplier_electronic_invoices'));
    assert.equal(stored.rows[0].n, 0, 'aucune facture créée');
    const journal = await mod.db.withTenant(account.organizationId, () => mod.db.query("select kind from supplier_electronic_invoice_events where kind='webhook.ignored_type'"));
    assert.equal(journal.rowCount, 1, 'acquittement journalisé');
  } finally { await cleanupOrganizations(mod); }
});

test('rapprochement fournisseur : ambiguïté explicite sans fusion automatique ; correction et approbation utilisateur', { skip }, async () => {
  const mod = await boot();
  const account = await seedAccount(mod);
  try {
    await mod.db.withTenant(account.organizationId, async () => {
      await mod.db.query(`insert into activities(id,organization_id,code,name) values($1,$2,'pa','Activité PA')`, [uuid(), account.organizationId]);
      const act = (await mod.db.query('select id from activities where organization_id=$1 limit 1', [account.organizationId])).rows[0].id;
      await mod.db.query(`insert into suppliers(id,organization_id,activity_id,name) values($1,$2,$3,'Atelier Martin')`, [uuid(), account.organizationId, act]);
      await mod.db.query(`insert into suppliers(id,organization_id,activity_id,name) values($1,$2,$3,'Atelier  Martin ')`, [uuid(), account.organizationId, act]);
    });
    const { token } = await provisionEndpoint(mod, account);
    const response = await deliverWebhook(mod, token, paEnvelope({ invoice: { ...paEnvelope().invoice, supplier: { name: 'ATELIER MARTIN', email: null, siren: null, siret: null, vatNumber: null } } }));
    assert.equal(response.statusCode, 200);
    const invoiceId = response.json().invoiceId;

    const detail = await mod.app.inject({ method: 'GET', url: `/pa/inbox/${invoiceId}`, headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(detail.json().invoice.supplier_match_status, 'ambiguous', 'plusieurs correspondances → ambiguïté, aucune fusion');
    assert.equal(detail.json().invoice.supplier_id, null);

    // Correction : catégorie comptable + rattachement explicite, puis revue et approbation.
    const suppliers = await mod.db.withTenant(account.organizationId, () => mod.db.query('select id from suppliers order by created_at limit 1'));
    const patch = await mod.app.inject({
      method: 'PATCH', url: `/pa/inbox/${invoiceId}`, headers: { authorization: `Bearer ${account.token}` },
      payload: { accountingCategory: '606 - Achats', supplierId: suppliers.rows[0].id, status: 'reviewed' },
    });
    assert.equal(patch.statusCode, 200, patch.body);
    assert.equal(patch.json().invoice.status, 'reviewed');
    assert.equal(patch.json().invoice.supplier_match_status, 'matched');

    const badSupplier = await mod.app.inject({ method: 'PATCH', url: `/pa/inbox/${invoiceId}`, headers: { authorization: `Bearer ${account.token}` }, payload: { supplierId: uuid() } });
    assert.equal(badSupplier.statusCode, 400, 'fournisseur d’une autre organisation refusé');
    const badStatus = await mod.app.inject({ method: 'PATCH', url: `/pa/inbox/${invoiceId}`, headers: { authorization: `Bearer ${account.token}` }, payload: { status: 'transmitted' } });
    assert.equal(badStatus.statusCode, 400, 'statut hors cycle de vie refusé');

    const approve = await mod.app.inject({ method: 'PATCH', url: `/pa/inbox/${invoiceId}`, headers: { authorization: `Bearer ${account.token}` }, payload: { status: 'approved' } });
    assert.equal(approve.statusCode, 200);
    assert.equal(approve.json().invoice.status, 'approved');
    const journal = await mod.db.withTenant(account.organizationId, () => mod.db.query("select kind,detail from supplier_electronic_invoice_events where kind='invoice.approved'"));
    assert.equal(journal.rowCount, 1, 'approbation journalisée');
    assert.match(journal.rows[0].detail.notice, /aucune écriture comptable/i, 'l’approbation ne crée aucune écriture comptable automatique');
  } finally { await cleanupOrganizations(mod); }
});

test('isolation multi-tenant : la boîte de réception échoue fermé entre organisations', { skip }, async () => {
  const mod = await boot();
  const accountA = await seedAccount(mod);
  const accountB = await seedAccount(mod);
  try {
    const endpointA = await provisionEndpoint(mod, accountA);
    const endpointB = await provisionEndpoint(mod, accountB);
    const response = await deliverWebhook(mod, endpointA.token, paEnvelope());
    assert.equal(response.statusCode, 200);
    const invoiceIdA = response.json().invoiceId;

    // B ne voit ni la facture de A, ni son journal, ni ses événements en erreur.
    const asB = await mod.app.inject({ method: 'GET', url: `/pa/inbox/${invoiceIdA}`, headers: { authorization: `Bearer ${accountB.token}` } });
    assert.equal(asB.statusCode, 404, 'détail de A invisible pour B');
    const listB = await mod.app.inject({ method: 'GET', url: '/pa/inbox', headers: { authorization: `Bearer ${accountB.token}` } });
    assert.equal(listB.json().invoices.length, 0, 'la boîte de B est vide');
    const fileB = await mod.app.inject({ method: 'GET', url: `/pa/inbox/${invoiceIdA}/file`, headers: { authorization: `Bearer ${accountB.token}` } });
    assert.equal(fileB.statusCode, 404, 'l’original de A est inaccessible pour B');

    // Le jeton de B ne délivre pas des données de A ; chaque événement reste dans son organisation.
    await deliverWebhook(mod, endpointB.token, paEnvelope({ invoice: { ...paEnvelope().invoice, supplier: { name: 'Fournisseur B', email: null, siren: null, siret: null, vatNumber: null } } }));
    const counts = await mod.db.withTenant(accountB.organizationId, () => mod.db.query('select count(*)::int n from supplier_electronic_invoices'));
    assert.equal(counts.rows[0].n, 1, 'B ne porte que ses propres réceptions');

    // Sans contexte tenant (pool applicatif brut) : échec fermé malgré des lignes existantes.
    const raw = await mod.db.query('select count(*)::int n from supplier_electronic_invoices');
    assert.equal(raw.rows[0].n, 0, 'RLS : zéro ligne hors contexte tenant');
  } finally { await cleanupOrganizations(mod); }
});
