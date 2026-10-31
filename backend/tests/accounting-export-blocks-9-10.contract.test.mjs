import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const documents = readFileSync(path.resolve(here, '../src/routes/documents.ts'), 'utf8');
const business = readFileSync(path.resolve(here, '../src/routes/business.ts'), 'utf8');

test('full export includes a separate accounting PDF for every active organization activity', () => {
  assert.match(documents, /select id,name from activities where organization_id=\$1 and active=true order by created_at/);
  assert.match(documents, /accountingReportsExpected=activeActivities\.length/);
  assert.match(documents, /for\(let activityIndex=0;activityIndex<activeActivities\.length;activityIndex\+\+\)/);
  assert.match(documents, /accountingReportsIncluded\+\+/);
  assert.match(documents, /accountingReports:'rapport\(s\) comptable\(s\) PDF'/);
  assert.match(documents, /Accounting PDF omitted from data export/);
  assert.match(documents, /comptabilite\/comptabilite-\$\{accountingReportYear\}\.pdf/);
});

test('direct CSV export applies the same bounded integer year rule as the ZIP export', () => {
  const start = business.indexOf("app.get('/accounting/report.csv'");
  assert.ok(start >= 0, 'CSV route should exist');
  const route = business.slice(start);
  assert.match(route, /const requestedYear=Number\(\(r\.query as any\)\?\.year\)/);
  assert.match(route, /Number\.isInteger\(requestedYear\)&&requestedYear>=1900&&requestedYear<=2100/);
  assert.match(route, /filename="export-comptable-\$\{year\}\.csv"/);
});
