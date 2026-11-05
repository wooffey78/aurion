import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, unlink, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash, createHmac, randomUUID } from 'node:crypto';

// backend/src/services -> backend  (identique en dev et dans dist/) : indépendant du dossier courant.
export const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STORAGE_BASE = path.join(BACKEND_ROOT, 'storage');
export const PRIVATE_BASE = path.join(STORAGE_BASE, 'private');

/** Dossier privé d'une organisation : backend/storage/private/<org> */
export function privateRoot(organizationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error('INVALID_ORGANIZATION_ID');
  return path.join(PRIVATE_BASE, organizationId);
}

/**
 * Convertit une clé de stockage ("private/<org>/<fichier>") en chemin disque
 * backend/storage/private/<org>/<fichier>, avec protection contre la traversée de dossiers.
 */
export function fileFromKey(key: string) {
  const clean = validatePrivateKey(key);
  const full = path.resolve(STORAGE_BASE, clean);
  if (!full.startsWith(STORAGE_BASE + path.sep)) throw new Error('INVALID_STORAGE_KEY');
  return full;
}

function validatePrivateKey(value: string) {
  const key = String(value || '');
  const segments = key.split('/');
  if (key.startsWith('/') || key.includes('\\') || key.includes('\0') || segments[0] !== 'private' || segments.length < 3 || segments.some(part => !part || part === '.' || part === '..' || /[\r\n]/.test(part))) {
    throw new Error('INVALID_STORAGE_KEY');
  }
  return key;
}

