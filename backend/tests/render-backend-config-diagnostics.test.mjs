import test from 'node:test';
import assert from 'node:assert/strict';
import { missingProductionBackendConfig, hasProductionBackendConfig } from '../../tools/render-backend-config.mjs';

const validEnv = {
  NODE_ENV: 'production', COOKIE_SECURE: 'true', RENDER_SERVICE_ID: 'srv-test',
  DATABASE_URL: 'postgresql://runtime:secret@db.example.test/aurion',
  AURION_MIGRATION_DATABASE_URL: 'postgresql://owner:secret@db.example.test/aurion',
  AURION_RUNTIME_DB_ROLE: 'aurion_runtime', JWT_SECRET: 'j'.repeat(48),
  AURION_ENCRYPTION_KEY: 'k'.repeat(48), AURION_ENCRYPTION_KEY_VERSION: 'k1',
  APP_BASE_URL: 'https://aurion.example.test', CORS_ORIGIN: 'https://aurion.example.test',
  AURION_SUPPORT_EMAIL: 'support@example.test', AURION_STORAGE_BACKEND: 's3',
  AURION_S3_BUCKET: 'aurion-bucket', AURION_S3_ACCESS_KEY: 'access', AURION_S3_SECRET_KEY: 'secret',
  STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '',
};

test('un environnement Render complet ne présente aucune variable manquante', () => {
  assert.deepEqual(missingProductionBackendConfig(validEnv), []);
  assert.equal(hasProductionBackendConfig(validEnv), true);
});

test('le diagnostic liste les noms et formats manquants sans révéler les valeurs secrètes', () => {
  const missing = missingProductionBackendConfig({ NODE_ENV: 'production', RENDER_SERVICE_ID: 'srv-test', DATABASE_URL: 'postgresql://user:VERY_SECRET@host/db' });
  for (const expected of ['COOKIE_SECURE=true', 'JWT_SECRET', 'AURION_MIGRATION_DATABASE_URL', 'AURION_RUNTIME_DB_ROLE', 'AURION_STORAGE_BACKEND=s3', 'AURION_S3_BUCKET', 'APP_BASE_URL (origine HTTPS publique)']) {
    assert.ok(missing.includes(expected), `${expected} absent de ${missing.join(' | ')}`);
  }
  assert.equal(missing.some(value => value.includes('VERY_SECRET') || value.includes('postgresql://')), false);
  assert.equal(hasProductionBackendConfig({ NODE_ENV: 'production' }), false);
});
