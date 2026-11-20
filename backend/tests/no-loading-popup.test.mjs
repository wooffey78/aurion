import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('suppression totale de la barre de progression', () => {
  const main = read('../../assets/js/main.js');
  const css = read('../../assets/css/app.css');
  const sync = read('../../assets/js/account-sync.js');
  const dashboardOther = read('../../assets/js/pages/dash/other.js');
  assert.doesNotMatch(main, /__aurionNetworkProgressInstalled|installNetworkProgress|aurion-loading-popup|window\.fetch\s*=/);
  assert.doesNotMatch(css, /aurion-loading-popup|aurion-loading-mark|aurion-loading-progress/);
  assert.doesNotMatch(sync, /aurionLoading|Chargement…|window\.fetch=async|location\.reload\(\)/);
  assert.doesNotMatch(sync, /<style|@keyframes/);
  assert.equal(dashboardOther.includes(' style='), false, 'aucun attribut style inline ne doit être bloqué par la CSP');
});

test('déconnexion de toutes les sessions sans rechargement complet', () => {
  const account = read('../../assets/js/pages/dash/account.js');
  assert.match(account, /api\.logoutAll\(\);invalidateSession\(\);go\('\/auth'\)/);
  assert.doesNotMatch(account, /api\.logoutAll\(\);location\.hash='#\/auth';location\.reload\(\)/);
});
