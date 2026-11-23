# CHANGELOG — Aurion 15.4.42

Version V2 : mise en œuvre du **moteur de propositions de métiers** (chantier 2 du backlog V2), premier livrable de la fiche de conception V2 « propositions classées, niveaux de confiance explicites et conservation systématique des choix manuels ». Le principe fondateur du bloc 8 est conservé et étendu : proposer, expliquer, jamais imposer — et surtout, ce que l'utilisateur a choisi à la main ne peut plus jamais être écrasé par une détection.

## 1. Moteur de propositions de métiers (multi-signaux, classement)

- Nouvelle fonction pure `proposeProfilesFromSignals(signals)` dans `backend/src/services/micro-detection.ts` : plusieurs profils métiers classés par pertinence (2 à 5 propositions), à partir de **cinq familles de signaux** — code APE/NAF précis détecté par le registre public, description de l'activité, nom de l'activité, prestations et pièces effectivement proposées (catalogue réel), activités secondaires ou complémentaires déclarées.
- Le moteur est **déterministe et local** : mêmes entrées → mêmes sorties (testé par `assert.deepEqual`), aucun service d'IA distante (standard posé en 15.4.0 avec le retrait de l'IA et respecté par `bordereau-parser.ts`). Il réutilise le vocabulaire existant (`RULES`, `EXTRA_KEYWORDS` de `profiles.ts`, désormais exportés — source unique, pas de duplication) et les règles NAF existantes (`NAF_PROFILE_HINTS`, `proposeCategoryFromNaf`).
- **Pondérations documentées dans le code** (score entier interne plafonné à 100, jamais affiché comme un pourcentage de certitude) : NAF précis +50 · description +10/mot-clé (max 25) · nom +15 · prestations +6/pièce (max 24) · pièces +4 (max 12, catalogue plafonné à +30) · activités secondaires +8/mot-clé (max 15).
- Chaque proposition porte : code et intitulé du profil, catégorie micro cohérente (via `MICRO_CATEGORIES`), niveau de confiance, **2 à 4 raisons courtes et sourcées** citant les fragments réellement reconnus (« Code APE/NAF 62.01Z (INSEE) : … », « Prestations du catalogue : « Recherche de fuite »… »).

## 2. Niveaux de confiance : échelle à quatre niveaux, mapping déterministe

- `tres-eleve` (très élevé) : code NAF précis ET au moins deux autres familles concordantes.
- `eleve` (élevé) : code NAF précis ET au moins une autre famille ; ou trois familles ou plus sans code NAF précis.
- `moyen` (moyen) : code NAF précis seul ; ou deux familles sans code NAF précis ; ou catalogue étayé seul (≥ 2 prestations reconnues).
- `faible` (faible) : un seul signal non étayé ou aucun → `requiresConfirmation: true` (demande de confirmation, jamais une affectation).
- Libellés utilisateurs explicites embarqués (`confidenceLabel`) ; critères écrits dans le code et testés par contrat (pas de précision artificielle).

## 3. Conservation des choix manuels : invariant fondamental appliqué

- **Effet de bord supprimé** : la mise à jour d'une activité sans profil renseigné ne supprime plus la surcharge `activity_profile_overrides` (l'ancien `else await query('delete …')` de la route PUT est retiré). Une modification du SIRET, du NAF ou de la description ne réinitialise plus jamais la sélection.
- **Un seul point d'écriture** de la sélection : le helper `saveActivityProfileOverride`, appelé uniquement depuis des actions utilisateur explicites (création avec profil choisi, mise à jour avec profil choisi, route dédiée). Démontré par contrat de balayage : exactement un `insert into activity_profile_overrides` et un `delete from activity_profile_overrides` dans les routes, la suppression n'existant que dans le chemin volontaire `remove===true`.
- **Nouvelle route** `POST /activities/:id/profile-choice` : confirmer une proposition (`profileCode` + `confirmProposalId` → origine `confirmed`), choisir un métier dans la liste complète (origine `manual`), ou retirer volontairement (`remove: true`). Actions validées contre `PROFILE_CODES` et journalisées.
- **Origine du choix conservée** : nouvelles colonnes `origin` (`auto`/`confirmed`/`manual`, défaut `manual` pour ne jamais rétrograder les surcharges existantes), `chosen_from_proposal`, `chosen_at`. `GET /activities/:id/profile` expose désormais le triplet : métier retenu (`retainedCode`, `retainedTitle`), origine, date de décision et proposition d'origine.
- Le moteur **ne sait pas écrire** : `proposeProfilesFromSignals` est pur (contrat : aucun `insert/update/delete/query` dans le service), et `detect-profile` n'appelle jamais le helper d'écriture.

## 4. Traçabilité : journal des propositions (migration 093)

- `backend/migrations/093_profile_selection_origin.sql` : **additive et idempotente**, colonnes d'origine + table `profile_proposal_events` (kind `proposed`/`applied`/`confirmed`/`manual_change`/`removed`/`ignored`, contenu affiché de la proposition en `jsonb`) sous **RLS 074** (politique `tenant_isolation`, échec fermé sans contexte tenant, accès inter-entreprises réservé à `aurion_admin`).
- `POST /activities/detect-profile` journalise les propositions calculées (kind `proposed`) avec le contenu affiché, uniquement pour une activité appartenant à l'organisation (`where exists`, échec fermé). Aucune donnée client : uniquement le cycle de vie du choix de métier.

## 5. Compatibilité

- Les champs historiques de `detect-profile` (code, title, modules, calc, suggestedParts, warranty, nafHint) restent calculés **exactement comme avant** : les anciens clients ignorent les champs ajoutés (`proposals`, `requiresConfirmation`, `source`). Le registre public (`public-registry.ts`) et le référentiel versionné (migration 078) sont inchangés.
- Le front existant continue de fonctionner sans modification ; l'affichage complet de la liste classée dans les écrans est la suite du chantier 2 (ordre de la fiche : invariants et traçabilité d'abord). La conception V2 associée est livrée dans `docs/CONCEPTION-V2-MOTEUR-PROPOSITIONS.md`.

## 6. Tests

- Nouveau fichier `backend/tests/v2-profile-proposals.contract.test.mjs` : **7 tests** — migration additive et défaut sûr, RLS du journal, pureté du moteur, échelle de confiance documentée, invariant de non-écrasement (balayage des routes), classement/confiance/déterminisme sur le build, incertitude = confirmation requise.
- Suites voisines rejouées avec succès : bloc8 (micro-catégories), catalogue de profils 15.4.36, step18 (boutons de détection), step29 (tarification par profil), contrat de fusion/version 15.4.35 (versions harmonisées), strict-requirements, bloc3. Résultat cumulé : **60 tests passés, 0 échec**, seuls les tests d'intégration PostgreSQL réelle se désactivent proprement hors base (comportement contractuel inchangé).
- `tsc --noEmit` (typecheck) et `tsc -p tsconfig.json` (build) : **0 erreur**.

## 7. Version

`VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, lockfiles, `index.html` et `sw.js` harmonisés en **15.4.42** (contrat générique de versions).
