// Stockage documentaire dans le cloud personnel de l'utilisateur (Google Drive, première implémentation).
// Principes (cahier des charges 15.4.0) :
//  - les fichiers originaux sont envoyés dans le Drive de l'utilisateur, jamais conservés durablement par Aurion ;
//  - la base Aurion ne garde que les métadonnées (référence métier, identifiant distant, état, empreintes) ;
//  - les jetons OAuth sont chiffrés au repos (AES-256-GCM, clé hors dépôt) et ne sortent jamais du serveur ;
//  - un document n'est déclaré « synchronisé » qu'après confirmation du fournisseur (identifiant + MD5 + taille) ;
//  - aucun fichier n'est remplacé : chaque nouvelle version est un nouveau fichier, l'historique est conservé.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { db, query } from '../db.js';
import { encrypt, decrypt } from './google.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
// drive.file : accès limité aux fichiers créés ou ouverts avec Aurion. about.get (quota) accepte ce périmètre.
export const DRIVE_SCOPES = [DRIVE_SCOPE];
export const ROOT_FOLDER_NAME = 'Aurion — Mon entreprise';
export const CLOUD_FOLDERS: ReadonlyArray<readonly [string, string]> = [
  ['administratif', '01_Administratif'],
  ['clients', '02_Clients'],
  ['fournisseurs', '03_Fournisseurs'],
  ['devis', '04_Devis'],
  ['factures', '05_Factures'],
  ['achats', '06_Achats_et_depenses'],
  ['notes_de_frais', '07_Notes_de_frais'],
  ['exports', '08_Exports_comptables'],
  ['archives', '09_Archives'],
] as const;
export const SOURCE_FOLDER: Record<string, string> = {
  quote: 'devis', invoice: 'factures', expense_receipt: 'notes_de_frais', accounting_export: 'exports', file: 'administratif', other: 'archives',
};
export const MAX_CLOUD_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv', 'text/plain', 'application/zip',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const FOLDER_MIME = 'application/vnd.google-apps.folder';
// Les URL de l'API sont fixes en production ; un double local peut être injecté uniquement hors production (tests d'intégration).
const apiBase = () => (config.NODE_ENV !== 'production' && process.env.AURION_GOOGLE_API_BASE_FOR_TESTS) || 'https://www.googleapis.com';
const tokenUrl = () => (config.NODE_ENV !== 'production' && process.env.AURION_GOOGLE_TOKEN_URL_FOR_TESTS) || 'https://oauth2.googleapis.com/token';
const revokeUrl = () => (config.NODE_ENV !== 'production' && process.env.AURION_GOOGLE_REVOKE_URL_FOR_TESTS) || 'https://oauth2.googleapis.com/revoke';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export class CloudError extends Error {
  constructor(public code: string, public statusCode = 502, message?: string) { super(message || code); }
}

/** Seuils d'alerte de quota, centralisés et modifiables (AURION_CLOUD_QUOTA_THRESHOLDS="80,90,95,100"). */
export function quotaThresholds(): { warning: number; alert: number; critical: number; full: number } {
  const raw = String(process.env.AURION_CLOUD_QUOTA_THRESHOLDS || '80,90,95,100').split(',').map(x => Number(x.trim()));
  const valid = raw.length === 4 && raw.every(x => Number.isFinite(x) && x > 0 && x <= 100) && raw[0] < raw[1] && raw[1] < raw[2] && raw[2] <= raw[3];
  const [warning, alert, critical, full] = valid ? raw : [80, 90, 95, 100];
  return { warning, alert, critical, full };
}

export type QuotaLevel = 'ok' | 'warning' | 'alert' | 'critical' | 'full' | 'unknown';
export function quotaLevel(limit: number | null, usage: number | null): QuotaLevel {
  if (limit === null || usage === null || !Number.isFinite(limit) || !Number.isFinite(usage) || limit <= 0) return 'unknown';
  const percent = (usage / limit) * 100, t = quotaThresholds();
  if (percent >= t.full) return 'full';
  if (percent >= t.critical) return 'critical';
  if (percent >= t.alert) return 'alert';
  if (percent >= t.warning) return 'warning';
  return 'ok';
}

