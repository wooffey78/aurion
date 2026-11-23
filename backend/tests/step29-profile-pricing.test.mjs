import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.AURION_TEST_ROOT || path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const migration = fs.readFileSync(path.join(root, 'backend/migrations/053_subscription_pricing_14_month_10pct_yearly.sql'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'backend/migrations/009_accounts_legal_billing.sql'), 'utf8');
const accountUi = fs.readFileSync(path.join(root, 'assets/js/pages/dash/account.js'), 'utf8');
const route = fs.readFileSync(path.join(root, 'backend/src/routes/account.ts'), 'utf8');
const money = fs.readFileSync(path.join(root, 'backend/src/services/money.ts'), 'utf8');

function ttc(htCents, vatBps = 2000) { return Number((BigInt(htCents) * (10_000n + BigInt(vatBps)) + 5_000n) / 10_000n); }

test('profil: essai 60 jours et tarifs 14€/151,20€ TTC cohérents avec affichage et paiement', () => {
  assert.match(schema, /trial_days integer not null default 60/);
  assert.match(schema, /\('monthly','Aurion mensuel',\d+,'month',60\)/);
  assert.match(schema, /\('yearly','Aurion annuel',\d+,'year',60\)/);
  assert.match(migration, /price_ht_cents = case code[\s\S]*when 'monthly' then 1167[\s\S]*when 'yearly' then 12600/);
  assert.equal(ttc(1167), 1400);
  assert.equal(ttc(12600), 15120);
  assert.match(money, /BigInt\(ht\) \* \(10_000n \+ BigInt\(bps\)\) \+ 5_000n/);
  assert.match(route, /calculateTtcCents\(Number\(plan\.price_ht_cents\)\)/);
  assert.match(accountUi, /price_ttc_cents/);
  assert.doesNotMatch(accountUi, /price_ht_cents\)\*1\.2/);
});
