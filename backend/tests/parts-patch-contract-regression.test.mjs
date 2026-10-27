import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('PATCH /parts preserves omitted fields but accepts an explicit stock value of zero', () => {
  const route = read('backend/src/routes/business.ts');
  assert.match(route, /const current=\\(await query\\('select \\* from parts where id=\\$1 and organization_id=\\$2'/);
  assert.match(route, /if\\(b\\.stock!==undefined\\)\\{stock=optionalNumber\\(b\\.stock,'Stock'/);
  assert.match(route, /if\\(b\\.sellingPrice!==undefined\\)sellingPrice=optionalNumber\\(b\\.sellingPrice/);
  assert.match(route, /if\\(b\\.saleCoefficientPercent!==undefined\\)saleCoefficient=optionalNumber\\(b\\.saleCoefficientPercent/);
  assert.match(route, /keepOrClear=\\(key:string,oldValue:unknown\\)=>b\\[key\\]===undefined\\?oldValue/);
});

test('account sync no longer rewrites an intentional stock zero or fetches the full parts list during PATCH', () => {
  const sync = read('assets/js/account-sync.js');
  assert.doesNotMatch(sync, /method==='PATCH'&&\\/parts/);
  assert.doesNotMatch(sync, /body\\.stock=part\\.stock/);
  assert.doesNotMatch(sync, /nativeFetch\\('\\/parts'/);
  assert.match(sync, /invoices/);
});
