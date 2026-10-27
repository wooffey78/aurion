import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/accounting.ts', import.meta.url), 'utf8');

test('monthlyAccounting quotes the PostgreSQL month alias in both monthly queries', () => {
  assert.match(source, /date_trunc\('month',paid_at\)::date as "month"/);
  assert.match(source, /date_trunc\('month',entry_date\)::date as "month"/);
  assert.doesNotMatch(source, /date_trunc\('month',(?:paid_at|entry_date)\)::date month\b/);
});

test('monthlyAccounting keeps the year filter parameterized and the output row contract stable', () => {
  assert.match(source, /date_trunc\('year',paid_at\)=make_date\(\$3,1,1\)/);
  assert.match(source, /date_trunc\('year',entry_date\)=make_date\(\$3,1,1\)/);
  assert.match(source, /interface MonthRow \{ month:string; revenueHt:number/);
  assert.match(source, /r\.month\.toISOString\(\)/);
});

test('PostgreSQL parses the quoted month alias in the integration environment', {
  skip: process.env.AURION_INTEGRATION_TESTS !== '1'
}, async () => {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query("SELECT date_trunc('month', CURRENT_DATE)::date AS \"month\"");
    assert.ok(result.rows[0].month instanceof Date || typeof result.rows[0].month === 'string');
  } finally {
    await client.end();
  }
});
