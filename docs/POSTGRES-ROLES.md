# Rôles PostgreSQL Aurion

En production, utiliser deux URL distinctes :

- `AURION_MIGRATION_DATABASE_URL` : rôle propriétaire/migrateur, seul autorisé à exécuter le DDL.
- `DATABASE_URL` : rôle applicatif runtime, sans propriété des tables et sans privilège de création de schéma.
- `AURION_RUNTIME_DB_ROLE` : nom SQL exact du rôle utilisé par `DATABASE_URL`.

Le rôle runtime doit exister avant le démarrage. Le migrateur accorde de façon idempotente `SELECT, INSERT, UPDATE, DELETE` sur les tables applicatives existantes, `USAGE, SELECT, UPDATE` sur les séquences, et les privilèges par défaut correspondants pour les futures tables/séquences créées par le même rôle propriétaire. La table `schema_migrations` est explicitement exclue des droits runtime.

Exemple de création (à adapter à l’environnement et au gestionnaire de secrets) :

```sql
CREATE ROLE aurion_runtime LOGIN PASSWORD 'à-fournir-via-un-secret-manager';
GRANT CONNECT ON DATABASE aurion TO aurion_runtime;
GRANT USAGE ON SCHEMA public TO aurion_runtime;
```

Ne pas réutiliser le rôle runtime comme propriétaire de migration. Définir les trois variables sur Render avant le déploiement. Le démarrage échoue volontairement en production si l’URL migrateur ou le nom du rôle runtime manque.
