// V2 (chantier 3, 15.4.44) — Calibrage étendu du corpus : le moteur de propositions
// reconnaît les formulations courantes des métiers micro (nom, description, code APE/NAF).
// Le corpus de calibrage est REJOUÉ à chaque extension du catalogue (rappel accru,
// précision conservée) ; aucune proposition n'est appliquée sans confirmation explicite
// (invariant V2 : l'automatisation assiste, elle ne décide jamais à la place de l'utilisateur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const distProfiles = new URL('../dist/services/profiles.js', import.meta.url);
const distDetection = new URL('../dist/services/micro-detection.js', import.meta.url);
const skip = existsSync(distProfiles) && existsSync(distDetection) ? false : 'dist/ absente : lancer le build (npm test le fait)';

test('v2 calibrage: hygiène du corpus — chaque métier a ses indices, aucun doublon inter-profils', { skip }, async () => {
  const { PROFILE_CODES, EXTRA_KEYWORDS } = await import(distProfiles);
  const { NAF_PROFILE_HINTS } = await import(distDetection);
  // Chaque profil dispose d'un vocabulaire propre non vide — SAUF le profil générique :
  // par conception il n'a AUCUN indice de détection (aucun mot-clé, aucune prestation
  // supplémentaire, aucune pièce) et ne peut jamais être proposé par le moteur ; c'est
  // l'option explicitement humaine pour les métiers hors catalogue.
  for (const code of PROFILE_CODES) {
    if (code === 'generic-services') {
      assert.equal((EXTRA_KEYWORDS[code] || []).length, 0, 'le profil générique ne doit avoir aucun indice de détection');
      continue;
    }
    const words = EXTRA_KEYWORDS[code] || [];
    assert.ok(words.length >= 4, `vocabulaire manquant pour ${code}`);
  }
  // Un mot-clé n'appartient qu'à un seul métier : les raisons citées restent non ambiguës.
  const seen = new Map();
  for (const [code, words] of Object.entries(EXTRA_KEYWORDS)) {
    for (const w of words) {
      const owner = seen.get(w);
      assert.ok(!owner || owner === code, `mot-clé partagé « ${w} » : ${owner} et ${code}`);
      seen.set(w, code);
    }
  }
  // Hints NAF : préfixes valides et disjoints, profil existant, note informative.
  const prefixes = new Set();
  for (const h of NAF_PROFILE_HINTS) {
    assert.match(h.prefix, /^\d{2}\.\d{2}$/, `préfixe NAF invalide : ${h.prefix}`);
    assert.ok(!prefixes.has(h.prefix), `préfixe NAF en doublon : ${h.prefix}`);
    prefixes.add(h.prefix);
    assert.ok(PROFILE_CODES.includes(h.profile), `profil inconnu : ${h.profile}`);
    assert.ok(h.note.length >= 15, `note trop courte pour ${h.prefix}`);
  }
});

// Corps de calibrage : combinaisons nom/description/NAF courantes du micro.
// 15.4.46 : source unique déplacée dans tests/fixtures/calibration-cases.mjs — partagée
// avec l'outil de rejouage tools/calibration-replay.mjs (chantier 3 : rejouer à chaque
// extension du catalogue).
import { CASES, NAF_HINT_CASES, NAF_HINT_STABLE_CASES } from './fixtures/calibration-cases.mjs';

test('v2 calibrage: 24 combinaisons courantes → la bonne proposition en tête, confiance étayée', { skip }, async () => {
  const { proposeProfilesFromSignals } = await import(distDetection);
  for (const [, name, description, naf, expected, expectedConf] of CASES) {
    const r = proposeProfilesFromSignals({ name, description, nafCode: naf });
    assert.ok(r.proposals.length >= 1, `${name} : aucune proposition`);
    assert.equal(r.proposals[0].profile, expected, `${name} : attendu ${expected}, obtenu ${r.proposals.map(p => p.profile).join(',')}`);
    const head = r.proposals[0];
    if (expectedConf) assert.ok(expectedConf.includes(head.confidence), `${name} : confiance ${head.confidence}`);
    if (naf) assert.equal(head.matchedNaf, naf, `${name} : NAF non rapproché`);
    assert.ok(head.reasons.length >= 1, `${name} : raisons manquantes`);
    assert.ok(['tres-eleve', 'eleve', 'moyen', 'faible'].includes(head.confidence), `${name} : niveau inconnu`);
  }
});

test('v2 calibrage: hints NAF ajoutés — résolution directe, proposition indicative jamais imposée', { skip }, async () => {
  const { proposeProfileFromNaf } = await import(distDetection);
  for (const [code, expected] of NAF_HINT_CASES) {
    const h = proposeProfileFromNaf(code);
    assert.equal(h?.profile, expected, `${code} → ${h?.profile} (attendu ${expected})`);
    assert.ok(h.note.length >= 10, `${code} : note manquante`);
  }
  // Les indices déjà couverts par les versions antérieures restent stables (aucune régression).
  for (const [code, expected] of NAF_HINT_STABLE_CASES) {
    assert.equal(proposeProfileFromNaf(code)?.profile, expected, `${code} : régression du hint existant`);
  }
});

test('v2 calibrage: déterminisme du moteur recalibré (aucun aléa introduit par le corpus)', { skip }, async () => {
  const { proposeProfilesFromSignals } = await import(distDetection);
  const signals = { nafCode: '43.91A', name: 'Second Souffle', description: 'ravalement de façades, peinture et carrelage', services: ['Peinture façade', 'Pose carrelage'], parts: ['Mortier'] };
  const a = proposeProfilesFromSignals(signals);
  const b = proposeProfilesFromSignals(signals);
  assert.deepEqual(b, a);
  assert.equal(a.proposals[0].profile, 'building');
  // Précision conservée : un texte sans vocabulaire connu ne propose rien d'imaginé,
  // et le profil générique n'est jamais proposé automatiquement (choix humain uniquement).
  const weak = proposeProfilesFromSignals({ description: 'activité atypique qwv sans vocabulaire connu' });
  assert.equal(weak.requiresConfirmation, true);
  for (const p of weak.proposals) assert.equal(p.confidence, 'faible');
  assert.ok(!weak.proposals.some(p => p.profile === 'generic-services'), 'le profil générique ne doit jamais être proposé automatiquement');
});
