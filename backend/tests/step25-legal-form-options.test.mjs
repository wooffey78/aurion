import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const onboarding = fs.readFileSync('assets/js/pages/onboarding.js', 'utf8');
const settings = fs.readFileSync('assets/js/pages/dash/settings.js', 'utf8');
const fiscal = fs.readFileSync('backend/src/services/fiscal-detection.ts', 'utf8');

function legalFormOptionsCount() {
  const block = fiscal.match(/export const LEGAL_FORMS:LegalFormOption\[\]=\[(.*?)\];/s)?.[1] || '';
  return (block.match(/\{code:'[^']+',label:'[^']+',regime:'/g) || []).length;
}

test('step25: onboarding offers legal-form select backed by all server options', () => {
  assert.match(onboarding, /<select id="legalForm">/);
  assert.match(onboarding, /let legalForms=\[\];/);
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
  assert.match(onboarding, /legal_form:merged\.legal_form/);
  assert.match(settings, /\$\('#slegal'\)\.value=merged\.legal_form/);
  assert.match(settings, /legalInput\.value=r\.legalForm/);
});
