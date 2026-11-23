import { db } from '../dist/db.js';
import { decryptSecret, encryptSecret } from '../dist/services/secrets.js';

const apply = process.argv.includes('--apply');
const client = await db.connect();
let updated = 0;
let unchanged = 0;
try {
  await client.query('BEGIN');
  const rows = await client.query(
    'SELECT organization_id, password_enc FROM mail_accounts WHERE password_enc IS NOT NULL FOR UPDATE'
  );
  for (const row of rows.rows) {
    const ciphertext = String(row.password_enc || '');
    // Déchiffrer d'abord : une erreur arrête toute la transaction, sans perte de données.
    const plaintext = decryptSecret(ciphertext);
    if (!plaintext) throw new Error(`MAIL_SECRET_EMPTY:${row.organization_id}`);
    const currentVersion = `v2.${process.env.AURION_ENCRYPTION_KEY_VERSION || 'k1'}.`;
    if (ciphertext.startsWith(currentVersion)) {
      unchanged++;
      continue;
    }
    const rotated = encryptSecret(plaintext);
    // Vérification cryptographique avant d'écrire le nouveau ciphertext.
    if (decryptSecret(rotated) !== plaintext) throw new Error(`MAIL_SECRET_VERIFY_FAILED:${row.organization_id}`);
    if (apply) {
      await client.query('UPDATE mail_accounts SET password_enc=$1, updated_at=now() WHERE organization_id=$2', [rotated, row.organization_id]);
      updated++;
    } else {
      updated++;
    }
  }
  if (apply) await client.query('COMMIT');
  else await client.query('ROLLBACK');
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', scanned: rows.rowCount, needsRotation: updated, alreadyCurrent: unchanged }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Rotation annulée ; aucune modification validée. Erreur:', error?.message || error);
  process.exitCode = 1;
} finally {
  client.release();
  await db.end();
}
