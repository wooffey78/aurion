import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const auth = read('../../assets/js/pages/auth.js');
const device = read('../../assets/js/core/device.js');

test('les clés d’accès sont proposées uniquement sur un appareil mobile compatible en contexte sécurisé', () => {
  assert.match(device, /window\.isSecureContext/);
  assert.match(device, /window\.PublicKeyCredential/);
  assert.match(device, /navigator\.credentials\?\.get&&navigator\.credentials\?\.create/);
  assert.match(device, /navigator\.userAgentData\?\.mobile/);
  assert.match(auth, /shouldOfferPasskey\(email\)/);
});

test('la connexion par clé d’accès conditionnelle ne démarre qu’après le choix explicite de connexion', () => {
  assert.match(auth, /async function startConditionalPasskeyLogin\(/);
  assert.match(auth, /mediation:'conditional'/);
  assert.match(auth, /if\(!registration&&isMobileDevice\(\)\)void startConditionalPasskeyLogin\(email,status,error\)/);
  assert.match(auth, /stopConditionalPasskey\(\)/);
  assert.doesNotMatch(auth, /setTimeout\(\(\)=>.*navigator\.credentials\.get/);
});

test('l’activation d’une clé d’accès reste volontaire et conserve le mot de passe', () => {
  assert.match(auth, /id=\\?['"]passkey-later/);
  assert.match(auth, /id=\\?['"]passkey-enable/);
  assert.match(auth, /enable\.onclick=async/);
  assert.match(auth, /await enableMobilePasskey\(\)/);
  assert.match(auth, /id="password" type="password"/);
  assert.match(auth, /Vous pouvez réessayer ou continuer sans elle/);
  assert.doesNotMatch(auth, /setTimeout\(\(\)=>biometricLogin\(\)\.catch/);
});
