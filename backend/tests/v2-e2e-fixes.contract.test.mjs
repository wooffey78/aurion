// V2 (15.4.45) — Gardes de régression des défauts trouvés par la recette navigateur
// (docs/RECETTE-NAVIGATEUR-15.4.45.md) : chaque assertion ci-dessous aurait bloqué un
// des trois défauts livrés en 15.4.43 (collision d'identificateur front, insert du
// journal aux colonnes échangées, ordre des écritures de l'origine).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const repoRoot = new URL('../../', import.meta.url);
const rel = p => new URL(p, repoRoot);
const read = p => readFileSync(rel(p), 'utf8');

test('15.4.45: settings — plus aucune collision d\'identificateur avec les imports (boot)', () => {
  const src = read('assets/js/pages/dash/settings.js');
  // Le module importe renderProposals (propositions champ par champ du registre) ;
  // une déclaration locale du même nom cassait le chargement de tout le front.
  assert.match(src, /import\{[^}]*\brenderProposals\b[^}]*\}from'\.\.\/\.\.\/core\/company-detect\.js'/);
  assert.doesNotMatch(src, /const renderProposals=/, 'déclaration locale interdite : collision d\'identificateur (boot cassé en 15.4.43)');
  assert.match(src, /const renderProfileProposals=/, 'la variante locale doit porter un nom distinct');
  assert.match(src, /renderProfileProposals\(r\)/);
});

test('15.4.45: journal du choix — colonnes dans l\'ordre et paramètres typés (FK 094)', () => {
  const src = read('backend/src/routes/business.ts');
  // L'insert du helper de sélection retenue (celui qui écrit confirmed/manual_change) :
  // organization_id=$2 (organisation), activity_id=id (activité) — l'ordre échangé
  // violait la clé étrangère et perdait chaque événement de choix.
  const insert = src.match(/select \$2,id,case when \$3::text='confirmed'[\s\S]{0,200}?from activities where id=\$1 and organization_id=\$2/);
  assert.ok(insert, 'insert corrigé du journal du choix introuvable');
  assert.match(insert[0], /\$4::text/, 'paramètre de profil non typé');
  assert.match(insert[0], /\$5::text/, 'paramètre chosenFrom non typé');
  // La lecture du triplet expose l'origine et la date (traçabilité complète).
  assert.match(src, /retainedCode:ov\?\.profile_code/);
});

test('15.4.45: onboarding — la confirmation explicite est la DERNIÈRE écriture de l\'origine', () => {
  const src = read('assets/js/pages/onboarding.js');
  const block = src.match(/const profileCode=val\('ob-profile'\);([\s\S]*?)await saveProgress\('activity'\)/);
  assert.ok(block, 'bloc de sauvegarde de l\'étape activité introuvable');
  const updateAt = block[1].indexOf('await api.updateActivity');
  const choiceAt = block[1].indexOf('await api.profileChoice');
  assert.ok(updateAt >= 0, 'updateActivity absent de la sauvegarde');
  assert.ok(choiceAt > updateAt, 'l\'ordre est inversé : profileChoice doit venir APRÈS updateActivity, sinon l\'origine confirmée est rétrogradée en manual');
});
