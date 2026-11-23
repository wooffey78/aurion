import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL est requis.');
if (process.env.NODE_ENV === 'production' || process.env.AURION_ENV === 'production' || process.env.AURION_ALLOW_DATA_RESET !== 'true') {
  throw new Error('Refus de remise à zéro : définir AURION_ALLOW_DATA_RESET=true et ne jamais utiliser ce script en production.');
}
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reset-test-data.sql');
const sql = await readFile(file, 'utf8');
const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, query_timeout: 15000 });
try {
  await client.connect();
  const environment = await client.query('select current_database() database_name, current_user role_name');
  if (!/(test|ci|integration)/i.test(String(environment.rows[0]?.database_name || ''))) {
    throw new Error('Refus de remise à zéro : le nom de la base doit contenir test, ci ou integration.');
  }
  await client.query(sql);
  console.log('[AURION DB] Base PostgreSQL de test remise à zéro.');
} finally {
  await client.end().catch(() => {});
}
