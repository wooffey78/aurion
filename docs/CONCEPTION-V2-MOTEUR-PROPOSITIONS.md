# Conception V2 — Moteur de propositions de métiers

> Fiche de conception fonctionnelle (condensé dépôt) — document complet de référence : `CONCEPTION-V2-MOTEUR-PROPOSITIONS-METIERS.docx` (livré hors dépôt).
> Rattachement : **chantier 2** (détection automatique et propositions de métiers) et **chantier 3** (catalogue métier enrichi) du backlog V2.
> Socle : 15.4.41 · Mise en œuvre : **15.4.42** · Date : 20 novembre 2026.

## 1. Objet

Le moteur de propositions de métiers est une exigence fonctionnelle à part entière d'Aurion V2, avec deux composantes indissociables : un classement de propositions assorti de niveaux de confiance explicites et expliqués, et la conservation systématique des choix manuels. La conception fait évoluer le socle existant (registre public SIREN/SIRET, proposition de catégorie par code APE/NAF, indices NAF vers les profils, trente profils métiers, table `activity_profile_overrides`), sans le reconstruire.

## 2. Fonctionnement attendu

Cinq familles de signaux alimentent le classement :

1. le code NAF/APE et les données obtenues par SIRET/SIREN (registre public) ;
2. la description de l'activité renseignée par l'utilisateur ;
3. les prestations et services effectivement proposés (catalogue réel) ;
4. les mots-clés et éléments du catalogue métier ;
5. les éventuelles activités secondaires ou complémentaires.

La sortie est une liste de **2 à 5 propositions classées**, jamais une correspondance unique imposée. Chaque proposition porte le profil, la catégorie micro associée, un niveau de confiance et 2 à 4 raisons courtes et sourcées. Trois états ne doivent jamais être confondus : **détecté** (signal brut), **proposé** (candidat classé), **retenu** (seul état qui fait autorité).

## 3. Niveaux de confiance (critères documentés, calibrés, sans précision artificielle)

| Niveau | Signification | Critères d'attribution |
| --- | --- | --- |
| Très élevé | Correspondance particulièrement forte | Code NAF précis ET ≥ 2 autres familles concordantes |
| Élevé | Correspondance cohérente et bien étayée | Code NAF précis ET ≥ 1 autre famille ; OU ≥ 3 familles sans code NAF précis |
| Moyen | Correspondance plausible, à confirmer | Code NAF précis seul ; OU 2 familles ; OU catalogue étayé seul (≥ 2 prestations) |
| Faible | Correspondance incertaine | Un seul signal non étayé ou aucun → demande de confirmation obligatoire |

Pondérations internes (score entier 0-100, jamais affiché comme un pourcentage) : NAF précis +50 · description +10/mot-clé (max 25) · nom +15 · prestations +6/pièce (max 24) · pièces +4 (max 12) · catalogue plafonné à +30 · activités secondaires +8/mot-clé (max 15). Calibrage sur le corpus des trente profils et des combinaisons NAF/description courantes ; rejoué à chaque extension du catalogue (chantier 3).

## 4. Conservation systématique des choix manuels (invariant fondamental)

1. Un métier choisi ou corrigé manuellement devient la référence retenue ; une détection automatique ne peut jamais le remplacer.
2. Une modification du SIRET, du NAF ou de la description ne réinitialise pas la sélection (effet de bord de suppression supprimé en 15.4.42).
3. Une meilleure correspondance détectée est affichée comme suggestion, uniquement comme proposition.
4. Seul l'utilisateur décide de modifier son métier retenu.
5. L'origine du choix est conservée : `auto` (accepté sans correction), `confirmed` (proposition confirmée), `manual` (saisi à la main) — jamais rétrogradée ; les surcharges préexistantes valent `manual` par défaut.
6. Le système distingue métier détecté, métier proposé et métier retenu ; les propositions, confirmations et changements sont traçables (`profile_proposal_events`, RLS 074).

Traduction technique : le moteur est pur (aucune écriture) ; un seul helper d'écriture, appelé uniquement depuis des actions utilisateur explicites ; le retrait passe par la route dédiée `POST /activities/:id/profile-choice` ; démonstration par contrat de balayage (un seul `insert`, un seul `delete` volontaire).

## 5. Critères de validation V2 (preuves exigées)

| Critère | Preuve |
| --- | --- |
| Plusieurs profils proposés et classés | Contrat + test unitaire (2 à 5 propositions, tri déterministe) |
| Niveau de confiance compréhensible et explicable | Contrat (4 niveaux, libellés, 2-4 raisons sourcées) |
| Incertain = demande de confirmation | Test unitaire (`requiresConfirmation`, aucune affectation) |
| Le choix manuel résiste aux détections et actualisations | Contrat : mise à jour sans profil = surcharge et origine inchangées |
| Modification volontaire à tout moment | Route `profile-choice` (confirmer, choisir, retirer) |
| Traçabilité | Journal daté des propositions et décisions (purge liée à la suppression de compte) |
| Aucune automatisation ne peut écraser une sélection | Contrat de balayage des routes d'écriture |

## 6. État de mise en œuvre (15.4.42)

- `micro-detection.ts` : `proposeProfilesFromSignals` (classement, niveaux, raisons) — pur et déterministe.
- `profiles.ts` : `RULES` et `EXTRA_KEYWORDS` exportés (source unique du vocabulaire).
- `business.ts` : `detect-profile` enrichi (compatibilité conservée), `GET /activities/:id/profile` expose le triplet retenu/origine/date, `POST /activities/:id/profile-choice` (seule écriture volontaire), effet de bord de suppression retiré de la mise à jour.
- Migration `093_profile_selection_origin.sql` : colonnes d'origine + journal, additive et idempotente, RLS standard.
- Tests : `backend/tests/v2-profile-proposals.contract.test.mjs` (7 contrats), suites voisines vertes, typecheck et build sans erreur.
- Reste du chantier 2 : affichage de la liste classée dans les écrans (le front actuel ignore les champs ajoutés), calibrage étendu du corpus, export CSV du journal (chantier exploitation).
- Règle héritée du chantier 3 : tout nouveau métier embarque ses indices (préfixes NAF, mots-clés, notes de prudence) et hérite automatiquement des invariants — l'automatisation assiste l'utilisateur, elle ne décide jamais à sa place.

> **Avancement 15.4.43-15.4.44** : le reste du chantier 2 est réalisé — liste classée affichée et actionnables dans les écrans (Paramètres et parcours guidé), origine non rétrogradable (non-régression SQL), export CSV du journal (`/admin/profile-proposal-journal.csv`), conventions du journal (migration 094 : FK cascade + réplication orgkey). Le chantier 3 est engagé : **calibrage étendu du corpus** (15.4.44) — vocabulaire étendu pour les 29 métiers indexés, règles de texte pour les dix profils restés sans indices, 33 hints NAF révision 2 ajoutés et deux notes corrigées (43.31 plâtrerie, 43.34 peinture/vitrerie), avec un **corpus de calibrage rejouable** (`v2-profile-calibration.contract.test.mjs` : 24 combinaisons courantes nom/description/NAF, hygiène du corpus, invariants « profil générique jamais proposé automatiquement » et déterminisme). Le profil `generic-services` reste sans indices par conception : c'est l'option explicitement humaine, hors propositions automatiques.
