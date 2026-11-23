// Contrats du doctor de parité : signatures opaques, aucune valeur exposée, --strict explicite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  compareEnvironments,
  googleSignature,
  main,
  normalizeBuildSha,
  normalizeMigrationVersion,
  normalizeRedirectUri,
  parseDotenv,
  renderReport,
  reportToJson,
  storageSignature,
  stripeSignature,
} from '../../tools/parity-doctor.mjs';

const DB_SECRET = 'postgresql://aurion:SENTINEL_DB_PASSWORD@db.example.test/aurion';
const JWT_SECRET = 'SENTINEL_JWT_SECRET_0123456789abcdef';
const GOOGLE_SECRET = 'SENTINEL_GOOGLE_CLIENT_SECRET';
const STRIPE_LIVE = 'sk_live_SENTINEL_STRIPE_KEY';
const STRIPE_TEST = 'sk_test_SENTINEL_STRIPE_KEY';
const BUILD_A = 'a'.repeat(40);
const BUILD_B = 'b'.repeat(40);
const REFERENCE_NAMES = [
  'DATABASE_URL',
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_DRIVE_REDIRECT_URI',
  'AURION_STORAGE_BACKEND',
  'STRIPE_SECRET_KEY',
  'AURION_MIGRATION_VERSION',
  'AURION_BUILD_SHA',
];

function values(overrides = {}) {
  return {
    DATABASE_URL: DB_SECRET,
    JWT_SECRET,
    APP_BASE_URL: 'https://app.example.test',
    GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: GOOGLE_SECRET,
    GOOGLE_REDIRECT_URI: 'https://app.example.test/integrations/google/callback',
    GOOGLE_DRIVE_REDIRECT_URI: 'https://app.example.test/cloud/google/callback',
    AURION_STORAGE_BACKEND: 's3',
    AURION_S3_BUCKET: 'SENTINEL_BUCKET',
    AURION_S3_ACCESS_KEY: 'SENTINEL_ACCESS',
    AURION_S3_SECRET_KEY: 'SENTINEL_STORAGE_KEY',
    STRIPE_SECRET_KEY: STRIPE_LIVE,
    STRIPE_WEBHOOK_SECRET: 'whsec_SENTINEL',
    AURION_MIGRATION_VERSION: '092',
    AURION_BUILD_SHA: BUILD_A,
    ...overrides,
  };
}

function env(overrides = {}) {
  return new Map(Object.entries(values(overrides)));
}

function assertNoSecrets(text) {
  for (const sentinel of [
    'SENTINEL',
    'postgresql://',
    'app.example.test',
    STRIPE_LIVE,
    STRIPE_TEST,
    BUILD_A,
    BUILD_B,
    'GOOGLE_REDIRECT_URI',
    'DATABASE_URL',
    'JWT_SECRET',
  ]) {
    assert.equal(String(text).includes(sentinel), false, `fuite détectée : ${sentinel}`);
  }
}

test('le parseur .env ne développe rien et ne conserve que les affectations', () => {
  const parsed = parseDotenv(`
    # commentaire
    A="valeur avec espaces"
    export B=2
    C='simple'
    D=$A
    E=
  `);
  assert.equal(parsed.get('A'), 'valeur avec espaces');
  assert.equal(parsed.get('B'), '2');
  assert.equal(parsed.get('C'), 'simple');
  assert.equal(parsed.get('D'), '$A');
  assert.equal(parsed.get('E'), '');
  assert.equal(parsed.has('commentaire'), false);
});

