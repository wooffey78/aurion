/**
 * Outil base de données d'Aurion (utilisé par les scripts d'installation / démarrage) :
 *   node dist/dbtool.js wait [secondes]  -> attend que DATABASE_URL réponde
 *   node dist/dbtool.js provision        -> crée le rôle et la base Aurion via le compte administrateur du PostgreSQL embarqué
 * Aucun mot de passe n'est jamais demandé : tout est lu dans backend/.env (généré à l'installation).
 */
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
const [, , cmd, arg] = process.argv;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function ping(url: string) {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  await c.connect();
  try { await c.query('select 1'); } finally { await c.end(); }
}

async function wait(seconds: number) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL absent de backend/.env');
  const deadline = Date.now() + seconds * 1000;
  let last = '';
  while (Date.now() < deadline) {
    try { await ping(url); console.log('[AURION DB] base joignable'); return; }
    catch (e: any) { last = String(e?.message || e); await sleep(1000); }
  }
  throw new Error('Base injoignable : ' + last);
}

async function provision() {
  const url = new URL(process.env.DATABASE_URL || '');
  const user = decodeURIComponent(url.username), password = decodeURIComponent(url.password), dbName = url.pathname.replace(/^\//, '');
  const adminPw = process.env.AURION_PG_ADMIN_PASSWORD, adminUser = process.env.AURION_PG_ADMIN_USER || 'aurion_admin', port = process.env.AURION_PG_PORT || url.port || '5432';
  if (!adminPw) throw new Error('AURION_PG_ADMIN_PASSWORD absent de backend/.env');
  // Le compte administrateur du PostgreSQL embarqué : on attend qu'il réponde (démarrage en cours).
  let admin: pg.Client | null = null, lastErr = '';
  for (let i = 0; i < 60 && !admin; i++) {
    const c = new pg.Client({ host: '127.0.0.1', port: Number(port), user: adminUser, password: adminPw, database: 'postgres', connectionTimeoutMillis: 5000 });
    try { await c.connect(); admin = c; } catch (e: any) { lastErr = String(e?.message || e); try { await c.end(); } catch { /* ignore */ } await sleep(1000); }
  }
  if (!admin) throw new Error('PostgreSQL embarqué injoignable : ' + lastErr);
  try {
    const q = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows;
    const ident = (await q('select quote_ident($1) v', [user]))[0].v, lit = (await q('select quote_literal($1) v', [password]))[0].v, dbIdent = (await q('select quote_ident($1) v', [dbName]))[0].v;
    if ((await q('select 1 from pg_roles where rolname=$1', [user])).length) await admin.query(`alter role ${ident} with login password ${lit}`);
    else await admin.query(`create role ${ident} login password ${lit}`);
    if (!(await q('select 1 from pg_database where datname=$1', [dbName])).length) await admin.query(`create database ${dbIdent} owner ${ident}`);
    console.log('[AURION DB] rôle et base prêts');
  } finally { await admin.end(); }
  await ping(process.env.DATABASE_URL!);
}

try {
  if (cmd === 'wait') await wait(Number(arg || 60));
  else if (cmd === 'provision') await provision();
  else throw new Error('Commande inconnue. Utiliser : wait | provision');
  process.exit(0);
} catch (e: any) { console.error('[AURION DB] ERREUR :', e?.message || e); process.exit(1); }
