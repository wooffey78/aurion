import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

const onboarding = fs.readFileSync(path.join(root,'assets/js/pages/onboarding.js'), 'utf8');
const settings = fs.readFileSync(path.join(root,'assets/js/pages/dash/settings.js'), 'utf8');
const fiscal = fs.readFileSync(path.join(root,'backend/src/services/fiscal-detection.ts'), 'utf8');

function legalFormOptionsCount() {
  const block = fiscal.match(/export const LEGAL_FORMS:LegalFormOption\[\]=\[(.*?)\];/s)?.[1] || '';
  return (block.match(/\{code:'[^']+',label:'[^']+',regime:'/g) || []).length;
}

test('step25: onboarding offers legal-form select backed by all server options', () => {
  // D6 (15.4.0) : nouveau parcours, même liste serveur des formes juridiques.
  assert.match(onboarding, /<select id="ob-legal">/);
  assert.match(onboarding, /legalForms:\[\]/);
  const count = legalFormOptionsCount();
  assert.equal(count, 24);
  assert.match(onboarding, /legalForms\.map\(/);
});

test('step25: organization settings exposes the same legal-form list instead of free text', () => {
  assert.match(settings, /<select id="slegal">/);
  assert.match(settings, /const populateLegalForms=async/);
  assert.match(settings, /api\.legalForms\(\)/);
});

test('step25: automatic detection can still assign a detected label to the select', () => {
  // D4 (15.4.0) : la forme détectée est proposée puis ajoutée au select si besoin, dans le parcours et les Paramètres.
  assert.match(onboarding, /if\(el\.tagName==='SELECT'&&!\[\.\.\.el\.options\]\.some\(o=>o\.value===value\)\)el\.add\(new Option\(value,value\)\)/);
  assert.match(settings, /registryFieldMap=\{name:'#sname',siret:'#ssiret',siren:'#ssiren',legal_form:'#slegal'/);
  assert.match(settings, /if\(el\.tagName==='SELECT'&&!\[\.\.\.el\.options\]\.some\(o=>o\.value===value\)\)el\.add\(new Option\(value,value\)\)/);
  assert.match(settings, /const detectLegal=async\(\)=>/);
  assert.match(settings, /api\.detectLegalForm\(/);
});