test('les signatures de stockage et de mode Stripe ne conservent aucun secret', () => {
  assert.equal(storageSignature(new Map([['AURION_STORAGE_BACKEND', 'local']])).value, 'local');
  assert.equal(storageSignature(new Map([['AURION_STORAGE_BACKEND', 's3']])).value, 's3');
  assert.equal(storageSignature(new Map([['AURION_STORAGE_BACKEND', 'local'], ['AURION_S3_BUCKET', 'bucket']])).value, 's3');
  assert.equal(storageSignature(new Map([['AURION_STORAGE_BACKEND', 'inconnu']])).available, false);

  assert.equal(stripeSignature(new Map()).value, 'disabled');
  assert.equal(stripeSignature(new Map([['STRIPE_SECRET_KEY', 'sk_test_SENTINEL']])).value, 'test');
  assert.equal(stripeSignature(new Map([['STRIPE_SECRET_KEY', 'rk_live_SENTINEL']])).value, 'live');
  assert.equal(stripeSignature(new Map([['STRIPE_SECRET_KEY', '***'], ['AURION_STRIPE_MODE', 'live']])).value, 'live');
  assert.equal(stripeSignature(new Map([['STRIPE_SECRET_KEY', '***']])).available, false);
  assert.equal(stripeSignature(new Map([['STRIPE_SECRET_KEY', '***'], ['AURION_STRIPE_MODE', 'inconnu']])).available, false);
});

test('Google désactivé sans URI reste une configuration valide', () => {
  assert.equal(googleSignature(new Map([['APP_BASE_URL', 'https://app.example.test']])).value, 'désactivé');
  assert.equal(googleSignature(new Map([['GOOGLE_CLIENT_ID', 'client.apps.googleusercontent.com']])).available, false);
});

test('les URI Google sont validées sans être restituées', () => {
  assert.equal(
    normalizeRedirectUri('https://APP.example.test:443/integrations/google/callback', '/integrations/google/callback'),
    'https://app.example.test/integrations/google/callback',
  );
  assert.equal(normalizeRedirectUri('https://app.example.test/integrations/google/callback?x=1', '/integrations/google/callback'), null);
  assert.equal(normalizeRedirectUri('https://app.example.test/mauvais-chemin', '/integrations/google/callback'), null);
  assert.equal(normalizeRedirectUri('https://user:pass@app.example.test/integrations/google/callback', '/integrations/google/callback'), null);
});

test('les versions de migration et les SHA sont normalisés sans être exposés', () => {
  assert.equal(normalizeMigrationVersion('092_subscription_no_billing_status.sql'), '092');
  assert.equal(normalizeMigrationVersion('92'), '092');
  assert.equal(normalizeMigrationVersion('v92'), null);
  assert.equal(normalizeBuildSha('A'.repeat(40)), 'aaaaaaaaaaaa');
  assert.equal(normalizeBuildSha('SHA-abcdef0'), null);
  assert.equal(normalizeBuildSha('abc123'), null);
});

test('trois environnements identiques donnent une parité complète et aucune fuite', () => {
  const report = compareEnvironments({
    local: env(),
    staging: env(),
    production: env(),
    referenceNames: REFERENCE_NAMES,
  });
  assert.equal(report.ok, true);
  assert.deepEqual(report.summary, { identical: 6, different: 0, unavailable: 0 });
  assert.equal(report.fields.every(field => field.status === 'identical'), true);
  assert.equal(report.fields.find(field => field.id === 'variables').cells.local.counts.present, REFERENCE_NAMES.length);
  assertNoSecrets(JSON.stringify(report));
  assertNoSecrets(renderReport(report));
  assertNoSecrets(JSON.stringify(reportToJson(report)));
});

