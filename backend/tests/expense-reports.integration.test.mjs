// Notes de frais (cahier des charges 15.4.0) : prise en compte par le moteur de calcul comptable.
// Prérequis : « npm run build » et DATABASE_URL vers une base de test migrée ; sinon test ignoré avec la raison.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const accPath = process.env.AURION_ACCOUNTING_TEST_MODULE || fileURLToPath(new URL('../dist/services/accounting.js', import.meta.url));
const dbPath = process.env.AURION_CLOUD_TEST_DB_MODULE || fileURLToPath(new URL('../dist/db.js', import.meta.url));
const ready = existsSync(accPath) && existsSync(dbPath) && Boolean(process.env.DATABASE_URL);
const skip = ready ? false : 'dist/ absent ou DATABASE_URL non défini : exécuter après « npm run build » sur une base de test migrée';

test('les notes de frais alimentent les achats HT et la TVA déductible du mois de la dépense', { skip }, async () => {
  const { monthlyAccounting } = await import(accPath); const { query } = await import(dbPath);
  const org = crypto.randomUUID(), act = crypto.randomUUID();
  await query(`insert into organizations(id,name,activity) values($1,'NDF test','Test')`, [org]);
  try {
    await query(`insert into activities(id,organization_id,code,name) values($1,$2,'ndf','Activité NDF')`, [act, org]);
    await query(`insert into expense_reports(organization_id,activity_id,spent_on,label,amount_ttc,vat_amount) values($1,$2,'2026-03-10','Péage',12.00,2.00),($1,$2,'2026-03-20','Repas',30.00,0),($1,$2,'2025-12-31','Hors année',100,0)`, [org, act]);
    await assert.rejects(query(`insert into expense_reports(organization_id,activity_id,label,amount_ttc,vat_amount) values($1,$2,'TVA > TTC',10,20)`, [org, act]));
    const months = await monthlyAccounting(org, act, 2026);
    const march = months.find(m => new Date(m.month).toISOString().startsWith('2026-03'));
    assert.ok(march, 'mois de mars présent');
    assert.equal(Number(march.purchases.toFixed(2)), 40);
    assert.equal(Number(march.purchaseVat.toFixed(2)), 2);
    assert.equal(Number(march.expenseReports.toFixed(2)), 40);
    assert.equal(months.some(m => new Date(m.month).getUTCFullYear() === 2025), false, 'filtre annuel respecté');
  } finally { await query('delete from organizations where id=$1', [org]); }
});
