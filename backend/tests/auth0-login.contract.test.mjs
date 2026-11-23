import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = path => readFileSync(join(root, path), 'utf8');

test('Auth0 : flux OIDC serveur avec state, nonce et PKCE', () => {
  const auth = read('backend/src/routes/auth.ts');
  assert.match(auth, /createRemoteJWKSet, jwtVerify/);
  assert.match(auth, /code_challenge_method:'S256'/);
  assert.match(auth, /httpOnly:true,secure:config\.COOKIE_SECURE,sameSite:'lax'/);
  assert.match(auth, /AbortSignal\.timeout\(10000\)/);
  assert.match(auth, /client_secret:config\.AUTH0_CLIENT_SECRET/);
  assert.match(auth, /codeVerifier/);
  assert.match(auth, /nonce/);
  assert.match(auth, /state!==transaction\.state/);
  assert.match(auth, /identity\.nonce!==transaction\.nonce/);
  assert.match(auth, /algorithms:\['RS256'\]/);
  assert.match(auth, /issuer:auth0Issuer\(\)/);
  assert.match(auth, /audience:config\.AUTH0_CLIENT_ID/);
  assert.match(auth, /identity\.email_verified!==true/);
});

test('Auth0 : refuse les comptes inconnus et les appartenances ambiguës', () => {
  const auth = read('backend/src/routes/auth.ts');
  assert.match(auth, /from users u where lower\(u\.email\)=lower\(\$1\)/);
  assert.match(auth, /count\(\*\) over\(partition by u\.id\)::int as membership_count/);
  assert.match(auth, /if\(!user\)return auth0LoginFailure\(reply,'not-linked'\)/);
  assert.match(auth, /Number\(user\.membership_count\)>1/);
  // Le callback SSO ne doit ni créer un compte utilisateur ni un espace sans consentement Aurion.
  const start = auth.indexOf("app.get('/auth/auth0/callback'");
  const end = auth.indexOf("app.get('/auth/registration-status'", start);
  const callback = auth.slice(start, end);
  assert.doesNotMatch(callback, /insert into users/i);
  assert.doesNotMatch(callback, /insert into organizations/i);
});

test('Auth0 : la session finale reste une session Aurion et le bouton est facultatif', () => {
  const auth = read('backend/src/routes/auth.ts');
  const ui = read('assets/js/pages/auth.js');
  const api = read('assets/js/core/api.js');
  const config = read('backend/src/config.ts');
  assert.match(auth, /app\.get\('\/auth\/auth0\/status'/);
  assert.match(auth, /app\.get\('\/auth\/auth0\/start'/);
  assert.match(auth, /app\.get\('\/auth\/auth0\/callback'/);
  assert.match(auth, /signAccessToken\(\{userId:user\.id,organizationId:user\.organization_id/);
  assert.match(ui, /id="auth0-signin"/);
  assert.match(ui, /mode!=='login'\|\|!auth0Configured/);
  assert.match(ui, /auth0AuthStatus\(\)/);
  assert.doesNotMatch(ui, /AUTH0_CLIENT_SECRET|client_secret/);
  assert.match(api, /auth0AuthStatus:\(\)=>request\('\/auth\/auth0\/status'\)/);
  assert.match(config, /AUTH0_DOMAIN:z\.string\(\)/);
  assert.match(config, /AUTH0_CLIENT_SECRET:z\.string\(\)/);
  assert.match(config, /auth0Redirect\.origin!==expectedOrigin/);
});

test('Auth0 : la documentation n’expose aucun secret côté frontend', () => {
  const env = read('backend/.env.example');
  const render = read('render.yaml');
  const docs = read('docs/AUTH0-CONFIGURATION.md');
  assert.match(env, /^AUTH0_DOMAIN=$/m);
  assert.match(env, /^AUTH0_CLIENT_ID=$/m);
  assert.match(env, /^AUTH0_CLIENT_SECRET=$/m);
  assert.ok(render.includes('key: AUTH0_CLIENT_SECRET\n        sync: false'));
  assert.match(docs, /Regular Web Application/);
  assert.match(docs, /AUTH0_REDIRECT_URI/);
  assert.match(docs, /adresse doit être déclarée vérifiée/);
});
