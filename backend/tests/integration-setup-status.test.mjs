import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Google OAuth readiness includes encryption and callback prerequisites', () => {
  const google = read('../src/services/google.ts');
  const mail = read('../src/services/mail.ts');
  const integration = read('../src/routes/integrations.ts');
  const journey = read('../src/routes/journey.ts');
  for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_TOKEN_ENCRYPTION_KEY']) assert.ok(google.includes(name), `prérequis absent : ${name}`);
  assert.match(mail, /google: \{ \.\.\.googleOAuthSetupStatus\(\), connected:/);
  assert.match(integration, /\.\.\.googleOAuthSetupStatus\(\)/);
  assert.match(integration, /missingConfiguration:setup\.missingConfiguration/);
  assert.match(journey, /googleOAuthSetupStatus\(\)/);
  assert.match(journey, /APP_BASE_URL/);
});

test('la configuration incomplète est expliquée à l’écran sans exposer les secrets', () => {
  const mailbox = read('../../assets/js/pages/mailbox.js');
  const onboarding = read('../../assets/js/pages/guided-onboarding.js');
  const mailService = read('../src/services/mail.ts');
  assert.match(mailbox, /chiffré dans la base du serveur Aurion/);
  assert.doesNotMatch(mailbox, /uniquement sur cet ordinateur/);
  assert.match(mailbox, /id="mb-username"/);
  assert.match(mailbox, /username:q\('#mb-username'\)\.value\.trim\(\)/);
  assert.match(mailService, /username: a\.username \|\| a\.email/);
  assert.match(onboarding, /j-ai-provider-status/);
  assert.match(onboarding, /missingConfiguration/);
  assert.match(onboarding, /La clé reste côté serveur et n’est jamais affichée/);
});
