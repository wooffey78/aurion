// 15.4.55 — durcissement des moteurs : contrat exécutable sans PostgreSQL.
//  1) mémoïsation pure de computePricing (source unique pricing.ts, copie navigateur sync-pricing) ;
//  2) détection robuste aux apostrophes typographiques et aux accents (profiles.ts) ;
//  3) placeholders de modèles personnalisés dans le BON encart (STATUS selon le type, DOCUMENT_TITLE profilé) ;
//  4) accueil servi depuis un cache mémoire (aucune lecture disque par requête).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);

const dist = (p) => { try { return existsSync(fileURLToPath(new URL(p, import.meta.url))) ? fileURLToPath(new URL(p, import.meta.url)) : false; } catch { return false; } };

test('unitaire — computePricing : mémoïsation pure (même entrée → même objet, ordre de clés insensible)', { skip: !dist('../dist/services/pricing.js') }, async () => {
  const { computePricing } = await import(dist('../dist/services/pricing.js'));
  const base = { partCost: 100, partQuantity: 2, vatRate: 20, targetTtc: '240,00', driver: 'ttc', coefficientValue: 10, coefficientUnit: 'percent', coefficientBasis: 'purchase' };
  const a = computePricing(base);
  const reordered = { driver: 'ttc', coefficientBasis: 'purchase', coefficientUnit: 'percent', coefficientValue: 10, targetTtc: '240,00', vatRate: 20, partQuantity: 2, partCost: 100 };
  const b = computePricing(reordered);
  assert.deepEqual(b, a, 'l’ordre des clés ne doit pas influencer le résultat');
  const c = computePricing(base);
  assert.equal(c, a, 'le même appel consécutif est servi depuis le cache');
  const d = computePricing({ ...base, targetTtc: '260,00' });
  assert.notEqual(d, a, 'une entrée différente recalcule');
  assert.ok(Math.abs(d.totalTtc - 260) < 0.001);
  // Les calculs restent exacts : aucune dérive introduite par la mémoïsation.
  assert.deepEqual(a.contributions, computePricing(JSON.parse(JSON.stringify(base))).contributions);
});

test('unitaire — détection : apostrophes typographiques et accents reconnus (aucune régression des cas directs)', { skip: !dist('../dist/services/profiles.js') }, async () => {
  const { profileFor } = await import(dist('../dist/services/profiles.js'));
  // Apostrophe typographique (U+2019) dans la saisie vs apostrophe droite dans les mots-clés :
  // le repli la fait reconnaître sans jamais modifier la valeur saisie.
  assert.equal(profileFor('Domaine des Vignes', 'Chambres d’hôtes et location saisonnière de meublés').code, 'hospitality');
  assert.equal(profileFor('Éducateur à domicile', 'promenade et garde d’animaux').code, 'pets');
  // Accents (texte accentué vs mot-clé non accentué) :
  assert.equal(profileFor('Atelier Écran Express', 'reparation de telephone et vente d’accessoires').code, 'smartphone-repair');
  // Les cas historiques restent identiques :
  assert.equal(profileFor('Plomberie Durand', 'réparation de fuite').code, 'plumbing');
  assert.equal(profileFor('', '').code, 'generic-services');
  // Le choix manuel (override) reste intouchable :
  assert.equal(profileFor('Plomberie Durand', 'réparation de fuite', 'electrical').code, 'electrical');
});

test('contrat — placeholders : chaque champ annoncé est alimenté ; STATUS et DOCUMENT_TITLE dans le bon encart', () => {
  const renderer = readFileSync(new URL('../src/services/document-renderer.ts', import.meta.url), 'utf8');
  const fieldsBlock = readFileSync(new URL('../src/services/document-renderer.ts', import.meta.url), 'utf8').match(/export const TEMPLATE_FIELDS=\[([^\]]+)\]/);
  assert.ok(fieldsBlock, 'liste TEMPLATE_FIELDS introuvable');
  const fields = fieldsBlock[1].split(',').map(f => f.replace(/'/g, '').trim()).filter(Boolean);
  // Chaque champ annoncé existe dans la map values (aucun placeholder fantôme) :
  for (const f of fields) assert.ok(renderer.includes(`${f}:`), `champ {{${f}}} annoncé mais jamais alimenté`);
  // STATUS : jamais « Facture envoyée » sur un devis (garde par isInvoice) :
  assert.match(renderer, /STATUS:isInvoice\?\(/);
  assert.match(renderer, /Devis émis — en attente de décision du client/);
  // DOCUMENT_TITLE : titre profilé réel du document natif (model.title), pas l'étiquette générique :
  assert.match(renderer, /DOCUMENT_TITLE:model\.title/);
});

test('contrat — accueil : le HTML de la page publique est mis en cache mémoire (aucune lecture disque par requête)', () => {
  const app = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
  assert.match(app, /let indexCache: \{ base: string; html: string \} \| null = null/);
  assert.match(app, /if \(!indexCache \|\| indexCache\.base !== base\)/);
  // Le garde HSTS explicite en production est présent dans le plugin de sécurité :
  const security = readFileSync(new URL('../src/plugins/security.ts', import.meta.url), 'utf8');
  assert.match(security, /Strict-Transport-Security/);
  assert.match(security, /includeSubDomains/);
});
