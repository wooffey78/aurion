import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

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
  const clean = String(key).replace(/\\/g, '/').replace(/^\/+/, '');
  const full = path.resolve(STORAGE_BASE, clean);
  if (!full.startsWith(STORAGE_BASE + path.sep)) throw new Error('INVALID_STORAGE_KEY');
  return full;
}


export async function savePrivateUpload(org: string, part: { filename: string; file: NodeJS.ReadableStream; truncated?: boolean }, maxBytes: number) {
  const ext = path.extname(part.filename).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const safe = `${randomUUID()}${ext.length >= 2 && ext.length <= 10 ? ext : '.bin'}`;
  const root = privateRoot(org);
  await mkdir(root, { recursive: true });
  const target = path.join(root, safe);
  let size = 0;
  (part.file as any).on('data', (c: Buffer) => { size += c.length; });
  try {
    await pipeline(part.file as any, createWriteStream(target, { flags: 'wx' }));
    if (size > maxBytes || part.truncated) throw new Error('FILE_TOO_LARGE');
  } catch (e) {
    try { await unlink(target); } catch {}
    if (String(e).includes('FILE_TOO_LARGE')) {
      const x = new Error('FILE_TOO_LARGE'); (x as any).statusCode = 413; throw x;
    }
    throw e;
  }
  return { id: randomUUID(), safe, target, size };
}
