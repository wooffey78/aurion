// Contrats statiques du stockage cloud, des notes de frais et de la rétractation dans « Mon compte » (15.4.0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const drive = read('../src/services/cloud-drive.ts'), routes = read('../src/routes/cloud.ts'), app = read('../src/app.ts');
const migration = read('../migrations/073_cloud_storage_expense_reports_onboarding.sql');

test('autorisation Drive minimale, distincte de la connexion Aurion, state à usage unique', () => {
  assert.match(drive, /DRIVE_SCOPES = \[DRIVE_SCOPE\]/);
  assert.match(drive, /auth\/drive\.file'/);
  assert.doesNotMatch(drive, /auth\/drive'|drive\.readonly|auth\/drive\.metadata/);
  assert.match(routes, /delete from cloud_oauth_states where state=\$1 and expires_at>now\(\) returning/);
  assert.match(routes, /if \(q\.error\)/);
  assert.match(app, /cloudRoutes/); assert.match(app, /expenseReportRoutes/);
});

test('toutes les routes cloud (hors retour OAuth) exigent une session et filtrent par entreprise', () => {
  const priv = routes.slice(routes.indexOf("priv.addHook('onRequest', app.requireAuth)"));
  assert.ok(priv.length > 0);
  for (const r of ["'/cloud/status'", "'/cloud/google/start'", "'/cloud/connection'", "'/cloud/quota/refresh'", "'/cloud/documents'", "'/cloud/business/:kind/:id'", "'/cloud/documents/:id/content'"]) assert.ok(priv.includes(r), r);
  assert.match(drive, /select \* from cloud_documents where organization_id=\$1 and id=\$2/);
});

test('jetons chiffrés, jamais renvoyés ; quota et seuils centralisés ; aucune fausse confirmation', () => {
  assert.match(drive, /encrypt\(tokens\.access_token\)/);
  assert.doesNotMatch(read('../src/services/cloud-drive.ts').match(/export async function cloudStatus[\s\S]*?\n}\n/)[0], /token/);
  assert.match(drive, /AURION_CLOUD_QUOTA_THRESHOLDS \|\| '80,90,95,100'/);
  assert.match(drive, /Capacité totale non communiquée|totalKnown/);
  assert.match(drive, /md5Checksum[\s\S]*!== md5/);
  assert.match(drive, /'cloud-quota'/);
  assert.match(drive, /appProperties has/);
  assert.match(drive, /ISSUED_DOCUMENT_LOCKED/);
});

test('arborescence attendue par le cahier des charges', () => {
  for (const n of ['Aurion — Mon entreprise', '01_Administratif', '02_Clients', '03_Fournisseurs', '04_Devis', '05_Factures', '06_Achats_et_depenses', '07_Notes_de_frais', '08_Exports_comptables', '09_Archives']) assert.ok(drive.includes(n), n);
});

test('migration 073 strictement additive', () => {
  assert.doesNotMatch(migration, /\bdrop\s+(table|column|index)\b|\bdelete\s+from\b|\btruncate\b|\balter\s+column\b/i);
  assert.match(migration, /create table if not exists expense_reports/);
});

test('file locale : IndexedDB, identifiant unique, confirmation avant suppression de la copie', () => {
  const sync = read('../../assets/js/core/cloud-sync.js');
  assert.match(sync, /indexedDB\.open/);
  assert.match(sync, /clientRef/);
  assert.match(sync, /status:r\.status==='conflict'\?'conflict':'synced',blob:null/);
  assert.match(sync, /addEventListener\('online'/);
  assert.match(sync, /navigator\.storage\.persist/);
});

test('notes de frais : ajout, consultation, téléchargement, suppression, transfert cloud, calculs', () => {
  const ui = read('../../assets/js/pages/dash/expenses.js'), r = read('../src/routes/expense-reports.ts'), b = read('../src/routes/business.ts');
  for (const x of ['#expense-add', 'data-exp-view', 'data-exp-download', 'data-exp-delete', 'data-exp-cloud']) assert.ok(ui.includes(x), x);
  for (const x of ["app.get('/expense-reports'", "app.post('/expense-reports'", "app.patch('/expense-reports/:id'", "app.delete('/expense-reports/:id'"]) assert.ok(r.includes(x), x);
  assert.match(b, /forecastOutputs:forecastOut\+expenseToReimburse/);
});

test('rétractation : absente de la barre latérale, présente dans Mon compte, logique unique', () => {
  assert.doesNotMatch(read('../../assets/js/pages/dashboard.js'), /withdrawal-nav-link|#\/withdrawal/);
  assert.match(read('../../assets/js/pages/dash/account.js'), /id="account-withdrawal"/);
  const acc = read('../src/routes/account.ts');
  assert.match(acc, /app\.post\('\/billing\/withdrawal'[^\n]*withdrawalHandler\(false\)\)/);
  assert.match(acc, /app\.post\('\/account\/withdrawal'[^\n]*withdrawalHandler\(true\)\)/);
  assert.match(read('../../assets/js/main.js'), /if\(r==='\/withdrawal'\)return renderWithdrawal\(\)/);
});
