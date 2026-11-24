# CHANGELOG — 15.4.59

## Réparation du blocage « La requête a échoué. » (fiches client ET conversion devis→facture) · badge compteur cliquable (pause ⇄ relance) · section Chantiers restaurée · prévisionnel non dilué

### Défaut corrigé — « La requête a échoué. » à la validation d'une nouvelle fiche client (fiche pourtant créée)
- **Cause racine** : la remise à zéro 15.4.58 (exclusion `excluded_at`) pouvait toucher une session **encore ouverte** (`ended_at is null`) sans la refermer. Cette session « ouverte mais exclue » restait invisible du compteur (les lectures filtrent `excluded_at is null`) tout en occupant l'index unique `idx_client_time_active_user` (migration 012 : une session ouverte par utilisateur).
- **Symptôme exact** : à la création d'une fiche, les deux fermetures préalables (Bloc 5) filtraient `excluded_at is null` → la session cicatrice n'était jamais refermée → l'insertion de la nouvelle session de temps échouait (23505 → 500) **après** l'écriture de la fiche (autocommit) : l'utilisateur voyait « La requête a échoué. », la modale restait ouverte (sortie par « Annuler »), et la fiche n'apparaissait qu'après un changement de section.
- **Corrections** : `/time-metrics/reset` referme d'abord les sessions ouvertes de la portée visée (sémantique exacte de l'arrêt : running → durée accumulée ; paused → clôture simple) **avant** l'exclusion ; `POST /clients`, `/time-sessions/start` et `resumeClientTimer` cicatrisent l'état « ouverte mais exclue » (`closeOpenExcludedSessions`). L'état existant en production est réparé au premier contact — aucune migration destructive, aucune donnée touchée.

### Défaut corrigé — « La requête a échoué. » à la conversion devis→facture (facture pourtant créée)
- Même famille de défaut : après le commit de la conversion, le **relais du chrono** (`resumeClientTimer`) et son arrêt après envoi n'étaient pas gardés — sur l'état cicatrice, l'INSERT du relais provoquait un 23505 → 500 générique alors que la facture existait déjà (visible seulement après changement de section).
- Les deux appels sont désormais gardés (try/catch + journalisation `client timer resume/stop skipped after conversion`), selon la même politique que le `pauseClientTimer` de l'enregistrement de document : un incident de chrono ne fait plus jamais échouer une écriture déjà validée.

### Section Chantiers restaurée dans la sidebar (demande utilisateur)
- Depuis 15.4.50, l'entrée Chantiers était masquée lorsque le catalogue de modularité ne déclarait pas la fonctionnalité pertinente pour le métier de l'activité (ou après un échec du chargement des fonctionnalités, repli conservateur).
- **15.4.59 : Chantiers redevient une capacité cœur** — visible quel que soit le métier : plus de masquage par profil dans le menu (`navigation.js`), `chantiers` traité comme core dans le catalogue serveur (`profile-features.ts`, jamais listé dans « ce que ce métier n'affiche pas ») et conservé dans le repli hors connexion (`profile-features.js`).

### Prévisionnel — pertinence : plus de dilution de la moyenne historique
- **Défaut** : la moyenne des encaissements HT divisait le total de la fenêtre par la **fenêtre demandée** (6 mois par défaut), même lorsque l'historique réel était plus court — un compte d'un mois d'âge voyait sa moyenne divisée par 6 : prévision 3/6 mois et annuelle systématiquement sous-estimée, encarts quasi vides malgré une activité réelle.
- **Correction** : le diviseur est désormais le nombre de **mois effectivement historisés** depuis le premier encaissement de la fenêtre (borné par la fenêtre, minimum 1) ; il est exposé dans la réponse (`effectiveHistoryMonths`) et rappelé dans la méthode affichée à l'utilisateur.
- Analyse d'ensemble confirmée : `/dashboard/summary` (totaux, journal, compteurs modules), `documentForecastEntries` (entrées prévisionnelles = devis ouverts TTC + SAV financiers négatifs, partagée accueil/trésorerie) et `monthlyAccounting` (encaissements affectés au mois d'encaissement, principal puis majorations, kilométrage refacturé uniquement en mode `client_price`) sont cohérents et inchangés.

### Compteur « temps économisé » — alimentation rétablie
- Le moteur de calcul (manuel − réel, sessions terminées non exclues) était correct ; c'est **l'alimentation qui était bloquée** : après la remise à zéro, plus aucune session ne pouvait être créée (création de fiche ou démarrage de chrono → 500). Le compteur restait donc à 0 quelle que soit l'activité réelle — la remise à zéro explique la mise à 0 initiale (historique conservé, réf. §07-6), mais chaque session suivante devait réalimenter les compteurs : c'est rétabli.
- `/time-sessions/start` : un démarrage ne peut plus heurter l'index unique — une session d'un **autre client** encore ouverte lui cède la place (durée préservée et comptabilisée), une session déjà en cours pour **ce** client est retournée telle quelle (idempotent), les cicatrices exclues sont refermées. `resumeClientTimer` (relance après facturation) applique les mêmes garde-fous.

### Nouveauté — badge compteur cliquable sur la fiche client
- Le badge « ⏱ Compteur en cours / ⏸ Compteur en pause » devient un **bouton** : un clic met le compteur **en pause** (temps écoulé accumulé, session relançable) ; le badge propose ensuite la **relance** (reprise de la session en pause, sinon nouvelle session honorant l'estimation de la fiche). Si le chrono tourne pour un autre client, l'information est affichée — aucune bascule silencieuse.
- Nouvel endpoint `POST /time-sessions/:id/pause` (sémantique identique à `pauseClientTimer` : `ended_at` reste null, la session reste relançable) et méthode front `api.pauseTimeSession`.

### Tests
- `tests/time-metrics-15.4.59.contract.test.mjs` : 10 contrats — fermeture avant exclusion (portée activité et organisation), cicatrisation sur les trois points d'insertion, interdiction de réactiver une session exclue, idempotence du démarrage, endpoint pause, badge pause ⇄ relance, conversion devis→facture gardée après commit, prévisionnel non dilué (`effectiveHistoryMonths`), Chantiers toujours visible (menu + catalogue + repli).
- Verrou « versions harmonisées » au vert sur 15.4.59 (`merge-15.4.35.contract.test.mjs` : 16/16) ; `v50-workflows-frontend` et `accounting-engine-coherence` mis à jour et au vert ; build Render exact (`npm ci` + `tsc`) exécuté **sur le nœud publié**.

### Version
- `VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, lockfiles, `sw.js`, `index.html` : **15.4.59**. Aucune migration SQL nouvelle (réparation comportementale) ; aucune donnée détruite.
