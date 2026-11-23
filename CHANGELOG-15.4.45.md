# CHANGELOG — Aurion 15.4.45

Version V2 : **recette navigateur de bout en bout** (PostgreSQL réel + navigateur piloté) du moteur de propositions, **signal « activités secondaires » enfin collecté par l'interface**, et **trois défauts réels découverts par la recette et corrigés** (dont une panne de démarrage du front livrée en 15.4.43). Le corpus calibré de la 15.4.44 est conservé à l'identique.

## 1. Signal « activités secondaires » — collecté par l'interface (le moteur l'attendait depuis 15.4.42)

- **Parcours guidé (étape « Votre activité »)** : nouveau champ « Activités secondaires ou complémentaires » (une par ligne), envoyé au moteur (`secondaryActivities`), **persisté** dans `configuration_data.secondary_activities` et réaffiché à chaque retour.
- **Paramètres (section Entreprise)** : même champ, persisté et réaffiché ; les propositions du modal « Modifier l'activité » citent désormais la raison « Activités secondaires : « … » ».
- **Re-détection automatique** : la correction du nom, de la description ou des activités secondaires relance la détection (~600 ms, débouncée) dans les deux écrans — la sélection retenue n'est **jamais** écrasée par une re-détection.
- Rappel moteur (inchangé) : +8 par mot-clé reconnu, plafond +15, raison sourcée ; le métier principal n'est pas déplacé par le signal secondaire.

## 2. Recette navigateur exécutée — et trois défauts corrigés

La recette (navigateur réel sur PostgreSQL 17.4 embarqué, migrations 001→094, compte inscrit comme un utilisateur) a prouvé la chaîne complète **et** révélé trois défauts invisibles aux tests de source :

1. **Le front ne démarrait plus** (régression 15.4.43) — `settings.js` déclarait un `renderProposals` local alors qu'il importe celui de `core/company-detect.js` : collision d'identificateur → `SyntaxError` → écran « Le code de l'application ne s'est pas chargé correctement » **sur tous les écrans**. Corrigé : variante locale renommée `renderProfileProposals`. Garde de régression ajoutée.
2. **Le journal du choix perdait chaque événement** (régression 15.4.43, migration 094) — dans `saveActivityProfileOverride`, les colonnes de l'insert étaient **échangées** (`organization_id` recevait l'id d'activité → violation de clé étrangère) et un paramètre était sans type inférable dans `jsonb_build_object` : l'origine était persistée (upsert avant l'insert) mais la requête finissait en 500 et **aucun événement `confirmed`/`manual_change` n'était écrit**. Corrigé : colonnes en ordre + casts explicites ; vérifié en base et par API (200).
3. **L'origine 'confirmed' rétrogradée par l'onboarding** — la sauvegarde de l'étape écrivait la mise à jour de l'activité (origine 'manual') **après** la confirmation de proposition ; une nouvelle décision à code différent n'étant pas protégée par la non-régression, l'origine repassait à 'manual'. Corrigé : **la confirmation explicite est désormais la dernière écriture de l'origine** (mise à jour d'abord, `profile-choice` ensuite).

## 3. Traçabilité complète vérifiée de bout en bout

- Journal `profile_proposal_events` : piste intégrale observée en base — détections (`proposed`, avec confiance et raisons), choix (`confirmed` avec `chosenFromProposal`) et changements manuels (`manual_change`).
- `GET /activities/:id/profile` : triplet complet (métier retenu, origine `confirmed`, décision datée, proposition d'origine).
- Affichage : « Métier retenu : proposition confirmée · décision du … » dans le modal d'activité.

## 4. Artifacts de recette (rejouables, livrés dans l'archive)

- `docs/RECETTE-NAVIGATEUR-15.4.45.md` : parcours complet, résultats, défauts trouvés et corrections, preuves.
- `tools/recette-e2e.sh` : infrastructure rejouable — PostgreSQL embarqué si aucune base fournie (binaires portables, sans privilège), migrations, serveur, compte de recette, fumée API.
- `tools/recette-smoke.mjs` : 8 contrôles API (propositions classées, signal secondaire cité, confiance, origine confirmée et datée, triplet de traçabilité) — tous verts.
- `backend/tests/v2-e2e-fixes.contract.test.mjs` : gardes de régression des trois défauts (collision d'identificateur interdite, colonnes du journal dans l'ordre avec casts, ordre des écritures de l'origine).
- `backend/tests/v2-secondary-signals.contract.test.mjs` : collecte front + effet moteur + déterminisme du signal secondaire.

## 5. Tests et vérifications

- **Batterie complète rejouée** après corrections : suites V2 (journal, UX, propositions, calibration, signaux secondaires, gardes E2E), catalogue 15.4.36, bloc 8, step18/29, versions, suppression de compte, console d'administration, strict-requirements, bloc 3 — **0 échec** (skips contractuels : intégration PostgreSQL réelle hors base pour les suites qui l'exigent).
- `tsc --noEmit` et build : 0 erreur.
- Recette navigateur : parcours complet exécuté (voir section 2) ; preuves visuelles livrées avec l'archive de travail.
- Tests de convention mis à jour pour les formes de source nouvelles (nom `renderProfileProposals`, confirmation à la validation) — invariants inchangés : aucun clic « Utiliser » ne confirme immédiatement, la confirmation reste une action volontaire à l'enregistrement.

## 6. Version

`VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, lockfiles, `index.html` et `sw.js` harmonisés en **15.4.45**.
