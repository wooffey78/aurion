// 15.4.49 — Recette d'intégration PostgreSQL des blocs prompts 01 à 09 : provenance
// d'identité, décisions du cycle commercial + historique, instantanés client + fusion
// auditée, collisions d'agenda avec dérogation auditée, outbox événementiel.
// Comme les autres batteries d'intégration du dépôt : exécutée uniquement quand une base
// réelle est provisionnée (AURION_INTEGRATION_TESTS=1 + DATABASE_URL + AURION_ADMIN_DATABASE_URL).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

process.env.NODE_ENV ||= 'test';
process.env.DATABASE_URL ||= 'postgresql://aurion_runtime:test@127.0.0.1:5432/aurion_it049';
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
async function seedAccount(mod) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Recette 15.4.49')`, [organizationId, `R49 ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `r49-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description,quote_validity_days) values($1,'principale','Activité principale','Fixture 15.4.49',30)`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('Bloc 01 — la modification effective des identifiants écrit l\u2019historique et la provenance', { skip }, async () => {
  const mod = await boot(); const { app, db } = mod;
  const { token, organizationId, userId } = await seedAccount(mod);
  const headers = { authorization: `Bearer ${token}` };
  // Changement d'identité déclaré comme issu du registre public.
  const patched = await app.inject({ method: 'PATCH', url: '/organization', headers, payload: { name: 'Atelier Test', activity: 'Réparation', siret: '55210055400013', siren: '552100554', identitySource: 'registre-public' } });
  assert.equal(patched.statusCode, 200, patched.body);
  assert.equal(patched.json().identity_source, 'registre-public');
  assert.ok(patched.json().identity_checked_at);
  await db.withTenant(organizationId, async () => {
    const rows = (await db.query(`select field,old_value,new_value,source from organization_identity_history where organization_id=$1 order by field`, [organizationId])).rows;
    const fields = rows.map(r => r.field).sort();
    assert.deepEqual(fields, ['name', 'siren', 'siret']);
    const siret = rows.find(r => r.field === 'siret');
    assert.equal(siret.source, 'registre-public');
    // Re-save sans changement : aucune nouvelle ligne (jamais d'écriture répétée).
  });
  const again = await app.inject({ method: 'PATCH', url: '/organization', headers, payload: { name: 'Atelier Test', activity: 'Réparation', siret: '55210055400013', siren: '552100554' } });
  assert.equal(again.statusCode, 200);
  await db.withTenant(organizationId, async () => {
    const n = Number((await db.query(`select count(*)::int n from organization_identity_history where organization_id=$1`, [organizationId])).rows[0].n);
    assert.equal(n, 3);
  });
});

test('Bloc 05 — acceptation/refus/annulation de devis : décisions horodatées et historisées', { skip }, async () => {
  const mod = await boot(); const { app, db } = mod;
  const { token, organizationId } = await seedAccount(mod);
  const headers = { authorization: `Bearer ${token}` };
  const aid = (await db.withTenant(organizationId, () => db.query(`select id from activities where organization_id=$1 limit 1`, [organizationId]))).rows[0].id;
  const created = await app.inject({ method: 'POST', url: '/quotes', headers, payload: { activityId: aid, intervention: 'Prestation', vatRate: 20, finalPriceTtc: 150 } });
  assert.equal(created.statusCode, 201, created.body);
  const quoteId = created.json().id;
  // Instantanés client écrits à la création (Bloc 06) même sans fiche : nulls honnêtes.
  const acc = await app.inject({ method: 'POST', url: `/quotes/${quoteId}/accept`, headers, payload: {} });
  assert.equal(acc.statusCode, 200, acc.body);
  const reAcc = await app.inject({ method: 'POST', url: `/quotes/${quoteId}/accept`, headers, payload: {} });
  assert.equal(reAcc.statusCode, 409); // ALREADY_CLOSED — idempotence par refus déterministe
  const rejectAfterAccept = await app.inject({ method: 'POST', url: `/quotes/${quoteId}/reject`, headers, payload: { reason: 'trop tard' } });
  assert.equal(rejectAfterAccept.statusCode, 409);
  await db.withTenant(organizationId, async () => {
    const q = (await db.query(`select status,accepted_at from quotes where id=$1`, [quoteId])).rows[0];
    assert.equal(q.status, 'accepted'); assert.ok(q.accepted_at);
    const hist = (await db.query(`select from_status,to_status from document_status_history where document_id=$1 order by created_at`, [quoteId])).rows;
    assert.equal(hist.length, 1); assert.equal(hist[0].to_status, 'accepted');
  });
  // Deuxième devis : refus puis annulation impossible après refus (ALREADY_CLOSED).
  const c2 = await app.inject({ method: 'POST', url: '/quotes', headers, payload: { activityId: aid, intervention: 'Prestation 2', vatRate: 20, finalPriceTtc: 90 } });
  const q2 = c2.json().id;
  const rej = await app.inject({ method: 'POST', url: `/quotes/${q2}/reject`, headers, payload: { reason: 'Client a décliné' } });
  assert.equal(rej.statusCode, 200);
  const acc2 = await app.inject({ method: 'POST', url: `/quotes/${q2}/accept`, headers, payload: {} });
  assert.equal(acc2.statusCode, 409);
});

