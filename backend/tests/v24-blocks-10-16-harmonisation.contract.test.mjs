// Blocs 11/13/14/15/16 + prompt général (15.4.48) — contrats statiques et unitaires purs.
// Comptabilité (verrou de période, correction auditée), workflows déterministes, collaboration
// comptable, centralisation documentaire, harmonisation transversale (RLS, événements, statuts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL ||= 'postgresql://aurion_runtime:test@127.0.0.1:5432/aurion_local';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const business = read('../src/routes/business.ts');
const authSrc = read('../src/plugins/auth.ts');
const scheduler = read('../src/services/scheduler.ts');

// ── Bloc 11 — verrou de période + correction de règlement auditée ──────────────────────
test('bloc 11 — verrou de période : clôture, rouverture, garde sur les écritures métier', () => {
  const migration = read('../migrations/097_accounting_period_lock.sql');
  assert.match(migration, /create table if not exists accounting_closed_periods/);
  assert.match(migration, /unique \(organization_id, period_year\)/);
  assert.match(migration, /create table if not exists payment_corrections/);
  assert.match(migration, /payment_payload jsonb not null/);
  assert.match(migration, /add column if not exists matched_by uuid/);
  assert.match(business, /assertPeriodOpen/);
  assert.match(business, /PERIOD_CLOSED/);
  assert.match(business, /app\.post\('\/accounting\/periods\/:year\/close'/);
  assert.match(business, /app\.post\('\/accounting\/periods\/:year\/reopen'/);
  assert.match(business, /app\.get\('\/accounting\/periods'/);
  // FEC et agrégats excluent les écritures annulées (cohérence après correction).
  const exports = read('../src/services/accounting-export.ts');
  assert.match(exports, /voided_at is null/);
  const monthly = read('../src/services/accounting.ts');
  assert.match(monthly, /voided_at is null/);
});

test('bloc 11 — correction de règlement : motif obligatoire, jamais rapprochée, jamais clôturée', () => {
  assert.match(business, /app\.delete\('\/invoices\/:id\/payings?\/:paymentId'|app\.delete\('\/invoices\/:id\/payments\/:paymentId'/);
  assert.match(business, /REASON_REQUIRED/);
  assert.match(business, /PAYMENT_RECONCILED/);
  assert.match(business, /payment_corrections/);
  // Le rapprochement bancaire est attribué (audit du prompt 11).
  const bank = read('../src/routes/bank.ts');
  assert.match(bank, /matched_by=\$3/);
  assert.match(bank, /unmatched_by=\$2/);
});

// ── Bloc 13 — automatisations déterministes (sans IA) ──────────────────────────────────
test('bloc 13 — règles configurables, versionnées, simulation à blanc, journal idempotent', () => {
  const migration = read('../migrations/098_workflow_rules_tasks.sql');
  assert.match(migration, /create table if not exists workflow_rules/);
  assert.match(migration, /trigger_type varchar\(40\) not null check \(trigger_type in \('invoice_overdue','stock_below_threshold','deadline_reminder'\)\)/);
  assert.match(migration, /create table if not exists workflow_runs/);
  assert.match(migration, /status in \('simulated','executed','failed','cancelled'\)/);
  assert.match(migration, /unique \(organization_id, idempotency_key\)/);
  assert.match(migration, /create table if not exists tasks/);
  assert.match(migration, /status in \('todo','done','cancelled'\)/);
  const service = read('../src/services/workflows.ts');
  assert.match(service, /normalizeRuleConfig/);
  assert.match(service, /substitute/);
  assert.match(service, /dryRun/);
  assert.match(service, /runWorkflowSweep/);
  assert.match(service, /AUCUN LLM|aucune prédiction/i);
  // Aucune action externe sans validation humaine : actions internes seulement.
  assert.match(service, /seules journal_alert et create_task sont disponibles/);
  const automation = read('../src/routes/automation.ts');
  assert.match(automation, /\/automation\/rules\/:id\/simulate/);
  assert.match(automation, /\/automation\/sweep/);
  // Le scheduler balaye les workflows et revendique les jobs avant envoi (pas de double envoi).
  assert.match(scheduler, /runWorkflowSweep/);
  assert.match(scheduler, /status='sending'/);
  assert.match(scheduler, /on conflict do nothing/);
});

// ── Bloc 15 — collaboration comptable ───────────────────────────────────────────────────
test('bloc 15 — demandes avec état/auteur/échéance/résolution, échanges, complétude du dossier', () => {
  const migration = read('../migrations/099_accountant_collaboration.sql');
  assert.match(migration, /create table if not exists accountant_requests/);
  assert.match(migration, /state in \('open','answered','resolved','cancelled'\)/);
  assert.match(migration, /author_role in \('operator','accountant'\)/);
  assert.match(migration, /create table if not exists accountant_request_messages/);
  assert.match(migration, /add column if not exists email_status/);
  // Garde : le comptable n'écrit QUE dans l'espace de collaboration.
  assert.match(authSrc, /accountantCollabWrite/);
  assert.match(authSrc, /\/accountant\/requests/);
  assert.match(authSrc, /ROLE_READ_ONLY/);
  const collab = read('../src/routes/accountant-collab.ts');
  assert.match(collab, /RESOLUTION_NOTE_REQUIRED/);
  assert.match(collab, /\/accountant\/dossier/);
  assert.match(collab, /affirme jamais qu\\?'un dossier a été transmis/);
  // Invitation : envoi e-mail, jeton retiré des listes.
  assert.match(business, /emailStatus/);
  const invitations = business.slice(business.indexOf('/organization/accountant-invitations'), business.indexOf('app.delete(\'/organization/accountant-invitations'));
  assert.ok(!/select id,email,token,/.test(invitations), 'le jeton ne doit plus être renvoyé dans les listes');
});

// ── Bloc 16 — centralisation documentaire ───────────────────────────────────────────────
test('bloc 16 — SHA-256, détection MIME, corbeille/restauration/purge, liens, partages révocables', () => {
  const migration = read('../migrations/100_document_centralisation.sql');
  assert.match(migration, /add column if not exists sha256 varchar\(64\)/);
  assert.match(migration, /add column if not exists detected_mime/);
  assert.match(migration, /add column if not exists category varchar\(60\)/);
  assert.match(migration, /create table if not exists document_links/);
  assert.match(migration, /create table if not exists document_shares/);
  assert.match(migration, /unique \(organization_id, token_hash\)/);
  const documents = read('../src/routes/documents.ts');
  assert.match(documents, /sniffMime/);
  assert.match(documents, /decideUpload/);
  assert.match(documents, /sha256Hex/);
  assert.match(documents, /savePrivateBuffer/);
  // Corbeille : suppression logique, restauration, purge après contrôle des références.
  assert.match(documents, /trashed:true/);
  assert.match(documents, /\/documents\/:id\/restore/);
  assert.match(documents, /\/documents\/:id\/purge/);
  assert.match(documents, /DOCUMENT_REFERENCED/);
  // Partage : jeton hashé, révocation, aucune fuite du jeton dans les listes.
  assert.match(documents, /document_shares/);
  assert.match(documents, /\/documents\/shares\/:shareId/);
  assert.match(documents, /revoked_by/);
  const shareRoute = read('../src/routes/share-links.ts');
  assert.match(shareRoute, /SHARE_EXPIRED/);
  assert.match(shareRoute, /access_count=access_count\+1/);
  assert.match(shareRoute, /status\). !== 'clean'|documentStatus\) !== 'clean'/);
});

// ── Bloc 19 — harmonisation transversale ────────────────────────────────────────────────
test('bloc 19 — RLS comblée (account_deletion_requests), socle d\'événements, statuts partagés', () => {
  const rls = read('../migrations/101_harmonisation_rls.sql');
  assert.match(rls, /'account_deletion_requests'/);
  const syncTriggers = read('../migrations/102_sync_entities.sql');
  assert.match(syncTriggers, /'stock_movements','part_reservations','purchase_orders','purchase_order_lines','tasks','accountant_requests'/);
  const events = read('../src/services/events.ts');
  assert.match(events, /emitOrgEvent/);
  assert.match(events, /on conflict \(organization_id,dedupe_key\)/);
  const statuses = read('../src/services/statuses.ts');
  assert.match(statuses, /CANCELED_DOCUMENT_STATUSES/);
  const replication = read('../src/services/sync-replication.ts');
  assert.match(replication, /SYNC_SCHEMA_VERSION = 4/);
  assert.match(replication, /stock_movements: \{ table: 'stock_movements'/);
});

// ── Unitaires purs (aucune base requise) ────────────────────────────────────────────────
const wfPath = fileURLToPath(new URL('../dist/services/workflows.js', import.meta.url));
const skippable = existsSync(wfPath) ? false : 'dist/ absente : lancer le build (npm test le fait)';

test('unitaire — configuration de règle validée : conditions et actions déterministes', { skip: skippable }, async () => {
  const { normalizeRuleConfig, substitute, WorkflowError, TRIGGER_LABELS } = await import(pathToFileURL(wfPath).href);
  // Aucune action inconnue acceptée ; au moins une action requise.
  assert.throws(() => normalizeRuleConfig('invoice_overdue', { actions: [] }), WorkflowError);
  assert.throws(() => normalizeRuleConfig('invoice_overdue', { actions: [{ type: 'send_money', title: 'x' }] }), WorkflowError);
  assert.throws(() => normalizeRuleConfig('invoice_overdue', { overdueDays: 400, actions: [{ type: 'journal_alert', title: 'x' }] }), WorkflowError);
  const ok = normalizeRuleConfig('invoice_overdue', { overdueDays: 15, actions: [{ type: 'create_task', title: 'Relancer {invoice}', description: '{daysLate} jours de retard', dueInDays: 2 }] });
  assert.equal(ok.overdueDays, 15);
  assert.equal(ok.actions[0].type, 'create_task');
  assert.equal(ok.actions[0].dueInDays, 2);
  // Substitution déterministe : variables connues remplacées, inconnues conservées littéralement.
  assert.equal(substitute('Facture {invoice} · {daysLate} j', { invoice: 'F-2026-1', daysLate: '3' }), 'Facture F-2026-1 · 3 j');
  assert.equal(substitute('Bonjour {unknown}', {}), 'Bonjour {unknown}');
  assert.equal(TRIGGER_LABELS.invoice_overdue.length > 0, true);
});

// ── Recette d'intégration PostgreSQL (skippée sans base réelle provisionnée) ────────────
const appPath = fileURLToPath(new URL('../dist/app.js', import.meta.url));
const dbPath = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const authPath = fileURLToPath(new URL('../dist/plugins/auth.js', import.meta.url));
const ready = existsSync(appPath) && existsSync(dbPath) && Boolean(process.env.DATABASE_URL)
  && process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1, DATABASE_URL ou AURION_ADMIN_DATABASE_URL non défini';
const crypto = (await import('node:crypto')).default;

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
async function seedAccount(mod, role = 'owner') {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity,siren) values($1,$2,'Test 15.4.48',$3)`, [organizationId, `Micro ${organizationId.slice(0, 8)}`, '123456789']);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `v248-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,$3)`, [organizationId, userId, role]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture 15.4.48')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role, sv });
  return { token, userId, organizationId };
}

test('intégration 15.4.48 — stock traçable, périodes clôturées, correction auditée, workflows', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const authA = { authorization: `Bearer ${A.token}` };
  const aid = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query(`select id from activities where organization_id=$1 and code='principale'`, [A.organizationId])).rows[0].id));
  // 1) Création d'un article avec stock initial → mouvement « initial » tracé.
  const part = await mod.app.inject({ method: 'POST', url: '/parts', headers: authA, payload: { name: 'Filtre test', stock: 10, minStockThreshold: 4, unit: 'pièce', activityId: aid } });
  assert.equal(part.statusCode, 201, part.body);
  const partId = part.json().id;
  const movs = (await mod.app.inject({ method: 'GET', url: '/stock/movements', headers: authA })).json().movements;
  assert.equal(movs.length, 1);
  assert.equal(movs[0].movementType, 'initial');
  // 2) PATCH stock 10 → 4 : ajustement tracé + alerte de seuil dans le journal.
  await mod.app.inject({ method: 'PATCH', url: `/parts/${partId}`, headers: authA, payload: { stock: 4 } });
  const summary = (await mod.app.inject({ method: 'GET', url: '/stock/summary', headers: authA })).json();
  assert.equal(summary.parts[0].physical, 4);
  assert.equal(summary.parts[0].belowThreshold, true);
  const journal = (await mod.app.inject({ method: 'GET', url: '/journal/events', headers: authA })).json().events;
  assert.ok(journal.some(e => e.eventType === 'stock_below_threshold'), 'alerte de seuil émise');
  // 3) Réservation : diminue le disponible, refuse la surréservation.
  const resv = await mod.app.inject({ method: 'POST', url: '/stock/reservations', headers: authA, payload: { partId, quantity: 3 } });
  assert.equal(resv.statusCode, 201, resv.body);
  const over = await mod.app.inject({ method: 'POST', url: '/stock/reservations', headers: authA, payload: { partId, quantity: 5 } });
  assert.equal(over.statusCode, 400);
  const afterReserve = (await mod.app.inject({ method: 'GET', url: '/stock/summary', headers: authA })).json();
  assert.equal(afterReserve.parts[0].available, 1);
  // 4) Consommation confirmée → mouvement « consumption » + statut consumed.
  const consumed = await mod.app.inject({ method: 'POST', url: `/stock/reservations/${resv.json().id}/consume`, headers: authA });
  assert.equal(consumed.statusCode, 201);
  const finalSummary = (await mod.app.inject({ method: 'GET', url: '/stock/summary', headers: authA })).json();
  assert.equal(finalSummary.parts[0].physical, 1);
  // 5) Facture + règlement + verrou de période + correction auditée.
  const client = await mod.app.inject({ method: 'POST', url: '/clients', headers: authA, payload: { name: 'Client test', activityId: aid } });
  const clientId = client.json().id || client.json().clientId;
  const invoice = await mod.app.inject({ method: 'POST', url: '/quotes', headers: authA, payload: { type: 'invoice', clientId, items: [{ label: 'Prestation', quantity: 1, unitPrice: 100 }], activityId: aid } });
  const invoiceId = invoice.json().id;
  const payment = await mod.app.inject({ method: 'POST', url: `/invoices/${invoiceId}/payments`, headers: authA, payload: { amount: 100, paymentMethod: 'cash' } });
  assert.ok([200, 201].includes(payment.statusCode), payment.body);
  const paymentId = payment.json().id;
  // Clôture de l'exercice courant → la correction est refusée.
  const year = new Date().getFullYear();
  const close = await mod.app.inject({ method: 'POST', url: `/accounting/periods/${year}/close`, headers: authA, payload: {} });
  assert.equal(close.statusCode, 200, close.body);
  const rejected = await mod.app.inject({ method: 'DELETE', url: `/invoices/${invoiceId}/payments/${paymentId}`, headers: authA, payload: { reason: 'test' } });
  assert.equal(rejected.statusCode, 409);
  assert.equal(rejected.json().error, 'PERIOD_CLOSED');
  // Rouverture explicite → correction audité possible, trace conservée.
  await mod.app.inject({ method: 'POST', url: `/accounting/periods/${year}/reopen`, headers: authA, payload: {} });
  const corrected = await mod.app.inject({ method: 'DELETE', url: `/invoices/${invoiceId}/payments/${paymentId}`, headers: authA, payload: { reason: 'doublon de saisie' } });
  assert.ok([200, 201].includes(corrected.statusCode), corrected.body);
  const trace = (await mod.db.withTenant(A.organizationId, async () => (await mod.db.query(`select payment_payload,reason from payment_corrections where organization_id=$1`, [A.organizationId])).rows));
  assert.equal(trace.length, 1);
  assert.equal(trace[0].reason, 'doublon de saisie');
  // 6) Workflow : règle sur facture en retard → run exécuté une seule fois (idempotence).
  const rule = await mod.app.inject({ method: 'POST', url: '/automation/rules', headers: authA, payload: { name: 'Relance retard', triggerType: 'invoice_overdue', config: { overdueDays: 0, actions: [{ type: 'create_task', title: 'Relancer {invoice}' }] } } });
  assert.equal(rule.statusCode, 201, rule.body);
  const sweep1 = await mod.app.inject({ method: 'POST', url: '/automation/sweep', headers: authA });
  const sweep2 = await mod.app.inject({ method: 'POST', url: '/automation/sweep', headers: authA });
  const runs = (await mod.app.inject({ method: 'GET', url: '/automation/runs', headers: authA })).json().runs;
  assert.equal(runs.filter(r2 => r2.status === 'executed').length, 1, 'un seul run malgré deux balayages');
  const tasks = (await mod.app.inject({ method: 'GET', url: '/tasks', headers: authA })).json().tasks;
  assert.equal(tasks.length, 1);
  // 7) Isolation : une autre organisation ne voit ni stock ni tâches ni demandes.
  const B = await seedAccount(mod);
  const other = (await mod.app.inject({ method: 'GET', url: '/stock/summary', headers: { authorization: `Bearer ${B.token}` } })).json();
  assert.equal(other.parts.length, 0);
  const otherTasks = (await mod.app.inject({ method: 'GET', url: '/tasks', headers: { authorization: `Bearer ${B.token}` } })).json().tasks;
  assert.equal(otherTasks.length, 0);
});
