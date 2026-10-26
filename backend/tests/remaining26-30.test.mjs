import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('../..',import.meta.url).pathname);
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

// Étape 26 — Fournitures : les contrôles visibles sont reliés au CRUD existant.
{
  const x=read('assets/js/pages/dash/catalog.js');
  for(const token of ['#add-supply','createSupply','updateSupply','deleteSupply']) assert.match(x,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(x,/activityId:getActiveActivity\(\)/);
}

// Étape 27 — Rafraîchissement : les mutations standard passent par le hook commun.
{
  const x=read('assets/js/pages/dash/core.js');
  assert.match(x,/await hooks\.refresh\(\)/);
  assert.match(x,/let submitting=false/);
  assert.match(x,/if\(submitting\)return/);
}

// Étape 28 — Compte : une modification réussie recharge la vue et ses données.
{
  const x=read('assets/js/pages/dash/account.js');
  assert.match(x,/api\.updateAccount/);
  assert.match(x,/await hooks\.refresh\('account'\)/);
}

// Étape 29 — Les routes métier exposent bien un CRUD pour les données catalogue.
{
  const x=read('backend/src/routes/business.ts');
  for(const name of ['supplies','interventions','parts','warranty-policies']) assert.ok(x.includes(`'/${name}`),`route ${name} absente`);
}

// Étape 30 — Le chargement global récupère les collections métier nécessaires au rendu.
{
  const x=read('assets/js/pages/dashboard.js');
  for(const name of ['clients','quotes','suppliers','parts','interventions','supplies','warranties','warrantyPolicies','sav']) assert.match(x,new RegExp(`api\\.${name}\\(\\)`));
  assert.match(x,/Object\.assign\(S,/);
}

console.log('remaining26-30: 5/5 OK');
