# Aurion 15.3.0 — guide des migrations

## Règles

- La version 15.3.0 ajoute uniquement la migration `backend/migrations/065_guided_journey_administrative_addresses.sql` ; aucune migration historique n’est réécrite.
- La migration doit d’abord être essayée sur une base jetable représentative, puis appliquée par le mécanisme de migration existant avec le rôle DDL dédié.
- Utiliser `AURION_MIGRATION_DATABASE_URL` pour les tâches de migration conformément aux règles déjà présentes dans le projet. Ne pas utiliser une clé secrète de production dans un environnement de développement.
- Sauvegarder une base existante avant changement de schéma et vérifier l’état du registre des migrations avant une nouvelle tentative.

## Contenu de la migration 065

- `onboarding_journeys` : état serveur du guide et données de brouillon.
- `dashboard_journal_events` : événements persistants dédupliqués, rendus dans le journal du tableau de bord existant.
- `administrative_formalities`, `administrative_document_links`, `administrative_mail_items` : formalités, liens de fichiers et métadonnées de messages rapprochés.
- `administrative_mail_connections`, `administrative_mail_send_connections`, `administrative_mail_oauth_states` : connexions Gmail de lecture et d’envoi avec autorisations distinctes, et état OAuth à usage unique.
- `administrative_mail_send_locks` : verrou d’idempotence d’envoi par formalité, évitant les doubles envois lors d’une répétition de requête ou d’un résultat fournisseur incertain.
- `client_intervention_addresses` : adresses secondaires, adresse par défaut et archivage.
- Colonnes additives dans `quotes` pour l’identifiant et l’instantané de l’adresse d’intervention.
- Colonnes additives dans `email_signatures` pour les rendus et catégories de signature.
- Reprise additive des anciennes valeurs `clients.intervention_address` comme première adresse par défaut. La colonne historique demeure conservée.
- Une note de journal est ajoutée uniquement aux organisations historiques dont `configuration_incomplete` est vrai (ou nul), sans créer de parcours pour ces organisations.

## Recette après migration

1. Vérifier les contraintes, index et nouvelles tables.
2. Comparer le nombre de clients avec une ancienne adresse d’intervention au nombre d’adresses initiales importées.
3. Tester une organisation nouvelle et une organisation historique : la première possède une entrée de parcours ; la seconde conserve son comportement d’accès et n’est pas forcée dans le tutoriel.
4. Créer un client avec plusieurs adresses, une seule adresse de facturation, puis un devis avec une adresse d’intervention. Modifier/archiver l’adresse et vérifier que l’instantané du document demeure inchangé.
5. Vérifier l’isolation en utilisant deux organisations de test différentes.
6. Vérifier l’export ZIP et le journal persistant.
7. Relancer le mécanisme de migration en environnement de test et confirmer qu’il signale correctement que la version est déjà appliquée sans duplication destructive.

La migration n’a pas été exécutée pendant la production de cette archive : PostgreSQL/`psql` n’était pas disponible. Les étapes ci-dessus sont donc une recette requise, pas un résultat de test revendiqué.
