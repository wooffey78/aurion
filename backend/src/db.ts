import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "./config.js";
const { Pool } = pg;
export const db = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

// ---------------------------------------------------------------------------------------
// Contexte multi-tenant (RLS PostgreSQL — isolation inter-organisations, défense en profondeur).
// Le contexte est posé par requête HTTP (voir app.ts : enveloppe du cycle de vie) puis rempli
// par le plugin d'authentification dès que l'organisation active est connue. Les services
// appelés hors requête HTTP (callbacks OAuth, webhook Stripe, travaux planifiés) l'établissent
// explicitement via withTenant(). En l'absence de contexte, les politiques RLS échouent fermé :
// aucune ligne des tables protégées n'est lisible ni modifiable.
// ---------------------------------------------------------------------------------------
type TenantScope = { organizationId: string | null };
/** Portée de requête brute : enveloppée autour du cycle de vie HTTP dans app.ts. */
export const tenantRequestScope = new AsyncLocalStorage<TenantScope>();

/** Exécute `work` dans le contexte de l'organisation donnée (imbriquable, sans fuite vers le pool). */
export async function withTenant<T>(organizationId: string | null, work: () => Promise<T>): Promise<T> {
  return tenantRequestScope.run({ organizationId }, work);
}
/** Organisation active du contexte courant, ou null hors contexte (les tables protégées échouent fermé). */
export function currentTenant(): string | null {
  return tenantRequestScope.getStore()?.organizationId ?? null;
}
/** À n'utiliser que depuis un gestionnaire de requête : mémorise l'organisation authentifiée. */
export function setRequestTenant(organizationId: string): void {
  const store = tenantRequestScope.getStore();
  if (store) store.organizationId = organizationId;
}

const SET_LOCAL_TENANT = "select set_config('app.current_organization',$1,true)";
const CLEAR_LOCAL_TENANT = "select set_config('app.current_organization','',true)";

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text:string, values:unknown[]=[]){
  const tenant = currentTenant();
  if(!tenant) return db.query<T>(text, values); // tables globales (identité, santé…) ; les tables protégées échouent fermé.
  // Contexte transactionnel local : SET LOCAL disparaît au COMMIT/ROLLBACK, aucune contamination du pool.
  const client = await db.connect();
  try{
    await client.query('begin');
    await client.query(SET_LOCAL_TENANT, [tenant]);
    const result = await client.query<T>(text, values);
    await client.query('commit');
    return result;
  }catch(error){
    await client.query('rollback').catch(()=>{});
    throw error;
  }finally{
    client.release();
  }
}

/** Ouvre une transaction explicite en appliquant le tenant courant (SET LOCAL, périmètre transaction uniquement). */
export async function beginTenant(client: pg.PoolClient): Promise<void> {
  await client.query('begin');
  const tenant = currentTenant();
  if (tenant) await client.query(SET_LOCAL_TENANT, [tenant]);
}

/**
 * Applique le contexte tenant à une transaction DÉJÀ OUVERTE (création d'organisation pendant
 * l'inscription ou l'invitation : les écritures métier qui suivent doivent passer la RLS de la
 * nouvelle organisation). Le contexte disparaît au COMMIT/ROLLBACK.
 */
export async function applyTenant(client: pg.PoolClient, organizationId: string): Promise<void> {
  await client.query(SET_LOCAL_TENANT, [organizationId]);
}

/**
 * Client détenu hors transaction (verrou consultatif de session, file cloud) : applique le tenant
 * au niveau de la session de CE client puis le réinitialise systématiquement avant restitution.
 */
export async function withClientTenant<T>(client: pg.PoolClient, organizationId: string, work: () => Promise<T>): Promise<T> {
  await client.query("select set_config('app.current_organization',$1,false)", [organizationId]);
  try { return await work(); }
  finally { await client.query(CLEAR_LOCAL_TENANT).catch(()=>{}); }
}

// ---------------------------------------------------------------------------------------
// Pool d'administration (rôle SQL membre de « aurion_admin ») : le SEUL chemin autorisé à franchir
// l'isolation RLS, pour les besoins inter-entreprises explicites — statistiques de la console
// d'administration, travaux planifiés, webhook Stripe. Chaque utilisation est journalisée dans
// platform_admin_access_log. Ce pool n'est jamais le rôle propriétaire des tables.
// ---------------------------------------------------------------------------------------
export const adminDb = config.AURION_ADMIN_DATABASE_URL ? new Pool({
  connectionString: config.AURION_ADMIN_DATABASE_URL,
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
}) : null;

/** Journalise un accès inter-entreprises explicite (une entrée par opération, pas par requête). */
export async function logAdminAccess(operation: string, detail?: unknown): Promise<void> {
  if (!adminDb) return;
  await adminDb.query('insert into platform_admin_access_log(operation,detail) values($1,$2::jsonb)', [operation, JSON.stringify(detail ?? null)]).catch(()=>{});
}

/**
 * Requête inter-entreprises explicite (console d'administration, travaux planifiés, webhook Stripe).
 * Nécessite AURION_ADMIN_DATABASE_URL pointant vers un rôle membre de « aurion_admin » ;
 * sinon l'appel échoue avec ADMIN_DB_NOT_CONFIGURED (503) plutôt que de renvoyer des données vides.
 */
export async function adminQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(text:string, values:unknown[]=[]){
  if (!adminDb) {
    const error = new Error('Pool d’administration non configuré (AURION_ADMIN_DATABASE_URL).') as Error & { statusCode?: number; code?: string };
    error.code = 'ADMIN_DB_NOT_CONFIGURED'; error.statusCode = 503;
    throw error;
  }
  return adminDb.query<T>(text, values);
}

/**
 * Transaction d'administration : UNE connexion, BEGIN/COMMIT/ROLLBACK, pour les traitements
 * inter-entreprises qui doivent être atomiques (suppression de compte, reprises).
 * Les verrous de ligne (`select … for update`) pris dans `work` couvrent toute la transaction.
 */
export async function adminTransaction<T>(work:(client:pg.PoolClient)=>Promise<T>):Promise<T>{
  if (!adminDb) {
    const error = new Error('Pool d’administration non configuré (AURION_ADMIN_DATABASE_URL).') as Error & { statusCode?: number; code?: string };
    error.code = 'ADMIN_DB_NOT_CONFIGURED'; error.statusCode = 503;
    throw error;
  }
  const client = await adminDb.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
