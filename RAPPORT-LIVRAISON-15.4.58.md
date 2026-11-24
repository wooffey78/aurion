# RAPPORT DE LIVRAISON — 15.4.58 (révision du moteur « temps économisé »)

Date : 24 novembre 2026 · Précédente publiée : 15.4.57 (cloisonnement d'activité des encarts et montants robustes) · **Publication** : correctif appliqué sur la ligne `main` de `wooffey78/aurion` (layout racine) via patch de publication ; la poussée déclenche le déploiement Render automatiquement (autoDeploy, render.yaml).

> Périmètre publié : le correctif « temps économisé » seul. Le moteur de calcul central sur classeur Excel (livraison locale 15.4.57) n'est pas inclus dans cette publication et reste à publier séparément le cas échéant.

## 1 · Objet

Corriger le compteur « temps économisé » qui ne calculait pas correctement, conformément au référentiel documentaire (§07-6 : compteur de temps économisé, remise à zéro avec confirmation sans destruction de l'historique, estimation ≠ économie financière comptable).

## 2 · Diagnostic (cause racine du symptôme « compteur incorrect »)

1. **Saisie écrasée par 0** — `/time-sessions/start` : `manual=hasHistory?0:…`. Dès la deuxième session d'un client, le temps manuel saisi était remplacé par 0 → Σ manuel = 0 → économisé = max(0, 0 − réel) = **0 en permanence**. C'est la cause du symptôme rapporté.
2. **Relais du chronomètre** — `resumeClientTimer` insérait toujours `manual_minutes=0` (session créée après conversion devis → facture) : même effet.
3. **Remise à zéro destructive** — la remise à zéro SUPPRIMAIT les sessions, contrairement au §07-6 (« ne supprime pas les données historiques nécessaires aux statistiques ou audits ») : après une remise à zéro, les statistiques quotidiennes et l'audit perdaient tout.

## 3 · Corrections

| Fichier | Changement |
|---|---|
| `backend/migrations/121_time_metrics_soft_reset.sql` | Colonne `excluded_at timestamptz` + index partiel (idempotent) |
| `backend/src/routes/business.ts` | Reset = exclusion (plus aucun `delete`) avec retour du nombre de sessions exclues ; garde `ACTIVITY_REQUIRED` conservé ; `/time-metrics` et `/time-metrics/stats` filtrés `excluded_at is null` ; `/time-sessions/start` honore `manualMinutes` (saisie > estimation de fiche à la 1ʳᵉ session > 0) ; `pauseClientTimer`/`resumeClientTimer`/`stopClientTimer` filtrés + `resumeClientTimer` applique le même moteur d'estimation ; arrêt global filtré |
| `backend/src/routes/integrations.ts` | Arrêts de session (fin d'événement calendrier) filtrés |
| `backend/src/services/clients.ts` | Fiche client : sessions exclues retirées du calcul (temps Aurion, économisé) |
| `assets/js/pages/dash/other.js` | Message de confirmation : « l'historique est conservé pour l'audit, les statistiques et le suivi des chantiers » (plus de « Action irréversible ») |
| `backend/tests/time-metrics.contract.test.mjs` · `tests/time-metrics-reset-scope.contract.test.mjs` | Contrats mis à jour et étendus (10 tests) : saisie honorée, exclusion sans suppression, portée bornée, filtres sur toutes les lectures, chantiers non affectés |

## 4 · Vérifications (arbre publié, layout racine)

- Build TypeScript : **OK** avec la commande exacte du build Render (`npm ci --prefix backend --include=dev` puis `node tools/ensure-backend-deps.mjs && npm --prefix backend run build`).
- Verrou « versions harmonisées » (`merge-15.4.35.contract.test.mjs`) : **16/16 pass** — toutes les références alignées sur 15.4.58 (`VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, les deux lockfiles avec `packages[""]`, coquille `sw.js` et `index.html`). Ce verrou a permis de rattraper `backend/VERSION.txt`, oublié lors du bump initial.
- Contrats « temps économisé » : **16/16 pass** (`time-metrics.contract.test.mjs` 6/6, `time-metrics-reset-scope.contract.test.mjs` 4/4 et assertions associées) — dont l'interdiction réaffichée du `hasHistory ? 0 : …` et l'absence totale de `delete from client_time_sessions`.
- Suite backend complète (751 tests) : 667 pass, 69 skip, 15 échecs **préexistants et indépendants du correctif** — démontré par exécution séquentielle des 11 fichiers concernés dans l'arbre patché ET dans la baseline `origin/main` construite à l'identique : les ensembles de sous-tests en échec sont strictement identiques (tests sensibles à l'environnement sandbox : clés Google, `APP_BASE_URL`, crédentiels S3, seuils datés). **Le correctif n'introduit aucun échec supplémentaire.**
- Restant : tests d'intégration PostgreSQL (migration 121) à rejouer avec base ; recette manuelle du chronométrage (démarrage avec saisie → arrêt → compteur, puis remise à zéro → historique conservé).

## 5 · Fichiers modifiés ou ajoutés

**Ajoutés** : `backend/migrations/121_time_metrics_soft_reset.sql` ; `CHANGELOG-15.4.58.md` ; ce rapport.
**Modifiés** : `backend/src/routes/business.ts` ; `backend/src/routes/integrations.ts` ; `backend/src/services/clients.ts` ; `assets/js/pages/dash/other.js` ; `backend/tests/time-metrics.contract.test.mjs` ; `backend/tests/time-metrics-reset-scope.contract.test.mjs` ; `package.json`, `backend/package.json`, `package-lock.json`, `backend/package-lock.json`, `VERSION.txt`, `backend/VERSION.txt`, `sw.js`, `index.html`, `assets/js/main.js` (bump 15.4.58 — lockfiles et `backend/VERSION.txt` alignés conformément au verrou « versions harmonisées »).

## 6 · Déploiement

La poussée de `main` déclenche automatiquement le déploiement Render (autoDeploy, service `aurion`, Francfort). La migration 121 (`excluded_at`) s'applique au démarrage du backend via `node dist/migrate.js` (migrations additives idempotentes, ordre croissant) ; aucun nouveau paramètre d'environnement n'est requis ; aucune donnée n'est détruite.

**Vérifications post-déploiement** : `GET /health/db` → 200 ; page d'accueil portant `v=15.4.58-r1` (`index.html`) et coquille `aurion-shell-v15.4.58-r1` (`sw.js`) ; puis recette fonctionnelle : saisir une estimation au démarrage d'une session → arrêter → le compteur « Temps économisé » reflète manuel − réel ; « Remettre à zéro » → les compteurs retombent à zéro et l'historique des sessions reste consultable (audit/chantiers).
