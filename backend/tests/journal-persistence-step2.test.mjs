import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('../..',import.meta.url).pathname);
const business=fs.readFileSync(path.join(root,'backend/src/routes/business.ts'),'utf8');
const other=fs.readFileSync(path.join(root,'assets/js/pages/dash/other.js'),'utf8');

test('étape 2: le journal est fourni par le backend et n’est plus reconstruit depuis des compteurs volatils',()=>{
  assert.match(business,/return \{[\s\S]*journal:/,'le résumé dashboard doit exposer un journal persistant/déterministe');
  assert.match(other,/S\.dashboardCounters\?\.journal/,'le dashboard doit rendre le journal fourni par le backend');
  assert.doesNotMatch(other,/const c=S\.dashboardCounters\|\|\{\},items=\[\];/,'le journal ne doit plus être reconstruit uniquement au rendu frontend');
});
