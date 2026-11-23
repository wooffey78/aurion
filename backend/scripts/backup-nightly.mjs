#!/usr/bin/env node
// 15.4.51 (PROMPT A5) — sauvegarde quotidienne orchestrée : enveloppe de scripts/backup-db.mjs
// (dump custom + vérification + rétention) avec journal JSON daté (chemin à déclarer dans
// AURION_BACKUP_LOG_PATH pour l'exposer dans /health) et copie facultative vers un second
// emplacement (règle 3-2-1 : la copie hors site reste du ressort de l'opérateur — runbook §2).
// Usage :
//   node scripts/backup-nightly.mjs --out <répertoire> [--prune-days 30] [--secondary <répertoire>]
// Planification : cron du VPS OVH (recommandé) ou tâche planifiée Windows — voir
// docs/RUNBOOK-PRODUCTION.md §2 (section mise à jour en 15.4.51). Le script est idempotent :
// rejouer le même jour produit un nouveau fichier daté (timestamp à la minute) et met à jour le journal.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const outDir = arg('--out');
if (!outDir) {
  console.error('Usage : node scripts/backup-nightly.mjs --out <répertoire> [--prune-days 30] [--secondary <répertoire>]');
  process.exit(2);
}
const pruneDays = Number(arg('--prune-days') || 30);
const secondary = arg('--secondary');
const here = path.dirname(fileURLToPath(import.meta.url));
const journalPath = process.env.AURION_BACKUP_LOG_PATH || path.join(outDir, 'backup-log.json');
const startedAt = new Date().toISOString();

console.log(`Sauvegarde quotidienne Aurion — démarrage ${startedAt}`);
const r = spawnSync(process.execPath, [path.join(here, 'backup-db.mjs'), '--out', outDir, '--prune-days', String(pruneDays)], {
  stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
});
console.log(r.stdout || '');
if (r.status !== 0) {
  console.error(r.stderr || `backup-db a échoué (code ${r.status})`);
  // Journal d'échec : /health expose lastBackupAt daté — l'absence de fraîcheur est un signal.
  try {
    writeFileSync(journalPath, JSON.stringify({ lastAttemptAt: startedAt, lastSuccessAt: null, ok: false, error: (r.stderr || '').slice(0, 400) }, null, 2));
  } catch {}
  process.exit(1);
}

// Le fichier produit par backup-db : aurion-db-AAAAMMJJ-HHMM.dump le plus récent du répertoire.
const dumps = (readdirSafe(outDir)).filter((f) => /^aurion-db-\d{8}-\d{6}\.dump$/.test(f)).sort();
const latest = dumps[dumps.length - 1];
const dumpPath = path.join(outDir, latest);
const size = statSync(dumpPath).size;
const sha256 = createHash('sha256').update(readFileSync(dumpPath)).digest('hex');
let secondaryCopied = false;
if (secondary) {
  mkdirSync(secondary, { recursive: true });
  copyFileSync(dumpPath, path.join(secondary, latest));
  secondaryCopied = true;
  console.log(`Copie secondaire écrite : ${path.join(secondary, latest)}`);
}
const journal = { lastAttemptAt: startedAt, lastSuccessAt: new Date().toISOString(), ok: true, file: latest, sizeBytes: size, sha256, secondaryCopied, retentionDays: pruneDays };
writeFileSync(journalPath, JSON.stringify(journal, null, 2));
console.log(`✔ Journal mis à jour : ${journalPath}`);
console.log('Rappel RUNBOOK §2 : la clé de chiffrement (AURION_ENCRYPTION_KEY) doit être sauvegardée SÉPARÉMENT des données.');

function readdirSafe(dir) {
  try { return readdirSync(dir); } catch { return []; }
}
