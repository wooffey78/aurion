import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('administration peut relancer uniquement toutes les sections actuellement en échec', () => {
  const source = read('../../assets/js/pages/dash/other.js');
  assert.match(source, /retrySection\s*===\s*'failed'/);
  assert.match(source, /Object\.keys\(adminLoaders\)\.filter\(key\s*=>\s*adminCache\.errors\[key\]\)/);
  assert.match(source, /admin\.bind\('failed'\)/);
});

test('la relance globale inclut les demandes de rétractation uniquement si elles sont en échec', () => {
  const source = read('../../assets/js/pages/dash/other.js');
  assert.match(source, /retrySection\s*===\s*'failed'\s*&&\s*adminWithdrawalsCache\.error/);
  assert.match(source, /if \(adminWithdrawalsCache\.error\) failed\.push\('withdrawals'\)/);
  assert.match(source, /withdrawals: 'Demandes de rétractation'/);
});
