import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const business=fs.readFileSync(path.join(root,'backend/src/routes/business.ts'),'utf8');
const other=fs.readFileSync(path.join(root,'assets/js/pages/dash/other.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/css/app.css'),'utf8');

test('étape 31: journal priorisé par urgence puis date avec scroll Aurion',()=>{
  assert.match(business,/journal\.sort\(\(a:any,b:any\)=>/,'le backend doit trier le journal');
  assert.match(business,/rank=\(x:any\)=>x\.severity==='red'\?0:1/,'le tri doit placer les urgences rouges avant les jaunes');
  assert.match(business,/sortAt|due_at|starts_at/,'le tri doit disposer d’une date de référence');
  assert.match(other,/class="list" role="region" aria-label="Journal de bord"/,'le journal doit exposer une région dédiée au scroll');
  assert.match(css,/\.journal-board \.list\{[\s\S]*overflow-y:auto/,'la liste du journal doit être scrollable');
  assert.match(css,/\.journal-board \.list-row\{[\s\S]*padding-left/,'la barre latérale doit être espacée du texte');
});
