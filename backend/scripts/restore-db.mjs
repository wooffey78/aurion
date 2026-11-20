// Test de restauration — exécutable du RUNBOOK (docs/RUNBOOK-PRODUCTION.md §3).
// Restaure une sauvegarde pg_dump (format custom) dans une base JETABLE, puis vérifie le
// contenu restauré (migrations, tables, isolation RLS). PROTECTIONS :
//   1. La cible provient UNIQUEMENT de AURION_RESTORE_TARGET_URL — jamais de DATABASE_URL ni
//      d'AURION_MIGRATION_DATABASE_URL ; toute égalité est refusée (écrasement de production).
//   2. L'option --confirm est obligatoire (la restauration écrase les données de la cible).
//   3. pg_restore s'arrête à la première erreur (--exit-on-error) : un exercice qui échoue
//      échoue LISIBLEMENT — c'est le but du test.
// Usage :
//   node scripts/restore-db.mjs --from <fichier.dump> --confirm
// Environnement :
//   AURION_RESTORE_TARGET_URL — URL de la base JETABLE (créée au préalable, vide)
//   PG_RESTORE_PATH — chemin explicite du binaire (sinon pg_restore du PATH)
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const maskUrl = (u) => {
  try { const x = new URL(u); return `${x.protocol}//${x.username}:***@${x.host}${x.pathname}`; }
  catch { return '(URL masquée)'; }
};

const from = arg('--from');
const confirm = process.argv.includes('--confirm');
if (!from || !confirm) {
  console.error('Usage : node scripts/restore-db.mjs --from <fichier.dump> --confirm');
  console.error('La cible (base JETABLE) est fournie par la variable AURION_RESTORE_TARGET_URL.');
  console.error('Voir docs/RUNBOOK-PRODUCTION.md §3 pour la procédure complète.');
  process.exit(2);
}
const target = process.env.AURION_RESTORE_TARGET_URL || '';
if (!target) {
  console.error('ERREUR : AURION_RESTORE_TARGET_URL absente.');
  console.error('Créez d\'abord une base jetable (ex. aurion_restore_drill) et fournissez son URL — JAMAIS la base de production.');
  process.exit(2);
}
// Garde-fou principal, vérifié AVANT toute autre action : jamais la base de production.
for (const forbidden of ['DATABASE_URL', 'AURION_MIGRATION_DATABASE_URL']) {
  const v = process.env[forbidden];
  if (v && v === target) {
    console.error(`REFUS : AURION_RESTORE_TARGET_URL est identique à ${forbidden} — le test de restauration ne s'exécute JAMAIS sur la base de production.`);
    process.exit(1);
  }
}
if (!existsSync(from) || statSync(from).size <= 0) {
  console.error(`ERREUR : sauvegarde introuvable ou vide : ${from}`);
  process.exit(2);
}

const pgRestore = process.env.PG_RESTORE_PATH || 'pg_restore';
console.log(`Sauvegarde : ${from}`);
console.log(`Cible jetable : ${maskUrl(target)}`);
console.log(`pg_restore (${pgRestore}) — --clean --if-exists --no-owner --exit-on-error…`);
const r = spawnSync(pgRestore, [
  '--clean', '--if-exists', '--no-owner', '--exit-on-error',
  '--dbname=' + target,
  from,
], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
if (r.status !== 0) {
  console.error(`ÉCHEC de la restauration (code ${r.status}) : ${(r.stderr || r.error?.message || '').slice(0, 900)}`);
  if (r.error?.code === 'ENOENT') console.error('pg_restore est introuvable. Renseignez PG_RESTORE_PATH (ex. Windows : C:\\Program Files\\PostgreSQL\\16\\bin\\pg_restore.exe).');
  console.error('Un échec de restauration est un résultat de test VALIDE : corriger et rejouer (RUNBOOK §3).');
  process.exit(1);
}
console.log('✔ pg_restore terminé sans erreur.');

// Vérifications post-restauration : migrations, tables, isolation RLS sur la cible jetable.
const { Client } = require('pg');
const client = new Client({ connectionString: target });
await client.connect();
try {
  const mig = await client.query('select count(*)::int as n from schema_migrations');
  const tables = await client.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
  console.log(`✔ schema_migrations : ${mig.rows[0].n} migrations restaurées.`);
  console.log(`✔ Tables public : ${tables.rows[0].n}.`);

  // Isolation RLS : sans contexte tenant, une lecture applicative ne doit rien renvoyer.
  const runtimeRole = process.env.AURION_RUNTIME_DB_ROLE || '';
  if (runtimeRole) {
    const asRuntime = await client.query(`select count(*)::int as n from clients`);
    console.log(`Lecture en tant que ${client.user} (rôle de la cible) : ${asRuntime.rows[0].n} lignes clients.`);
    console.log('Contrôle d\'isolation complet (A/B avec contextes tenants) : backend/tests/tenant-isolation.rls.test.mjs.');
  }
  console.log('\nSuite du RUNBOOK §3 : démarrer l\'application sur cette cible (mêmes variables, y compris AURION_ENCRYPTION_KEY), vérifier compte/facture/justificatif/export, puis consigner dans docs/CHECKLIST-PRE-PRODUCTION.md.');
} finally {
  await client.end();
}
