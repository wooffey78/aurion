import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const onboarding = read('../../assets/js/pages/onboarding.js');
const settings = read('../../assets/js/pages/dash/settings.js');
const suppliers = read('../../assets/js/pages/dash/suppliers.js');
const clients = read('../../assets/js/pages/dash/other.js');

function assertOrder(source, before, after, message) {
  const a = source.indexOf(before);
  const b = source.indexOf(after);
  assert.ok(a >= 0, `${message}: missing '${before}'`);
  assert.ok(b >= 0, `${message}: missing '${after}'`);
  assert.ok(a < b, `${message}: '${after}' must follow '${before}'`);
}

// D4/D6 (15.4.0) : nouveau parcours ; le bouton « Détecter mon entreprise » suit le champ SIRET/SIREN et précède les champs proposés.
// 15.4.5 : le champ accepte aussi le NOM de l'entreprise ; la liste de choix du registre suit le bouton.
assertOrder(onboarding, "field('ob-identifier','SIRET, SIREN ou nom'", 'id="ob-detect"', 'Onboarding detection placement');
assertOrder(onboarding, 'id="ob-detect"', 'renderCompanyChoices(box', 'Onboarding name-search choices after the detect button');
assert.ok(onboarding.indexOf('id="ob-detect"') < onboarding.indexOf("field('ob-name'"));
assertOrder(settings, "F('ssiret','SIRET'", 'id="lookup-company-siret"', 'Settings SIRET detection placement');
assertOrder(suppliers, "F('name','Nom'", "F('siret','SIRET'", 'Supplier identifier order');
assertOrder(suppliers, "F('siret','SIRET'", 'id="lookup-supplier"', 'Supplier SIRET detection placement');
// 15.4.5 : la détection par nom passe par le bouton partagé et le module unique (aucun bouton hérité dédié).
assert.ok(!suppliers.includes('id="lookup-supplier-name"'), 'No legacy dedicated name button');
assert.ok(suppliers.includes('renderCompanyChoices'), 'Supplier name search uses the shared choices list');
assert.ok(settings.includes('renderCompanyChoices'), 'Settings name search uses the shared choices list');
assertOrder(clients, '<span>SIRET</span><input id="siret"', 'id="lookup-client-siret"', 'Client SIRET detection placement');

// The current activity editor auto-detects fiscal/legal form; it intentionally has no duplicate button.
assert.match(settings, /const detectLegal=async\(\)=>/);
assert.match(settings, /api\.detectLegalForm\(/);
assert.match(settings, /Renseignée une seule fois dans « Entreprise »/);
assert.doesNotMatch(settings, /id="detect-legal-form"/);

console.log('step18 detection button layout: OK');
