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
  // D4 (15.4.0) : plus de mémoire « détectée » globale ; seules les propositions acceptées une à une sont écrites.
  assert.match(settings, /let registryCandidate=null;/);
  assert.doesNotMatch(settings, /let registryDetected=\{\.\.\.S\.company\};/);
});
