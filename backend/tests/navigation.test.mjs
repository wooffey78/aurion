// Navigation de la coquille : le menu est dérivé d'une définition unique et testé par
// comportement (visibilité, ordre, administration), sans relire le source de l'interface.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV_ITEMS, hiddenViews, navigationItems } from '../../assets/js/core/navigation.js';

test('le menu par défaut expose les vues métier dans l’ordre attendu', () => {
  // 15.4.53 : la vue « Modèles de documents » (templates) est branchée dans le menu,
  // juste après « Devis & factures » — elle était auparavant orpheline (inaccessible).
  assert.deepEqual(navigationItems().map(item => item.id), [
    'home', 'clients', 'chantiers', 'catalog', 'suppliers', 'invoices', 'templates', 'agenda', 'accounting', 'support', 'settings',
  ]);
});

test('l’administration n’apparaît que pour un administrateur, en dernière position', () => {
  assert.ok(!navigationItems().some(item => item.id === 'admin'));
  const items = navigationItems({ isAdmin: true });
  assert.equal(items.at(-1).id, 'admin');
  assert.equal(items.filter(item => item.id === 'admin').length, 1);
});

test('le questionnaire masque les menus inutilisés sans toucher aux autres', () => {
  const questionnaire = { support: 'Non', agenda: 'Non', accounting: 'Non', parts: 'Non', stock: 'Non' };
  assert.deepEqual([...hiddenViews(questionnaire)].sort(), ['accounting', 'agenda', 'catalog', 'support']);
  const ids = navigationItems({ questionnaire }).map(item => item.id);
  assert.deepEqual(ids, ['home', 'clients', 'chantiers', 'suppliers', 'invoices', 'templates', 'settings']);
});

test('le catalogue reste visible si une seule des deux Sources est active', () => {
  assert.ok(!hiddenViews({ parts: 'Non', stock: 'Oui' }).has('catalog'));
  assert.ok(!hiddenViews({ parts: 'Oui', stock: 'Non' }).has('catalog'));
});

test('le profil sans module agenda masque l’agenda, sauf réponse explicite Oui', () => {
  assert.ok(hiddenViews({}, ['clients']).has('agenda'));
  assert.ok(!hiddenViews({}, ['clients', 'agenda']).has('agenda'));
  assert.ok(!hiddenViews({ agenda: 'Oui' }, ['clients']).has('agenda'));
});

test('chaque entrée du menu est complète et unique', () => {
  assert.equal(new Set(NAV_ITEMS.map(item => item.id)).size, NAV_ITEMS.length);
  for (const item of NAV_ITEMS) {
    assert.ok(item.label.trim(), `libellé manquant pour ${item.id}`);
    assert.ok(item.icon.trim(), `icône manquante pour ${item.id}`);
  }
});