test('Bloc 06 — suppression encadrée, archivage réversible, fusion auditée de doublons', { skip }, async () => {
  const mod = await boot(); const { app, db } = mod;
  const { token, organizationId } = await seedAccount(mod);
  const headers = { authorization: `Bearer ${token}` };
  const aid = (await db.withTenant(organizationId, () => db.query(`select id from activities where organization_id=$1 limit 1`, [organizationId]))).rows[0].id;
  const c1 = await app.inject({ method: 'POST', url: '/clients', headers, payload: { name: 'Mme Dupont', email: 'dupont@example.test', phone: '0601020304', activityId: aid } });
  const c2 = await app.inject({ method: 'POST', url: '/clients', headers, payload: { name: 'Dupont', email: 'dupont@example.test', activityId: aid } });
  const survivor = c1.json().id, absorbed = c2.json().id;
  // Document envoyé rattaché → suppression refusée (obligations de conservation).
  const q = await app.inject({ method: 'POST', url: '/quotes', headers, payload: { activityId: aid, clientId: survivor, intervention: 'Prestation', vatRate: 20, finalPriceTtc: 200, documentType: 'invoice', sendEmail: false } });
  assert.equal(q.statusCode, 201, q.body);
  await app.inject({ method: 'PATCH', url: `/quotes/${q.json().id}`, headers, payload: { sentAt: undefined } }).catch(() => {});
  await db.withTenant(organizationId, async () => {
    await db.query(`update quotes set sent_at=now() where id=$1`, [q.json().id]);
  });
  const del = await app.inject({ method: 'DELETE', url: `/clients/${survivor}`, headers });
  assert.equal(del.statusCode, 409); assert.equal(del.json().error, 'CLIENT_HAS_SENT_DOCUMENTS');
  // Fusion : refus sans confirmation ni motif, jamais automatique.
  const noConfirm = await app.inject({ method: 'POST', url: `/clients/${survivor}/merge`, headers, payload: { duplicateId: absorbed } });
  assert.equal(noConfirm.statusCode, 400); assert.equal(noConfirm.json().error, 'CONFIRM_REQUIRED');
  const noReason = await app.inject({ method: 'POST', url: `/clients/${survivor}/merge`, headers, payload: { duplicateId: absorbed, confirm: true, reason: '' } });
  assert.equal(noReason.statusCode, 400);
  const merged = await app.inject({ method: 'POST', url: `/clients/${survivor}/merge`, headers, payload: { duplicateId: absorbed, confirm: true, reason: 'Doublon constaté par l\u2019utilisateur' } });
  assert.equal(merged.statusCode, 200, merged.body);
  await db.withTenant(organizationId, async () => {
    const absorbedRow = (await db.query(`select merged_into,archived_at from clients where id=$1`, [absorbed])).rows[0];
    assert.equal(absorbedRow.merged_into, survivor); assert.ok(absorbedRow.archived_at);
    const doc = (await db.query(`select client_id from quotes where id=$1`, [q.json().id])).rows[0];
    assert.equal(doc.client_id, survivor); // document re-pointé vers la fiche conservatrice
    const audit = (await db.query(`select count(*)::int n from client_merges where survivor_id=$1 and absorbed_id=$2`, [survivor, absorbed])).rows[0];
    assert.equal(audit.n, 1);
    // outbox : un événement client_merged publié (Bloc 09)
    const ev = (await db.query(`select status from business_events_outbox where organization_id=$1 and idempotency_key=$2`, [organizationId, `client-merged:${absorbed}`])).rows[0];
    assert.ok(ev); assert.equal(ev.status, 'pending');
  });
  // Archivage réversible + exclusion des listes courantes.
  const arch = await app.inject({ method: 'POST', url: `/clients/${survivor}/archive`, headers, payload: {} });
  assert.equal(arch.statusCode, 200);
  const listed = await app.inject({ method: 'GET', url: '/clients', headers });
  assert.equal(listed.json().some(c => c.id === survivor), false);
  const listedAll = await app.inject({ method: 'GET', url: '/clients?includeArchived=1', headers });
  assert.equal(listedAll.json().some(c => c.id === survivor), true);
});

