// Contrats 15.4.36 — aucune donnée non renseignée ne devient un faux zéro, et la détection
// automatique complète la TVA intracommunautaire depuis le SIREN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const quote = read('assets/js/pages/dash/quote.js');
const layout = read('backend/src/services/document-layout.ts');

test('frais kilométriques : champs vides avec placeholder, jamais « 0,00 € »', () => {
  assert.doesNotMatch(quote, /value="\$\{e\(mileageInternalRate\)\}"/, 'le coût interne ne doit pas s’afficher à 0');
  assert.doesNotMatch(quote, /value="\$\{e\(mileageClientRate\)\}"/, 'le tarif client ne doit pas s’afficher à 0');
  assert.match(quote, /value="\$\{mileageInternalRate\?e\(mileageInternalRate\):''\}"/);
  assert.match(quote, /value="\$\{mileageClientRate\?e\(mileageClientRate\):''\}"/);
  assert.match(quote, /'à renseigner'/, 'le montant appliqué reste un placeholder');
  assert.match(quote, /kmKnown&&rateKnown\?money\(mt\):'à renseigner'/);
});

test('coefficient : vide tant qu’aucune valeur n’est saisie', () => {
  assert.match(quote, /id="coefficientValue" type="number" min="0" step="0\.01" value="\$\{coefficientValue\?e\(coefficientValue\):''\}"/);
});

test('les documents n’impriment pas une ligne de frais kilométriques à zéro', () => {
  assert.match(layout, /m\.mileage\.total !== '0,00\s?€' && m\.mileage\.total !== '0\s?€'/);
  assert.match(layout, /m\.mileage\.visible !== false/);
});

test('la TVA intracommunautaire est calculée depuis le SIREN quand le registre ne la fournit pas', () => {
  const source = read('assets/js/core/registry-fill.js').replace(/export /g, '');
  const context = vm.createContext({ URL });
  new vm.Script(source).runInContext(context);
  assert.equal(context.frenchVatFromSiren('732829320'), 'FR44732829320');
  assert.equal(context.frenchVatFromSiren('12345'), '');
  const merged = context.mergeRegistryFields({}, { legalName: 'Entreprise test', siren: '732829320' });
  assert.equal(merged.vat_number, 'FR44732829320');
  const preserved = context.mergeRegistryFields({ vat_number: 'FR99999999999' }, { siren: '732829320' });
  assert.equal(preserved.vat_number, 'FR99999999999', 'une valeur saisie n’est jamais écrasée');
});
