# Aurion 15.2.38

## Correctifs de sécurité et fiabilité
- Migration 057 : correction des triggers de synchronisation pour les tables à clé `user_id`, et protection des suppressions d’organisation.
- Migration 058 : liste blanche des tables métier synchronisées afin d’éviter les révisions déclenchées par les journaux et paiements plateforme.
- Rôle runtime PostgreSQL séparé du migrateur, privilèges idempotents, droits par défaut et exclusion de `schema_migrations`.
- Rotation transactionnelle des secrets de messagerie, en simulation par défaut.
- Stripe : demande de paiement persistée avant création Checkout, acquittement 200 des sessions signées non reconnues, purge des demandes en attente expirées, clés de production vérifiées par paire.
- Synchronisation navigateur : révision locale scindée par organisation/utilisateur, acquittement des propres écritures sans rechargement complet.
- Comptabilité/trésorerie : coefficient commercial exclu des dépenses réelles ; prévisions du tableau de bord calculées en HT et SAV financiers déduits.
- Suppression des documents : métadonnées et devis/factures supprimés atomiquement avant nettoyage des fichiers générés.
- CI : tests smoke exécutés une seule fois, archive nommée selon `VERSION.txt`, test avec deux rôles PostgreSQL ; health check Render vérifie la base.

## Validation
Les tests de la CI PostgreSQL 17 et le contrôle final doivent être verts avant fusion et déploiement. Le navigateur réel et la base de production ne sont pas remplacés par des tests statiques.
