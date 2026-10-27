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
  assert.match(summary, /await monthlyAccounting\(org,aid,accountingYear\)/);
});

test('monthly accounting executes independent invoice and accounting-entry queries concurrently', () => {
  assert.match(accounting, /const \[inv,ent\]=await Promise\.all\(\[query\(/);
  assert.match(accounting, /query\(\x60select date_trunc\('month',entry_date\)/);
});
