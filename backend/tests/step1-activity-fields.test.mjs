import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const settings=fs.readFileSync(path.join(root,'assets/js/pages/dash/settings.js'),'utf8');
const sync=fs.readFileSync(path.join(root,'backend/src/services/configuration-sync.ts'),'utf8');

test('activité : saisie manuelle, sélection du métier et champs fiscaux indépendants',()=>{
  const start=settings.indexOf('const activityForm=');
  const end=settings.indexOf('export function bind',start);
  assert.ok(start>=0&&end>start,'formulaire activité repéré');
  const form=settings.slice(start,end);
  assert.ok(form.includes("manualInput('name','Nom de l’activité','Nom donné à cette activité'"));
  assert.ok(form.includes("manualInput('description','Description / métier','Décrivez l’activité avec des mots"));
  assert.match(form,/<select id="profileCode">/);
  assert.ok(form.includes('Identité juridique :'));
  assert.ok(form.includes("manualInput('vatRate'"),'TVA modifiable');
  assert.ok(form.includes("manualInput('urssafRate'"),'taux agrégé modifiable');
  assert.doesNotMatch(form,/value="\$\{e\(a\.name\)\}"/);
  assert.doesNotMatch(form,/>\$\{e\(a\.description/);
});

test('nom métier et description ne sont pas écrasés par le code NAF',()=>{
  assert.doesNotMatch(sync,/nextName=.*orgRow\.activity/);
  assert.doesNotMatch(sync,/nextDescription=.*orgRow\.activity/);
  assert.match(sync,/nextName=canSyncIdentity/);
  assert.match(sync,/nextDescription=canSyncIdentity/);
});

test('modifier une activité conserve les valeurs existantes si les champs restent vides',()=>{
  const start=settings.indexOf('const activityBody=');
  const end=settings.indexOf('export function bind',start);
  const binding=settings.slice(start,end);
  assert.match(binding,/name:value\('name'\)\|\|a\.name/);
  assert.match(binding,/description:value\('description'\)\|\|a\.description/);
  assert.match(binding,/vatRate:numOrUndefined\('vatRate'\)/);
  assert.match(binding,/defaultPartCoefficientPercent:numOrUndefined\('defaultPartCoefficientPercent'\)/);
});
