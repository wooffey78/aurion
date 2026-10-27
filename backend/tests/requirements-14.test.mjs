import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const auth = fs.readFileSync(new URL('../../assets/js/pages/auth.js', import.meta.url), 'utf8');

test('biometric sign-in is offered only on supported devices and is user-initiated', () => {
  assert.match(auth, /biometric\.hidden=r\|\|!biometricAllowed\(\)/);
  assert.match(auth, /biometric\.onclick=async/);
  assert.doesNotMatch(auth, /setTimeout\(\(\)=>biometricLogin\(\)\.catch\(\(\)=>\{\}\)/);
});

test('passkeys are offered on secure desktop and mobile browsers supporting WebAuthn', () => {
  assert.match(auth, /window\.isSecureContext&&window\.PublicKeyCredential&&navigator\.credentials\?\.get&&navigator\.credentials\?\.create/);
  assert.doesNotMatch(auth, /Android|iPhone|iPad|iPod/);
});

test('biometric flow keeps password fallback and only registers after a deliberate choice', () => {
  assert.match(auth, /window\.confirm\('Enregistrer une clé d’accès sur cet appareil/);
  assert.match(auth, /await enableBiometric\(biometric\)/);
});
