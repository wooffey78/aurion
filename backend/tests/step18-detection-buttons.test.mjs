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

assertOrder(onboarding, '<span>SIRET</span>', 'id="detect"', 'Onboarding detection placement');
assert.ok(onboarding.indexOf('id="detect"') < onboarding.indexOf('id="close"'));
assertOrder(settings, "F('ssiret','SIRET'", 'id="lookup-company-siret"', 'Settings SIRET detection placement');
assertOrder(suppliers, "F('name','Nom'", "F('siret','SIRET'", 'Supplier identifier order');
assertOrder(suppliers, "F('siret','SIRET'", 'id="lookup-supplier"', 'Supplier SIRET detection placement');
assertOrder(suppliers, 'id="lookup-supplier"', 'id="lookup-supplier-name"', 'Supplier detection controls order');
assertOrder(clients, '<span>SIRET</span><input id="siret"', 'id="lookup-client-siret"', 'Client SIRET detection placement');

// The current activity editor auto-detects fiscal/legal form; it intentionally has no duplicate button.
assert.match(settings, /const detectLegal=async\(\)=>/);
assert.match(settings, /api\.detectLegalForm\(/);
assert.match(settings, /Renseignée une seule fois dans « Entreprise »/);
assert.doesNotMatch(settings, /id="detect-legal-form"/);

console.log('step18 detection button layout: OK');
