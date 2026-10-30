import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Google OAuth readiness includes client id, secret, redirect and token encryption prerequisites', () => {
  const google = read('../src/services/google.ts');
  const mail = read('../src/services/mail.ts');
  const integration = read('../src/routes/integrations.ts');
  for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_TOKEN_ENCRYPTION_KEY']) assert.ok(google.includes(name), 'prérequis absent : ' + name);
  assert.match(mail, /google: \{ \.\.\.googleOAuthSetupStatus\(\), connected:/);
  assert.match(integration, /\.\.\.googleOAuthSetupStatus\(\)/);
  assert.match(integration, /missingConfiguration:setup\.missingConfiguration/);
  assert.match(integration, /\/communications\/calendar/);
  assert.match(integration, /\/communications\/email\/document/);
});

test('la configuration messagerie ne renvoie jamais les mots de passe au navigateur', () => {
  const mailbox = read('../../assets/js/pages/mailbox.js');
  const mailService = read('../src/services/mail.ts');
  const mailRoutes = read('../src/routes/mail.ts');
  assert.match(mailbox, /chiffré dans la base du serveur Aurion/);
  assert.match(mailbox, /id="mb-username"/);
  assert.match(mailService, /encryptSecret\(s\.password\)/);
  assert.match(mailService, /decryptSecret\(a\.password_enc\)/);
  assert.match(mailRoutes, /verifySettings\(s\)/);
  assert.doesNotMatch(mailRoutes, /password_enc\s*:/);
});

test('la configuration initiale reste dédiée aux entreprises existantes', () => {
  const onboarding = read('../../assets/js/pages/onboarding.js');
  const main = read('../../assets/js/main.js');
  assert.match(main, /renderOnboarding/);
  assert.doesNotMatch(main, /renderGuidedOnboarding|journeyEntryState/);
  assert.match(onboarding, /supplierLookup/);
  assert.match(onboarding, /SIRET/);
  assert.match(onboarding, /SIREN/);
  assert.doesNotMatch(onboarding, /brandStep|logo|businessNamePrompt|administrativeFormalit/i);
});
