import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('../..',import.meta.url).pathname);
const settings=fs.readFileSync(path.join(root,'assets/js/pages/dash/settings.js'),'utf8');
const sync=fs.readFileSync(path.join(root,'backend/src/services/configuration-sync.ts'),'utf8');

test('étape 1: activité — champs manuels vides, placeholders, sélecteurs conservés',()=>{
  const form=settings.slice(settings.indexOf('const activityForm='),settings.indexOf('export function bind'));
  assert.match(form,/manualInput\('name','Nom de l’activité','Nom donné à cette activité par l’utilisateur',a\.id\?'':'required'\)/);
  assert.match(form,/textarea id="description" placeholder="Décrivez l’activité avec des mots/);
  for(const id of ['vatRate','urssafRate','marginMinPercent','defaultPartCoefficientPercent','defaultLaborCoefficientPercent']){
    assert.match(form,new RegExp(`manualInput\\('${id}'`),`champ manuel ${id} doit être vide à l'ouverture`);
  }
  assert.match(form,/<select id="profileCode">/);
  assert.match(form,/<select id="legalForm">/);
  assert.doesNotMatch(form,/value=\"\$\{e\(a\.name\)\}\"/);
  assert.doesNotMatch(form,/>\$\{e\(a\.description\|\|'\'\)\}<\/textarea>/);
});

test('étape 1: le nom et la description de l’activité ne prennent pas le code NAF',()=>{
  assert.doesNotMatch(sync,/nextName=.*orgRow\.activity/);
  assert.doesNotMatch(sync,/nextDescription=.*orgRow\.activity/);
  assert.match(sync,/nextName=canSyncIdentity \? \(clean\(orgRow\.custom_activity\) \|\| clean\(orgRow\.name\)/);
  assert.match(sync,/nextDescription=canSyncIdentity \? \(clean\(orgRow\.custom_activity\) \|\| activity\.description/);
});

console.log('step1 activity fields: OK');


const binding=settings.slice(settings.indexOf('const activityBody='),settings.indexOf('export function bind'));

test('étape 1: modification d’une activité conserve les valeurs existantes si les champs manuels restent vides',()=>{
  assert.match(binding,/name:value\('name'\)\|\|a\.name/);
  assert.match(binding,/description:value\('description'\)\|\|a\.description/);
  assert.match(binding,/vatRate:numOrUndefined\('vatRate'\)\?\?\(a\.vat_rate/);
  assert.match(binding,/defaultPartCoefficientPercent:numOrUndefined\('defaultPartCoefficientPercent'\)\?\?\(a\.default_part_coefficient_percent/);
});
