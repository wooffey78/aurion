// 15.4.68 — régression des moteurs corrigés : calcul commercial (mémoïsation, cotisations),
// affichage des encarts (formatage, frais kilométriques) et mise en page des documents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { computePricing } from '../../assets/js/core/pricing.js';
import { buildOdt, formatEuro, formatQty, starterModel } from '../../backend/src/services/document-layout.ts';

const base = {
  partCost: 100, targetTtc: 240, vatRate: 20,
  contributions: [{ name: 'Cotisations sociales', rate: 22, basis: 'ca_ht' }],
};
const odtContent = model => new AdmZip(buildOdt(model)).getEntry('content.xml').getData().toString('utf8');

test('15.4.68 — deux calculs identiques sont totalement indépendants (aucun cache partagé)', () => {
  const first = computePricing({ ...base });
  assert.equal(first.totalTtc, 240);
  // Le moteur 15.4.69 ne mémoïse plus : modifier un résultat ne peut jamais affecter le suivant.
  first.totalTtc = -1;
  first.contributions[0].amount = -1;
  const again = computePricing({ ...base });
  assert.notEqual(again, first);
  assert.equal(again.totalTtc, 240);
  assert.equal(again.contributions[0].amount, 44);
});

test('15.4.68 — une ligne de cotisation nulle ne fait pas échouer le calcul', () => {
  const result = computePricing({ partCost: 100, targetTtc: 240, vatRate: 20, contributions: [null] });
  assert.equal(result.totalTtc, 240);
  assert.equal(result.contributions.length, 1);
  assert.equal(result.contributions[0].amount, 0);
});

test('15.4.68 — les montants et quantités non numériques ne produisent jamais NaN', () => {
  assert.equal(formatEuro('abc'), '0,00\u00A0€');
  assert.equal(formatEuro(undefined), '0,00\u00A0€');
  assert.equal(formatQty('abc'), '0');
  assert.ok(!formatEuro('non numérique').includes('NaN'));
  assert.ok(!formatQty('non numérique').includes('NaN'));
  assert.equal(formatEuro(1234.5), `1\u00A0234,50\u00A0€`);
});

test('15.4.68 — l’encart kilométrique suit le montant réel, jamais le texte formaté', () => {
  const zero = { ...starterModel('quote'), mileage: { km: '0', rate: formatEuro(0), total: formatEuro(0) } };
  assert.ok(!odtContent(zero).includes('Kilometrage'), 'encart à 0,00 € affiché');
  const zeroAlt = { ...zero, mileage: { ...zero.mileage, total: '0 €' } };
  assert.ok(!odtContent(zeroAlt).includes('Kilometrage'), 'variante « 0 € » affichée');
  const billed = { ...zero, mileage: { km: '12', rate: '0,80\u00A0€', total: formatEuro(9.6) } };
  assert.ok(odtContent(billed).includes('Kilometrage'), 'encart réel masqué');
  const placeholder = { ...zero, mileage: { ...zero.mileage, total: '{{MILEAGE_TOTAL}}' } };
  assert.ok(odtContent(placeholder).includes('Kilometrage'), 'aperçu de modèle sans encart');
});
