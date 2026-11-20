import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('la conversion devis-facture restitue le statut réel de livraison e-mail', () => {
  const docs = read('../../assets/js/pages/dash/docs.js');
  assert.match(docs, /emailToast\(r\.emailStatus/);
  assert.doesNotMatch(docs, /Facture \$\{r\.number\} créée et envoyée/);
  const business = read('../src/routes/business.ts');
  assert.match(business, /return \{number:converted\.number,emailStatus\}/);
});

test('les confirmations de la modale distinguent le message de succès fourni et la file hors ligne', () => {
  const core = read('../../assets/js/pages/dash/core.js');
  assert.match(core, /done='Enregistré'/);
  assert.match(core, /__offlineQueued\s*\?[^:]+:\s*done/);
  assert.match(core, /envoi par e-mail confirmé/i);
});

test('l’envoi de PDF annonce le bon statut après confirmation de l’API', () => {
  const docs = read('../../assets/js/pages/dash/docs.js');
  assert.match(docs, /done:'E-mail envoyé avec la pièce jointe\.'/);
});
