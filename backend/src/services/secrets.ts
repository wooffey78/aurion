import crypto from 'node:crypto';
import { config } from '../config.js';

// Chiffrement AES-256-GCM des secrets stockés en base (mot de passe de messagerie).
// La clé provient de AURION_ENCRYPTION_KEY (générée à l'installation), à défaut de JWT_SECRET.
function key() {
  return crypto.createHash('sha256').update('aurion-secrets:' + (config.AURION_ENCRYPTION_KEY || config.JWT_SECRET)).digest();
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(value: string) {
  const [ver, iv, tag, data] = value.split('.');
  if (ver !== 'v1' || !iv || !tag || !data) throw new Error('SECRET_FORMAT');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
