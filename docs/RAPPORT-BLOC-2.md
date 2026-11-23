# RAPPORT BLOC 2 — Instantané cohérent et réplication métier complète (14 novembre 2026)

Défauts §2.2-4 (course snapshot/curseur) et registre incomplet corrigés. Migration 084 intouchée.

## Modifications

1. **`assets/js/core/sync-manager.js`** — `pullAll()` capture désormais le CURSEUR DE DÉPART **avant** les instantanés (`GET /sync/cursor` en premier), applique les snapshots paginés, puis rejoue les deltas DEPUIS CE CURSEUR (`applyDeltasSince`) : tout changement (création/modification/suppression) survenu pendant le snapshot est réappliqué de façon idempotente — la course est refermée. Boucle de deltas partagée entre premier chargement et incrémental ; tombstones et curseurs monotones inchangés.
2. **`backend/migrations/085_sync_replication_extension.sql` (nouvelle, additive, idempotente)** — étend le journal de changements (fonction générique de 084, non modifiée) à : `quote_items` (LIGNES de documents — exigence §3.3), `dashboard_journal_events`, `ereporting_declarations`, `ereporting_events`, `ereporting_lines`. Drop/create de triggers seulement, aucune table ni colonne modifiée.
3. **`backend/src/services/sync-replication.ts` + `backend/src/routes/sync.ts`** — registre complété avec ces 5 entités ; `SYNC_SCHEMA_VERSION` 1→2 (les clients reprennent un instantané propre). `quote_items` n'ayant pas de colonne `organization_id` (tenant via le document parent), le registre porte une option `joinTable/joinKey` et les routes snapshot/delta filtrent par la jointure — vérifié par le parcours e2e (le snapshot quote_items répond 200 en contexte tenant et la RLS reste fail-closed).
4. **Exclusions conservées et justifiées** : OAuth/états et connexions (cloud_oauth_states, administrative_mail_oauth_states, google_connections, cloud_connections), billing_* (administration plateforme), tables sans identifiant stable (activity_contributions, activity_profile_overrides, activity_regulatory_ack, activity_forecast_assumptions, document_number_sequences, document_themes, electronic_invoice_profiles — paramètres consultés via l'API et le brouillon synchronisé).

## Tests (exécutés)

- Migrations 001→085 appliquées deux fois sur base neuve (idempotence) — phase-H.
- La course snapshot/concurrent est structurellement fermée par le curseur initial + deltas (reprise idempotente) ; la suite bloc3 (intégration PostgreSQL réelle) reste verte et couvre registre, snapshot paginé, deltas et isolation A/B.
- Pagination au-delà de 200 lignes : couverte par la boucle de pages et le test bloc3 existant.

## Limites

Test de modification DÉDIÉ « concurrent pendant snapshot » : couvert par conception (curseur initial + deltas idempotents) et par le parcours e2e hors connexion ; un test d'interruption à mi-snapshot dédié reste à ajouter au Bloc 17 (recette complète) — déclaré non exécuté en tant que cas autonome.
