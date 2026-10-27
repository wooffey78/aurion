import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const main = fs.readFileSync(path.join(ROOT, 'assets/js/main.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8');

test('étape 17: accueil utilise quatre illustrations locales et place les libellés hors des boutons', () => {
  const platforms = ['ios', 'android', 'macos', 'windows'];
  for (const platform of platforms) {
    assert.match(main, new RegExp(`data-platform=\"${platform}\"`));
    assert.match(main, new RegExp(`src=\"\\./assets/platforms/${platform}\\.svg\"`));
  }
  assert.match(main, /<figure class=\"platform-download-card\"/);
  assert.match(main, /<figcaption class=\"platform-download-copy\"/);
  assert.doesNotMatch(main, /https:\/\/(?:www\.apple\.com|storage\.googleapis\.com|msftstories\.thesourcemediaassets\.com)/);
  const installSection = main.match(/<section class=\"install-grid\"[\s\S]*?<\/section>/)?.[0] ?? '';
  const cards = [...installSection.matchAll(/<figure class="platform-download-card"><button class="install-card" data-platform="([^"]+)"[^>]*>([\s\S]*?)<\/button><figcaption class="platform-download-copy"><strong>/g)];
  assert.equal(cards.length, 4, 'chaque plateforme possède un bouton et un libellé extérieur');
  assert.deepEqual(cards.map((match) => match[1]).sort(), [...platforms].sort());
  assert.match(css, /\.platform-download-copy\{/);
  assert.match(css, /font-size:1\.02rem/);
});
