import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('la rotation des secrets est transactionnelle, vérifiée et en dry-run par défaut', () => {
  const script = read('../scripts/rotate-secrets.mjs');
  const pkg = JSON.parse(read('../package.json'));
  assert.match(script, /SELECT organization_id, password_enc FROM mail_accounts WHERE password_enc IS NOT NULL FOR UPDATE/);
  assert.match(script, /decryptSecret\(ciphertext\)/);
  assert.match(script, /decryptSecret\(rotated\) !== plaintext/);
  assert.match(script, /if \(apply\) await client\.query\('COMMIT'\)/);
  assert.match(script, /else await client\.query\('ROLLBACK'\)/);
  assert.equal(pkg.scripts['secrets:rotate'], 'npm run build && node scripts/rotate-secrets.mjs');
});
