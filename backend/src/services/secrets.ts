import crypto from 'node:crypto';
import { config } from '../config.js';

// AES-256-GCM des secrets en base. Les nouvelles valeurs incluent une version de clé.
// Le format historique v1 reste lisible pendant la rotation, sans retomber sur JWT_SECRET.
type KeyMaterial = { version: string; material: string };
function keyFor(material: string) {
  if (!material) throw new Error('SECRET_ENCRYPTION_KEY_MISSING');
  return crypto.createHash('sha256').update('aurion-secrets:' + material).digest();
}
function primaryKey(): KeyMaterial {
  if (!config.AURION_ENCRYPTION_KEY) throw new Error('SECRET_ENCRYPTION_KEY_MISSING');
  return { version: config.AURION_ENCRYPTION_KEY_VERSION, material: config.AURION_ENCRYPTION_KEY };
}
function previousKey(): KeyMaterial | null {
  return config.AURION_ENCRYPTION_KEY_PREVIOUS
    ? { version: config.AURION_ENCRYPTION_KEY_PREVIOUS_VERSION || 'previous', material: config.AURION_ENCRYPTION_KEY_PREVIOUS }
    : null;
}

export function encryptSecret(value: string) {
  const key = primaryKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(key.material), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v2', key.version, iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptSecret(value: string) {
  const fields = value.split('.');
  const format = fields[0];
  const candidates: KeyMaterial[] = [];
  if (format === 'v2' && fields.length === 5) {
    const version = fields[1];
    const current = primaryKey();
    const previous = previousKey();
    if (current.version === version) candidates.push(current);
    if (previous?.version === version) candidates.push(previous);
    if (!candidates.length) throw new Error('SECRET_ENCRYPTION_KEY_VERSION_UNAVAILABLE');
    return decryptWith(candidates[0], fields[2], fields[3], fields[4]);
  }
  if (format === 'v1' && fields.length === 4) {
    // v1 ne stockait pas le key id : essayer la clé actuelle puis l'ancienne, sans fallback JWT.
    candidates.push(primaryKey());
    const previous = previousKey();
    if (previous) candidates.push(previous);
    // Compatibilité de migration explicite uniquement pour les ciphertexts v1 historiques.
    // La clé JWT n'est jamais utilisée pour les nouvelles écritures ni en repli silencieux.
    if (config.AURION_ENCRYPTION_LEGACY_JWT_KEY) candidates.push({ version: 'legacy-jwt-explicit', material: config.JWT_SECRET });
    for (const candidate of candidates) {
      try { return decryptWith(candidate, fields[1], fields[2], fields[3]); } catch { /* essayer la clé précédente */ }
    }
    throw new Error('SECRET_DECRYPTION_FAILED');
  }
  throw new Error('SECRET_FORMAT');
}

function decryptWith(candidate: KeyMaterial, ivText: string, tagText: string, dataText: string) {
  if (!ivText || !tagText || !dataText) throw new Error('SECRET_FORMAT');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(candidate.material), Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64')), decipher.final()]).toString('utf8');
}
