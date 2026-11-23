#!/usr/bin/env node
// Rejouage de calibrage — chantier 3 du moteur de propositions V2 : le calibrage est
// « rejoué à chaque extension du catalogue ». Source unique des cas :
// backend/tests/fixtures/calibration-cases.mjs (partagée avec le contrat de calibration).
//
// Usage : node tools/calibration-replay.mjs [--json]
// Sortie : rapport de dérive par cas (attente vs réel, confiance, NAF), invariant du
// signal secondaire, déterminisme. Code de sortie 1 si une dérive est détectée.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDetection = path.join(root, 'backend/dist/services/micro-detection.js');
if (!existsSync(distDetection)) {
  console.error('dist/ absente — lancer d\'abord : npm --prefix backend run build');
  process.exit(2);
}
// Le moteur importe la configuration applicative (validation stricte) : fournir un
// environnement neutre si absent — le rejouage ne touche aucune base, il est pur calcul.
process.env.DATABASE_URL ||= 'postgres://localhost:5432/aurion_replay';
process.env.JWT_SECRET ||= 'calibration-replay-local-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
const { proposeProfilesFromSignals, proposeProfileFromNaf } = await import(distDetection);
const { CASES, NAF_HINT_CASES, NAF_HINT_STABLE_CASES } = await import(path.join(root, 'backend/tests/fixtures/calibration-cases.mjs'));

const json = process.argv.includes('--json');
const derive = [];
const rows = [];

for (const [secteur, name, description, naf, expected, expectedConf] of CASES) {
  const r = proposeProfilesFromSignals({ name, description, nafCode: naf });
  const head = r.proposals[0];
  const problems = [];
  if (!head) problems.push('aucune proposition');
  if (head && head.profile !== expected) problems.push(`attendu ${expected}, obtenu ${head.profile}`);
  if (head && expectedConf && !expectedConf.includes(head.confidence)) problems.push(`confiance ${head.confidence} hors bande [${expectedConf.join(', ')}]`);
  if (head && naf && head.matchedNaf !== naf) problems.push(`NAF non rapproché (${head.matchedNaf || '—'})`);
  if (head && !head.reasons?.length) problems.push('raisons manquantes');
  if (problems.length) derive.push({ case: secteur, problems });
  rows.push({ case: secteur, attendu: expected, obtenu: head?.profile || '—', confiance: head?.confidence || '—', naf: naf || '—', ok: !problems.length });
}

// Signal secondaire : invariant 15.4.45 — le métier secondaire apparaît avec sa raison,
// le métier principal n'est pas déplacé.
const sec = proposeProfilesFromSignals({ name: 'Décor Web', description: 'création de sites internet pour artisans', secondaryActivities: ['réparation de téléphones'] });
const phone = sec.proposals.find(p => p.profile === 'smartphone-repair');
if (!phone?.reasons?.some(x => x.includes('Activités secondaires'))) derive.push({ case: 'signal secondaire', problems: ['raison « Activités secondaires » absente'] });
rows.push({ case: 'signal secondaire', attendu: 'smartphone-repair cité', obtenu: phone ? 'cité' : 'absent', confiance: phone?.confidence || '—', naf: '—', ok: !!phone?.reasons?.some(x => x.includes('Activités secondaires')) });

// Hints NAF : résolution directe + stabilité des versions antérieures.
for (const [code, expected] of [...NAF_HINT_CASES, ...NAF_HINT_STABLE_CASES]) {
  const h = proposeProfileFromNaf(code);
  const ok = h?.profile === expected;
  if (!ok) derive.push({ case: `hint NAF ${code}`, problems: [`attendu ${expected}, obtenu ${h?.profile || '—'}`] });
  rows.push({ case: `hint NAF ${code}`, attendu: expected, obtenu: h?.profile || '—', confiance: '—', naf: code, ok });
}

// Déterminisme : deux exécutions identiques.
const sig = { nafCode: '43.91A', name: 'Second Souffle', description: 'ravalement de façades, peinture et carrelage', services: ['Peinture façade'], parts: ['Mortier'] };
const deterministic = JSON.stringify(proposeProfilesFromSignals(sig)) === JSON.stringify(proposeProfilesFromSignals(sig));
if (!deterministic) derive.push({ case: 'déterminisme', problems: ['deux exécutions diffèrent'] });
rows.push({ case: 'déterminisme', attendu: 'stable', obtenu: deterministic ? 'stable' : 'instable', confiance: '—', naf: '—', ok: deterministic });

if (json) {
  console.log(JSON.stringify({ derive, rows, total: rows.length, ok: rows.length - derive.length }, null, 2));
} else {
  for (const r of rows) console.log(`${r.ok ? '  ✓' : '  ✖'} ${r.case.padEnd(22)} attendu ${r.attendu.padEnd(20)} obtenu ${String(r.obtenu).padEnd(20)} confiance ${r.confiance}`);
  console.log(`\n${rows.length - derive.length}/${rows.length} contrôles conformes.`);
  if (derive.length) {
    console.log('\nDÉRIVES :');
    for (const d of derive) console.log(`  ✖ ${d.case} : ${d.problems.join(' · ')}`);
  }
}
process.exit(derive.length ? 1 : 0);
