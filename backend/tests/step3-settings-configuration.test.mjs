import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
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
  assert.match(settings,/3 · Configuration fonctionnelle[\s\S]*4 · Activités et calculs métier/);
  assert.match(settings,/Entreprise[\s\S]*Messagerie & agenda/);
  assert.match(settings,/company-registry-preview/);
  // D4 (15.4.0) : « Appliquer la détection » globale remplacée par « Appliquer / Ignorer » champ par champ (company-detect.js).
  assert.match(settings,/renderProposals\(box,buildProposals\(/);
  // D4 (15.4.0) : message porté par l'implémentation partagée de détection.
  assert.match(fs.readFileSync(path.join(root,'assets/js/core/company-detect.js'),'utf8'),/Les informations du registre correspondent déjà à votre saisie/);
  assert.match(onboarding,/Configuration initiale d’Aurion/);
});
