import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const auth = fs.readFileSync(new URL('../../assets/js/pages/auth.js', import.meta.url), 'utf8');

test('biometric button is restricted to supported mobile devices', () => {
  assert.match(auth, /biometric\.hidden=r\|\|!biometricAllowed\(\)\|\|localStorage\.getItem\('aurion\.biometric\.choice'\)==='enabled'/);
});

test('iPad desktop user agent remains eligible when it exposes touch points', () => {
  assert.match(auth, /maxTouchPoints/);
});

test('automatic biometric prompt stays enabled after the mobile choice is enabled', () => {
  assert.match(auth, /if\(!r&&biometricAllowed\(\)&&localStorage\.getItem\('aurion\.biometric\.choice'\)==='enabled'\)/);
});
