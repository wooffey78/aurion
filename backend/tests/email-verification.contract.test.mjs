import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

test('le flux de vérification e-mail est désactivé dans l’application',()=>{
  const auth=read('backend/src/routes/auth.ts');
  const api=read('assets/js/core/api.js');
  const page=read('assets/js/pages/auth.js');
  const main=read('assets/js/main.js');
  assert.doesNotMatch(auth,/\/auth\/verify-email|\/auth\/verification\/resend|EMAIL_NOT_VERIFIED|emailVerificationAvailable|email_verified_at/);
  assert.doesNotMatch(api,/verifyEmail:|resendEmailVerification|EMAIL_NOT_VERIFIED|EMAIL_VERIFICATION/);
  assert.doesNotMatch(page,/resend-verification|EMAIL_NOT_VERIFIED|verificationRequired/);
  assert.doesNotMatch(main,/renderEmailVerification|\/verify-email/);
  assert.match(auth,/app\.setSession\(reply, token\)/);
});

test('la migration de retrait est additive et conserve la migration 061 historique',()=>{
  const original=read('backend/migrations/061_email_verification.sql');
  const rollback=read('backend/migrations/062_disable_email_verification.sql');
  assert.match(original,/add column if not exists email_verified_at timestamptz/i);
  assert.match(original,/create table if not exists email_verification_tokens/i);
  assert.match(rollback,/drop table if exists email_verification_tokens/i);
  assert.match(rollback,/alter table users drop column if exists email_verified_at/i);
});
