// Pré-vol Google — contrats hors réseau.
// Le faux serveur local reproduit uniquement les endpoints Google utilisés :
// /token, /calendar/v3/users/me/calendarList et /drive/v3/about.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  diagnoseGoogleConfiguration,
  formatGoogleConfiguration,
  listGoogleCalendars,
  readGoogleDriveQuota,
  refreshGoogleAccessToken,
  runGoogleLivePreflight,
} from '../scripts/lib/google-preflight.mjs';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_SECRET = 'SENTINEL_GOOGLE_CLIENT_SECRET';
const REFRESH_TOKEN = 'SENTINEL_REFRESH_TOKEN';

async function startFakeGoogle() {
  const state = {
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.file',
    ].join(' '),
    tokenStatus: 200,
    tokenError: 'invalid_grant',
    calendarStatus: 200,
    driveStatus: 200,
    quota: { limit: '1000000000', usage: '824000000', usageInDrive: '800000000', usageInDriveTrash: '4000000' },
    tokenCalls: 0,
    calendarCalls: 0,
    driveCalls: 0,
    lastTokenBody: null,
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    const json = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === '/token') {
      state.tokenCalls += 1;
      state.lastTokenBody = new URLSearchParams(body);
      if (state.tokenStatus !== 200) return json(state.tokenStatus, { error: state.tokenError });
      if (state.lastTokenBody.get('refresh_token') === 'drive-refresh') {
        return json(200, { access_token: 'at_drive_test', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' });
      }
      return json(200, { access_token: 'at_preflight_test', expires_in: 3600, scope: state.scope });
    }
    if (url.pathname === '/tokeninfo') {
      return json(200, { scope: state.scope });
    }
    if (url.pathname === '/calendar/v3/users/me/calendarList') {
      state.calendarCalls += 1;
      if (String(req.headers.authorization || '') !== 'Bearer at_preflight_test') return json(401, { error: { code: 401 } });
      if (state.calendarStatus !== 200) return json(state.calendarStatus, { error: { code: state.calendarStatus } });
      return json(200, {
        items: [
          { id: 'primary@example.test', summary: 'Agenda principal', primary: true, accessRole: 'owner', timeZone: 'Europe/Paris' },
          { id: 'travail@example.test', summary: 'Travail', primary: false, accessRole: 'reader', timeZone: 'Europe/Paris' },
        ],
      });
    }
    if (url.pathname === '/drive/v3/about') {
      state.driveCalls += 1;
      if (!['Bearer at_preflight_test', 'Bearer at_drive_test'].includes(String(req.headers.authorization || ''))) return json(401, { error: { code: 401 } });
      if (state.driveStatus !== 200) return json(state.driveStatus, { error: { code: state.driveStatus } });
      return json(200, { storageQuota: state.quota });
    }
    return json(404, { error: { code: 404 } });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    state,
    base,
    endpoints: {
      token: `${base}/token`,
      tokenInfo: `${base}/tokeninfo`,
      openid: `${base}/openid`,
      calendar: `${base}/calendar/v3`,
      drive: `${base}/drive/v3`,
    },
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

function env(overrides = {}) {
  return new Map(Object.entries({
    APP_BASE_URL: 'http://127.0.0.1:4000',
    GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: 'http://127.0.0.1:4000/integrations/google/callback',
    GOOGLE_DRIVE_REDIRECT_URI: 'http://127.0.0.1:4000/cloud/google/callback',
    GOOGLE_TOKEN_ENCRYPTION_KEY: 'x'.repeat(32),
    GOOGLE_CALENDAR_ID: 'primary',
    AURION_CLOUD_QUOTA_THRESHOLDS: '80,90,95,100',
    GOOGLE_PREFLIGHT_REFRESH_TOKEN: REFRESH_TOKEN,
    ...overrides,
  }));
}

function assertNoSecrets(text) {
  assert.equal(String(text).includes(CLIENT_SECRET), false, 'secret client exposé');
  assert.equal(String(text).includes(REFRESH_TOKEN), false, 'refresh token exposé');
  assert.equal(String(text).includes('at_preflight_test'), false, 'access token exposé');
}

test('diagnostic : Google désactivé, incomplet ou configuré, sans valeur', () => {
  const disabled = diagnoseGoogleConfiguration(new Map(), { environment: 'staging' });
  assert.equal(disabled.state, 'disabled');
  assert.deepEqual(disabled.missing, []);
  assert.equal(formatGoogleConfiguration(disabled), 'désactivé (aucune variable Google)');

  // Le modèle .env.example contient des URI de retour mais pas d'identifiants : Google reste désactivé.
  const templateDefaults = diagnoseGoogleConfiguration(new Map([
    ['GOOGLE_REDIRECT_URI', 'http://127.0.0.1:4000/integrations/google/callback'],
    ['GOOGLE_DRIVE_REDIRECT_URI', 'http://127.0.0.1:4000/cloud/google/callback'],
    ['GOOGLE_CALENDAR_ID', 'primary'],
  ]), { environment: 'local' });
  assert.equal(templateDefaults.state, 'disabled');

  const partial = diagnoseGoogleConfiguration(new Map([
    ['GOOGLE_CLIENT_ID', 'client.apps.googleusercontent.com'],
  ]), { environment: 'local' });
  assert.equal(partial.state, 'incomplete');
  assert.ok(partial.missing.includes('GOOGLE_CLIENT_SECRET'));
  assert.ok(partial.missing.includes('GOOGLE_REDIRECT_URI'));
  assert.ok(partial.missing.some(item => item.startsWith('GOOGLE_TOKEN_ENCRYPTION_KEY')));
  const rendered = formatGoogleConfiguration(partial);
  assert.match(rendered, /GOOGLE_CLIENT_SECRET/);
  assert.doesNotMatch(rendered, /apps\.googleusercontent\.com/);

  const configured = diagnoseGoogleConfiguration(env(), { environment: 'local' });
  assert.equal(configured.state, 'configured');
  assert.deepEqual(configured.missing, []);
});

test('diagnostic production : refuse les URI HTTP et exige APP_BASE_URL', () => {
  const diagnostic = diagnoseGoogleConfiguration(env({
    APP_BASE_URL: '',
    GOOGLE_REDIRECT_URI: 'http://app.example.test/integrations/google/callback',
    GOOGLE_DRIVE_REDIRECT_URI: 'http://app.example.test/cloud/google/callback',
  }), { environment: 'production' });
  assert.equal(diagnostic.state, 'incomplete');
  assert.ok(diagnostic.missing.some(item => item.includes('APP_BASE_URL')));
  assert.ok(diagnostic.missing.some(item => item.includes('GOOGLE_REDIRECT_URI HTTPS')));
  assert.ok(diagnostic.missing.some(item => item.includes('GOOGLE_DRIVE_REDIRECT_URI HTTPS')));
});

test('le refresh token réel est échangé sans exposer les secrets', async () => {
  const fake = await startFakeGoogle();
  try {
    const result = await refreshGoogleAccessToken({
      clientId: 'client.apps.googleusercontent.com',
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      fetchImpl: fetch,
      tokenUrl: fake.endpoints.token,
    });
    assert.equal(result.ok, true);
    assert.equal(result.accessToken, 'at_preflight_test');
    assert.equal(result.expiresIn, 3600);
    assert.match(result.scope, /calendar/);
    assert.equal(fake.state.lastTokenBody.get('grant_type'), 'refresh_token');
    assert.equal(fake.state.lastTokenBody.get('client_id'), 'client.apps.googleusercontent.com');
    assert.equal(fake.state.lastTokenBody.get('client_secret'), CLIENT_SECRET);
    assert.equal(fake.state.lastTokenBody.get('refresh_token'), REFRESH_TOKEN);
    assertNoSecrets(result.message || '');
  } finally {
    await fake.close();
  }
});

test('un refresh token révoqué donne un diagnostic lisible, sans le secret', async () => {
  const fake = await startFakeGoogle();
  fake.state.tokenStatus = 400;
  try {
    const result = await refreshGoogleAccessToken({
      clientId: 'client.apps.googleusercontent.com',
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      fetchImpl: fetch,
      tokenUrl: fake.endpoints.token,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'invalid_grant');
    assert.match(result.message, /refresh token refusé/i);
    assert.doesNotMatch(result.message, new RegExp(REFRESH_TOKEN));
  } finally {
    await fake.close();
  }
});

test('liste les calendriers, sans identifiant dans les messages', async () => {
  const fake = await startFakeGoogle();
  try {
    const result = await listGoogleCalendars({
      accessToken: 'at_preflight_test',
      fetchImpl: fetch,
      calendarBaseUrl: fake.endpoints.calendar,
    });
    assert.equal(result.ok, true);
    assert.equal(result.calendars.length, 2);
    assert.equal(result.calendars[0].summary, 'Agenda principal');
    assert.equal(result.calendars[0].primary, true);
    assert.equal(result.calendars[1].accessRole, 'reader');
    assertNoSecrets(JSON.stringify(result));
  } finally {
    await fake.close();
  }
});

test('lit le quota Drive et calcule le niveau avec les seuils de l’application', async () => {
  const fake = await startFakeGoogle();
  try {
    const result = await readGoogleDriveQuota({
      accessToken: 'at_preflight_test',
      fetchImpl: fetch,
      driveBaseUrl: fake.endpoints.drive,
      thresholds: [80, 90, 95, 100],
    });
    assert.equal(result.ok, true);
    assert.equal(result.quota.limit, 1000000000);
    assert.equal(result.quota.usage, 824000000);
    assert.equal(result.quota.percent, 82.4);
    assert.equal(result.quota.level, 'warning');
    assertNoSecrets(JSON.stringify(result));
  } finally {
    await fake.close();
  }
});

test('contrôle réel complet : refresh, scopes, calendriers et quota', async () => {
  const fake = await startFakeGoogle();
  try {
    const result = await runGoogleLivePreflight(env(), {
      fetchImpl: fetch,
      endpoints: fake.endpoints,
      environment: 'local',
      requireDrive: true,
    });
    assert.equal(result.ok, true);
    const states = Object.fromEntries(result.checks.map(check => [check.id, check.state]));
    assert.equal(states.refresh, 'OK');
    assert.equal(states.scopes, 'OK');
    assert.equal(states.calendars, 'OK');
    assert.equal(states['calendar-target'], 'OK');
    assert.equal(states.drive, 'ATTENTION'); // quota à 82,4 % : au-dessus de 80 %, pas bloquant
    assert.equal(result.calendars.length, 2);
    assertNoSecrets(JSON.stringify(result));
  } finally {
    await fake.close();
  }
});

test('un jeton Drive distinct permet de tester le quota sans scope drive.file sur le jeton principal', async () => {
  const fake = await startFakeGoogle();
  fake.state.scope = [
    'openid', 'email', 'profile',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar',
  ].join(' ');
  fake.state.quota.usage = '100000000';
  try {
    const result = await runGoogleLivePreflight(env({ GOOGLE_PREFLIGHT_DRIVE_REFRESH_TOKEN: 'drive-refresh' }), {
      fetchImpl: fetch,
      endpoints: fake.endpoints,
      environment: 'local',
      requireDrive: true,
    });
    assert.equal(result.ok, true);
    const drive = result.checks.find(check => check.id === 'drive');
    assert.equal(drive.state, 'OK');
    assert.equal(fake.state.tokenCalls, 2);
  } finally {
    await fake.close();
  }
});

test('un quota Drive saturé est signalé comme bloquant', async () => {
  const fake = await startFakeGoogle();
  fake.state.quota.usage = fake.state.quota.limit;
  try {
    const result = await runGoogleLivePreflight(env(), {
      fetchImpl: fetch,
      endpoints: fake.endpoints,
      environment: 'local',
      requireDrive: true,
    });
    assert.equal(result.ok, false);
    const drive = result.checks.find(check => check.id === 'drive');
    assert.equal(drive.state, 'ÉCHEC');
    assert.match(drive.detail, /niveau full/);
  } finally {
    await fake.close();
  }
});

test('un scope calendrier manquant bloque la liste mais n’empêche pas le quota Drive', async () => {
  const fake = await startFakeGoogle();
  fake.state.scope = 'https://www.googleapis.com/auth/drive.file';
  fake.state.quota.usage = '100000000';
  try {
    const result = await runGoogleLivePreflight(env(), {
      fetchImpl: fetch,
      endpoints: fake.endpoints,
      environment: 'local',
    });
    assert.equal(result.ok, false);
    const states = Object.fromEntries(result.checks.map(check => [check.id, check.state]));
    assert.equal(states.scopes, 'ÉCHEC');
    assert.equal(states.calendars, 'NON TESTÉ');
    assert.equal(states.drive, 'OK');
    assert.equal(fake.state.calendarCalls, 0);
  } finally {
    await fake.close();
  }
});

test('un refresh token absent laisse le contrôle réel non testé', async () => {
  const result = await runGoogleLivePreflight(env({ GOOGLE_PREFLIGHT_REFRESH_TOKEN: '' }), {
    fetchImpl: fetch,
    environment: 'local',
  });
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].state, 'NON TESTÉ');
});

test('un refresh refusé arrête le contrôle réel avant les appels Calendar/Drive', async () => {
  const fake = await startFakeGoogle();
  fake.state.tokenStatus = 400;
  try {
    const result = await runGoogleLivePreflight(env(), {
      fetchImpl: fetch,
      endpoints: fake.endpoints,
      environment: 'local',
    });
    assert.equal(result.ok, false);
    assert.equal(result.checks[0].id, 'refresh');
    assert.equal(result.checks[0].state, 'ÉCHEC');
    assert.equal(fake.state.calendarCalls, 0);
    assert.equal(fake.state.driveCalls, 0);
    assertNoSecrets(JSON.stringify(result));
  } finally {
    await fake.close();
  }
});

test('le CLI affiche les manques par environnement sans divulguer les valeurs', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'aurion-google-preflight-'));
  const local = path.join(directory, 'local.env');
  const staging = path.join(directory, 'staging.env');
  const production = path.join(directory, 'production.env');
  writeFileSync(local, `GOOGLE_CLIENT_ID=${CLIENT_SECRET}\n`);
  writeFileSync(staging, 'GOOGLE_CLIENT_ID=client.apps.googleusercontent.com\nGOOGLE_REDIRECT_URI=http://127.0.0.1:4000/integrations/google/callback\n');
  writeFileSync(production, '');
  const childEnv = {
    ...process.env,
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    GOOGLE_REDIRECT_URI: '',
    GOOGLE_DRIVE_REDIRECT_URI: '',
    GOOGLE_TOKEN_ENCRYPTION_KEY: '',
    GOOGLE_PREFLIGHT_REFRESH_TOKEN: '',
    GOOGLE_PREFLIGHT_DRIVE_REFRESH_TOKEN: '',
    APP_BASE_URL: '',
  };
  try {
    const result = spawnSync(process.execPath, [
      'scripts/check-integrations.mjs',
      '--local', local,
      '--staging', staging,
      '--production', production,
      '--strict',
    ], { cwd: backendDir, env: childEnv, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /Google configuration \(local\)/);
    assert.match(result.stdout, /GOOGLE_CLIENT_SECRET/);
    assert.match(result.stdout, /Google configuration \(production\) : NON CONFIGURÉ/);
    assert.equal(result.stdout.includes(CLIENT_SECRET), false, 'valeur secrète exposée');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
