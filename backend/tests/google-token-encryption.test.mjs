import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://aurion_test:ci-only@127.0.0.1:5432/aurion_test',
  JWT_SECRET: 'google-token-encryption-test-secret-at-least-32-characters',
  GOOGLE_TOKEN_ENCRYPTION_KEY: 'google-token-encryption-test-material-at-least-32-chars',
};

test('Google tokens are encrypted at rest and round-trip correctly', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { encrypt, decrypt } = await import('./dist/services/google.js');
    const value = 'refresh-token-not-for-storage-in-clear';
    const encrypted = encrypt(value);
    if (encrypted === value || encrypted.split('.').length !== 3) process.exit(2);
    if (decrypt(encrypted) !== value) process.exit(3);
    console.log('encrypted-round-trip-ok');
  `], { cwd: backendDir, env: baseEnv, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /encrypted-round-trip-ok/);
});

test('Google token encryption fails closed when the dedicated key is absent', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { encrypt } = await import('./dist/services/google.js');
    encrypt('do-not-store-plaintext');
  `], {
    cwd: backendDir,
    env: { ...baseEnv, GOOGLE_TOKEN_ENCRYPTION_KEY: '' },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GOOGLE_TOKEN_ENCRYPTION_KEY_MISSING/);
});
