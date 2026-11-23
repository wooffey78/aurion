// Sauvegarde de base PostgreSQL — exécutable du RUNBOOK (docs/RUNBOOK-PRODUCTION.md §2).
// Export logique pg_dump --format=custom de la base de production, vers un fichier daté
// dans le répertoire choisi, avec vérification de lisibilité après écriture. La sauvegarde
// ainsi produite reste à COPIER hors du serveur (autre emplacement UE chiffré) : ce script
// crée le fichier, la règle 3-2-1 est appliquée par l'opérateur (runbook).
// Usage :
//   node scripts/backup-db.mjs --out <répertoire> [--prune-days N]
// Environnement :
//   AURION_MIGRATION_DATABASE_URL (préféré) ou DATABASE_URL — source de la sauvegarde
//   PG_DUMP_PATH / PG_RESTORE_PATH — chemins explicites (sinon binaire du PATH ;
//     sous Windows : répertoire bin de l'installation PostgreSQL du PS1 Install-Aurion)
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const maskUrl = (u) => {
  try { const x = new URL(u); return `${x.protocol}//${x.username}:***@${x.host}${x.pathname}`; }
  catch { return '(URL masquée)'; }
};

const outDir = arg('--out');
const pruneDays = Number(arg('--prune-days') || 0);
if (!outDir) {
  console.error('Usage : node scripts/backup-db.mjs --out <répertoire> [--prune-days N]');
  console.error('Exemples :');
  console.error('  Windows : node scripts\\backup-db.mjs --out D:\\Sauvegardes-Aurion --prune-days 30');
  console.error('  Linux   : node scripts/backup-db.mjs --out /var/backups/aurion --prune-days 30');
  process.exit(2);
}
const url = process.env.AURION_MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('ERREUR : ni AURION_MIGRATION_DATABASE_URL ni DATABASE_URL ne sont définis.');
  console.error('La sauvegarde utilise le rôle migrateur (accès complet en lecture) de préférence.');
  process.exit(2);
}
const pgDump = process.env.PG_DUMP_PATH || 'pg_dump';
const pgRestore = process.env.PG_RESTORE_PATH || 'pg_restore';

console.log(`Source : ${maskUrl(url)}`);
if (!process.env.AURION_MIGRATION_DATABASE_URL && process.env.DATABASE_URL) {
  console.log('Note : AURION_MIGRATION_DATABASE_URL absente — DATABASE_URL (rôle applicatif) utilisée ; certaines métadonnées du propriétaire peuvent différer.');
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const outFile = path.resolve(outDir, `aurion-db-${stamp}.dump`);
mkdirSync(outDir, { recursive: true });
if (existsSync(outFile)) {
  console.error(`ERREUR : le fichier cible existe déjà (${outFile}) — ne jamais écraser une sauvegarde.`);
  process.exit(1);
}

console.log(`pg_dump (${pgDump}) — format custom, sans données de role owner…`);
const r = spawnSync(pgDump, [
  '--format=custom', '--no-owner',
  '--file=' + outFile,
  url,
], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
if (r.status !== 0) {
  console.error(`ÉCHEC pg_dump (code ${r.status}) : ${(r.stderr || r.error?.message || '').slice(0, 600)}`);
  if (r.error?.code === 'ENOENT') console.error('pg_dump est introuvable. Renseignez PG_DUMP_PATH (ex. Windows : C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe) ou installez le client PostgreSQL.');
  process.exit(1);
}
const size = statSync(outFile).size;
if (size <= 0) { console.error('ÉCHEC : fichier de sauvegarde vide.'); process.exit(1); }

console.log(`✔ Sauvegarde écrite : ${outFile} (${(size / 1048576).toFixed(2)} Mo)`);

// Vérification de lisibilité : un dump que pg_restore ne peut pas lister n'est pas une sauvegarde.
console.log(`Vérification pg_restore --list (${pgRestore})…`);
const v = spawnSync(pgRestore, ['--list', outFile], { encoding: 'utf8' });
if (v.status === 0) {
  const tables = (v.stdout || '').split('\n').filter(l => /TABLE\s/.test(l) && !/TABLE DATA/.test(l)).length;
  const data = (v.stdout || '').split('\n').filter(l => /TABLE DATA/.test(l)).length;
  console.log(`✔ Sauvegarde lisible : ${tables} tables, ${data} sections de données.`);
} else {
  console.warn(`⚠ pg_restore n'a pas pu lister la sauvegarde (code ${v.status}) — vérifiez manuellement : ${pgRestore} --list "${outFile}"`);
}

// Rétention : suppression explicite, limitée au motif exact du script, dans le répertoire --out.
if (pruneDays > 0) {
  const cutoff = Date.now() - pruneDays * 86400_000;
  let removed = 0;
  for (const f of readdirSync(outDir)) {
    if (!/^aurion-db-\d{8}-\d{6}\.dump$/.test(f)) continue;
    const p = path.join(outDir, f);
    if (p === outFile) continue;
    if (statSync(p).mtimeMs < cutoff) { unlinkSync(p); removed++; console.log(`Rétention : supprimé ${f}`); }
  }
  console.log(removed ? `Rétention ${pruneDays} jours : ${removed} ancienne(s) sauvegarde(s) supprimée(s).` : `Rétention ${pruneDays} jours : rien à supprimer.`);
}

console.log('\nProchaines étapes (RUNBOOK §2) : chiffrer puis copier ce fichier vers un emplacement distinct (autre compte/région UE), et enregistrer la version applicative du jour.');
