import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const business=fs.readFileSync(path.join(root,'backend/src/routes/business.ts'),'utf8');
const accounting=fs.readFileSync(path.join(root,'backend/src/services/accounting.ts'),'utf8');
const other=fs.readFileSync(path.join(root,'assets/js/pages/dash/other.js'),'utf8');

test('les SAV financiers négatifs sont intégrés à la comptabilité et au prévisionnel de trésorerie, sans double comptage',()=>{
  assert.match(accounting,/sum\(case when entry_type='sav' then amount else 0 end\)/);
  assert.match(accounting,/cur\.revenueHt\+=n\(r\.sav\)/);
  assert.match(business,/documentForecastEntries\(org,aid\)/);
  assert.match(business,/forecastEntries:cashForecast\.entries/);
  assert.match(business,/forecastNet:cashForecast\.entries-forecastOut-expenseToReimburse/);
  assert.match(business,/savDeduction:savTotal/);
  const forecastService=fs.readFileSync(path.join(root,'backend/src/services/document-forecast.ts'),'utf8');
  assert.match(forecastService,/from sav_cases/);
  assert.match(forecastService,/sav_type='financial'/);
  assert.match(forecastService,/sum\(amount_ttc\)/);
  assert.match(business,/s\.amount_ttc\/nullif/);
  assert.match(other,/savTotal=\(S\.sav\|\|\[\]\)\.filter/);
  assert.match(other,/S\.treasury\?\.committedIn/);
  assert.match(other,/S\.treasury\?\.savTotal/);
});