export function driveRedirectUri(): string {
  if (process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim()) return process.env.GOOGLE_DRIVE_REDIRECT_URI.trim();
  const base = String(process.env.APP_BASE_URL || '').trim() || `http://127.0.0.1:${config.PORT}`;
  return new URL('/cloud/google/callback', base).toString();
}

export function driveSetupStatus() {
  const missing: string[] = [];
  if (!config.GOOGLE_CLIENT_ID.trim()) missing.push('GOOGLE_CLIENT_ID');
  if (!config.GOOGLE_CLIENT_SECRET.trim()) missing.push('GOOGLE_CLIENT_SECRET');
  if (config.GOOGLE_TOKEN_ENCRYPTION_KEY.trim().length < 32) missing.push('GOOGLE_TOKEN_ENCRYPTION_KEY (32 caractères minimum)');
  try {
    const u = new URL(driveRedirectUri());
    if (u.pathname !== '/cloud/google/callback' || u.search || u.hash || u.username || u.password) missing.push('GOOGLE_DRIVE_REDIRECT_URI (chemin /cloud/google/callback)');
    if (config.NODE_ENV === 'production' && u.protocol !== 'https:') missing.push('GOOGLE_DRIVE_REDIRECT_URI HTTPS');
  } catch { missing.push('GOOGLE_DRIVE_REDIRECT_URI invalide'); }
  return { configured: missing.length === 0, missingConfiguration: missing };
}

export function authorizationUrl(state: string, loginHint?: string) {
  const u = new URL(AUTH_URL);
  u.searchParams.set('client_id', config.GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', driveRedirectUri());
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', DRIVE_SCOPES.join(' '));
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('include_granted_scopes', 'false');
  u.searchParams.set('state', state);
  if (loginHint && /^[^\s@]+@[^\s@]+$/.test(loginHint)) u.searchParams.set('login_hint', loginHint);
  return u.toString();
}

async function tokenRequest(body: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(tokenUrl(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString(), signal: AbortSignal.timeout(15_000) });
  } catch { throw new CloudError('CLOUD_UNAVAILABLE', 503, 'Le service Google ne répond pas. Réessayez plus tard.'); }
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data?.error === 'invalid_grant') throw new CloudError('CLOUD_REVOKED', 401, 'L’autorisation Google Drive a expiré ou a été révoquée. Reconnectez le cloud.');
    throw new CloudError('CLOUD_TOKEN_FAILED', 502, 'Google a refusé l’échange d’autorisation.');
  }
  return data as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
}

export async function exchangeCode(code: string) {
  return tokenRequest({ code, client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, redirect_uri: driveRedirectUri(), grant_type: 'authorization_code' });
}

async function audit(organizationId: string, userId: string | null, action: string, detail: Record<string, unknown> = {}) {
  // Jamais de jeton, de contenu de document ni de nom de fichier complet dans le journal d'audit.
  try { await query('insert into cloud_audit_events(organization_id,user_id,action,detail) values($1,$2,$3,$4)', [organizationId, userId, action, JSON.stringify(detail)]); } catch { /* audit best-effort */ }
}
export { audit as cloudAudit };

export async function saveConnection(organizationId: string, userId: string, tokens: { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string }) {
  const scopes = String(tokens.scope || '');
  if (!scopes.split(/\s+/).includes(DRIVE_SCOPE)) throw new CloudError('CLOUD_SCOPE_REFUSED', 400, 'L’autorisation d’accès aux fichiers Aurion dans Google Drive n’a pas été accordée.');
  const expiresAt = tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null;
  await query(`insert into cloud_connections(organization_id,provider,status,access_token_enc,refresh_token_enc,expires_at,scopes,last_error_code,connected_at,updated_at)
    values($1,'google_drive','connected',$2,$3,$4,$5,null,now(),now())
    on conflict(organization_id) do update set provider='google_drive',status='connected',
      access_token_enc=excluded.access_token_enc,
      refresh_token_enc=coalesce(excluded.refresh_token_enc,cloud_connections.refresh_token_enc),
      expires_at=excluded.expires_at,scopes=excluded.scopes,last_error_code=null,connected_at=now(),updated_at=now()`,
  [organizationId, tokens.access_token ? encrypt(tokens.access_token) : null, tokens.refresh_token ? encrypt(tokens.refresh_token) : null, expiresAt, scopes]);
  await audit(organizationId, userId, 'cloud_connected', { provider: 'google_drive' });
}

