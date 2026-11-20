import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('le déploiement Render est limité au dépôt, à main, au commit distant et au plan gratuit', () => {
  const script = read('../../tools/Deploy-Aurion-Render.ps1');
  assert.match(script, /https:\/\/github\.com\/wooffey78\/aurion/);
  assert.match(script, /if \(\$branch -ne 'main'\)/);
  assert.match(script, /refs\/heads\/main/);
  assert.match(script, /\$localSha -ne \$remoteSha/);
  assert.match(script, /\$serviceRepo -ne \$Repository/);
  assert.match(script, /\$service\.branch -ne 'main'/);
  assert.match(script, /\$plan -ne 'free'/);
  assert.match(script, /DATABASE_URL/);
  assert.match(script, /DEPLOYER/);
});

test('le script de livraison ne modifie ni variables Render, ni service, ni branche distante', () => {
  const script = read('../../tools/Deploy-Aurion-Render.ps1');
  assert.doesNotMatch(script, /Method\s+'PATCH'/);
  assert.doesNotMatch(script, /Method\s+'PUT'/);
  assert.doesNotMatch(script, /Method\s+'DELETE'/);
  assert.match(script, /services\/\$ServiceId\/deploys/);
  assert.match(script, /Aucune base de données, variable d’environnement ou ressource Render ne sera créée ou modifiée/);
});
