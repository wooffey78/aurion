import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const main = fs.readFileSync(path.join(ROOT, 'assets/js/main.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8');

test('étape 17: accueil utilise quatre photos officielles et place les libellés hors des encarts', () => {
  const required = [
    ['ios', 'https://www.apple.com/newsroom/images/2026/09/major-updates-for-apples-software-platforms-are-now-available/article/Apple-iOS-27-Siri-mode-in-Camera_big.jpg.large.jpg'],
    ['android', 'https://storage.googleapis.com/gweb-uniblog-publish-prod/images/1_hero_image.width-100.format-webp.webp'],
    ['macos', 'https://www.apple.com/v/os/f/images/macos/highlights/highlights_siri_conversations_endframe__d56qnw2oz22q_large.jpg'],
    ['windows', 'https://msftstories.thesourcemediaassets.com/sites/612/2021/06/Windows-11-PC-Devices-800x533.jpg'],
  ];
  for (const [platform, url] of required) {
    assert.match(main, new RegExp(`data-platform="${platform}"`));
    assert.match(main, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(main, /<figure class="platform-download-card"/);
  assert.match(main, /<figcaption class="platform-download-copy"/);
  const installSection = main.match(/<section class="install-grid"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.doesNotMatch(installSection, /aurion-(?:ios|android|macos|windows)\.svg/);
  for (const platform of ['ios','android','macos','windows']) {
    assert.match(installSection, new RegExp(`<button class=\"install-card\" data-platform=\"${platform}\"[^>]*>[\\s\\S]*?<\/button><figcaption class=\"platform-download-copy\"`));
  }
  assert.match(css, /\.platform-download-copy\{/);
  assert.match(css, /font-size:1\.02rem/);
});
