import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('suppression totale de la barre de progression', () => {
  const main = read('../../assets/js/main.js');
  const css = read('../../assets/css/app.css');
  assert.doesNotMatch(main, /__aurionNetworkProgressInstalled|installNetworkProgress|aurion-loading-popup|window\\.fetch\\s*=/);
  assert.doesNotMatch(css, /aurion-loading-popup|aurion-loading-mark|aurion-loading-progress/);
});

test('déconnexion de toutes les sessions sans rechargement complet', () => {
  const account = read('../../assets/js/pages/dash/account.js');
  assert.match(account, /api\\.logoutAll\\(\\);invalidateSession\\(\\);go\\('\\/auth'\\)/);
  assert.doesNotMatch(account, /api\\.logoutAll\\(\\);location\\.hash='#\\/auth';location\\.reload\\(\\)/);
});
