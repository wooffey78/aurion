# RAPPORT BLOC 4 — Outbox métier robuste, dépendances et récupération (14 novembre 2026)

Défauts §2.2-3 (`sending` interrompu) et §2.2-5 (dépendances) corrigés. Le moteur, le store `outbox`, `sync-ops.ts` et l'idempotence `sync_applied_ops` sont PRÉSERVÉS — corrections ciblées.

## Modifications

1. **Bail (lease) et récupération** (`assets/js/core/outbox.js`) — chaque passage en `sending` pose `leaseUntil = now + 120 s` ; les opérations `sending` à bail expiré repassent automatiquement `pending` (au démarrage de session ET à chaque cycle de rejeu). Une réponse perdue après exécution serveur reste sans doublon : l'idempotence serveur dédoublonne par `opId` (`sync_applied_ops`).
2. **Dépendances déterministes** — à l'enregistrement (`recordOp`), toute valeur de payload ou de CHENIN égale à une référence locale en file devient `@ref:<localRef>` et la première référence rencontrée définit `dependsOn` : le graphe créateur→dépendants est persisté, l'ordre de rejeu suit le tri topologique puis `decidedAt` (plus jamais `decidedAt` seul pour une chaîne client→devis).
3. **Chemin avec référence locale (serveur)** — `backend/src/services/sync-ops.ts` : les segments `@ref:` des chemins résolus via le batch courant OU `sync_applied_ops` (dépôts séparés : modifier hors connexion une fiche créée hors connexion, même après redémarrage). Référence inconnue → refus honnête par liste blanche, jamais une écriture au mauvais identifiant.
4. **`outboxReady()`** (Bloc 1) — l'interception n'enregistre que si la file est prête.
5. **Statuts honnêtes conservés** : applied/duplicate/conflict/blocked/error + backoff borné + trace 30 jours + réessai manuel (`retryFailedOps`).

## Tests (exécutés)

- `backend/tests/bloc4-sync-ops.test.mjs` : rejeu sans doublon, substitution payloads+chemins (dépôts séparés), dépendance bloquée proprement, chemins interdits, isolation A/B, tombstone.
- Scénario Playwright hors connexion → rejeu automatique sans doublon (vérification PostgreSQL : exactement 1 ligne).
- Récupération `sending` : mécanisme de bail testé par conception (baux expirés → pending à chaque cycle) ; le cas « arrêt brutal à mi-`sending` » automatisé complet reste au Bloc 17 (recette) — déclaré non exécuté en tant que cas autonome ici.
- 401/refresh, 429 et 5xx : traités comme « synchronisation impossible → nouvelle tentative automatique » (backoff) ; l'espace disque plein déclenche une erreur d'enregistrement explicite (jamais silencieuse).

## Limites

Idempotency-key des écritures ONLINE (hors file) : non implémentée — hors périmètre du hors connexion, comportement historique inchangé (documenté au Bloc 17 pour décision).
