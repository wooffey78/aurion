// Décisions éditeur 15.4.40, verrouillées par contrat :
// 1. les documents contractuels en préparation ne sont JAMAIS bloquants (inscription, invitation
//    VIP, souscription) — l'acceptation des CGV/confidentialité reste exigée à l'inscription ;
// 2. la console d'administration fonctionne même sans pool d'administration dédié
//    (repli sur le rôle propriétaire de DATABASE_URL, hors RLS 074 — ENABLE sans FORCE) ;
// 3. les boutons « + Nouveau devis / + Nouvelle facture / Modifier » des documents commerciaux
//    changent toujours d'écran (correctif du garde pendingView) ;
// 4. la connexion par clé d'accès est explicite, adaptée à l'appareil (Face ID, Touch ID,
//    Windows Hello, empreinte Android, clé de sécurité) et aucun bouton de connexion n'est inerte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('les documents contractuels ne sont jamais bloquants (décision éditeur 15.4.40)', () => {
  const auth = read('backend/src/routes/auth.ts');
  const account = read('backend/src/routes/account.ts');
  assert.match(auth, /return \{ available: true, localEvaluation, reason: null \};/);
  assert.doesNotMatch(auth, /LEGAL_DOCUMENTS_UNPUBLISHED/);
  assert.doesNotMatch(account, /LEGAL_DOCUMENTS_UNPUBLISHED/);
  // L'acceptation des CGV reste exigée à l'inscription : contrôle produit, pas porte bloquante.
  assert.match(auth, /acceptLegal !== true/);
});

test('la console d\'administration fonctionne sans pool d\'administration dédié', () => {
  const db = read('backend/src/db.ts');
  assert.match(db, /return \(adminDb \?\? db\)\.query<T>\(text, values\);/);
  assert.match(db, /const client = await \(adminDb \?\? db\)\.connect\(\);/);
  assert.match(db, /const pool = adminDb \?\? db;/);
  // Une installation provisionnée conserve son pool dédié strict (AURION_ADMIN_DATABASE_URL).
  assert.match(db, /AURION_ADMIN_DATABASE_URL/);
});

test('les boutons devis/factures changent toujours d\'écran (correctif pendingView)', () => {
  const dash = read('assets/js/pages/dashboard.js');
  const docs = read('assets/js/pages/dash/docs.js');
  const quote = read('assets/js/pages/dash/quote.js');
  assert.match(dash, /if\(opts\.navigation\|\|S\.pendingView===id\)show\(id\)/);
  assert.match(dash, /if\(Array\.isArray\(id\)\)\{/);
  assert.match(docs, /hooks\.refresh\('quote',\{navigation:true\}\)/);
  assert.match(quote, /hooks\.refresh\('invoices',\{navigation:true\}\)/);
});

test('connexion : clé d\'accès explicite adaptative et aucun bouton inerte', () => {
  const device = read('assets/js/core/device.js');
  const ui = read('assets/js/pages/auth.js');
  assert.match(device, /export function supportsWebAuthn\(\)/);
  assert.match(device, /export function platformPasskeyLabel\(\)/);
  assert.match(device, /'Face ID'/);
  assert.match(device, /'Touch ID'/);
  assert.match(device, /'Windows Hello'/);
  assert.match(ui, /id="passkey-signin"/);
  assert.match(ui, /Continuer avec \$\{platformPasskeyLabel\(\)\}/);
  assert.doesNotMatch(ui, /registrationBlocked/);
  assert.doesNotMatch(ui, /La création de compte sera réactivée/);
  // Les boutons Google/Auth0 restent conditionnés à la configuration serveur réelle
  // (contrat Auth0 existant) : jamais de bouton qui ne fait rien.
  assert.match(ui, /mode!=='login'\|\|!auth0Configured/);
  assert.match(ui, /mode!=='login'\|\|!googleConfigured/);
});
