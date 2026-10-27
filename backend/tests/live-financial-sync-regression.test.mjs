import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('synchronisation live : 1 seconde, sans rechargement et sans réécriture du stock',()=>{
  const s=read('../../assets/js/account-sync.js');
  assert.match(s,/window\\.setInterval\\(poll,1000\\)/);
  assert.doesNotMatch(s,/location\\.reload\\(/);
  assert.match(s,/invoices/);
  assert.match(s,/delete body\\[key\\]/);
  assert.doesNotMatch(s,/body\\.stock=part\\.stock/);
  assert.doesNotMatch(s,/nativeFetch\\('\\/parts'/);
  assert.match(s,/home-forecast-3m/);
  assert.match(s,/accounting\\/summary/);
  assert.match(s,/treasury\\/summary/);
});

test('les routes financières nécessaires restent présentes',()=>{
  const b=read('../src/routes/business.ts');
  for(const x of ['/dashboard/summary','/accounting/summary','/treasury/summary'])assert.match(b,new RegExp(x.replaceAll('/','\\\\/')));
  assert.match(b,/invoice_payments/);
  assert.match(b,/accounting_entries/);
});
