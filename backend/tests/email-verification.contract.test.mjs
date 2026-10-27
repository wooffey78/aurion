import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

test('migration 061 ajoute le statut et des jetons e-mail à usage unique sans modifier les migrations existantes',()=>{
  const migration=read('backend/migrations/061_email_verification.sql');
  assert.match(migration,/add column if not exists email_verified_at timestamptz/i);
  assert.match(migration,/create table if not exists email_verification_tokens/i);
  assert.match(migration,/token_hash char\(64\) not null unique/i);
  assert.match(migration,/expires_at timestamptz not null/i);
  assert.match(migration,/consumed_at timestamptz/i);
  assert.match(migration,/on delete cascade/i);
});

test('registration n’ouvre aucune session avant la confirmation, et login bloque les comptes non vérifiés',()=>{
  const auth=read('backend/src/routes/auth.ts');
  assert.match(auth,/verificationRequired:\s*true/);
  assert.match(auth,/app\.post\('\/auth\/verify-email'/);
  assert.match(auth,/app\.post\('\/auth\/verification\/resend'/);
  assert.match(auth,/EMAIL_NOT_VERIFIED/);
  assert.match(auth,/session_version=coalesce\(session_version,0\)\+1/);
  assert.match(auth,/await revokeAllRefreshSessions\(user\.id\)/);
});

test('la connexion Google exige une adresse vérifiée et refuse le choix arbitraire d’organisation',()=>{
  const auth=read('backend/src/routes/auth.ts');
  assert.match(auth,/identity\.email_verified!==true/);
  assert.match(auth,/membership_count\)>1/);
  assert.match(auth,/disabledPasswordHash/);
  assert.match(auth,/email_verified_at=now\(\)/);
});

test('la synchronisation est conditionnelle et ne sonde plus chaque seconde',()=>{
  const client=read('assets/js/account-sync.js');
  const route=read('backend/src/routes/settings.ts');
  assert.match(client,/BASE_POLL_MS=20000/);
  assert.match(client,/MAX_POLL_MS=300000/);
  assert.match(client,/If-None-Match/);
  assert.doesNotMatch(client,/setInterval\(poll,1000\)/);
  assert.match(route,/If-None-Match/);
  assert.match(route,/max: 120, timeWindow: '1 minute'/);
});

test('la landing prévoit un message de panne de démarrage sans JavaScript inline',()=>{
  const html=read('index.html'),guard=read('assets/js/boot-guard.js'),main=read('assets/js/main.js');
  assert.match(html,/boot-guard\.js/);
  assert.match(guard,/window\.__aurionBooted/);
  assert.match(guard,/aurion-boot-retry/);
  assert.match(main,/window\.__aurionBooted=true/);
  assert.match(html,/id="install-grid"/);
  assert.match(main,/id="install-grid"/);
});
