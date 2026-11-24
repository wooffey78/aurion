# RAPPORT DE LIVRAISON — 15.4.59 (fiche client + conversion réparées · compteur réalimenté · badge cliquable · Chantiers restaurée · prévisionnel non dilué)

Date : 24 novembre 2026 · Précédente : 15.4.58 (publiée et vérifiée en ligne) · **Poussée GitHub / déploiement Render : préparés, NON exécutés** (identifiants de poussée à re-fournir — patch et script prêts).

## 1 · Objet

Six demandes : (1) corriger « La requête a échoué. » à la validation d'une nouvelle fiche client (fiche pourtant créée, visible après changement de section, sortie de modale uniquement par « Annuler ») ; (2) vérifier que le compteur « temps économisé » reporte bien les données ; (3) rendre cliquable l'information « Compteur en pause » de la fiche client : pause, puis proposition de relance ; (4) restaurer la section Chantiers de la sidebar ; (5) corriger « la création de documents se fait mais renvoie requête échouée avant d'être visible » ; (6) analyser la pertinence du moteur de calcul et des données reportées dans les encarts du tableau de bord et le prévisionnel, puis corriger.

## 2 · Diagnostic (cause racine démontrée)

1. **Session « ouverte mais exclue »** — la remise à zéro 15.4.58 pose `excluded_at` sur toutes les sessions de l'activité **sans refermer celle qui est encore ouverte** (`ended_at is null`). Or l'index unique `idx_client_time_active_user` (migration 012 : une session ouverte par utilisateur) porte sur `user_id where ended_at is null` : la session cicatrice bloque toute nouvelle session.
2. **Création de fiche « à moitié réussie »** — `POST /clients` referme d'abord les sessions ouvertes **mais filtre `excluded_at is null`** : la cicatrice échappe aux fermetures. La fiche est écrite (autocommit), puis l'insertion de sa session de temps échoue (23505 → 500) : l'utilisateur voit « La requête a échoué. », la modale reste ouverte, et la fiche n'apparaît qu'après changement de section — exactement le symptôme rapporté.
3. **Compteur à 0** — la mise à 0 après remise à zéro est conforme (exclusion, historique conservé, réf. §07-6). Mais chaque session suivante devait réalimenter les compteurs ; comme aucune session ne pouvait plus être créée (fiche → 500, démarrage de chrono → même 23505), le compteur restait à 0. Le moteur de calcul lui-même (manuel − réel sur sessions terminées non exclues) est correct et inchangé.
4. **Conversion devis→facture « à moitié réussie »** — même famille : après le commit de la conversion, le relais du chrono (`resumeClientTimer`, ligne non gardée) tente un INSERT qui heurte la cicatrice (23505 → 500 générique) alors que la facture existe déjà. C'est la demande n°5 : les documents « se créent » mais renvoient « requête échouée » avant d'être visibles.
5. **Section Chantiers masquée** — depuis 15.4.50, l'entrée est retirée du menu quand le catalogue de modularité (`profile-features`) ne juge pas la fonctionnalité pertinente pour le métier de l'activité, ou après un échec ponctuel du chargement des fonctionnalités (repli conservateur, mis en cache pour toute la session).
6. **Prévisionnel dilué** — la moyenne des encaissements HT divisait le total de la fenêtre par la **fenêtre demandée** (6 mois) même quand l'historique réel est plus court : un compte d'un mois d'âge avait sa moyenne divisée par 6 → projections 3/6 mois et annuelle systématiquement sous-estimées, encarts « quasi vides » malgré une activité réelle. Analyse d'ensemble : `/dashboard/summary` (totaux, journal, compteurs), `documentForecastEntries` (entrées prévisionnelles partagées accueil/trésorerie) et `monthlyAccounting` (encaissements affectés au mois d'encaissement, kilométrage refacturé uniquement en `client_price`) sont pertinents et inchangés ; les mises à jour d'encarts en temps réel (minuteur 5 s/30 s, rafraîchissement arrière-plan 45 s, focus/online) existent et fonctionnent.

## 3 · Corrections

| Fichier | Changement |
|---|---|
| `backend/src/routes/business.ts` | **`/time-metrics/reset`** : les sessions encore ouvertes de la portée visée (running → durée accumulée ; paused → clôture simple) sont refermées AVANT l'exclusion (portée activité et portée organisation) — l'état « ouverte mais exclue » n'est plus créé. **Nouveau helper `closeOpenExcludedSessions`** appelé par `POST /clients`, `/time-sessions/start` et `resumeClientTimer` : cicatrisation de l'état existant au premier contact (exclues, ces sessions ne redeviennent jamais comptabilisées — aucun reset d'exclusion). **Nouveau helper `takeoverOtherClientSessions`** : démarrer un chrono alors qu'une session d'un autre client est ouverte lui fait céder la place (durée préservée) ; session déjà en cours pour CE client → retour idempotent `alreadyRunning`. **Nouvel endpoint `POST /time-sessions/:id/pause`** : temps écoulé accumulé, `status='paused'`, `ended_at` reste null (session relançable), sémantique identique à `pauseClientTimer`. **Conversion devis→facture** : relais et arrêt du chrono après commit gardés (try/catch + journalisation) — plus d'échec de réponse alors que la facture existe. **Prévisionnel** : diviseur = mois effectivement historisés depuis le premier encaissement de la fenêtre (borné, min 1), exposé (`effectiveHistoryMonths`) et rappelé dans la méthode affichée. |
| `assets/js/core/api.js` | Nouvelle méthode `pauseTimeSession` (POST `/time-sessions/:id/pause`). |
| `assets/js/pages/dash/clientsheet.js` | Badge compteur devenu **bouton** : « ⏱ Compteur en cours — cliquer pour mettre en pause » / « ⏸ Compteur en pause — cliquer pour relancer ». Clic → pause (toast de confirmation), puis le badge propose la relance (reprise de la session en pause via `/time-sessions/start`, sinon nouvelle session honorant l'estimation de la fiche). Chrono en cours sur un autre client → information explicite, aucune bascule silencieuse. |
| `assets/js/core/navigation.js` | **Section Chantiers restaurée** : plus de masquage par profil dans le menu — l'entrée redevient toujours visible. |
| `backend/src/services/profile-features.ts` | `chantiers` traité comme **capacité cœur** (`CORE` + calcul forcé à true + profil non reconnu) : jamais listée dans « ce que ce métier n'affiche pas ». |
| `assets/js/core/profile-features.js` | Repli hors connexion : `chantiers: true`, plus aucune raison de masquage pour cette entrée. |
| `VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, `package-lock.json`, `backend/package-lock.json`, `sw.js`, `index.html`, `assets/js/main.js` | Harmonisation 15.4.59 (verrou de versions). |
| `backend/tests/time-metrics-15.4.59.contract.test.mjs` | 10 contrats (détail §4). |
| `backend/tests/v50-workflows-frontend.test.mjs` | Contrat de navigation mis à jour : plus de règle de masquage de Chantiers ; repli `chantiers: true`. |
| `CHANGELOG-15.4.59.md` · ce rapport | Traçabilité. |

**Note de construction** — le `business.ts` de la livraison est reconstruit depuis la base publiée (`68b9360`) par `scripts/apply-15.4.59-backend.py` : la dérive locale du « moteur classeur » (import `pricingWithWorkbookEngine`, jamais publiée, modules absents de l'arbre publié — le build Render aurait échoué) est **exclue** ; l'acceptance vérifie que la différence résiduelle avec l'arbre de travail ne contient que ces lignes de moteur classeur. Le build exact (`npm ci` + `tsc`) est exécuté sur le nœud publié avant commit.

## 4 · Vérifications (exécutées dans ce bac à sable)

- **Contrats 15.4.59 + temps + navigation + cohérence comptable + verrou : 36/36 pass** — dont les 10 du fichier 15.4.59 : fermeture avant exclusion (portées activité et organisation), cicatrisation avant insertion dans `POST /clients` (ordre garanti), interdiction de réactiver une session exclue (aucun `set excluded_at=null`), démarrage sans heurt d'index (takeover + `alreadyRunning`), cicatrisation de `resumeClientTimer` avant relectures, endpoint pause (`ended_at` null, relançable) + méthode front, badge pause ⇄ relance, **conversion devis→facture gardée après commit**, **prévisionnel non dilué** (`effectiveHistoryMonths`, formule annuelle intacte), **Chantiers toujours visible** (menu + catalogue + repli).
- **Lot métier : 50/50 pass** (workflow paiements, numérotation, scénarios dorés, concurrence paiements, calculs devis/facture, audit cahier des charges, cohérence comptable, relances, prévisions trésorerie).
- **Routes : 3/3 pass** (inventaire et absence de doublon — le nouvel endpoint pause est couvert).
- **Smoke : 12/12 pass** (légal 5.1, navigation, service worker, dialogs natifs).
- **Build Render exact : OK sur le nœud publié** (`npm ci` + `tsc` dans le worktree de publication) ; **typecheck : OK** ; **check frontend : OK** (50 fichiers, syntaxe et imports — inclut `api.js`, `clientsheet.js`, `navigation.js`, `profile-features.js` modifiés).
- Recette en ligne après déploiement : créer une fiche client → plus d'erreur, modale refermée, fiche visible immédiatement ; créer un devis puis le convertir → plus d'erreur, facture visible ; badge fiche → pause → relance ; session → arrêt → compteur « Temps économisé » réalimenté (manuel − réel) ; remise à zéro → compteurs à 0, historique conservé, créations suivantes OK ; sidebar → Chantiers visible ; prévisionnel → moyenne ramenée aux mois effectivement historisés (indiqué dans la méthode).

## 5 · Réparation des données existantes (sans migration)

L'état cicatricé déjà présent en production (session ouverte + exclue) est réparé **au premier contact**, sans migration destructive : la prochaine création de fiche, conversion, démarrage de chrono ou relance referme la session bloquante avant d'insérer. Aucune donnée n'est détruite ; aucune migration SQL nouvelle dans cette livraison.

## 6 · Fichiers modifiés ou ajoutés

**Ajoutés** : `backend/tests/time-metrics-15.4.59.contract.test.mjs` ; `CHANGELOG-15.4.59.md` ; ce rapport.
**Modifiés** : `backend/src/routes/business.ts` ; `assets/js/core/api.js` ; `assets/js/pages/dash/clientsheet.js` ; `assets/js/core/navigation.js` ; `backend/src/services/profile-features.ts` ; `assets/js/core/profile-features.js` ; `backend/tests/v50-workflows-frontend.test.mjs` ; `VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, `package-lock.json`, `backend/package-lock.json`, `sw.js`, `index.html`, `assets/js/main.js` (bump 15.4.59).

## 7 · Déploiement (à la demande)

Aucun push effectué depuis ce bac à sable (identifiants de poussée absents). Prêts : patch `AURION-15.4.59-PUBLICATION.patch` (commit sur base `origin/main` `68b9360`, build validé sur le nœud publié) et `scripts/publisher-15.4.59.sh`. À l'activation : autoDeploy Render construit et déploie ; aucun paramètre d'environnement nouveau ; aucune migration SQL nouvelle ; vérifier ensuite `/health/db` → 200 et la coquille servie en `v=15.4.59-r1`.
