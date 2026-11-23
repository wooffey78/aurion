// V2 (chantier 2) — Moteur de propositions de métiers : contrats de classement et de
// conservation. Ce que la conception V2 rend vérifiable : plusieurs profils proposés et
// classés, niveaux de confiance explicites et déterministes, correspondances incertaines
// soumis à confirmation, et surtout l'invariant fondamental — aucune automatisation ne
// peut écraser une sélection manuelle (aucun chemin d'écriture automatique vers
// activity_profile_overrides, effet de bord de suppression supprimé, retrait volontaire
// uniquement, origine du choix conservée et journalisée).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const service = read('../src/services/micro-detection.ts');
const business = read('../src/routes/business.ts');
const migration = read('../migrations/093_profile_selection_origin.sql');

// ── Contrat statique : migration 093 additive et idempotente ────────────────────────
test('v2: migration 093 — origine du choix contrainte, défaut sûr pour les surcharges existantes', () => {
  assert.match(migration, /add column if not exists origin varchar\(20\) not null default 'manual'/);
  assert.match(migration, /add column if not exists chosen_from_proposal varchar\(64\)/);
  assert.match(migration, /add column if not exists chosen_at timestamptz/);
  assert.match(migration, /check \(origin in \('auto', 'confirmed', 'manual'\)\)/);
  // Les surcharges préexistantes ne sont jamais rétrogradées : défaut 'manual'.
  assert.doesNotMatch(migration, /default 'auto'/);
});

