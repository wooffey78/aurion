import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('les catégories du catalogue métier sont repliées au chargement et peuvent se rétracter',()=>{
  const catalog=read('../../assets/js/pages/dash/catalog.js');
  const css=read('../../assets/css/app.css');
  assert.match(catalog,/data-toggle-category="\$\{c\.id\}" aria-expanded="false"/);
  assert.match(catalog,/data-category-content hidden/);
  assert.match(catalog,/expandCategory\(section,toggle\.getAttribute\('aria-expanded'\)!=='true'\)/);
  assert.match(css,/catalog-category \[data-category-content\]\[hidden\]\{display:none!important\}/);
});

test('le fond est légèrement bleuté et le texte utilise un bleu sombre lisible',()=>{
  const css=read('../../assets/css/app.css');
  assert.match(css,/:root\{color-scheme:light;--bg:#f1f6fc/);
  assert.match(css,/html,body\{background:#f1f6fc!important;color:#173252!important\}/);
  assert.match(css,/color:#435d7b!important/);
});
