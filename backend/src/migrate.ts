import pg from 'pg';
import { db } from './db.js';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// backend/src (ou backend/dist) -> backend/migrations : independant du dossier courant.
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const log = (m: string) => console.log(`[AURION MIGRATE] ${m}`);

const migrationUrl = process.env.AURION_MIGRATION_DATABASE_URL?.trim();
if (process.env.NODE_ENV === 'production' && !migrationUrl) {
  throw new Error('AURION_MIGRATION_DATABASE_URL doit être défini en production ; le rôle runtime ne doit jamais exécuter de DDL.');
}
const migrationDb = migrationUrl ? new pg.Pool({ connectionString: migrationUrl, max: 2, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 }) : db;

const files = (await readdir(dir))
  .filter(f => /^\d+_.*\.sql$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
log(`${files.length} fichier(s) de migration detecte(s).`);
const prefixGroups = new Map<string, string[]>();
for (const file of files) { const prefix = file.match(/^(\d+)_/)?.[1]; if (prefix) prefixGroups.set(prefix, [...(prefixGroups.get(prefix) || []), file]); }
for (const [prefix, group] of prefixGroups) if (group.length > 1) log(`ATTENTION prefixe historique ${prefix} duplique : ${group.join(', ')}. Ne pas réutiliser ce préfixe pour une nouvelle migration.`);

const client = await migrationDb.connect();
let failed = false;
try {
  // Un seul processus de migration a la fois.
  await client.query('select pg_advisory_lock(727001)');
  await client.query(`create table if not exists schema_migrations(
    name text primary key,
    checksum text not null,
    applied_at timestamptz not null default now())`);

  const done = new Map<string, string>();
  for (const r of (await client.query('select name,checksum from schema_migrations')).rows) done.set(r.name, r.checksum);

  for (const file of files) {
    const sql = await readFile(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (done.has(file)) {
      if (done.get(file) !== checksum) {
        log(`ERREUR ${file} a ete modifie depuis son application : checksum different.`);
        if (process.env.NODE_ENV === 'production') throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${file}`);
      } else log(`deja appliquee ${file}`);
      continue;
    }
    log(`application de ${file}`);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations(name,checksum) values($1,$2)', [file, checksum]);
      await client.query('commit');
      log(`OK ${file}`);
    } catch (e) {
      await client.query('rollback').catch(() => {});
      console.error(`[AURION MIGRATE] ECHEC ${file}`);
      throw e;
    }
  }

  const checks = [
    ['activities', 'select 1 from activities limit 1'],
    ['document_templates', 'select 1 from document_templates limit 1'],
    ['generated_documents', 'select 1 from generated_documents limit 1'],
    ['activity legal_form', 'select legal_form from activities limit 1'],
    ['accounting_entries', 'select 1 from accounting_entries limit 1'],
  ] as const;
  for (const [name, sql] of checks) { await client.query(sql); log(`verifie ${name}`); }
} catch (e: any) {
  failed = true;
  console.error('[AURION MIGRATE] ERREUR :', e?.message || e);
} finally {
  try { await client.query('select pg_advisory_unlock(727001)'); } catch {}
  client.release();
  await migrationDb.end();
  if (migrationDb !== db) await db.end();
}
if (failed) process.exit(1);
log('Migration terminee.');
