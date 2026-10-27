import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../assets/js/pages/dash/settings.js', import.meta.url), 'utf8');

test('paramètres : adresse siège, code NAF et activité précise sont présentés une seule fois', () => {
  assert.match(source,/F\('saddress','Adresse du siège',S\.company\.address\|\|''\)/);
  assert.match(source,/F\('spostal','Code postal',S\.company\.postal_code\|\|''\)/);
  assert.match(source,/F\('scity','Ville',S\.company\.city\|\|''\)/);
  assert.match(source,/F\\('sactivity','Activité \/ métier',S\\.company\\.activity\\|\\|''\\)/);
  assert.match(source,/F\\('snaf','Code NAF',S\\.company\\.configuration_data\\?\\.naf_code\\|\\|''\\)/);\n  assert.equal(source.includes("F('sactivity','Activité historique'"), false);
  assert.match(source,/F\('scustom','Activité précise',S\.company\.custom_activity\|\|''\)/);
  assert.match(source,/\$\('#scustom'\)\.value\.trim\(\)/);
  assert.match(source,/customActivity:\$\('#scustom'\)\.value\.trim\(\)/);
  assert.match(source,/mergeRegistryFields/);
});
