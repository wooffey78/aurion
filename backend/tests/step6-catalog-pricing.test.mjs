import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const business = fs.readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');
const quote = fs.readFileSync(new URL('../../assets/js/pages/dash/quote.js', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../../assets/js/pages/dash/catalog.js', import.meta.url), 'utf8');

test('étape 6 : le backend applique le prix catalogue même lorsque le coefficient porte sur la marge', () => {
  assert.match(business, /if\(b\.catalogPricing===true\)\{const catalogTarget=await catalogQuoteTarget/);
  assert.match(business, /if\(\(b\.catalogPricing\?\?cur\.catalog_pricing\)===true\)\{const catalogTarget=await catalogQuoteTarget/);
});

test('étape 6 : le prix catalogue de prestation est un TTC fixe et les pièces restent internes', () => {
  assert.match(quote, /const service=Number\(iv\?\.default_price\|\|0\)/);
  assert.match(quote, /const total=service/);
  assert.doesNotMatch(quote, /const total=service\+partHt/);
  assert.match(catalog, /Prix client habituel TTC/);
  assert.match(catalog, /Prix de vente HT \(indicatif\)/);
});

test('étape 6 : les prix catalogue restent bornés à l’activité du devis côté serveur', () => {
  assert.match(business, /from interventions where organization_id=\$1 and activity_id=\$2/);
  assert.match(business, /from parts where id=\$1 and organization_id=\$2 and activity_id=\$3/);
  assert.match(business, /from parts where organization_id=\$1 and activity_id=\$2 and lower\(trim\(name\)\)=lower\(trim\(\$3\)\)/);
});
