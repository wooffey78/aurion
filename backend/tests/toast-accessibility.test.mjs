import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root=new URL('../..',import.meta.url);
const ui=readFileSync(new URL('assets/js/core/ui.js',root),'utf8');
const css=readFileSync(new URL('assets/css/app.css',root),'utf8');

test('les notifications rendent les succès et erreurs disponibles aux lecteurs d’écran',()=>{
  assert.match(ui,/role','region'/);
  assert.match(ui,/aria-label','Notifications Aurion'/);
  assert.match(ui,/type==='error'\?'alert':'status'/);
  assert.match(ui,/aria-atomic','true'/);
});

test('les notifications restent visibles sur petits écrans avec zone de sécurité mobile',()=>{
  assert.match(css,/@media\(max-width:700px\)\{\.toast-region\{left:12px;right:12px;bottom:calc\(12px \+ env\(safe-area-inset-bottom,0px\)\)\}/);
  assert.match(css,/\.toast\{overflow-wrap:anywhere\}/);
});
