# RAPPORT BLOC 7 — Interface de synchronisation et gestion des blocages (14 novembre 2026)

Défaut §2.2-7 corrigé : le moteur est désormais VISIBLE dans l'interface, en réutilisant les événements EXISTANTS (`aurion:sync-status`, `aurion:outbox-changed`) — aucun deuxième bus.

## Modifications

1. **`assets/js/core/sync-ui.js` (nouveau)** — indicateur global dans la barre latérale du tableau de bord : en ligne / hors connexion / réplication en cours / rejeu / à jour ; date du dernier succès ; progression du premier chargement (entité courante, entités terminées) ; vues affichées hors connexion.
2. **Panneau « Synchronisation »** (accessible clavier, `aria-expanded`/`aria-controls`, `aria-live` sur la liste) : compteurs exacts (attente, envoi, appliquées, conflits, refusées, erreurs), détail de chaque opération en attente (méthode+chemin, date de décision, raison du blocage lisible), boutons « Synchroniser maintenant » et « Relancer les opérations en erreur » (réessai HUMAIN approprié — jamais de seconde confirmation d'une décision déjà prise).
3. **CSS** (`assets/css/app.css`) — styles au design existant (variables du thème), états colorés (busy/orange, offline/rouge), responsive (panneau scrollable, 360 px OK), sans `alert()`.
4. **`assets/js/pages/dashboard.js`** — `initSyncUi()` appelé après le bootstrap attendu.

## Tests (exécutés)

- Le scénario Playwright hors connexion VÉRIFIE l'indicateur (« Hors connexion — décisions conservées ») et le compteur de la file (`pending:1`) dans la vraie interface, puis le retour à la normale.
- Compteurs exacts : provenant directement de `outboxSnapshot()` (même source que le moteur) — un seul état, pas de double comptabilité.

## Limites

Résolution de conflits à DEUX VERSIONS côte à côte (champs divergents) : les conflits sont conservés et AFFICHÉS (statut + raison, jamais last-write-wins silencieux — le serveur garde sa version et l'opération reste traçable), mais l'écran de comparaison champ par champ reste à construire au Bloc 17 avec des cas réels de recette.