type S3Config = { bucket: string; accessKey: string; secretKey: string; endpoint: URL; region: string; forcePathStyle: boolean };
function s3Config(): S3Config | null {
  const mode = String(process.env.AURION_STORAGE_BACKEND || '').trim().toLowerCase();
  const bucket = String(process.env.AURION_S3_BUCKET || '').trim();
  if (mode !== 's3' && !bucket) return null;
  const accessKey = String(process.env.AURION_S3_ACCESS_KEY || '').trim();
  const secretKey = String(process.env.AURION_S3_SECRET_KEY || '');
  const endpointText = String(process.env.AURION_S3_ENDPOINT || 'https://s3.de.io.cloud.ovh.net').trim();
  const region = String(process.env.AURION_S3_REGION || 'de').trim();
  const forcePathStyle = String(process.env.AURION_S3_FORCE_PATH_STYLE || '').trim().toLowerCase() === 'true';
  if (!bucket || !accessKey || !secretKey) throw new Error('S3_STORAGE_CONFIGURATION_INCOMPLETE');
  const endpoint = new URL(endpointText);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('S3_ENDPOINT_MUST_BE_HTTPS');
  // Dot-free names keep virtual-host TLS certificates valid for bucket.s3.<region>.io.cloud.ovh.net.
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('INVALID_S3_BUCKET');
  return { bucket, accessKey, secretKey, endpoint, region, forcePathStyle };
}
export function privateStorageMode(): 'local' | 's3' { return s3Config() ? 's3' : 'local'; }
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) => createHmac('sha256', key).update(value).digest();
const encodeKey = (key: string) => String(key).split('/').map(part => encodeURIComponent(part).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
export function s3ObjectUrl(config: S3Config, key: string) {
  const url = new URL(config.endpoint.toString());
  if (config.forcePathStyle) {
    // Neon Object Storage requires path-style addressing; keep the endpoint host unchanged.
    url.pathname = `/${encodeKey(config.bucket)}/${encodeKey(key)}`;
  } else {
    // OVHcloud supports virtual-host bucket addressing.
    url.hostname = `${config.bucket}.${url.hostname}`;
    url.pathname = `/${encodeKey(key)}`;
  }
  return url;
}
async function s3Request(method: 'GET' | 'PUT' | 'DELETE' | 'HEAD', key: string, body?: Buffer, contentType?: string) {
  const cfg = s3Config();
  if (!cfg) throw new Error('S3_STORAGE_NOT_CONFIGURED');
  const url = s3ObjectUrl(cfg, key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256(body || Buffer.alloc(0));
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(name => `${name}:${headers[name]!.trim()}\n`).join('');
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const toSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const dateKey = hmac(`AWS4${cfg.secretKey}`, date);
  const regionKey = hmac(dateKey, cfg.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(url, { method, headers: { ...headers, Authorization: authorization }, ...(body && method === 'PUT' ? { body: new Uint8Array(body) } : {}), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`S3_REQUEST_FAILED:${method}:${response.status}`);
  return response;
}

/** Stockage d'objets privé, local en développement et S3 privé en production. */
export async function readPrivateObject(key: string): Promise<Buffer> {
  const safeKey = validatePrivateKey(key);
  if (s3Config()) return Buffer.from(await (await s3Request('GET', safeKey)).arrayBuffer());
  return readFile(fileFromKey(safeKey));
}
export async function writePrivateObject(key: string, bytes: Buffer, contentType?: string): Promise<void> {
  const safeKey = validatePrivateKey(key);
  if (s3Config()) { await s3Request('PUT', safeKey, bytes, contentType); return; }
  const target = fileFromKey(safeKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'w' });
}
export async function deletePrivateObject(key: string): Promise<void> {
  const safeKey = validatePrivateKey(key);
  if (s3Config()) { await s3Request('DELETE', safeKey); return; }
  await unlink(fileFromKey(safeKey));
}
export async function privateObjectExists(key: string): Promise<boolean> {
  const safeKey = validatePrivateKey(key);
  if (s3Config()) {
    try { await s3Request('HEAD', safeKey); return true; }
    catch (error: any) { if (String(error?.message || '').includes(':404')) return false; throw error; }
  }
  try { return (await stat(fileFromKey(safeKey))).isFile(); } catch { return false; }
}
/** Copie temporairement un objet privé sur disque, notamment pour LibreOffice et les modèles ZIP. */
export async function materializePrivateObject(key: string): Promise<string> {
  const safeKey = validatePrivateKey(key);
  if (!s3Config()) return fileFromKey(safeKey);
  const safe = safeKey.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || randomUUID();
  const dir = path.join(STORAGE_BASE, 'tmp', 'objects');
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, `${randomUUID()}-${safe}`);
  await writeFile(target, await readPrivateObject(safeKey), { flag: 'wx' });
  return target;
}

/** Copie idempotemment l'ancien dossier local vers S3 avant le démarrage HTTP de l'ancien service. */
export async function migrateLocalPrivateStorageToS3(): Promise<{ copied: number; bytes: number }> {
  if (String(process.env.AURION_AUTO_MIGRATE_LOCAL_STORAGE || '').toLowerCase() !== 'true') return { copied: 0, bytes: 0 };
  if (!s3Config()) throw new Error('AUTO_STORAGE_MIGRATION_REQUIRES_S3');
  const visit = async (dir: string): Promise<string[]> => {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch (error: any) { if (error?.code === 'ENOENT') return []; throw error; }
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...await visit(full));
      else if (entry.isFile()) files.push(full);
    }
    return files;
  };
  const files = await visit(PRIVATE_BASE);
  let bytes = 0;
  for (const file of files) {
    const key = path.relative(STORAGE_BASE, file).split(path.sep).join('/');
    const buffer = await readFile(file);
    await writePrivateObject(key, buffer);
    bytes += buffer.length;
  }
  return { copied: files.length, bytes };
}


export async function savePrivateUpload(org: string, part: { filename: string; file: NodeJS.ReadableStream; truncated?: boolean }, maxBytes: number) {
  const ext = path.extname(part.filename).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const safe = `${randomUUID()}${ext.length >= 2 && ext.length <= 10 ? ext : '.bin'}`;
  const remote = !!s3Config();
  const root = remote ? path.join(STORAGE_BASE, 'tmp', 'uploads') : privateRoot(org);
  await mkdir(root, { recursive: true });
  const target = path.join(root, safe);
  let size = 0;
  (part.file as any).on('data', (c: Buffer) => { size += c.length; });
  try {
    await pipeline(part.file as any, createWriteStream(target, { flags: 'wx' }));
    if (size > maxBytes || part.truncated) throw new Error('FILE_TOO_LARGE');
    await writePrivateObject(`private/${org}/${safe}`, await readFile(target));
  } catch (e) {
    try { await unlink(target); } catch {}
    if (String(e).includes('FILE_TOO_LARGE')) {
      const x = new Error('FILE_TOO_LARGE'); (x as any).statusCode = 413; throw x;
    }
    throw e;
  }
  if (remote) {
    const cleanup = setTimeout(() => { void unlink(target).catch(() => {}); }, 15 * 60_000);
    cleanup.unref?.();
  }
  return { id: randomUUID(), safe, target, size };
}
