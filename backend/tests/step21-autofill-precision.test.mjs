import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const other = fs.readFileSync(new URL('../../assets/js/pages/dash/other.js', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../../assets/js/pages/dash/settings.js', import.meta.url), 'utf8');

test('étape 21: détection client passe par la fusion respectueuse des valeurs manuelles', () => {
  assert.match(other, /mergeRegistryFields/);
  assert.doesNotMatch(other, /m\.querySelector\('#name'\)\.value=c\.legalName/);
});

test('étape 21: Paramètres mémorise uniquement les valeurs réellement détectées', () => {
  assert.match(settings, /let registryDetected=\{\};/);
  assert.doesNotMatch(settings, /let registryDetected=\{\.\.\.S\.company\};/);
});
