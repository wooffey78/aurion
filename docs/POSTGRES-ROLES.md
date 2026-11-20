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

## Migration 055 : doublons de provider_session_id

La migration 055 crée un index unique partiel. Si elle échoue avec des sessions dupliquées, ne pas supprimer les demandes au hasard :

1. Faire une sauvegarde et lister les doublons :
   `SELECT provider_session_id, array_agg(id ORDER BY created_at DESC) AS request_ids, count(*) FROM billing_payment_requests WHERE provider_session_id IS NOT NULL GROUP BY provider_session_id HAVING count(*) > 1;`
2. Pour chaque groupe, comparer la session Stripe, l'organisation, le montant, la référence et le statut. Conserver la demande correspondant à la session réelle et déjà payée, s'il y en a une.
3. Marquer les demandes obsolètes en `canceled` plutôt que de supprimer une trace comptable ; mettre `provider_session_id = NULL` uniquement sur les lignes confirmées comme orphelines et non payées.
4. Vérifier que la requête de doublons ne retourne plus de ligne, puis relancer le migrateur. Ne jamais modifier le fichier de migration 055 déjà appliqué sur un autre environnement.

## Rotation des secrets de messagerie

Après avoir configuré la nouvelle clé comme clé principale et conservé l'ancienne dans `AURION_ENCRYPTION_KEY_PREVIOUS` (avec sa version), lancer d'abord une simulation :

```sh
npm --prefix backend run secrets:rotate
```

La simulation déchiffre chaque secret, vérifie qu'il est lisible et valide le nouveau ciphertext sans écrire en base. Si elle réussit, appliquer la rotation :

```sh
npm --prefix backend run secrets:rotate -- --apply
```

Le script verrouille les lignes, travaille dans une transaction et annule tout si un secret est illisible. Il ne journalise jamais les secrets en clair. Garder l'ancienne clé jusqu'à ce que la rotation soit appliquée et vérifiée sur tous les environnements.


## Procédure de production sur Render (pas à pas)

1. Ouvrir Render Dashboard, sélectionner la base PostgreSQL de production, puis utiliser son SQL console en tant que rôle propriétaire/admin. Confirmer le nom réel de la base dans l'URL interne de la base. Les commandes suivantes sont à exécuter sur cette base, et non sur une base locale.
2. Créer le rôle runtime avec un mot de passe généré par un gestionnaire de secrets :
   ```sql
   CREATE ROLE aurion_runtime LOGIN PASSWORD '<mot-de-passe-fort-unique>';
   GRANT CONNECT ON DATABASE <nom_reel_de_la_base> TO aurion_runtime;
   GRANT USAGE ON SCHEMA public TO aurion_runtime;
   ```
   Remplacer les deux valeurs entre chevrons par des identifiants SQL réels avant exécution. Ne pas stocker le mot de passe dans le dépôt ni dans un ticket.
3. Dans le service backend Render, définir `DATABASE_URL` avec l'URL interne PostgreSQL utilisant le rôle `aurion_runtime`, `AURION_MIGRATION_DATABASE_URL` avec l'URL propriétaire distincte, et `AURION_RUNTIME_DB_ROLE=aurion_runtime`. Définir aussi `AURION_SUPPORT_EMAIL` selon la validation du service.
4. Les migrations doivent être exécutées par le rôle indiqué dans `AURION_MIGRATION_DATABASE_URL`. Au démarrage, `migrate.ts` crée seulement les migrations nouvelles et accorde au runtime les privilèges de tables et séquences nécessaires, sans lui accorder de droits sur `schema_migrations`.
5. Redéployer, puis vérifier les journaux pour les lignes de migration et le health check `/health/db`. Si une migration déjà appliquée présente un checksum différent, arrêter et corriger le nouveau fichier de migration ; ne jamais éditer l'ancien fichier appliqué.
6. Révoquer l'accès temporaire SQL si un accès temporaire a été accordé, puis confirmer que l'application fonctionne avec le rôle runtime sans droits DDL.

**Important :** ne copier aucune URL contenant des identifiants dans les logs ou les messages de diagnostic. La migration additive 061 ajoute les colonnes et tables de vérification d'adresse e-mail ; elle n'altère aucun SQL déjà appliqué.
