# Recette navigateur — Aurion 15.4.45 (moteur de propositions V2, bout en bout)

> Objectif : démontrer dans un **navigateur réel**, sur une **base PostgreSQL réelle**, la
> chaîne complète du moteur de propositions : connexion → parcours guidé → propositions
> classées → signal « activités secondaires » → confirmation explicite → traçabilité
> (origine + journal). La recette a été **exécutée** le 21/11/2026 sur PostgreSQL 17.4
> embarqué (binaires portables, aucun privilège administrateur requis) ; elle est
> rejouable via `tools/recette-e2e.sh`.

## 1. Environnement de recette

| Élément | Valeur |
| --- | --- |
| PostgreSQL | 17.4 embarqué (`@embedded-postgres/linux-x64`, port 55432, auth trust, isolé hors projet) |
| Migrations | 001 → 094 appliquées (`node dist/migrate.js`), vérifications post-migration OK |
| Serveur | `node dist/server.js` (port 4000), le backend sert le front (`@fastify/static`) |
| Compte | inscrit via `POST /auth/register` (comme un utilisateur réel) — `recette@example.test` |
| Navigateur | Chromium piloté (agent-browser), session complète : login → dashboard |

## 2. Parcours exécuté et résultats

1. **Landing → connexion** : formulaire de connexion rendu, authentification OK,
   redirection `#/dashboard`.
2. **Parcours guidé, étape 2 (entreprise)** : dénomination « Décor Web », activité
   « Création de sites internet », code NAF `62.01A`.
3. **Étape 3 (Votre activité)** : la liste classée s'affiche —
   « Développement web / logiciel » avec **« Très élevé — correspondance particulièrement
   forte »** et la raison sourcée « Code APE/NAF 62.01A (INSEE) : Programmation
   informatique → développement web / logiciel. » Le métier est **prérempli, jamais
   imposé** (modifiable).
4. **Signal secondaire (nouveau 15.4.45)** : saisie de deux activités secondaires dans le
   champ dédié → la détection est **relancée automatiquement** (~600 ms) et la liste
   re-classée fait apparaître « Réparation smartphone / tablette » avec la raison
   **« Activités secondaires : « téléphone », « mobile » »**. Le métier principal
   sélectionné n'est **jamais écrasé** par la re-détection.
5. **Confirmation explicite** : clic « Utiliser » sur la proposition principale →
   enregistrement → en base : `activity_profile_overrides` avec
   `origin='confirmed'`, `chosen_from_proposal='web-development'`, décision datée ;
   le journal enregistre un événement `kind='confirmed'`.
6. **Paramètres** : le champ « Activités secondaires ou complémentaires » est **persisté**
   (`configuration_data.secondary_activities`) et réaffiché ; le modal « Modifier
   l'activité » affiche les propositions, la citation du signal secondaire et
   **« Métier retenu : proposition confirmée · décision du 21/11/2026 »** ; une
   re-confirmation du même métier **ne rétrograde jamais** l'origine (non-régression SQL
   vérifiée).
7. **Traçabilité complète** : le journal `profile_proposal_events` contient la piste
   intégrale du parcours de recette — 4× `proposed` (détections initiale et relancées) +
   `confirmed` / `manual_change` selon les actions.

Preuves visuelles : `02-propositions-signal-secondaire.png`,
`03-parametres-champ-secondaire.png`, `04-parametres-origine-confirmee.png`.

## 3. Défauts trouvés par la recette — corrigés dans 15.4.45

La recette a rempli son rôle : **trois défauts réels, invisibles aux tests de source, ont
été découverts et corrigés**.

1. **Le front ne démarrait plus** (régression 15.4.43) : `settings.js` déclarait un
   `renderProposals` local alors qu'il importe déjà celui de `core/company-detect.js` —
   collision d'identificateur → `SyntaxError` → écran d'erreur au boot, **aucun écran
   utilisable**. Correctif : la variante locale renommée `renderProfileProposals`. Garde
   de régression : `backend/tests/v2-e2e-fixes.contract.test.mjs`.
2. **L'insert du journal du choix échouait** (régression 15.4.43, migration 094) :
   dans `saveActivityProfileOverride`, les colonnes étaient **échangées**
   (`organization_id` recevait l'id d'activité → violation de clé étrangère) et un
   paramètre était sans type inférable dans `jsonb_build_object`. Résultat observé :
   l'origine était persistée (upsert avant l'insert) mais la requête finissait en 500 et
   **le journal perdait chaque événement de choix**. Correctif : colonnes remises en
   ordre + casts explicites ; vérifié en base (événements `confirmed` et `manual_change`
   écrits) et par API (200).
3. **L'origine 'confirmed' rétrogradée par l'onboarding** : la sauvegarde de l'étape
   appelait `updateActivity` (origine 'manual') **après** la confirmation de proposition —
   une nouvelle décision à code différent n'est pas protégée par la non-régression, donc
   l'origine repassait à 'manual'. Correctif : **l'ordre des écritures** — la mise à jour
   d'abord, la confirmation explicite en dernier (la confirmation doit être la dernière
   écriture de l'origine).

## 4. Rejouer la recette

```bash
# Prérequis : node ≥ 20, npm i (racine du dépôt), backend construit (npm run build)
cd backend && npm run build
cd .. && bash tools/recette-e2e.sh
```

Le script : télécharge les binaires PostgreSQL embarqués dans un répertoire isolé,
initialise le cluster, applique les migrations, démarre le serveur, inscrit le compte de
recette et exécute la fumée API (`detect-profile` avec signal secondaire, `profile-choice`,
lecture `GET /activities/:id/profile`). Le parcours navigateur (section 2) se déroule
ensuite à la main ou avec un pilote d'automatisation — chaque étape y est décrite avec
son résultat attendu.

> Note : sur un poste disposant déjà d'un PostgreSQL, exporter `DATABASE_URL` suffit —
> le script réutilise la base fournie et ne télécharge rien.
