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

// Onboarding detection control must be directly tied to SIRET/SIREN block.
assertOrder(onboarding, '<span>SIRET</span>', 'id="detect"', 'Onboarding detection placement');
assert.ok(
  onboarding.indexOf('id="detect"') < onboarding.indexOf('id="close"'),
  'Onboarding detection must appear before unrelated actions'
);

// Settings already has a SIRET/SIREN detection action below that block.
assertOrder(settings, "F('ssiret','SIRET'", 'id="lookup-company-siret"', 'Settings SIRET detection placement');

// Supplier detection controls are below the identifying fields.
assertOrder(suppliers, "F('name','Nom'", "F('siret','SIRET'", 'Supplier identifier order');
assertOrder(suppliers, "F('siret','SIRET'", 'id="lookup-supplier"', 'Supplier SIRET detection placement');
assertOrder(suppliers, 'id="lookup-supplier"', 'id="lookup-supplier-name"', 'Supplier detection controls order');

// Every SIRET form field must have a detection button. This is intentionally red on step 17.
assertOrder(clients, '<span>SIRET</span><input id="siret"', 'id="lookup-client-siret"', 'Client SIRET detection placement');

// Legal-form detection button must be anchored under the activity name rather than beside the legal-form field.
assertOrder(settings, "manualInput('name','Nom de l’activité'", 'id="detect-legal-form"', 'Activity legal-form detection placement');

console.log('step18 detection button layout: OK');
