import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBusinessNamePrompt } from '../../assets/js/core/business-name-assistant.js';
import { buildLogoPrompt } from '../../assets/js/core/logo-assistant.js';

test('le prompt de naming respecte l’activité confirmée, le mode et les contraintes actives', () => {
  const initials = buildBusinessNamePrompt({ activity: 'Réparation de vélos', customers: 'individuals' }, { mode: 'initials', initials: 'ML', initialsUsage: 'visible' });
  assert.match(initials, /Réparation de vélos/);
  assert.match(initials, /ML/);
  assert.match(initials, /doivent apparaître/);
  assert.match(initials, /disponibilité.*n’a été vérifiée/i);

  const required = buildBusinessNamePrompt({ activity: 'Conseil' }, { mode: 'required_word', requiredWords: ['Rive', 'Atelier'], wordRule: 'exact' });
  assert.match(required, /Rive, Atelier/);
  assert.match(required, /orthographe exacte/);

  const free = buildBusinessNamePrompt({ activity: 'Conseil' }, { mode: 'free', initials: 'ML', requiredWords: ['Rive'] });
  assert.doesNotMatch(free, /ML|Rive/);
  assert.match(free, /8 à 12 noms/);
});

test('le mode de conservation ne demande aucune nouvelle proposition', () => {
  const prompt = buildBusinessNamePrompt({ activity: 'Conseil', startingName: 'Les Rives' }, { mode: 'keep' });
  assert.match(prompt, /Ne propose aucun nouveau nom/);
  assert.match(prompt, /Les Rives/);
  assert.doesNotMatch(prompt, /Propose 8 à 12 noms/);
});

test('les préférences graphiques modifient le brief et gardent les anciennes valeurs de formes', () => {
  const premium = buildLogoPrompt({ brandName: 'Les Rives', activity: 'Conseil', positioning: 'premium', clients: 'businesses', tone: 'elegant', font: 'editorial', palette: 'ocean', graphicStyle: 'geometric', composition: 'horizontal', symbolHandling: 'include', complexity: 'balanced', uses: ['documents'] });
  const accessible = buildLogoPrompt({ brandName: 'Les Rives', activity: 'Conseil', positioning: 'accessible', composition: 'symbol_only', symbolHandling: 'avoid', font: 'sans', radius: 'round' });
  assert.match(premium, /Les Rives/);
  assert.match(premium, /premium/);
  assert.match(premium, /sérif éditoriale/);
  assert.match(premium, /bleu #174A72/);
  assert.match(premium, /devis et factures/);
  assert.notEqual(premium, accessible);
  assert.match(accessible, /aucun nom ni texte dans l’image/i);
  assert.match(accessible, /aucun symbole graphique/);
  assert.match(accessible, /angles doux|arrondis/i);
  assert.doesNotMatch(accessible, /Non précisé/);
});

test('un monogramme ne peut pas inventer les initiales et une couleur personnalisée est explicite', () => {
  const prompt = buildLogoPrompt({ composition: 'monogram', initials: 'AB', accent: '#123456', dark: '#102030', avoidSymbols: 'ampoule, engrenage' });
  assert.match(prompt, /AB/);
  assert.match(prompt, /n’invente aucune initiale/i);
  assert.match(prompt, /#123456/);
  assert.match(prompt, /ampoule, engrenage/);
});
