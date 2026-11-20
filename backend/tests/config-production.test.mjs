import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://aurion_test:ci-only@127.0.0.1:5432/aurion_test',
  JWT_SECRET: 'config-validation-test-secret-with-more-than-32-characters',
  COOKIE_SECURE: 'true',
  AURION_ENCRYPTION_KEY: 'explicit-config-test-encryption-key-at-least-32-chars',
  AURION_ENCRYPTION_KEY_VERSION: 'test-k1',
  AURION_RUNTIME_DB_ROLE: 'aurion_runtime',
  APP_BASE_URL: 'https://aurion.example.test',
  CORS_ORIGIN: 'https://aurion.example.test',
  AURION_SUPPORT_EMAIL: 'support@example.test',
  AURION_STORAGE_BACKEND: 's3',
  AURION_S3_BUCKET: 'aurion-config-tests-only',
  AURION_S3_ACCESS_KEY: 'ci-only-access-key',
  AURION_S3_SECRET_KEY: 'ci-only-secret-key',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  GOOGLE_REDIRECT_URI: '',
  GOOGLE_TOKEN_ENCRYPTION_KEY: '',
};

function loadConfig(overrides = {}) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import('./dist/config.js').then(({config}) => console.log(JSON.stringify({nodeEnv:config.NODE_ENV, baseUrl:config.APP_BASE_URL})))"], {
    cwd: backendDir,
    env: { ...baseEnv, ...overrides },
    encoding: 'utf8',
    timeout: 5000,
  });
  return result;
}


test('production requires Stripe secret and webhook signing key together', () => {
  const secretOnly = loadConfig({ STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: '' });
  assert.notEqual(secretOnly.status, 0);
  assert.match(secretOnly.stderr, /STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET doivent être définis ensemble/);
  const webhookOnly = loadConfig({ STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: 'whsec_example' });
  assert.notEqual(webhookOnly.status, 0);
  assert.match(webhookOnly.stderr, /STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET doivent être définis ensemble/);
});

test('production refuses missing dedicated encryption key instead of using JWT_SECRET', () => {
  const result = loadConfig({ AURION_ENCRYPTION_KEY: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AURION_ENCRYPTION_KEY doit être défini/);
});

test('production refuses CORS entries containing a path', () => {
  const result = loadConfig({ CORS_ORIGIN: 'https://aurion.example.test/admin' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CORS_ORIGIN doit contenir uniquement des origines HTTPS publiques/);
});

test('Google production setup requires the exact HTTPS callback', () => {
  const missing = loadConfig({ GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /GOOGLE_REDIRECT_URI/);

  const wrongOrigin = loadConfig({
    GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_REDIRECT_URI: 'https://other.example.test/integrations/google/callback',
    GOOGLE_TOKEN_ENCRYPTION_KEY: 'g'.repeat(48),
  });
  assert.notEqual(wrongOrigin.status, 0);
  assert.match(wrongOrigin.stderr, /GOOGLE_REDIRECT_URI doit correspondre/);

  const missingEncryptionKey = loadConfig({
    GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_REDIRECT_URI: 'https://aurion.example.test/integrations/google/callback',
    GOOGLE_TOKEN_ENCRYPTION_KEY: '',
  });
  assert.notEqual(missingEncryptionKey.status, 0);
  assert.match(missingEncryptionKey.stderr, /GOOGLE_TOKEN_ENCRYPTION_KEY doit être défini/);

  const validCallback = loadConfig({
    GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_REDIRECT_URI: 'https://aurion.example.test/integrations/google/callback',
    GOOGLE_TOKEN_ENCRYPTION_KEY: 'g'.repeat(48),
  });
  assert.equal(validCallback.status, 0, validCallback.stderr);
});

test('production migration command refuses to fall back to the runtime database role', () => {
  const env = { ...baseEnv };
  delete env.AURION_MIGRATION_DATABASE_URL;
  const result = spawnSync(process.execPath, ['dist/migrate.js'], {
    cwd: backendDir, env, encoding: 'utf8', timeout: 5000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /AURION_MIGRATION_DATABASE_URL doit être défini en production/);
});
