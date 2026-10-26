import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../../assets/js/main.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../assets/css/app.css', import.meta.url), 'utf8');

test('landing download cards are rendered before the hero section', () => {
  const install = main.indexOf('class="install-grid"');
  const hero = main.indexOf('class="landing-hero"');
  assert.notEqual(install, -1);
  assert.notEqual(hero, -1);
  assert.ok(install < hero);
});

test('landing download cards stay compact and images have no internal padding', () => {
  assert.match(css, /\.install-grid\{[^}]*max-width:820px[^}]*padding:0 12px/);
  assert.match(css, /\.install-card\{padding:0/);
  assert.match(css, /\.install-card img\{display:block;width:46px;height:46px/);
  assert.match(css, /\.install-card\{min-height:68px;padding:0/);
});
