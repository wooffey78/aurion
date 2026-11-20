// Contrats 15.4.36 — métiers, suggestions et détection.
// Chaque profil doit proposer un catalogue conséquent (prestations minutées + pièces),
// et le vocabulaire complémentaire doit reconnaître les dix nouveaux métiers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_CODES, listProfiles, profileFor } from '../dist/services/profiles.js';
import { PROFILE_MICRO_CATEGORY } from '../dist/services/fiscal-detection.js';
import { NAF_PROFILE_HINTS, proposeProfileFromNaf } from '../dist/services/micro-detection.js';

test('au moins 30 métiers proposés, tous catégorisés et documentés', () => {
  assert.ok(PROFILE_CODES.length >= 30, `profils : ${PROFILE_CODES.length} (attendu ≥ 30)`);
  const listed = listProfiles();
  assert.equal(listed.length, PROFILE_CODES.length);
  for (const profile of listed) {
    assert.ok(profile.title && profile.summary, `métier incomplet : ${profile.code}`);
    assert.ok(PROFILE_MICRO_CATEGORY[profile.code], `catégorie micro absente : ${profile.code}`);
  }
});

test('chaque métier possède un catalogue de suggestions enrichi', () => {
  for (const code of PROFILE_CODES) {
    const profile = profileFor('', '', code);
    const minimum = code === 'generic-services' ? 4 : 8;
    assert.ok(profile.suggestedServices.length >= minimum, `${code} : ${profile.suggestedServices.length} prestations (attendu ≥ ${minimum})`);
    assert.ok(profile.warranty.length >= 0);
    for (const service of profile.suggestedServices) {
      assert.ok(Number(profile.serviceMinutes[service]) > 0, `${code} : durée manquante pour « ${service} »`);
    }
    if (code !== 'generic-services') {
      assert.ok(profile.suggestedParts.length >= 3, `${code} : pièces insuffisantes`);
    }
  }
});

test('les dix nouveaux métiers sont détectés par leur vocabulaire', () => {
  const cases = [
    ['Naturopathe indépendant', 'wellness'],
    ['Agent de sécurité privée', 'security'],
    ['Copywriter indépendant', 'writing'],
    ['Nounou agréée à domicile', 'childcare'],
    ['Maraîcher bio en circuits courts', 'agriculture'],
    ['Chambres d’hôtes en Bourgogne', 'hospitality'],
    ['Mandataire immobilier', 'real-estate'],
    ['Studio d’enregistrement', 'music-audio'],
    ['Épicerie de quartier', 'retail'],
    ['Auxiliaire de vie à domicile', 'home-care'],
  ];
  for (const [name, expected] of cases) {
    assert.equal(profileFor(name).code, expected, `« ${name} » devrait être reconnu comme ${expected}`);
  }
});

test('un profil explicitement choisi n’est jamais remplacé par la détection', () => {
  assert.equal(profileFor('Réparation de vélos', '', 'computer-repair').code, 'computer-repair');
});

test('les codes APE des nouveaux métiers proposent un métier cohérent', () => {
  assert.ok(NAF_PROFILE_HINTS.length >= 45, `indices NAF : ${NAF_PROFILE_HINTS.length}`);
  assert.equal(proposeProfileFromNaf('55.20Z').profile, 'hospitality');
  assert.equal(proposeProfileFromNaf('68.31Z').profile, 'real-estate');
  assert.equal(proposeProfileFromNaf('80.10Z').profile, 'security');
  assert.equal(proposeProfileFromNaf('88.91A').profile, 'childcare');
  assert.equal(proposeProfileFromNaf('01.13Z').profile, 'agriculture');
  assert.equal(proposeProfileFromNaf('47.11F').profile, 'retail');
});