test('les écarts sont visibles par références opaques, jamais par valeurs', () => {
  const production = env({
    APP_BASE_URL: 'https://prod.example.test',
    GOOGLE_REDIRECT_URI: 'https://prod.example.test/integrations/google/callback',
    GOOGLE_DRIVE_REDIRECT_URI: 'https://prod.example.test/cloud/google/callback',
    AURION_STORAGE_BACKEND: 'local',
    AURION_S3_BUCKET: '',
    STRIPE_SECRET_KEY: STRIPE_TEST,
    AURION_MIGRATION_VERSION: '091',
    AURION_BUILD_SHA: BUILD_B,
  });
  production.delete('JWT_SECRET');
  const report = compareEnvironments({
    local: env(),
    staging: env(),
    production,
    referenceNames: REFERENCE_NAMES,
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.summary, { identical: 0, different: 6, unavailable: 0 });
  for (const field of report.fields) {
    assert.equal(field.status, 'different', field.id);
    assert.equal(field.cells.local.group, field.cells.staging.group, `${field.id} : local/staging devraient partager une référence`);
    assert.notEqual(field.cells.local.group, field.cells.production.group, `${field.id} : production devrait diverger`);
  }
  const variables = report.fields.find(field => field.id === 'variables');
  assert.deepEqual(variables.cells.production.counts, { present: REFERENCE_NAMES.length - 1, expected: REFERENCE_NAMES.length });
  const rendered = renderReport(report);
  assert.match(rendered, /ÉCART/);
  assertNoSecrets(rendered);
  assertNoSecrets(JSON.stringify(reportToJson(report)));
});

test('une valeur indisponible rend le champ indisponible sans exposer la cause technique', () => {
  const production = env({
    GOOGLE_DRIVE_REDIRECT_URI: 'https://app.example.test/mauvais-chemin',
    STRIPE_SECRET_KEY: STRIPE_TEST,
    AURION_MIGRATION_VERSION: '',
    AURION_BUILD_SHA: 'pas-un-sha',
  });
  production.set('STRIPE_SECRET_KEY', '***');
  const report = compareEnvironments({
    local: env(),
    staging: env(),
    production,
    referenceNames: REFERENCE_NAMES,
  });
  for (const id of ['google', 'stripe', 'migrations', 'build']) {
    assert.equal(report.fields.find(field => field.id === id).status, 'unavailable', id);
  }
  assert.equal(report.summary.unavailable, 4);
  const rendered = renderReport(report);
  assert.match(rendered, /INDISPONIBLE/);
  assertNoSecrets(rendered);
  assertNoSecrets(JSON.stringify(reportToJson(report)));
});

test('le CLI exige les trois fichiers et ne divulgue pas leur chemin en cas d’absence', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'aurion-parity-'));
  const local = path.join(directory, 'local.env');
  const staging = path.join(directory, 'staging.env');
  const production = path.join(directory, 'production.env');
  const write = (file, overrides = {}) => writeFileSync(file, Object.entries(values(overrides)).map(([key, value]) => `${key}=${value}`).join('\n'));
  try {
    write(local);
    write(staging);
    write(production, {
      APP_BASE_URL: 'https://prod.example.test',
      GOOGLE_REDIRECT_URI: 'https://prod.example.test/integrations/google/callback',
      GOOGLE_DRIVE_REDIRECT_URI: 'https://prod.example.test/cloud/google/callback',
      AURION_STORAGE_BACKEND: 'local',
      AURION_S3_BUCKET: '',
      STRIPE_SECRET_KEY: STRIPE_TEST,
      AURION_MIGRATION_VERSION: '091',
      AURION_BUILD_SHA: BUILD_B,
    });

    const output = [];
    const errors = [];
    const io = { log: message => output.push(String(message)), error: message => errors.push(String(message)) };
    assert.equal(main(['--local', local, '--staging', staging, '--production', production], io), 0);
    assert.match(output.join('\n'), /ÉCART/);
    assertNoSecrets(output.join('\n'));

    output.length = 0;
    assert.equal(main(['--local', local, '--staging', staging, '--production', production, '--strict'], io), 1);
    assert.match(output.join('\n'), /ÉCART/);
    assertNoSecrets(output.join('\n'));

    output.length = 0;
    assert.equal(main(['--local', local, '--staging', staging, '--production', production, '--json'], io), 0);
    const json = JSON.parse(output[0]);
    assert.equal(json.exitCode, 0);
    assert.equal(json.strict, false);
    assert.equal(json.summary.different, 5);
    assertNoSecrets(output[0]);

    output.length = 0;
    assert.equal(main(['--local', path.join(directory, 'absent.env'), '--staging', staging, '--production', production], io), 1);
    assert.equal(errors.join('\n').includes(directory), false, 'le chemin ne doit pas être divulgué');

    output.length = 0;
    errors.length = 0;
    assert.equal(main(['--local', local], io), 2);
    assert.match(errors.join('\n'), /trois fichiers/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
