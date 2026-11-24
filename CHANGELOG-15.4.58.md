# CHANGELOG — 15.4.58

## Révision du moteur de calcul du « temps économisé »

### Défaut corrigé — le compteur restait bloqué à zéro
- `/time-sessions/start` : depuis la deuxième session d'un client, l'estimation manuelle saisie au démarrage était **silencieusement écrasée par 0** (`hasHistory ? 0 : …`). Σ des temps manuels = 0 → temps économisé = max(0, 0 − réel) = 0 à chaque recalcul. Le moteur honore désormais l'estimation saisie **à chaque prise en charge**, conformément à l'aide à l'écran (« saisissez au début de chaque prise en charge le temps que vous auriez consacré manuellement »).
- Nouvelle logique de l'estimation initiale : **saisie explicite** → appliquée telle quelle ; **sans saisie** : la première session comptabilisée repart de l'estimation de la fiche client (comportement d'origine), ensuite 0 — aucune estimation n'est inventée.
- `resumeClientTimer` (relance du chronomètre après conversion d'un devis en facture) appliquait le même défaut (`manual_minutes=0` forcé) : même moteur appliqué (saisie > estimation de fiche à la première session > 0).

### Remise à zéro conforme au référentiel documentaire §07-6
- « La remise à zéro ne supprime pas les données historiques nécessaires aux statistiques ou audits » : la remise à zéro **exclut désormais les sessions du calcul** (marqueur technique `excluded_at`, migration `121_time_metrics_soft_reset.sql`) au lieu de les supprimer. L'historique reste disponible pour l'audit, les statistiques d'usage et le suivi des temps des chantiers.
- Portée inchangée et toujours bornée : l'activité affichée est requise dès qu'il en existe plusieurs (`ACTIVITY_REQUIRED`) ; la branche sans activité ne reste accessible qu'aux organisations à activité unique.
- Tous les calculs filtrent `excluded_at is null` : `/time-metrics` (totaux + session active), `/time-metrics/stats` (jour/semaine/mois), fiche client, arrêts de chrono (routes métier + intégration calendrier), reprises de session en pause. Les temps réels des chantiers continuent d'exploiter les sessions (mesure de travail, indépendante du compteur d'économie).
- Texte de confirmation du tableau de bord mis à jour : plus de promesse de suppression — « l'historique est conservé pour l'audit, les statistiques et le suivi des chantiers ».

### Tests
- `tests/time-metrics.contract.test.mjs` : 6 tests — portée des métriques, honneur à la saisie (interdiction réaffichée du `hasHistory ? 0 : …`), même moteur dans `resumeClientTimer`, exclusion sans suppression, lectures filtrées, affichages fiche client.
- `tests/time-metrics-reset-scope.contract.test.mjs` : 4 tests — activité affichée transmise, jamais de remise à zéro globale, exclusion bornée à l'activité sans aucun `delete`, métriques filtrées.
- Non-régression sur l'arbre publié : build TypeScript OK (commande Render), verrou « versions harmonisées » 16/16, suite backend complète 751 tests — les 15 échecs résiduels sont préexistants à la baseline `origin/main` (sensibles à l'environnement : clés Google, `APP_BASE_URL`, S3, seuils datés) et strictement identiques avant/après le correctif ; **aucun échec supplémentaire introduit**.

### Version
- `VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, `package-lock.json`, `backend/package-lock.json`, `sw.js`, `index.html` : 15.4.58 (verrou « versions harmonisées » au vert). Migration SQL minimale et idempotente : une colonne technique + un index partiel.
