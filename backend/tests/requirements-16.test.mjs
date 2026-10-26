import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const suggest = fs.readFileSync(new URL('../../assets/js/core/suggest.js', import.meta.url), 'utf8');

test('dropdown interaction keeps the menu open while toggling and typing', () => {
  assert.match(suggest, /toggle\.addEventListener\('click',ev=>\{ev\.preventDefault\(\);ev\.stopPropagation\(\)/);
  assert.match(suggest, /input\.addEventListener\('click',ev=>\{ev\.stopPropagation\(\)/);
  assert.match(suggest, /input\.addEventListener\('focus',\(\)=>\{if\(box\.hidden\)render\(\)\}\)/);
});

test('choosing an item closes the dropdown explicitly after dispatching the change', () => {
  assert.match(suggest, /input\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\);onPick\?\.\(it\);box\.hidden=true/);
});

test('outside pointer handling does not collapse an open dropdown inside its wrapper', () => {
  assert.match(suggest, /const outside=ev=>\{if\(!wrap\.contains\(ev\.target\)\)\{/);
  assert.match(suggest, /box\.addEventListener\('pointerdown',ev=>/);
});
