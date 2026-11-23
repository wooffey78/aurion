import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('catalogue métier expose la consultation, la recherche et les opérations de CRUD par catégorie', () => {
  const catalog = read('../../assets/js/pages/dash/catalog.js');
  const api = read('../../assets/js/core/api.js');
  const css = read('../../assets/css/app.css');
  for (const action of ["'view'", "'edit'", "'delete'", "'add'", "'export'", "'seed'"]) assert.ok(catalog.includes(action), `action catalogue absente : ${action}`);
  for (const route of ['createIntervention', 'updateIntervention', 'deleteIntervention', 'createPart', 'updatePart', 'deletePart', 'createSupply', 'updateSupply', 'deleteSupply', 'createWarrantyPolicy', 'updateWarrantyPolicy', 'deleteWarrantyPolicy', 'setPartPrice', 'deletePartPrice']) {
    assert.ok(api.includes(route), `route métier conservée : ${route}`);
  }
  assert.match(catalog, /aria-live="polite"/);
  assert.match(catalog, /aria-pressed/);
  assert.match(catalog, /schemaVersion:1/);
  assert.match(catalog, /known\[q\.type\]\.has\(key\)/);
  assert.match(css, /\.catalog-category-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:700px\).*catalog-control-row/s);
  for (const legacyAccent of ['#31e6a1','#55cfff','#3a6fd8','#1a9fd0','#5b8cff','#7c3aed','#60a5fa','rgba(70,180,255','rgba(164,92,255']) assert.ok(!css.toLowerCase().includes(legacyAccent), `accent hérité trop saturé : ${legacyAccent}`);
});

test('import catalogue est additif, borné, scoped activité et ne remplace pas les données par un fichier arbitraire', () => {
  const catalog = read('../../assets/js/pages/dash/catalog.js');
  assert.match(catalog, /!getActiveActivity\(\)/);
  assert.match(catalog, /file\.size>5\*1024\*1024/);
  assert.match(catalog, /tasks\.length>1000/);
  assert.match(catalog, /format!=='aurion-catalogue'/);
  assert.match(catalog, /known\[q\.type\]\.has\(key\)\)\{skipped\+\+;continue\}/);
  assert.doesNotMatch(catalog, /UPDATE\s+.+\s+SET/i);
});

test('connexion Google exige état CSRF, PKCE, jeton vérifié et compte Aurion existant', () => {
  const route = read('../src/routes/auth.ts');
  const api = read('../../assets/js/core/api.js');
  const auth = read('../../assets/js/pages/auth.js');
  assert.match(route, /aurion_google_login/);
  assert.match(route, /code_challenge_method:CodeChallengeMethod\.S256/);
  assert.match(route, /state!==transaction\.state/);
  assert.match(route, /verifyIdToken\(\{idToken,audience:config\.GOOGLE_CLIENT_ID\}\)/);
  assert.match(route, /identity\.email_verified!==true/);
  assert.match(route, /if\(!user\)return fail\(\)/);
  assert.match(route, /GOOGLE_LOGIN_NOT_CONFIGURED/);
  assert.match(api, /googleAuthStatus:.*auth\/google\/status/);
  assert.match(auth, /const showGoogle=\(\)=>\{google\.hidden=mode!=='login'\|\|!googleConfigured\}/);
  assert.match(auth, /api\.googleAuthStatus\(\)\.then\(result=>\{googleConfigured=result\?\.configured===true;showGoogle\(\)\}/);
  assert.match(auth, /google\.onclick=\(\)=>\{if\(!google\.hidden\)window\.location\.assign/);
});

test('gestion des clés d’accès : chaque liste et suppression est limitée à l’utilisateur authentifié', () => {
  const route = read('../src/routes/auth.ts');
  const account = read('../../assets/js/pages/dash/account.js');
  const api = read('../../assets/js/core/api.js');
  assert.match(route, /app\.get\('\/auth\/webauthn\/credentials', \{ preHandler: app\.requireAuth \}/);
  assert.match(route, /where user_id=\$1 order by created_at desc/);
  assert.match(route, /delete from webauthn_credentials where id=\$1 and user_id=\$2/);
  assert.match(account, /api\.webauthnRegisterOptions\(\)/);
  assert.match(account, /api\.webauthnRegisterVerify/);
  assert.match(account, /api\.deleteWebauthnCredential/);
  assert.match(api, /deleteWebauthnCredential:id=>request/);
});

test('fichiers JavaScript refondus passent l’analyse syntaxique ES module', () => {
  for (const file of ['../../assets/js/pages/dash/catalog.js','../../assets/js/pages/auth.js','../../assets/js/pages/dash/account.js']) {
    const source=read(file);
    const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
    assert.equal(result.status,0,`Erreur de syntaxe dans ${file}: ${result.stderr||result.stdout}`);
  }
});
