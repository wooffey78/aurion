import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.AURION_TEST_ROOT || path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

const migration = fs.readFileSync(path.join(root, 'backend/migrations/042_profile_pricing_7_70.sql'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'backend/migrations/009_accounts_legal_billing.sql'), 'utf8');
const account = fs.readFileSync(path.join(root, 'assets/js/pages/dash/account.js'), 'utf8');
const route = fs.readFileSync(path.join(root, 'backend/src/routes/account.ts'), 'utf8');

function ttc(htCents){ return Math.round(Number(htCents) * 1.2); }

test('profil: essai 60 jours et tarifs 7€/70€ TTC cohérents avec affichage, paiement et facturation', () => {
  assert.match(schema, /trial_days integer not null default 60/);
  assert.match(schema, /\('monthly','Aurion mensuel',\d+,'month',60\)/);
  assert.match(schema, /\('yearly','Aurion annuel',\d+,'year',60\)/);
  assert.match(migration, /price_ht_cents = case code[\s\S]*when 'monthly' then 583[\s\S]*when 'yearly' then 5833/);
  assert.equal(ttc(583), 700);
  assert.equal(ttc(5833), 7000);
  assert.match(account, /price_ht_cents\).*1\.2/);
  assert.match(route, /price_ht_cents\).*1\.20/);
});
