import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const auth = fs.readFileSync(new URL('../../assets/js/pages/auth.js', import.meta.url), 'utf8');

test('biometric sign-in is offered only on supported devices and is user-initiated', () => {
  assert.match(auth, /biometric\.hidden=r\|\|!biometricAllowed\(\)/);
  assert.match(auth, /biometric\.onclick=async/);
  assert.doesNotMatch(auth, /setTimeout\(\(\)=>biometricLogin\(\)\.catch\(\(\)=>\{\}\)/);
});

test('iPad desktop user agent remains eligible when it exposes touch points', () => {
  assert.match(auth, /maxTouchPoints/);
});

test('biometric flow keeps password fallback and only registers after a deliberate choice', () => {
  assert.match(auth, /window\.confirm\('Activer la connexion biométrique sur cet appareil \?'\)/);
  assert.match(auth, /await enableBiometric\(biometric\)/);
});
