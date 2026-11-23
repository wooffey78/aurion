import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('mobile : le formulaire tient compte du visual viewport et du clavier virtuel',()=>{
  const main=read('../../assets/js/main.js');
  const css=read('../../assets/css/mobile-keyboard.css');
  assert.match(main,/visualViewport/);
  assert.match(main,/keyboard-open/);
  assert.match(main,/scrollIntoView\(\{ block: 'center'/);
  assert.match(css,/var\(--aurion-viewport-height/);
  assert.match(css,/var\(--aurion-keyboard-inset/);
  assert.match(css,/font-size:16px/);
  assert.match(css,/overflow:auto/);
});
