# RAPPORT DE LIVRAISON — 15.4.58 (révision du moteur « temps économisé »)

Date : 24 novembre 2026 · Précédente : 15.4.57 · **Poussée GitHub / déploiement Render : NON exécutés** (règle 13 — demande distincte requise).

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

## 4 · Vérifications

- Contrats temps : **16/16 pass** (+ 1 skip base absente) — dont l'interdiction réaffichée du `hasHistory ? 0 : …` et l'absence totale de `delete from client_time_sessions`.
- Non-régression : **62/62 tests purs verts** (pricing, extensions, money, workflow factures/paiements, scénarios dorés, prévisions, mentions, légal 5.1, moteur classeur).
- Build TypeScript sans erreur.
- Restant : tests d'intégration PostgreSQL (migrations 057/121) à rejouer en CI avec base ; recette manuelle du chronométrage (démarrage avec saisie → arrêt → compteur, puis remise à zéro → historique conservé).

## 5 · Fichiers modifiés ou ajoutés

**Ajoutés** : `backend/migrations/121_time_metrics_soft_reset.sql` ; `CHANGELOG-15.4.58.md` ; ce rapport.
**Modifiés** : `backend/src/routes/business.ts` ; `backend/src/routes/integrations.ts` ; `backend/src/services/clients.ts` ; `assets/js/pages/dash/other.js` ; `backend/tests/time-metrics.contract.test.mjs` ; `backend/tests/time-metrics-reset-scope.contract.test.mjs` ; `package.json`, `backend/package.json`, `VERSION.txt`, `sw.js`, `index.html`, `assets/js/main.js` (bump 15.4.58).

## 6 · Déploiement (à la demande)

Aucun push ni déploiement effectués. À l'activation : la migration 121 s'applique au démarrage du backend (migrations idempotentes, ordre croissant) ; aucun paramètre d'environnement nouveau n'est requis.
