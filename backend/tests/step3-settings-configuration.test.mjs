import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('../..',import.meta.url).pathname);
const dashboard=fs.readFileSync(path.join(root,'assets/js/pages/dashboard.js'),'utf8');
const settings=fs.readFileSync(path.join(root,'assets/js/pages/dash/settings.js'),'utf8');
const onboarding=fs.readFileSync(path.join(root,'assets/js/pages/onboarding.js'),'utf8');

test('paramètres : la configuration fonctionnelle est organisée en une source unique et sans popup automatique',()=>{
  assert.doesNotMatch(dashboard,/renderOnboarding\(document\.querySelector\('#onboarding-modal-root'\)/);
  for(const key of ['parts','stock','contributions','support','agenda','accounting']){
    assert.match(settings,new RegExp(`\\['${key}',`));
  }
  assert.match(settings,/configurationData/);
  assert.match(settings,/questionnaire/);
  assert.match(settings,/configurationIncomplete:false/);
  assert.match(settings,/Configuration fonctionnelle[\s\S]*3 · Activités et calculs métier/);
  assert.match(settings,/Entreprise[\s\S]*Messagerie & agenda/);
  assert.match(settings,/company-registry-preview/);
  assert.match(settings,/Appliquer la détection/);
  assert.match(settings,/Aucune information nouvelle ne sera appliquée/);
  assert.match(onboarding,/Configuration initiale d’Aurion/);
});
