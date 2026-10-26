import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const business=fs.readFileSync('backend/src/routes/business.ts','utf8');
const accounting=fs.readFileSync('backend/src/services/accounting.ts','utf8');
const other=fs.readFileSync('assets/js/pages/dash/other.js','utf8');

test('étape 8 — les SAV négatifs sont déduits de la comptabilité et des prévisionnels',()=>{
  assert.match(business,/sum\(amount_ttc\).*sav_cases/);
  assert.match(business,/const hist=\(Number\(paid\?\.total\|\|0\)\+savTotal\)\/6/);
  assert.match(business,/const nextMonth=open\+savTotal/);
  assert.match(business,/const forecastIn=rows\.reduce/);
  assert.match(business,/forecastEntries:forecastIn\+savTotal/);
  assert.match(accounting,/cur\.revenueHt \+= Number\(r\.sav \|\| 0\)/);
  assert.match(other,/savTotal=\(S\.sav\|\|\[\]\)\.reduce/);
  assert.match(other,/ca=inv\.reduce.*\+savTotal/);
});
