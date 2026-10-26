import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.env.AURION_TEST_ROOT||process.cwd();
const account=fs.readFileSync(path.join(root,'assets/js/pages/dash/account.js'),'utf8');
const api=fs.readFileSync(path.join(root,'assets/js/core/api.js'),'utf8');
const route=fs.readFileSync(path.join(root,'backend/src/routes/account.ts'),'utf8');
const migrations=fs.readdirSync(path.join(root,'backend/migrations')).filter(x=>/^\d+_.*\.sql$/i.test(x)).sort();
const migrationText=migrations.map(x=>fs.readFileSync(path.join(root,'backend/migrations',x),'utf8')).join('\n');

test('profil utilisateur: avatar téléversable, privé et affiché après enregistrement',()=>{
  assert.match(account,/id=["']avatar-file["']/);
  assert.match(account,/api\.uploadAvatar\(/);
  assert.match(account,/accountAvatar\(\)/);
  assert.match(account,/URL\.createObjectURL/);
  assert.match(account,/avatarUrl|avatar_blob|avatar/i);
  assert.match(api,/uploadAvatar/);
  assert.match(api,/accountAvatar/);
  assert.match(route,/['"]\/account\/avatar['"]/);
  assert.match(route,/savePrivateUpload/);
  assert.match(route,/image\/(png|jpeg|webp)/);
  assert.match(route,/avatar_key/);
  assert.match(migrationText,/avatar_key/);
});
