import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../assets/js/pages/dash/settings.js', import.meta.url), 'utf8');

test('paramètres : adresse du siège, activité métier, code NAF et activité précise sont distincts', () => {
  assert.match(source,/F\('saddress','Adresse du siège',S\.company\.address\|\|''\)/);
  assert.match(source,/F\('spostal','Code postal',S\.company\.postal_code\|\|''\)/);
  assert.match(source,/F\('scity','Ville',S\.company\.city\|\|''\)/);
  assert.match(source,/F\('sactivity','Activité \/ métier',S\.company\.activity\|\|''\)/);
  assert.match(source,/F\('snaf','Code NAF',S\.company\.configuration_data\?\.naf_code\|\|''\)/);
  assert.match(source,/F\('scustom','Activité précise',S\.company\.custom_activity\|\|''\)/);
  assert.equal(source.includes("F('sactivity','Activité historique'"), false);
  assert.equal((source.match(/F\('snaf','Code NAF'/g)||[]).length,1);
  assert.match(source,/\$\('#scustom'\)\.value\.trim\(\)/);
  assert.match(source,/customActivity:\$\('#scustom'\)\.value\.trim\(\)/);
  // D4 (15.4.0) : la fusion passe par le module partagé company-detect.js (propositions champ par champ, saisie manuelle prioritaire).
  assert.match(source,/buildProposals\(currentCompanyValues\(\),registryCandidate\)/);
});