test('v2: migration 093 — journal des propositions isolé par tenant (RLS 074)', () => {
  assert.match(migration, /create table if not exists profile_proposal_events\(/);
  assert.match(migration, /kind varchar\(30\) not null check/);
  assert.match(migration, /alter table profile_proposal_events enable row level security/);
  assert.match(migration, /create policy tenant_isolation on public\.profile_proposal_events/);
  assert.match(migration, /organization_id = aurion_tenant_org\(\) or pg_has_role\(current_user, 'aurion_admin', 'member'\)/);
});

// ── Contrat statique : le moteur propose, n'écrit jamais ────────────────────────────
test('v2: le moteur de propositions est pur — aucune écriture vers la base', () => {
  assert.match(service, /export function proposeProfilesFromSignals/);
  assert.doesNotMatch(service, /insert into|delete from/);
  assert.doesNotMatch(service, /query\(/);
  // Pas de mise à jour SQL : le verbe SQL « update » n'apparaît que dans la prose française,
  // jamais comme instruction — on vérifie l'absence d'appels au client de base.
  assert.doesNotMatch(service, /from '\.\/db|from '\.\.\/db/);
});

test('v2: échelle de confiance — quatre niveaux explicites, libellés compréhensibles, critères documentés', () => {
  for (const n of ['tres-eleve', 'eleve', 'moyen', 'faible']) {
    assert.match(service, new RegExp(`'?${n}'?: '`));
  }
  assert.match(service, /Très élevé — correspondance particulièrement forte/);
  assert.match(service, /Élevé — correspondance cohérente et bien étayée/);
  assert.match(service, /Moyen — correspondance plausible, à confirmer/);
  assert.match(service, /Faible — correspondance incertaine, informations complémentaires nécessaires/);
  // Critères documentés dans le code (pondérations + mapping), pas de précision artificielle.
  assert.match(service, /Pondérations documentées/);
  assert.match(service, /score entier interne, plafonné à 100/);
});

// ── Contrat statique : invariant de conservation des choix manuels ──────────────────
test('v2: invariant — aucune automatisation ne peut écraser une sélection manuelle', () => {
  // Un seul point d'écriture de la sélection : le helper volontaire (origine explicite).
  const writes = business.match(/insert into activity_profile_overrides/g) || [];
  assert.equal(writes.length, 1, 'une seule écriture possible : le helper volontaire');
  assert.match(business, /if\(!PROFILE_CODES\.includes\(profileCode\)\)throw new Error\('INVALID_ACTIVITY_PROFILE'\)/);
  assert.match(business, /origin:'confirmed'\|'manual'='manual'/);
  // La mise à jour d'activité SANS profil ne supprime plus la surcharge (effet de bord supprimé).
  assert.doesNotMatch(business, /else await query\('delete from activity_profile_overrides/);
  // La seule suppression passe par la route volontaire dédiée (remove===true, journalisée).
  const deletes = business.match(/delete from activity_profile_overrides/g) || [];
  assert.equal(deletes.length, 1);
  assert.match(business, /profile-choice/);
  assert.match(business, /b\.remove===true/);
  // detect-profile ne fait que proposer : jamais d'appel au helper d'écriture.
  const detectBlock = business.slice(business.indexOf("app.post('/activities/detect-profile'"), business.indexOf("app.get('/activities/:id/profile'"));
  assert.ok(detectBlock.length > 0);
  assert.doesNotMatch(detectBlock, /saveActivityProfileOverride/);
});

// ── Unitaire sur le build compilé (dist/) ───────────────────────────────────────────
const distPath = new URL('../dist/services/micro-detection.js', import.meta.url).pathname;
const signals = {
  nafCode: '62.01Z',
  name: 'Studio web',
  description: 'Développement de sites internet et applications, maintenance informatique.',
  services: ['Création de site vitrine', 'Refonte de site internet'],
  parts: ['Nom de domaine'],
};

test('v2: unitaire (build) — plusieurs profils classés, confiance expliquée, déterminisme', { skip: existsSync(distPath) ? false : 'dist/ absente : lancer le build (npm test le fait)' }, async () => {
  const det = await import(distPath);
  const result = det.proposeProfilesFromSignals(signals);
  const { proposals, requiresConfirmation } = result;
  // Plusieurs propositions classées (2 à 5), tri décroissant du score interne.
  assert.ok(proposals.length >= 2 && proposals.length <= 5, `propositions : ${proposals.length}`);
  for (let i = 1; i < proposals.length; i++) assert.ok(proposals[i - 1].score >= proposals[i].score);
  // Le meilleur candidat est le métier du code APE précis, avec un niveau étayé.
  assert.equal(proposals[0].profile, 'web-development');
  assert.ok(['tres-eleve', 'eleve'].includes(proposals[0].confidence), proposals[0].confidence);
  // Chaque proposition : niveau compréhensible + raisons sourcées (2 à 4).
  for (const p of proposals) {
    assert.ok(['tres-eleve', 'eleve', 'moyen', 'faible'].includes(p.confidence));
    assert.match(p.confidenceLabel, /(Très élevé|Élevé|Moyen|Faible)/);
    assert.ok(p.reasons.length >= 2 && p.reasons.length <= 4, `raisons : ${p.reasons.length}`);
  }
  assert.ok(proposals[0].reasons.some(r => r.includes('Code APE/NAF 62.01Z')));
  assert.equal(proposals[0].matchedNaf, '62.01Z');
  // Déterminisme : mêmes entrées → mêmes sorties (aucun aléa, aucune horloge).
  assert.deepEqual(det.proposeProfilesFromSignals(signals), result);
  assert.equal(requiresConfirmation, false);
});

test('v2: unitaire (build) — correspondance incertaine = demande de confirmation, jamais une affectation', { skip: existsSync(distPath) ? false : 'dist/ absente : lancer le build' }, async () => {
  const det = await import(distPath);
  // Un seul signal non étayé → niveau faible → confirmation requise.
  const weak = det.proposeProfilesFromSignals({ description: 'activité atypique zzz sans vocabulaire connu' });
  assert.equal(weak.requiresConfirmation, true);
  for (const p of weak.proposals) assert.equal(p.confidence, 'faible');
  // Aucun signal du tout → aucune proposition inventée, confirmation requise.
  const empty = det.proposeProfilesFromSignals({});
  assert.equal(empty.proposals.length, 0);
  assert.equal(empty.requiresConfirmation, true);
  // Catalogue étayé seul (≥ 2 prestations reconnues) → plausible mais à confirmer.
  const cat = det.proposeProfilesFromSignals({ services: ['Recherche de fuite', 'Remplacement chauffe-eau', 'Entretien chaudière'] });
  assert.equal(cat.proposals[0].profile, 'plumbing');
  assert.equal(cat.proposals[0].confidence, 'moyen');
  assert.equal(cat.requiresConfirmation, false);
});

// ── 15.4.47 — Seuils centralisés, contradictions, données manquantes ─────────────────
test('v2 15.4.47: seuils et pondérations centralisés dans une constante unique configurable', () => {
  // Exigence de conception §5 : « les seuils de classement doivent être centralisés
  // et configurables, et non dispersés dans plusieurs fichiers ».
  assert.match(service, /export const PROPOSAL_TUNING = \{/);
  // Plus aucun littéral de pondération dispersé dans le corps du moteur :
  for (const bad of [/score \+= 50/, /score \+= 15/, /Math\.min\(25,/, /Math\.min\(30,/, /Math\.min\(15,/, /Math\.min\(100,/, /slice\(0, 5\)/]) {
    assert.doesNotMatch(service, bad);
  }
  // Le moteur lit uniquement la constante (une source unique de vérité des seuils).
  for (const field of ['nafPrecisePoints', 'descriptionPerKeyword', 'descriptionCap', 'nameMatchPoints', 'servicePerMatch', 'partPerMatch', 'catalogueCap', 'secondaryPerKeyword', 'secondaryCap', 'maxScore', 'maxProposals', 'catalogueAloneThreshold', 'textContradictionThreshold']) {
    assert.match(service, new RegExp(`tuning\\.${field}`), `seuil non centralisé : ${field}`);
  }
});

test('v2 15.4.47: contradictions entre familles et données manquantes — critères du tableau 2', () => {
  // Contradiction (tableau 2 : « signaux contradictoires entre familles ») : citée
  // comme raison sourcée, elle bloque « très élevé » (aucune contradiction exigée) ;
  // expliquée, elle ne rétrograde pas « élevé ». Mapping déterministe testé ci-dessous.
  assert.match(service, /contradictions/);
  assert.match(service, /Signal contraire :/);
  assert.match(service, /if \(confidence === 'tres-eleve' && contradictions\.length\) confidence = 'eleve';/);
  // Données manquantes expliquées (développement §5 : « Données manquantes »).
  assert.match(service, /Donnée manquante :/);
});

test('v2 15.4.47: unitaire (build) — contradiction NAF/texte détectée, « très élevé » impossible', { skip: existsSync(distPath) ? false : 'dist/ absente : lancer le build (npm test le fait)' }, async () => {
  const det = await import(distPath);
  // Code APE 43.21 (électrique) mais la description décrit nettement la plomberie :
  // le texte (plomberie, 30 pts) l'emporte sur le texte électrique (27 pts).
  const signalsContradict = {
    nafCode: '43.21Z',
    name: 'Électricité générale',
    description: 'recherche de fuite, remplacement de chauffe-eau, entretien de chaudière',
    services: ['Prise électrique', 'Tableau électrique'],
  };
  const r = det.proposeProfilesFromSignals(signalsContradict);
  const elec = r.proposals.find(p => p.profile === 'electrical');
  const plumb = r.proposals.find(p => p.profile === 'plumbing');
  assert.ok(elec && plumb, 'les deux candidats doivent apparaître dans la liste classée');
  // La contradiction est détectée, citée et empêche le niveau « très élevé ».
  assert.ok(Array.isArray(elec.contradictions) && elec.contradictions.length >= 1, 'contradiction non détectée');
  assert.ok(elec.reasons.some(x => x.includes('Signal contraire')), 'contradiction absente des raisons affichées');
  assert.notEqual(elec.confidence, 'tres-eleve', 'la contradiction doit bloquer « très élevé »');
  assert.equal(elec.confidence, 'eleve');
  // Le candidat concurrent cite ses preuves texte : l'utilisateur voit pourquoi il est classé.
  assert.ok(plumb.reasons.some(x => x.includes('Description de l') && x.includes('fuite')), 'preuve texte du concurrent non citée');
  // Mapping déterministe : mêmes entrées → mêmes contradictions et niveaux.
  assert.deepEqual(det.proposeProfilesFromSignals(signalsContradict), r);
});

test('v2 15.4.47: unitaire (build) — données manquantes expliquées dans les raisons affichées', { skip: existsSync(distPath) ? false : 'dist/ absente : lancer le build (npm test le fait)' }, async () => {
  const det = await import(distPath);
  const r = det.proposeProfilesFromSignals({ services: ['Recherche de fuite', 'Remplacement chauffe-eau', 'Entretien chaudière'] });
  assert.equal(r.proposals[0].profile, 'plumbing');
  const head = r.proposals[0];
  assert.ok(head.reasons.some(x => x.includes('Donnée manquante : aucun code APE/NAF')), 'donnée manquante NAF non expliquée');
  assert.ok(head.reasons.some(x => x.includes('aucune description d’activité')), 'donnée manquante description non expliquée');
  assert.ok(head.reasons.length >= 2 && head.reasons.length <= 4, `raisons : ${head.reasons.length}`);
  // Rien de secret ni de technique : les explications restent compréhensibles.
  for (const x of head.reasons) assert.ok(x.length > 0 && !x.includes('undefined'));
});
