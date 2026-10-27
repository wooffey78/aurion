import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('brouillon partagé côté serveur, isolé par organisation et utilisateur', () => {
  const route = read('../src/routes/settings.ts');
  const migration = read('../migrations/054_synced_quote_drafts.sql');
  const api = read('../../assets/js/core/api.js');
  const quote = read('../../assets/js/pages/dash/quote.js');
  const dashboard = read('../../assets/js/pages/dashboard.js');
  assert.match(migration, /PRIMARY KEY \(organization_id, user_id, draft_key\)/);
  assert.match(route, /where organization_id=\$1 and user_id=\$2 and draft_key=\$3/);
  assert.match(route, /DRAFT_TOO_LARGE/);
  assert.match(api, /getDraft:.*settings\/draft/);
  assert.match(quote, /Synchronisation du brouillon/);
  assert.match(quote, /targetNet:num\('#minimumProfit'\)/);
  assert.match(dashboard, /hooks\.refresh\(b\.dataset\.view\)/);
  assert.match(dashboard, /backgroundRefreshRunning/);
});

test('clavier mobile : visualViewport, taille minimale des champs et zone de défilement', () => {
  const main = read('../../assets/js/main.js');
  const css = read('../../assets/css/app.css');
  assert.match(main, /visualViewport/);
  assert.match(main, /scrollIntoView/);
  assert.match(css, /input,select,textarea\{font-size:16px/);
  assert.match(css, /body\.keyboard-open/);
});

test('biométrie : bouton accessible sans connexion automatique silencieuse', () => {
  const auth = read('../../assets/js/pages/auth.js');
  assert.match(auth, /biometric.hidden=r\|\|!biometricAllowed\(\)/);
  assert.doesNotMatch(auth, /setTimeout\(\(\)=>biometricLogin\(\)\.catch\(\(\)=>\{\}\)/);
  assert.match(auth, /biometric.onclick=async/);
  assert.match(auth, /window\.isSecureContext&&window\.PublicKeyCredential&&navigator\.credentials\?\.get&&navigator\.credentials\?\.create/);
  assert.doesNotMatch(auth, /Android\|iPhone\|iPad\|iPod/);
  const account=read('../../assets/js/pages/dash/account.js');
  assert.match(account, /webauthnCredentials\(\)/);
  assert.match(account, /deleteWebauthnCredential/);
});


test('registre entreprise : aucun appel automatique avant identifiant complet valide', async () => {
  const { isValidRegistryIdentifier } = await import('../../assets/js/core/registry-fill.js');
  assert.equal(isValidRegistryIdentifier('73282932000074'), true);
  assert.equal(isValidRegistryIdentifier('732829320'), true);
  assert.equal(isValidRegistryIdentifier('73282932'), false);
  assert.equal(isValidRegistryIdentifier('35600000000000'), false);
  assert.match(read('../../assets/js/pages/dash/settings.js'), /if\(registryLookupReady\(\)\)lookupRegistry\(false\)/);
});