test('Bloc 07 — collisions d\u2019agenda : 409 déterministe, dérogation audité, indisponibilité prise en compte', { skip }, async () => {
  const mod = await boot(); const { app, db } = mod;
  const { token, organizationId } = await seedAccount(mod);
  const headers = { authorization: `Bearer ${token}` };
  const aid = (await db.withTenant(organizationId, () => db.query(`select id from activities where organization_id=$1 limit 1`, [organizationId]))).rows[0].id;
  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 90000000).toISOString();
  const first = await app.inject({ method: 'POST', url: '/appointments', headers, payload: { activityId: aid, title: 'RDV 1', startsAt: start, endsAt: end } });
  assert.equal(first.statusCode, 201, first.body);
  const overlap = await app.inject({ method: 'POST', url: '/appointments', headers, payload: { activityId: aid, title: 'RDV 2', startsAt: start, endsAt: end } });
  assert.equal(overlap.statusCode, 409); assert.equal(overlap.json().error, 'CALENDAR_CONFLICT');
  assert.ok(overlap.json().conflicts.length >= 1);
  const noReason = await app.inject({ method: 'POST', url: '/appointments', headers, payload: { activityId: aid, title: 'RDV 2', startsAt: start, endsAt: end, allowConflict: true } });
  assert.equal(noReason.statusCode, 400); assert.equal(noReason.json().error, 'CONFLICT_REASON_REQUIRED');
  const override = await app.inject({ method: 'POST', url: '/appointments', headers, payload: { activityId: aid, title: 'RDV 2 (dérogation)', startsAt: start, endsAt: end, allowConflict: true, conflictReason: 'Client prioritaire, dérogation assumée' } });
  assert.equal(override.statusCode, 201, override.body);
  await db.withTenant(organizationId, async () => {
    const aud = (await db.query(`select count(*)::int n from calendar_override_audit where organization_id=$1`, [organizationId])).rows[0];
    assert.equal(aud.n, 1);
  });
  // Indisponibilité : participe aux collisions et à la vue unifiée.
  const unav = await app.inject({ method: 'POST', url: '/agenda/unavailabilities', headers, payload: { startsAt: new Date(Date.now() + 172800000).toISOString(), endsAt: new Date(Date.now() + 176800000).toISOString(), reason: 'Formation' } });
  assert.equal(unav.statusCode, 201, unav.body);
  const clash = await app.inject({ method: 'POST', url: '/appointments', headers, payload: { activityId: aid, title: 'RDV pendant formation', startsAt: new Date(Date.now() + 173800000).toISOString(), endsAt: new Date(Date.now() + 175800000).toISOString() } });
  assert.equal(clash.statusCode, 409);
  const agenda = await app.inject({ method: 'GET', url: '/agenda', headers });
  assert.equal(agenda.statusCode, 200);
  const kinds = new Set(agenda.json().items.map(i => i.kind));
  assert.ok(kinds.has('appointment')); assert.ok(kinds.has('unavailability'));
  // Temps de déplacement : honnête (aucune source de routage configurée → inconnu).
  const travel = await app.inject({ method: 'GET', url: '/appointments/travel-time', headers });
  assert.equal(travel.json().source, 'unknown'); assert.equal(travel.json().minutes, null);
});

