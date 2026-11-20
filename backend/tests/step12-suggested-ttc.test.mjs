import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('étape 12 — le devis ne majore plus automatiquement le total catalogue de 1 €', () => {
  const quote = readFileSync(new URL('../../assets/js/pages/dash/quote.js', import.meta.url), 'utf8');
  const business = readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(quote, /suggestedTtcFromCatalogTotal/);
  assert.doesNotMatch(business, /suggestedTtcFromCatalogTotal/);
  assert.match(quote, /\$\('#targetTtc'\)\.value=total\.toFixed\(2\)/);
});

test('étape 12 — le helper historique +1 n\'est plus utilisé par le parcours devis', () => {
  const helper = readFileSync(new URL('../../assets/js/core/suggested-ttc.js', import.meta.url), 'utf8');
  assert.match(helper, /suggestedTtcFromCatalogTotal/);
});
