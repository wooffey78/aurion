# RAPPORT-BLOC-02 — Complétude de la réplication métier (15.4.32)

## Objectif (prompt §5-BLOC 2)
Étendre le registre de réplication à toutes les tables métier utiles hors connexion, avec types, relations enfants et exclusions documentées ; vérifier snapshots paginés, curseur, deltas, tombstones et reprise.

## Constat (Bloc 0)
29 entités dans `SYNC_ENTITIES` ; ~14 tables métier manquantes ; référentiels datés globaux sans canal dédié.

## Changements
1. **Migration `086_sync_replication_completeness.sql`** (additive, idempotente, vérifiée ×2) :
   - Boucle générique 084 pour 7 tables `id+organization_id` : `bank_import_configs`, `cloud_documents` (métadonnées), `notification_jobs`, `outgoing_electronic_invoices`, `outgoing_transmission_events`, `payment_links`, `supplier_electronic_invoices`.
   - Fonction dédiée `aurion_sync_journal_write_orgkey` pour les tables **1:1 par organisation dont la clé primaire est `organization_id`** : `document_themes`, `email_signatures`, `electronic_invoice_profiles` (entity_id = organization_id).
   - Fonction dédiée `aurion_sync_journal_write_activity_key` pour `activity_profile_overrides` (PK = activity_id).
   - Fonction dédiée `aurion_sync_journal_write_forecast_assumptions` pour `activity_forecast_assumptions` (PK = activity_id, 086).
   - Enfants via parent (motif quote_items/085) : `template_versions` (via document_templates), `support_status_events` (via support_tickets).
2. **`backend/src/services/sync-replication.ts`** : registre étendu à **44 entités** ; nouvelle option `keyColumn` (clé naturelle) ; exclusions documentées dans l'en-tête (secrets/sessions, billing/account-sync, numérotation serveur `document_number_sequences` jamais répliquée, tables sans organization_id, fonctions retirées du produit, tables techniques).
3. **`backend/src/routes/sync.ts`** : snapshot et delta honorent `keyColumn`.

## Enseignement de fiabilité (consigné)
`schema_migrations` contrôle un **checksum** par fichier : 086 modifiée après sa première application n'est pas ré-exécutée (comportement correct du migrateur). La base de test a été recréée pour appliquer la version finale. **Règle rappelée : une migration appliquée ne se modifie plus jamais — toute correction passe par une migration supplémentaire.**

## Tests
- `bloc3-sync-replication.test.mjs` : contrat registre mis à jour (schemaVersion 3, 13 entités métier requises présentes, exclusions `mail_accounts`/`document_number_sequences`/`users`/`subscriptions` garanties) + **nouveau test `bloc2-completeness`** : delta sur les entités ajoutées, clé naturelle `activity_id` résolue dans le delta, snapshots `activity_forecast_assumptions` (A voit 1 ligne, B 0), enfant `template_versions` joint au parent avec isolation A/B, tombstone `document_themes` journalisé. **2/2 verts.**
- Non-régression complète phase-H : migrations 001→086 ×2 idempotentes, `npm run check`, `npm test` — résultat exact dans la livraison (voir rapport final de session si blocs suivants cumulés).

## Limite
Les référentiels datés globaux (`micro_rates`, `micro_referential_versions`, `regulatory_rules`) restent hors du registre tenant (sans organization_id) : leur canal de synchronisation versionné est traité au Bloc 7 (agrégats/fraîcheur), pas comme des données métier du tenant.

## Actions éditeur
Aucune.

## Confirmation
Aucun push, aucun déploiement, aucune dépense, aucune donnée réelle.

## État du bloc : **validé** (inventaire exhaustif ✓, isolation tenant réelle ✓, tests A/B et delta ✓, migrations ×2 ✓).
Livraison : incluse dans le ZIP de version courante (voir MISSION-ETAT).
