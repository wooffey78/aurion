import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('PATCH /parts preserves omitted fields but accepts an explicit stock value of zero', () => {
  const route = read('backend/src/routes/business.ts');
  assert.ok(route.includes("const current=(await query('select * from parts where id=$1 and organization_id=$2',[id,org])).rows[0]"));
  assert.ok(route.includes("if(b.stock!==undefined)"));
  assert.ok(route.includes("if(b.sellingPrice!==undefined)"));
  assert.ok(route.includes("if(b.saleCoefficientPercent!==undefined)"));
  assert.ok(route.includes("keepOrClear=(key:string,oldValue:unknown)=>b[key]===undefined?oldValue"));
});

test('account sync does not rewrite stock zero or fetch all parts during PATCH', () => {
  const sync = read('assets/js/account-sync.js');
  assert.ok(!sync.includes("method==='PATCH'"));
  assert.ok(!sync.includes('body.stock=part.stock'));
  assert.ok(!sync.includes("nativeFetch('/parts'"));
});