test('Bloc 08 — réservations : suppression du devis et du rendez-vous libère les quantités', { skip }, async () => {
  const mod = await boot(); const { app, db } = mod;
  const { token, organizationId } = await seedAccount(mod);
  const headers = { authorization: `Bearer ${token}` };
  const aid = (await db.withTenant(organizationId, () => db.query(`select id from activities where organization_id=$1 limit 1`, [organizationId]))).rows[0].id;
  const part = await app.inject({ method: 'POST', url: '/parts', headers, payload: { name: 'Écran test', activityId: aid, stock: 5, sellingPrice: 60 } });
  const partId = part.json().id;
  const q = await app.inject({ method: 'POST', url: '/quotes', headers, payload: { activityId: aid, intervention: 'Réparation', vatRate: 20, finalPriceTtc: 120 } });
  const quoteId = q.json().id;
  const res = await app.inject({ method: 'POST', url: '/stock/reservations', headers, payload: { partId, quantity: 2, quoteId } });
  assert.equal(res.statusCode, 201, res.body);
  const summary1 = await app.inject({ method: 'GET', url: '/stock/summary', headers });
  assert.equal(summary1.json().parts[0].available, 3);
  const del = await app.inject({ method: 'DELETE', url: `/quotes/${quoteId}`, headers });
  assert.equal(del.statusCode, 200);
  const summary2 = await app.inject({ method: 'GET', url: '/stock/summary', headers });
  assert.equal(summary2.json().parts[0].available, 5); // réservation libérée avec le document
  await db.withTenant(organizationId, async () => {
    const r = (await db.query(`select status from part_reservations where quote_id=$1`, [quoteId])).rows[0];
    assert.equal(r.status, 'released');
  });
});

test('Bloc 09 — outbox : publication idempotente, livraison au journal, lettre morte et rejeu contrôlé', { skip }, async () => {
  const mod = await boot(); const { app, db } = mod;
  const { token, organizationId, userId } = await seedAccount(mod);
  const headers = { authorization: `Bearer ${token}` };
  const year = new Date().getFullYear();
  const closed = await app.inject({ method: 'POST', url: `/accounting/periods/${year}/close`, headers, payload: { note: 'Recette' } });
  assert.equal(closed.statusCode, 200, closed.body);
  await db.withTenant(organizationId, async () => {
    const rows = (await db.query(`select id,status,attempts from business_events_outbox where organization_id=$1 and event_type='accounting_period_closed'`, [organizationId])).rows;
    assert.equal(rows.length, 1);
    // Livraison par le worker (canal journal) — idempotent par dedupe_key.
    const { processOutboxQueue } = await import('../dist/services/events-outbox.js');
    const sweep = await processOutboxQueue({ warn: () => {}, error: () => {}, info: () => {} });
    assert.ok(sweep.claimed >= 1);
    const after = (await db.query(`select status,processed_at from business_events_outbox where id=$1`, [rows[0].id])).rows[0];
    assert.equal(after.status, 'processed'); assert.ok(after.processed_at);
    const journal = (await db.query(`select count(*)::int n from dashboard_journal_events where organization_id=$1 and dedupe_key=$2`, [organizationId, `outbox:${rows[0].id}`])).rows[0];
    assert.equal(journal.n, 1);
    // Lettre morte simulée : échec de livraison → backoff, puis rejeu contrôlé avec motif.
    await db.query(`update business_events_outbox set status='dead_lettered',attempts=5 where id=$1`, [rows[0].id]);
  });
  const list = await app.inject({ method: 'GET', url: '/journal/outbox', headers });
  assert.equal(list.statusCode, 200);
  const evId = list.json().events.find(e => e.status === 'dead_lettered')?.id;
  assert.ok(evId);
  const noReason = await app.inject({ method: 'POST', url: `/journal/outbox/${evId}/replay`, headers, payload: {} });
  assert.equal(noReason.statusCode, 400);
  const replay = await app.inject({ method: 'POST', url: `/journal/outbox/${evId}/replay`, headers, payload: { reason: 'Redelivery après incident résolu' } });
  assert.equal(replay.statusCode, 200);
  // Période rouverte : événement distinct, clôture réversible (action humaine).
  const reopened = await app.inject({ method: 'POST', url: `/accounting/periods/${year}/reopen`, headers, payload: {} });
  assert.equal(reopened.statusCode, 200);
});

test('Bloc 03 — POST /pricing/calculate expose les extensions (marque, consommables, remise)', { skip }, async () => {
  const mod = await boot(); const { app } = mod;
  const { token } = await seedAccount(mod);
  const r = await app.inject({ method: 'POST', url: '/pricing/calculate', headers: { authorization: `Bearer ${token}` }, payload: { partCost: 45, shippingCost: 5, vatRate: 20, urssafRate: 22, targetTtc: 120, driver: 'ttc', consumablesCostHt: 10, discountTtc: 20 } });
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.equal(j.consumablesCostHt, 10); assert.equal(j.discountTtc, 20); assert.equal(j.listPriceTtc, 120);
  assert.equal(j.totalTtc, 100);
});
