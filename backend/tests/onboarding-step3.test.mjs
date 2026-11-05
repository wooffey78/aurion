// D2/D6/D7/D10 (15.4.0) : le parcours en 3 étapes (Entreprise / Personnalisation / Tableau de bord) est remplacé par
// Vous → Entreprise → Activité → Logo → Messagerie → Signature → Documents (cloud) → Récapitulatif.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const onboarding = fs.readFileSync(new URL('../../assets/js/pages/onboarding.js', import.meta.url), 'utf8');

test('parcours 15.4.0 : ordre des étapes et récapitulatif final', () => {
  const order=['you','company','activity','logo','mail','signature','cloud','recap'].map(k=>onboarding.indexOf(`{key:'${k}'`));
  assert.ok(order.every(i=>i>0));
  assert.deepEqual([...order].sort((a,b)=>a-b),order);
  assert.match(onboarding,/\[stepYou,stepCompany,stepActivity,stepLogo,stepMail,stepSignature,stepCloud,stepRecap\]/);
});

test('chaque étape écrit dans les entités lues par Paramètres et Mon compte (D7)', () => {
  assert.match(onboarding,/api\.updateAccount\(\{fullName:/);
  assert.match(onboarding,/jobTitle:val\('ob-job'\)/);
  assert.match(onboarding,/api\.updateOrganization\(orgBody\(/);
  assert.match(onboarding,/api\.saveEmailSignature\(payload\(\)\)/);
  assert.match(onboarding,/api\.uploadOrganizationLogo\(chosen\)/);
  // Le corps envoyé conserve toujours les champs existants de l'entreprise et fusionne la configuration.
  for (const field of ['customActivity:c.custom_activity','siren:c.siren','siret:c.siret','legalForm:c.legal_form','address:c.address','postalCode:c.postal_code','city:c.city','website:c.website']) assert.ok(onboarding.includes(field), field);
  assert.match(onboarding,/configurationData:\{\.\.\.\(c\.configuration_data\|\|\{\}\),\.\.\.configurationPatch\}/);
});

test('logo, messagerie et signature sont facultatifs ; la dernière étape mène au tableau de bord', () => {
  assert.match(onboarding,/skip:'Passer cette étape'/);
  assert.match(onboarding,/skip:'Configurer plus tard'/);
  assert.match(onboarding,/configurationIncomplete:false/);
  assert.match(onboarding,/go\('\/dashboard'\)/);
  assert.doesNotMatch(onboarding,/brandStep|businessNamePrompt|administrativeFormalit|identité visuelle/i);
});

test('note e-mail dédiée, consentement Drive explicite et accessibilité du parcours', () => {
  assert.match(onboarding,/nous vous conseillons de créer ou d’utiliser une adresse e-mail dédiée à votre entreprise/);
  assert.match(onboarding,/api\.cloudStart\('\/onboarding'\)/);
  assert.match(onboarding,/role="progressbar"/);
  assert.match(onboarding,/aria-current="step"/);
  assert.match(onboarding,/heading\.focus\(/);
  assert.doesNotMatch(onboarding,/style="/);
});
