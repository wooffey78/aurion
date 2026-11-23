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
const runtimeRole = process.env.AURION_RUNTIME_DB_ROLE?.trim();
const quoteIdentifier = (value: string) => `\"${value.replace(/\"/g, '\"\"')}\"`;
if (process.env.NODE_ENV === 'production' && !runtimeRole) {
  throw new Error('AURION_RUNTIME_DB_ROLE doit désigner le rôle SQL utilisé par DATABASE_URL.');
}
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
// Préfixes historiques déjà dupliqués avant l'instauration du contrôle (dérogation documentée,
// prompt §3.1/§3.4) : ils restent admis et signalés, mais ne doivent plus être réutilisés.
const historicalDuplicatePrefixes = new Set(['042', '044']);
for (const [prefix, group] of prefixGroups) if (group.length > 1) {
  if (historicalDuplicatePrefixes.has(prefix)) log(`ATTENTION prefixe historique ${prefix} duplique : ${group.join(', ')}. Ne pas réutiliser ce préfixe pour une nouvelle migration.`);
  else throw new Error(`MIGRATION_PREFIX_COLLISION:${prefix} — plusieurs migrations portent ce préfixe (${group.join(', ')}). Ajouter une nouvelle migration exige un préfixe unique : incrémentez le numéro après la dernière migration existante.`);
}

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

  // Bootstrap idempotent des rôles SQL référencés en dur par les migrations (074-083 : policies
  // et grants « TO aurion_admin » / « TO aurion_runtime »). Une installation neuve ne possède ni
  // l'un ni l'autre : ils sont créés ici NOLOGIN, avant toute migration, pour que les migrations
  // ne dépendent plus d'une étape externe (CI ou procédure manuelle). La connexion reste réservée
  // au provisionnement (dbtool provision, CI). Aucune migration existante n'est modifiée.
  for (const roleName of new Set(['aurion_admin', 'aurion_runtime', ...(runtimeRole ? [runtimeRole] : [])])) {
    const exists = await client.query('select 1 from pg_roles where rolname=$1', [roleName]);
    if (!exists.rowCount) {
      try {
        await client.query(`create role ${quoteIdentifier(roleName)} nologin`);
        log(`role ${roleName} absent : cree sans droit de connexion (bootstrap migrations)`);
      } catch {
        throw new Error(`BOOTSTRAP_ROLE_IMPOSSIBLE:${roleName} — les migrations référencent des rôles SQL absents et le compte de migration n'a pas le droit de les créer. Exécutez les migrations avec le compte administrateur (AURION_MIGRATION_DATABASE_URL) ou créez les rôles manuellement.`);
      }
    }
  }
  // PostgreSQL 15+ ne donne plus CREATE sur public à PUBLIC : le rôle d'administration
  // (membre de aurion_admin) doit pouvoir RÉEXÉCUTER les migrations (idempotence testée
  // par bloc3 et exigée par le §3). Le compte de migration est propriétaire de la base :
  // ce grant est donc possible ici ; s'il échoue (base fournie par un prestataire), on
  // avertit sans bloquer car les migrations restent exécutables par le propriétaire.
  try {
    await client.query('grant usage, create on schema public to aurion_admin');
  } catch (e) {
    log(`ATTENTION: grant sur le schéma public impossible pour aurion_admin (${(e as Error).message}) — réexécution via le rôle administré seulement si le propriétaire l'accorde.`);
  }

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

  // Le rôle de migration applique les droits du rôle runtime de façon idempotente.
  // Ne pas donner au serveur applicatif la possibilité de modifier l'historique des migrations.
  if (runtimeRole) {
    const role = await client.query('select 1 from pg_roles where rolname=$1', [runtimeRole]);
    if (!role.rowCount) throw new Error(`AURION_RUNTIME_DB_ROLE_INEXISTANT:${runtimeRole}`);
    const roleIdent = quoteIdentifier(runtimeRole);
    const owner = String((await client.query('select current_user')).rows[0]?.current_user || '');
    if (!owner) throw new Error('MIGRATION_OWNER_UNAVAILABLE');
    const ownerIdent = quoteIdentifier(owner);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${roleIdent}`);
    await client.query(`REVOKE ALL ON TABLE public.schema_migrations FROM ${roleIdent}`);
    // RLS 074 : le journal des accès inter-entreprises est écrit uniquement par le rôle d'administration.
    await client.query(`REVOKE ALL ON TABLE public.platform_admin_access_log FROM ${roleIdent}`).catch(() => {});
    await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${roleIdent}`);
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerIdent} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${roleIdent}`);
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerIdent} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${roleIdent}`);
    log(`droits runtime appliques pour ${runtimeRole} (schema_migrations exclue)`);
  }
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
