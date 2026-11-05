import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const routes = readFileSync(new URL('backend/src/routes/business.ts', root), 'utf8');
const accounting = readFileSync(new URL('backend/src/services/accounting.ts', root), 'utf8');
const summary = routes.slice(routes.indexOf("app.get('/dashboard/summary'"), routes.indexOf("app.get('/accounting/summary'"));

test('dashboard summary executes independent reads concurrently without changing response fields', () => {
  assert.match(summary, /const \[aid,t\]=await Promise\.all\(/);
  assert.match(summary, /const \[u,f,r4,historicalResult,warrResult,appointmentsResult,subResult,yearAccounting\]=await Promise\.all\(/);
  assert.match(summary, /monthlyAccounting\(org,aid,accountingYear\)/);
  assert.doesNotMatch(summary, /const yearAccounting=await monthlyAccounting/);
  for (const field of ['tickets:', 'unpaidCount:', 'unpaidTotal:', 'forecastEntries:', 'fourthReminderCount:', 'forecast,', 'subscription:sub', 'warranty:', 'trialDaysLeft,journal']) {
    assert.ok(summary.includes(field), `dashboard summary response contract must retain ${field}`);
  }
});

test('monthly accounting executes independent invoice and accounting-entry queries concurrently', () => {
  // Cahier des charges 15.4.0 (notes de frais) : une troisième requête indépendante, toujours exécutée en parallèle.
  assert.match(accounting, /const \[inv,ent,exp\]=await Promise\.all\(\[query\(/);
  assert.match(accounting, /from expense_reports where organization_id=\$1 and activity_id=\$2/);
  assert.match(accounting, /query\(\x60select date_trunc\('month',entry_date\)/);
});
