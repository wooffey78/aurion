# CHANGELOG — Aurion 15.4.43

Version V2 (suite du chantier 2) : les propositions de métiers deviennent **visibles et actionnables dans les écrans**, l'origine du choix devient **non rétrogradable**, le journal des propositions suit les **conventions standard du dépôt** (purge liée à l'espace, réplication), et l'exploitation dispose d'un **export CSV**. La 15.4.42 (moteur, niveaux de confiance, invariants) est conservée à l'identique.

## 1. Les propositions classées dans les écrans (fin du chantier 2 côté interface)

- **Paramètres → Activité** (modale « Modifier / Nouvelle activité ») : après détection, la liste des propositions s'affiche sous le sélecteur de métier — intitulé, **niveau de confiance lisible** (« Très élevé — … », « Moyen — … »), **2 à 4 raisons sourcées**, bouton **« Utiliser »** par proposition. Correspondance incertaine : message explicite « précisez la description ou choisissez directement le métier qui correspond le mieux ».
- **Parcours guidé (onboarding)** : même liste classée dans l'étape « Votre activité » ; chaque proposition peut être utilisée d'un clic (le choix n'est enregistré qu'à la validation de l'étape — pas de confirmation immédiate).
- **Métier retenu affiché** : la modale indique l'origine du choix courant (« proposition confirmée », « proposition acceptée », « choix manuel ») et la date de décision, avec le rappel « une détection automatique ne modifiera jamais ce choix ».
- **CSS dédié responsive** (`assets/css/app.css`) : lignes de proposition reprenant le style des lignes de cotisation existantes ; sur mobile (≤ 640 px) la liste passe en colonne et le bouton prend toute la largeur.
- **Traçabilité côté client** : les appels de détection transmettent désormais `activityId` (Paramètres et parcours guidé) — la proposition calculée et affichée est datée dans le journal (kind `proposed`), sans jamais toucher la sélection retenue.
- **api.js** : nouvelle méthode `profileChoice(id, body)` vers la route dédiée.

## 2. Confirmation explicite et origine non rétrogradable

- Dans Paramètres, « Utiliser » sur une proposition enregistre immédiatement le choix via `POST /activities/:id/profile-choice` avec `confirmProposalId` → origine **`confirmed`**, journalisée.
- **Non-régression SQL** (helper `saveActivityProfileOverride`) : ré-enregistrer ou re-confirmer le **même** métier ne rétrograde plus jamais l'origine ni la date de décision (`confirmed` reste confirmé) ; choisir un métier **différent** crée une nouvelle décision (origine demandée, datée maintenant). Fini le risque : l'utilisateur confirme une proposition puis enregistre le formulaire → l'origine reste `confirmed`.
- Invariants inchangés et re-testés : exactement **un** `insert into activity_profile_overrides` et **un** `delete` volontaire (route `profile-choice`, `remove===true`) dans les routes ; le moteur reste pur.

## 3. Intégrations standard du journal (migration 094, additive et idempotente)

- **Clé étrangère standard** : `profile_proposal_events.organization_id` référence désormais `organizations(id) ON DELETE CASCADE` (convention 001-004) — le journal suit le même cycle de vie que les données métier de l'espace, purge liée à l'espace garantie, nettoyage défensif des orphelins avant pose.
- **Réplication orgkey (086)** : trigger `aurion_sync_journal_trigger` sur le journal, même traitement que `support_status_events` — les décisions de choix de métier sont visibles depuis chaque instance de l'espace sans divergence.

## 4. Export d'exploitation du journal

- **`GET /admin/profile-proposal-journal.csv`** (console d'administration uniquement, accès inter-entreprises journalisé par les hooks existants) : journal des propositions exportable, daté, plafonné à 5 000 lignes, filtre facultatif par organisation (requête paramétrée). Colonnes : date, événement, organisation, activité, métier, confiance, raisons, contenu proposé. CSV UTF-8 avec BOM (accents corrects à l'ouverture dans un tableur), séparateur `;`.

## 5. Compatibilité

- Champs existants inchangés côté API (`detect-profile`, activités) ; les écrans ajoutent des éléments qui ne dépendent que des champs déjà exposés en 15.4.42. Aucun contenu existant n'est déplacé ; le sélecteur de métier reste le champ de référence. `public-registry.ts`, référentiel 078, moteur 15.4.42 : inchangés.

## 6. Tests

- Nouveau fichier `backend/tests/v2-profile-ux.contract.test.mjs` : **9 tests** — conventions 094 (FK cascade, réplication orgkey), non-régression de l'origine, exposition du triplet retenu/origine/décision, export CSV administrateur, méthode `profileChoice`, affichage des propositions dans Paramètres et dans le parcours guidé, responsive CSS.
- Suites voisines rejouées avec succès : moteur V2 (15.4.42), catalogue de profils, bloc 8, step18/29, versions harmonisées, suppression de compte transactionnelle, console d'administration (résilience, retry, bootstrap), strict-requirements, bloc 3. **Cumul : 81 tests passés, 0 échec** (seuls les tests d'intégration PostgreSQL réelle se désactivent hors base, comportement contractuel inchangé).
- `tsc --noEmit` (typecheck) et build : **0 erreur**.

## 7. Version

`VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, lockfiles, `index.html` et `sw.js` harmonisés en **15.4.43** (contrat générique de versions).
