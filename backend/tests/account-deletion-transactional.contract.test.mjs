// Contrat 15.4.36 — suppression de compte transactionnelle, verrouillée et contrôlable.
// Réservation atomique (verrou de ligne + bail), transaction unique pour l'effacement,
// erreurs externes jamais avalées, reprise traçable étape par étape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const db = read('backend/src/db.ts');
const service = read('backend/src/services/account-deletion.ts');
const migration = read('backend/migrations/090_account_deletion_transactional.sql');

test('un helper de transaction d’administration existe (BEGIN / COMMIT / ROLLBACK)', () => {
  assert.match(db, /export async function adminTransaction<T>/);
  assert.match(db, /await client\.query\('begin'\)/);
  assert.match(db, /await client\.query\('commit'\)/);
  assert.match(db, /await client\.query\('rollback'\)/);
  assert.match(db, /client\.release\(\)/);
});

test('la demande est réservée atomiquement avant tout traitement', () => {
  assert.match(service, /from account_deletion_requests where id=\$1 for update/);
  assert.match(service, /status='processing',processing_by=\$2,processing_started_at=now\(\)/);
  assert.match(service, /attempts=coalesce\(attempts,0\)\+1/);
  assert.match(service, /PROCESSING_LEASE_MS/);
  assert.match(service, /déjà en cours de traitement par un autre opérateur/);
});

test('l’effacement relationnel tient dans une seule transaction', () => {
  const start = service.indexOf('const result = await adminTransaction');
  assert.ok(start > 0, 'transaction d’effacement absente');
  const body = service.slice(start, service.indexOf("catch (error)", start));
  for (const sql of [
    'delete from google_connections where organization_id=$1',
    'delete from mail_accounts where organization_id=$1',
    'delete from organization_members where organization_id=$1 and user_id=$2',
    'insert into account_deletion_audit',
    'delete from users where id=$1',
  ]) {
    assert.ok(body.includes(sql), `opération hors transaction : ${sql}`);
  }
  assert.ok(body.indexOf('insert into account_deletion_audit') < body.indexOf('delete from users where id=$1'),
    'l’audit doit précéder l’effacement du compte');
});

test('les révocations et suppressions externes ne sont plus avalées', () => {
  assert.doesNotMatch(service, /bumpSessions\(userId\)\.catch/);
  assert.doesNotMatch(service, /deletePrivateObject\(String\(avatarKey\)\)\.catch/);
  assert.match(service, /step = 'sessions'/);
  assert.match(service, /step = 'avatar'/);
  assert.match(service, /step = 'erasure'/);
  assert.match(service, /last_error=\$2,last_step=\$3/);
});

test('la reprise reste idempotente et la migration 090 est additive', () => {
  assert.match(service, /alreadyProcessed: true/);
  assert.match(service, /set status='pending' where id=\$1 and status='processing'/);
  assert.ok(existsSync(new URL('../../backend/migrations/090_account_deletion_transactional.sql', import.meta.url)));
  for (const column of ['processing_started_at', 'attempts', 'last_error', 'last_step']) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`), `${column} manquant`);
  }
  assert.match(migration, /create index if not exists account_deletion_requests_processing_idx/);
});

test('la console d’administration expose le diagnostic de reprise', () => {
  assert.match(service, /r\.attempts as attempts/);
  assert.match(service, /r\.last_error as "lastError"/);
  assert.match(service, /r\.last_step as "lastStep"/);
  const other = read('assets/js/pages/dash/other.js');
  assert.match(other, /Tentatives : \$\{Number\(x\.attempts/);
  assert.match(other, /dernière étape/);
});
