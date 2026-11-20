// Bloc 10 — Calendrier fiscal et alertes de seuils.
// Échéances URSSAF selon la périodicité déclarée (bloc 9), seuils 2026 officiels,
// alertes 80/90/100 % (marges configurables) factuelles, dédupliquées au journal,
// ne bloquant jamais la facturation, sans e-mail sans consentement.
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

test('bloc10: unitaire — seuils 2026 officiels, jours fériés, report au jour ouvré, échéances', async () => {
  const fc = await import(new URL('../dist/services/fiscal-calendar.js', import.meta.url).pathname);
  // Seuils 2026 vérifiés le 14 novembre 2026 (economie.gouv.fr / service-public / impots.gouv).
  assert.equal(fc.THRESHOLDS_2026.sale, 203100);
  assert.equal(fc.THRESHOLDS_2026.services, 83600);
  assert.equal(fc.THRESHOLDS_2026.vatSaleBase, 85000);
  assert.equal(fc.THRESHOLDS_2026.vatServicesBase, 37500);
  assert.equal(fc.THRESHOLDS_2026.vatSaleMajorated, 93500);
  assert.equal(fc.THRESHOLDS_2026.vatServicesMajorated, 41250);
  // Pâques 2026 = dimanche 5 avril 2026 ; lundi de Pâques = 6 avril.
  const holidays = fc.frenchPublicHolidays(2026);
  assert.ok(holidays.has('2026-04-05'));
  assert.ok(holidays.has('2026-04-06'));
  assert.ok(holidays.has('2026-07-14'));
  assert.ok(holidays.has('2026-05-01'));
  assert.equal(holidays.size, 12);
  // Échéance tombant un jour férié (vendredi 1er mai 2026) → lundi 4 mai 2026.
  assert.equal(fc.nextBusinessDay('2026-05-01'), '2026-05-04');
  // Échéance tombant un week-end (samedi 28 février 2026) → lundi 2 mars 2026.
  assert.equal(fc.nextBusinessDay('2026-02-28'), '2026-03-02');
  // Échéances : trimestrielle = 4, mensuelle = 12, non déclarée = 0 (aucune date fiable).
  assert.equal(fc.urssafDeadlines(2026, 'trimestrielle').length, 4);
  assert.equal(fc.urssafDeadlines(2026, 'mensuelle').length, 12);
  assert.equal(fc.urssafDeadlines(2026, null).length, 0);
  const q1 = fc.urssafDeadlines(2026, 'trimestrielle')[0];
  assert.equal(q1.periodStart, '2026-01-01');
  assert.equal(q1.periodEnd, '2026-03-31');
  // Fin de mois suivant le trimestre = 30 avril 2026 (jeudi) → pas de report.
  assert.equal(q1.dueDate, '2026-04-30');
  assert.equal(q1.shifted, false);
  // Statuts de seuils : alertes 80/90/100 %, aucun blocage, messages factuels.
  const statuses = fc.thresholdStatuses([{ kind: 'vente', caHt: 180000 }, { kind: 'services', caHt: 100000 }], 2026);
  const sale = statuses.find(s => s.kind === 'vente');
  assert.equal(sale.threshold, 203100);
  assert.ok(Math.abs(sale.ratio - 180000 / 203100) < 0.001);
  // 180 000 / 203 100 ≈ 88,6 % → alerte 80 % atteinte, 90 % pas encore.
  assert.deepEqual(sale.alertLevels.map(a => a.percent), [80]);
  const services = statuses.find(s => s.kind === 'services');
  assert.deepEqual(services.alertLevels.map(a => a.percent), [80, 90, 100]);
  assert.match(services.message, /aucune modification automatique|Aucun chiffre/);
  // Marge à 100 % franchie → message renvoyant vers l'URSSAF/l'expert-comptable, jamais un refus.
  const vatServices = statuses.find(s => s.kind === 'vat_services');
  assert.equal(vatServices.threshold, 37500);
  // 100 000 / 37 500 ≈ 267 % → toutes les marges configurées sont franchies.
  assert.deepEqual(vatServices.alertLevels.map(a => a.percent), [80, 90, 100]);
  assert.match(vatServices.message, /impots\.gouv\.fr|Franchise/);
  // Marges personnalisées (ex. 50 %) acceptées — configurables.
  const custom = fc.thresholdStatuses([{ kind: 'vente', caHt: 110000 }], 2026, [0.5]);
  assert.deepEqual(custom.find(s => s.kind === 'vente').alertLevels.map(a => a.percent), [50]);
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
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 10')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `bloc10-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 10')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('bloc10: calendrier + seuils servis, alertes dédupliquées au journal, marges configurables, aucun blocage', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const B = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };
  const authB = { authorization: `Bearer ${B.token}` };

  // Facture « vente » à 90 % du seuil (182 790 €) : alertes 80 et 90 % attendues, pas de blocage.
  const inv = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: { documentType: 'invoice', intervention: 'Vente matériel', activityCategory: 'vente_bic',
      items: [{ label: 'Matériel', quantity: 1, unitCost: 0, unitPrice: 182790, activityCategory: 'vente_bic' }],
      vatRate: 0, urssafRate: 0, allowLoss: true },
  });
  assert.equal(inv.statusCode, 201, inv.body);

  // Périodicité non déclarée : échéances vides + note d'orientation (pas de date inventée).
  const cal0 = (await mod.app.inject({ method: 'GET', url: `/fiscal-calendar?year=2026`, headers: auth })).json();
  assert.equal(cal0.deadlines.length, 0);
  assert.match(cal0.periodicityNote, /périodicité/);

  // Périodicité trimestrielle déclarée (bloc 9) → 4 échéances.
  await mod.app.inject({ method: 'PATCH', url: '/organization', headers: auth, payload: { name: 'Micro A', activity: 'Test', urssafPeriodicity: 'trimestrielle', urssafPeriodicityEffectiveFrom: '2026-01-01' } });
  const cal = (await mod.app.inject({ method: 'GET', url: `/fiscal-calendar?year=2026`, headers: auth })).json();
  assert.equal(cal.deadlines.length, 4);
  assert.equal(cal.periodicity, 'trimestrielle');
  assert.match(cal.disclaimer, /sans conseil fiscal/);
  const sale = cal.thresholds.find(t => t.kind === 'vente');
  assert.equal(sale.caHt, 182790);
  assert.deepEqual(sale.alertLevels.map(a => a.percent), [80, 90]);

  // Alerte journal dédupliquée : un second appel ne duplique AUCUN événement.
  const count1 = (await mod.db.withTenant(A.organizationId, () => mod.db.query("select count(*)::int n from dashboard_journal_events where event_type='fiscal_threshold'"))).rows[0].n;
  await mod.app.inject({ method: 'GET', url: `/fiscal-calendar?year=2026`, headers: auth });
  const count2 = (await mod.db.withTenant(A.organizationId, () => mod.db.query("select count(*)::int n from dashboard_journal_events where event_type='fiscal_threshold'"))).rows[0].n;
  assert.equal(count1, count2, 'une seule alerte par seuil (déduplication)');
  assert.ok(count1 >= 4, '80 % et 90 % sur vente + TVA vente');

  // Marges configurables (50 %) → nouvelle alerte sans toucher aux factures ni bloquer.
  const margins = await mod.app.inject({ method: 'PUT', url: '/fiscal-calendar/margins', headers: auth, payload: { margins: [0.5, 1] } });
  assert.equal(margins.statusCode, 200);
  const badMargins = await mod.app.inject({ method: 'PUT', url: '/fiscal-calendar/margins', headers: auth, payload: { margins: [5] } });
  assert.equal(badMargins.statusCode, 400);
  const cal2 = (await mod.app.inject({ method: 'GET', url: `/fiscal-calendar?year=2026`, headers: auth })).json();
  const sale2 = cal2.thresholds.find(t => t.kind === 'vente');
  // Marges reconfigurées à [50 %, 100 %] : SEULES ces marges produisent des alertes (90 % n'est plus configurée).
  assert.deepEqual(sale2.alertLevels.map(a => a.percent), [50]);
  // La facture reste intacte (aucun blocage, aucune modification de facturation) :
  // la ligne et son prix de vente sont conservés tels qu'enregistrés.
  const docs = (await mod.app.inject({ method: 'GET', url: '/quotes', headers: auth })).json();
  const savedDoc = docs.find(x => x.number === inv.json().number);
  assert.ok(savedDoc);
  assert.equal(Number(savedDoc.items[0].unitPrice), 182790);

  // Isolation A/B : B ne voit ni les seuils de A ni ses alertes journal.
  const calB = (await mod.app.inject({ method: 'GET', url: `/fiscal-calendar?year=2026`, headers: authB })).json();
  const saleB = calB.thresholds.find(t => t.kind === 'vente');
  assert.equal(saleB.caHt, 0);
  assert.equal(saleB.alertLevels.length, 0);
  const journalB = (await mod.db.withTenant(B.organizationId, () => mod.db.query("select count(*)::int n from dashboard_journal_events where event_type='fiscal_threshold'"))).rows[0].n;
  assert.equal(journalB, 0);
});