async function connectionRow(organizationId: string) {
  return (await query('select * from cloud_connections where organization_id=$1', [organizationId])).rows[0] || null;
}

async function markRevoked(organizationId: string) {
  await query(`update cloud_connections set status='revoked',access_token_enc=null,last_error_code='CLOUD_REVOKED',updated_at=now() where organization_id=$1`, [organizationId]);
  await upsertJournal(organizationId, 'cloud_connection', 'cloud-connection', 'Cloud déconnecté', 'L’autorisation Google Drive a expiré ou a été révoquée. Vos documents en attente restent conservés sur vos appareils. Reconnectez le cloud dans Paramètres → Stockage.', 'error', '/dashboard?view=settings&section=settings-storage');
}

/** Jeton d'accès valide (renouvelé si nécessaire). Le jeton ne quitte jamais le serveur. */
async function accessToken(organizationId: string, forceRefresh = false): Promise<string> {
  const row = await connectionRow(organizationId);
  if (!row || row.status === 'disconnected') throw new CloudError('CLOUD_NOT_CONNECTED', 409, 'Aucun cloud n’est connecté.');
  if (row.status === 'revoked') throw new CloudError('CLOUD_REVOKED', 401, 'L’autorisation Google Drive a expiré ou a été révoquée. Reconnectez le cloud.');
  const current = row.access_token_enc ? decrypt(row.access_token_enc) : '';
  const fresh = row.expires_at && new Date(row.expires_at).getTime() - Date.now() > 60_000;
  if (current && fresh && !forceRefresh) return current;
  const refresh = row.refresh_token_enc ? decrypt(row.refresh_token_enc) : '';
  if (!refresh) { await markRevoked(organizationId); throw new CloudError('CLOUD_REVOKED', 401, 'Reconnectez le cloud pour renouveler l’autorisation.'); }
  try {
    const t = await tokenRequest({ refresh_token: refresh, client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token' });
    const expiresAt = t.expires_in ? new Date(Date.now() + Number(t.expires_in) * 1000) : null;
    await query(`update cloud_connections set access_token_enc=$1,refresh_token_enc=coalesce($2,refresh_token_enc),expires_at=$3,status='connected',last_error_code=null,updated_at=now() where organization_id=$4`,
      [t.access_token ? encrypt(t.access_token) : null, t.refresh_token ? encrypt(t.refresh_token) : null, expiresAt, organizationId]);
    await audit(organizationId, null, 'cloud_token_refreshed');
    return String(t.access_token || '');
  } catch (error) {
    if (error instanceof CloudError && error.code === 'CLOUD_REVOKED') await markRevoked(organizationId);
    throw error;
  }
}

/** Appel Drive authentifié avec un renouvellement du jeton sur 401 et une classification claire des erreurs. */
async function driveFetch(organizationId: string, path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await accessToken(organizationId, retried);
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  let response: Response;
  try { response = await fetch(`${apiBase()}${path}`, { ...init, headers, signal: AbortSignal.timeout(60_000) }); }
  catch { throw new CloudError('CLOUD_UNAVAILABLE', 503, 'Google Drive ne répond pas. Le transfert sera relancé automatiquement.'); }
  if (response.status === 401 && !retried) return driveFetch(organizationId, path, init, true);
  if (response.ok) return response;
  const data: any = await response.json().catch(() => ({}));
  const reason = String(data?.error?.errors?.[0]?.reason || data?.error?.status || '');
  if (response.status === 401) { await markRevoked(organizationId); throw new CloudError('CLOUD_REVOKED', 401, 'L’autorisation Google Drive a été révoquée. Reconnectez le cloud.'); }
  if (/storageQuotaExceeded|quotaExceeded/i.test(reason) && !/rateLimit/i.test(reason)) throw new CloudError('CLOUD_QUOTA_EXCEEDED', 507, 'Votre espace Google Drive est saturé. Le document reste en attente sur cet appareil.');
  if (response.status === 429 || /rateLimitExceeded|userRateLimitExceeded/i.test(reason)) throw new CloudError('CLOUD_RATE_LIMITED', 503, 'Google Drive limite temporairement les requêtes. Nouvel essai automatique.');
  if (response.status === 404) throw new CloudError('CLOUD_NOT_FOUND', 404, 'Fichier introuvable dans le cloud.');
  if (response.status === 403) throw new CloudError('CLOUD_FORBIDDEN', 403, 'Google Drive a refusé l’opération (autorisation insuffisante).');
  if (response.status >= 500) throw new CloudError('CLOUD_UNAVAILABLE', 503, 'Google Drive est temporairement indisponible.');
  throw new CloudError('CLOUD_REQUEST_FAILED', 502, 'La requête Google Drive a échoué.');
}

const qEscape = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findByAppProperty(organizationId: string, key: string, value: string, extra = ''): Promise<any | null> {
  const q = `appProperties has { key='${qEscape(key)}' and value='${qEscape(value)}' } and trashed=false${extra ? ' and ' + extra : ''}`;
  const r = await driveFetch(organizationId, `/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&pageSize=10&fields=${encodeURIComponent('files(id,name,md5Checksum,size,version,parents,mimeType)')}`);
  const data: any = await r.json();
  return (data.files || [])[0] || null;
}

async function folderExists(organizationId: string, id: string): Promise<boolean> {
  try { const r = await driveFetch(organizationId, `/drive/v3/files/${encodeURIComponent(id)}?fields=id,trashed,mimeType`); const d: any = await r.json(); return Boolean(d.id) && !d.trashed && d.mimeType === FOLDER_MIME; }
  catch (e) { if (e instanceof CloudError && e.code === 'CLOUD_NOT_FOUND') return false; throw e; }
}

async function createFolder(organizationId: string, name: string, parent: string | null, props: Record<string, string>) {
  const body = { name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}), appProperties: props };
  const r = await driveFetch(organizationId, '/drive/v3/files?fields=id,name', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return (await r.json() as any).id as string;
}

/**
 * Crée (une seule fois) « Aurion — Mon entreprise » et ses sous-dossiers.
 * Idempotent : identifiants mémorisés, existence vérifiée, recherche par propriété applicative avant création,
 * verrou consultatif PostgreSQL par entreprise pour éviter deux créations concurrentes.
 */
export async function ensureFolderTree(organizationId: string): Promise<Record<string, string>> {
  const client = await db.connect();
  try {
    await client.query('select pg_advisory_lock(hashtextextended($1,73))', [organizationId]);
    const known = new Map<string, string>((await client.query('select folder_key,remote_id from cloud_folders where organization_id=$1 and provider=$2', [organizationId, 'google_drive'])).rows.map((r: any) => [r.folder_key, r.remote_id]));
    const remember = async (key: string, id: string, name: string) => {
      await client.query(`insert into cloud_folders(organization_id,provider,folder_key,remote_id,name,verified_at) values($1,'google_drive',$2,$3,$4,now())
        on conflict(organization_id,provider,folder_key) do update set remote_id=excluded.remote_id,name=excluded.name,verified_at=now()`, [organizationId, key, id, name]);
      known.set(key, id);
    };
    let root = known.get('root') || '';
    if (!root || !(await folderExists(organizationId, root))) {
      const found = await findByAppProperty(organizationId, 'aurionRoot', organizationId, `mimeType='${FOLDER_MIME}'`);
      root = found?.id || await createFolder(organizationId, ROOT_FOLDER_NAME, null, { aurionRoot: organizationId });
      await remember('root', root, ROOT_FOLDER_NAME);
    }
    for (const [key, name] of CLOUD_FOLDERS) {
      const id = known.get(key);
      if (id && await folderExists(organizationId, id)) continue;
      const found = await findByAppProperty(organizationId, 'aurionFolder', `${organizationId}:${key}`, `mimeType='${FOLDER_MIME}'`);
      await remember(key, found?.id || await createFolder(organizationId, name, root, { aurionFolder: `${organizationId}:${key}` }), name);
    }
    await client.query('update cloud_connections set root_folder_id=$1,updated_at=now() where organization_id=$2', [root, organizationId]);
    return Object.fromEntries(known);
  } finally {
    await client.query('select pg_advisory_unlock(hashtextextended($1,73))', [organizationId]).catch(() => {});
    client.release();
  }
}

export async function upsertJournal(organizationId: string, eventType: string, dedupeKey: string, title: string, description: string, severity: 'action' | 'info' | 'warning' | 'error' | 'success', internalPath: string, levelChanged = true) {
  // Une seule notification par sujet : elle est mise à jour (ou réouverte si la situation s'aggrave), jamais dupliquée.
  await query(`insert into dashboard_journal_events(organization_id,event_type,title,description,severity,source,internal_path,dedupe_key)
    values($1,$2,$3,$4,$5,'cloud',$6,$7)
    on conflict(organization_id,dedupe_key) do update set title=excluded.title,description=excluded.description,severity=excluded.severity,internal_path=excluded.internal_path,
      is_read=case when $8::boolean then false else dashboard_journal_events.is_read end,
      resolved_at=case when $8::boolean then null else dashboard_journal_events.resolved_at end`,
  [organizationId, eventType, title.slice(0, 240), description, severity, internalPath, dedupeKey, levelChanged]);
}

export async function resolveJournal(organizationId: string, dedupeKey: string) {
  await query('update dashboard_journal_events set resolved_at=coalesce(resolved_at,now()) where organization_id=$1 and dedupe_key=$2 and resolved_at is null', [organizationId, dedupeKey]);
}

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'non communiqué';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']; let v = Number(value), i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}

const QUOTA_MESSAGES: Record<string, { title: string; severity: 'warning' | 'error' | 'action'; advice: string }> = {
  warning: { title: 'Stockage cloud : 80 % utilisés', severity: 'warning', advice: 'Pensez à libérer de l’espace chez votre fournisseur.' },
  alert: { title: 'Stockage cloud : alerte importante (90 %)', severity: 'warning', advice: 'Libérez de l’espace chez votre fournisseur ou vérifiez le compte connecté.' },
  critical: { title: 'Stockage cloud : situation critique (95 %)', severity: 'error', advice: 'Libérez rapidement de l’espace : les prochains transferts risquent d’être refusés.' },
  full: { title: 'Stockage cloud saturé', severity: 'error', advice: 'Les nouveaux documents restent en attente sur vos appareils tant que de l’espace n’est pas libéré.' },
};

async function notifyQuota(organizationId: string, level: QuotaLevel, previous: string, limit: number | null, usage: number | null, checkedAt: Date) {
  if (level === 'ok') { await resolveJournal(organizationId, 'cloud-quota'); return; }
  if (level === 'unknown') return; // aucune alerte inventée sans limite exploitable
  const m = QUOTA_MESSAGES[level];
  const percent = limit && usage !== null ? Math.min(100, (usage / limit) * 100) : null;
  const description = `${m.advice} Dernière mesure : ${formatBytes(usage)} utilisés sur ${formatBytes(limit)}${percent !== null ? ` (${percent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)` : ''}, le ${checkedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}. Consultez Paramètres → Stockage.`;
  const rank = (x: string) => ['ok', 'unknown', 'warning', 'alert', 'critical', 'full'].indexOf(x);
  await upsertJournal(organizationId, 'cloud_quota', 'cloud-quota', m.title, description, m.severity, '/dashboard?view=settings&section=settings-storage', rank(level) > rank(previous));
}

/** Lit le quota réel (about.get). En cas d'échec, la dernière valeur connue est conservée et marquée obsolète. */
export async function refreshQuota(organizationId: string, { force = false }: { force?: boolean } = {}) {
  const row = await connectionRow(organizationId);
  if (!row || row.status !== 'connected') return quotaSnapshot(row);
  if (!force && row.quota_checked_at && Date.now() - new Date(row.quota_checked_at).getTime() < 60_000) return quotaSnapshot(row);
  try {
    const r = await driveFetch(organizationId, `/drive/v3/about?fields=${encodeURIComponent('user(emailAddress),storageQuota(limit,usage,usageInDrive,usageInDriveTrash)')}`);
    const data: any = await r.json();
    const num = (v: unknown) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const limit = num(data?.storageQuota?.limit), usage = num(data?.storageQuota?.usage);
    const level = quotaLevel(limit, usage);
    const aurion = Number((await query(`select coalesce(sum(size_bytes),0)::bigint n from cloud_documents where organization_id=$1 and status in ('synced','conflict')`, [organizationId])).rows[0]?.n || 0);
    const checkedAt = new Date();
    await query(`update cloud_connections set account_email=coalesce($1,account_email),quota_limit_bytes=$2,quota_usage_bytes=$3,quota_drive_usage_bytes=$4,quota_trash_usage_bytes=$5,quota_aurion_usage_bytes=$6,quota_checked_at=$7,quota_error=null,quota_level=$8,updated_at=now() where organization_id=$9`,
      [data?.user?.emailAddress || null, limit, usage, num(data?.storageQuota?.usageInDrive), num(data?.storageQuota?.usageInDriveTrash), aurion, checkedAt, level, organizationId]);
    await notifyQuota(organizationId, level, row.quota_level || 'ok', limit, usage, checkedAt);
  } catch (error) {
    const code = error instanceof CloudError ? error.code : 'CLOUD_QUOTA_UNAVAILABLE';
    await query('update cloud_connections set quota_error=$1,updated_at=now() where organization_id=$2', [code, organizationId]);
    if (code === 'CLOUD_REVOKED') throw error;
  }
  return quotaSnapshot(await connectionRow(organizationId));
}

export function quotaSnapshot(row: any) {
  if (!row) return null;
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const limit = n(row.quota_limit_bytes), usage = n(row.quota_usage_bytes);
  const checkedAt = row.quota_checked_at ? new Date(row.quota_checked_at) : null;
  return {
    limitBytes: limit, usageBytes: usage, usageInDriveBytes: n(row.quota_drive_usage_bytes), trashBytes: n(row.quota_trash_usage_bytes), aurionBytes: n(row.quota_aurion_usage_bytes),
    availableBytes: limit !== null && usage !== null ? Math.max(0, limit - usage) : null,
    percentUsed: limit && usage !== null ? Math.min(100, Math.round((usage / limit) * 1000) / 10) : null,
    totalKnown: limit !== null && limit > 0,
    level: row.quota_level || 'unknown', checkedAt: checkedAt?.toISOString() || null,
    stale: !checkedAt || Boolean(row.quota_error) || Date.now() - checkedAt.getTime() > 24 * 3600_000,
    error: row.quota_error || null, thresholds: quotaThresholds(),
  };
}

export async function cloudStatus(organizationId: string) {
  const row = await connectionRow(organizationId);
  const counts = (await query(`select count(*) filter (where status in ('pending','syncing'))::int pending, count(*) filter (where status='error')::int errors, count(*) filter (where status='conflict')::int conflicts, count(*) filter (where status='synced')::int synced from cloud_documents where organization_id=$1`, [organizationId])).rows[0] || {};
  return {
    provider: row?.provider || null, providerLabel: row ? 'Google Drive' : null,
    status: row?.status || 'not_connected', accountEmail: row?.account_email || null,
    connectedAt: row?.connected_at || null, rootFolder: row?.root_folder_id ? ROOT_FOLDER_NAME : null,
    lastError: row?.last_error_code || null, quota: quotaSnapshot(row),
    server: { pending: Number(counts.pending || 0), errors: Number(counts.errors || 0), conflicts: Number(counts.conflicts || 0), synced: Number(counts.synced || 0) },
    setup: driveSetupStatus(),
  };
}

export async function disconnect(organizationId: string, userId: string) {
  const row = await connectionRow(organizationId);
  if (!row) return { ok: true, revoked: false };
  let revoked = false;
  const token = row.refresh_token_enc ? decrypt(row.refresh_token_enc) : row.access_token_enc ? decrypt(row.access_token_enc) : '';
  if (token) {
    try { const r = await fetch(revokeUrl(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString(), signal: AbortSignal.timeout(10_000) }); revoked = r.ok; } catch { revoked = false; }
  }
  // Les secrets sont effacés ; les fichiers déjà présents dans le Drive ne sont jamais supprimés.
  await query(`update cloud_connections set status='disconnected',access_token_enc=null,refresh_token_enc=null,expires_at=null,last_error_code=null,updated_at=now() where organization_id=$1`, [organizationId]);
  await resolveJournal(organizationId, 'cloud-quota');
  await resolveJournal(organizationId, 'cloud-connection');
  await audit(organizationId, userId, 'cloud_disconnected', { remoteRevocation: revoked });
  return { ok: true, revoked };
}

const safeName = (value: string) => String(value || 'document').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'document';
export function businessFileName(reference: string, partyName: string | null | undefined, ext: string) {
  const party = String(partyName || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return safeName(`${reference}${party ? `_${party}` : ''}${ext.startsWith('.') ? ext : `.${ext}`}`);
}

export function detectMime(bytes: Buffer, declared: string, fileName: string): string | null {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const map: Record<string, string> = { '.odt': 'application/vnd.oasis.opendocument.text', '.ods': 'application/vnd.oasis.opendocument.spreadsheet', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.zip': 'application/zip' };
    return map[ext] || 'application/zip';
  }
  if (['.csv', '.txt'].includes(ext) && !bytes.subarray(0, 4096).includes(0)) return ext === '.csv' ? 'text/csv' : 'text/plain';
  return ALLOWED_UPLOAD_TYPES.has(declared) && !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(declared) && !bytes.subarray(0, 4096).includes(0) ? declared : null;
}

export type UploadInput = {
  organizationId: string; userId: string; clientRef: string; sourceKind: string; sourceId?: string | null; businessRef?: string | null;
  fileName: string; mimeType: string; bytes: Buffer; expectedSha256?: string | null; baseVersion?: number | null; allowNewVersion?: boolean; deviceLabel?: string | null;
};

/**
 * Transfert idempotent : rejouer la même requête (même clientRef) ne crée jamais de doublon.
 * Retourne l'état confirmé par le fournisseur. Une saturation du quota n'est jamais présentée comme un succès.
 */
export async function uploadDocument(input: UploadInput) {
  const { organizationId, clientRef, bytes } = input;
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const md5 = crypto.createHash('md5').update(bytes).digest('hex');
  if (input.expectedSha256 && input.expectedSha256.toLowerCase() !== sha256) throw new CloudError('CLOUD_INTEGRITY_MISMATCH', 422, 'Le fichier reçu ne correspond pas à l’empreinte de l’appareil. Le transfert sera relancé.');
  const existing = (await query('select * from cloud_documents where organization_id=$1 and client_ref=$2', [organizationId, clientRef])).rows[0];
  if (existing && ['synced', 'conflict'].includes(existing.status) && existing.sha256 === sha256) return { document: existing, replay: true };
  if (existing && existing.sha256 && existing.sha256 !== sha256) throw new CloudError('CLOUD_CLIENT_REF_REUSED', 409, 'Cet identifiant de transfert est déjà utilisé par un autre contenu.');

  // Versions et conflits : on compare à la dernière version confirmée du même objet métier.
  let version = 1, supersedes: string | null = null, conflict = false, locked = input.sourceKind === 'invoice';
  if (input.sourceId && !existing) {
    const latest = (await query(`select id,version,sha256,locked,status from cloud_documents where organization_id=$1 and source_kind=$2 and source_id=$3 and status in ('synced','conflict') order by version desc limit 1`, [organizationId, input.sourceKind, input.sourceId])).rows[0];
    if (latest) {
      if (latest.sha256 === sha256) return { document: latest, replay: true, sameContent: true };
      if (latest.locked && !input.allowNewVersion) throw new CloudError('ISSUED_DOCUMENT_LOCKED', 409, 'Ce document comptable émis est déjà archivé. Une nouvelle version doit être demandée explicitement ; l’original ne sera jamais remplacé.');
      version = Number(latest.version) + 1; supersedes = latest.id;
      if (input.baseVersion !== undefined && input.baseVersion !== null && Number(input.baseVersion) < Number(latest.version)) conflict = true;
    }
  }
  const folders = await ensureFolderTree(organizationId);
  const folderKey = SOURCE_FOLDER[input.sourceKind] || 'administratif';
  const parent = folders[folderKey];
  const dot = input.fileName.lastIndexOf('.');
  const stem = dot > 0 ? input.fileName.slice(0, dot) : input.fileName, ext = dot > 0 ? input.fileName.slice(dot) : '';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const finalName = safeName(conflict ? `${stem}_conflit_${stamp}${ext}` : version > 1 ? `${stem}_v${version}${ext}` : input.fileName);

  const row = existing || (await query(`insert into cloud_documents(organization_id,client_ref,business_ref,source_kind,source_id,folder_key,file_name,mime_type,size_bytes,sha256,version,status,locked,supersedes_id,uploaded_by,device_label)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'syncing',$12,$13,$14,$15) returning *`,
  [organizationId, clientRef, input.businessRef || null, input.sourceKind, input.sourceId || null, folderKey, finalName, input.mimeType, bytes.length, sha256, version, locked, supersedes, input.userId, input.deviceLabel || null])).rows[0];
  if (existing) await query(`update cloud_documents set status='syncing',error_code=null,sha256=$1,size_bytes=$2,updated_at=now() where id=$3`, [sha256, bytes.length, existing.id]);

  try {
    // Reprise après coupure : le fichier a pu être créé alors que la réponse a été perdue.
    let remote = await findByAppProperty(organizationId, 'aurionClientRef', clientRef);
    if (!remote) {
      const boundary = `aurion_${crypto.randomBytes(12).toString('hex')}`;
      const metadata = { name: row.file_name || finalName, parents: [parent], mimeType: input.mimeType, appProperties: { aurionClientRef: clientRef, aurionOrg: organizationId, aurionRef: String(input.businessRef || '').slice(0, 100), aurionSha256: sha256, aurionVersion: String(version) } };
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
        bytes, Buffer.from(`\r\n--${boundary}--`),
      ]);
      const r = await driveFetch(organizationId, `/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent('id,name,md5Checksum,size,version')}`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body });
      remote = await r.json();
    }
    if (!remote?.id || String(remote.md5Checksum || '').toLowerCase() !== md5 || Number(remote.size) !== bytes.length) {
      await query(`update cloud_documents set status='error',error_code='CLOUD_INTEGRITY_CHECK_FAILED',remote_id=$1,updated_at=now() where id=$2`, [remote?.id || null, row.id]);
      throw new CloudError('CLOUD_INTEGRITY_CHECK_FAILED', 502, 'Le fournisseur n’a pas confirmé l’intégrité du fichier. Il reste en attente sur l’appareil.');
    }
    const saved = (await query(`update cloud_documents set status=$1,error_code=null,remote_id=$2,remote_md5=$3,remote_version=$4,synced_at=now(),updated_at=now() where id=$5 returning *`,
      [conflict ? 'conflict' : 'synced', remote.id, md5, remote.version ? Number(remote.version) : null, row.id])).rows[0];
    await audit(organizationId, input.userId, conflict ? 'cloud_upload_conflict' : 'cloud_upload_confirmed', { kind: input.sourceKind, version, bytes: bytes.length });
    if (conflict) await upsertJournal(organizationId, 'cloud_conflict', `cloud-conflict-${input.sourceKind}-${input.sourceId}`, 'Conflit de modification détecté', `Deux appareils ont modifié ${input.businessRef || 'le même document'}. Les deux versions sont conservées dans le cloud (aucun écrasement).`, 'warning', '/dashboard?view=settings&section=settings-storage');
    // Actualisation du quota après un transfert important.
    if (bytes.length >= 5 * 1024 * 1024) refreshQuota(organizationId, { force: true }).catch(() => {});
    return { document: saved, replay: false, conflict };
  } catch (error) {
    const code = error instanceof CloudError ? error.code : 'CLOUD_UPLOAD_FAILED';
    await query(`update cloud_documents set status='error',error_code=$1,updated_at=now() where id=$2 and status<>'synced'`, [code, row.id]);
    if (code === 'CLOUD_QUOTA_EXCEEDED') {
      await query(`update cloud_connections set quota_level='full',updated_at=now() where organization_id=$1`, [organizationId]);
      await upsertJournal(organizationId, 'cloud_quota', 'cloud-quota', 'Stockage cloud saturé', 'Un transfert a été refusé par Google Drive faute d’espace. Le document reste en attente sur votre appareil : libérez de l’espace chez votre fournisseur ou vérifiez le compte connecté (Paramètres → Stockage).', 'error', '/dashboard?view=settings&section=settings-storage', true);
    }
    throw error;
  }
}

export async function downloadDocument(organizationId: string, id: string) {
  const row = (await query('select * from cloud_documents where organization_id=$1 and id=$2', [organizationId, id])).rows[0];
  if (!row) throw new CloudError('NOT_FOUND', 404, 'Document introuvable.');
  if (!row.remote_id || !['synced', 'conflict'].includes(row.status)) throw new CloudError('CLOUD_NOT_SYNCED', 409, 'Ce document n’est pas encore synchronisé avec le cloud.');
  const r = await driveFetch(organizationId, `/drive/v3/files/${encodeURIComponent(row.remote_id)}?alt=media`);
  const bytes = Buffer.from(await r.arrayBuffer());
  return { row, bytes };
}
