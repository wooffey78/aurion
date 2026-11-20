# Isolation multi-tenant par RLS PostgreSQL (blocs 2 et 3 — migrations 074 et 075)

## Principe

Aurion protège les données de chaque organisation à deux niveaux complémentaires :

1. **Filtres applicatifs** (déjà existants) : chaque route et service filtre par `organization_id` authentifié — conservés intégralement.
2. **Row Level Security PostgreSQL** (nouveau, migration `074_multi_tenant_rls.sql`) : même en cas d'oubli d'un filtre applicatif, d'une injection SQL ou d'une régression, la base refuse toute ligne d'une autre organisation.

## Fonctionnement

- **68 tables protégées** : 54 tables métier portant `organization_id` (migration 074) + 7 tables liées via leur table mère (`quote_items`, `support_messages`, `support_status_events`, `supplier_parts`, `template_versions`, `activity_contributions`, `activity_profile_overrides`) + **4 tables du bloc 3** (migration 075) : `pa_webhook_endpoints`, `pa_webhook_events`, `supplier_electronic_invoices`, `supplier_electronic_invoice_events` + **3 tables du bloc 4** (migration 076) : `pa_outgoing_endpoints`, `outgoing_electronic_invoices`, `outgoing_transmission_events`.
- **Contexte tenant transactionnel** : `backend/src/db.ts` pose `set_config('app.current_organization', $1, true)` (équivalent `SET LOCAL`, périmètre transaction uniquement) dans chaque transaction. Au `COMMIT`/`ROLLBACK`, le contexte disparaît : **aucune contamination du pool de connexions**.
- **Échec fermé** : sans contexte (contexte absent, vide ou falsifié), la politique `tenant_isolation` ne correspond aucune ligne — ni lecture, ni écriture (`WITH CHECK`).
- **Le rôle applicatif ne peut pas contourner la RLS** : il n'est ni superuser, ni `BYPASSRLS`, ni propriétaire des tables (vérifié au démarrage par les tests ; séparation des rôles de migration et d'exécution exigée en production par `config.ts`).

## Chemins d'accès au contexte

| Chemin | Mécanisme |
|---|---|
| Requête HTTP authentifiée | enveloppe AsyncLocalStorage (`app.ts`) remplie par le plugin d'authentification (`setRequestTenant`) après vérification du jeton |
| Requête injectée (tests) | `app.inject` enveloppé — le dispatch traverse le même contexte tenant |
| Inscription / invitation VIP | `applyTenant(client, orgId)` après création de l'organisation |
| Callbacks OAuth (Google, Drive) | `withTenant(orgId)` — l'organisation vient du state à usage unique |
| Webhook Stripe | pool d'administration journalisé (voir ci-dessous) |
| Webhook PA (bloc 3) | point d'entrée résolu via pool d'administration journalisé (`pa.webhook.resolve`), puis toute écriture métier en transaction tenant explicite (`begin` + `applyTenant`) |
| Travaux planifiés (scheduler) | sélection inter-entreprises via pool d'administration, puis `withTenant` par organisation |
| Appels directs de services (tests) | `withTenant(orgId, () => service(orgId, …))` |

## Accès inter-entreprises explicites (pool d'administration)

Les besoins légitimes inter-entreprises — console d'administration, travaux planifiés, webhook Stripe — passent par un **pool SQL distinct** (`AURION_ADMIN_DATABASE_URL`) dont le rôle est membre du rôle `aurion_admin` (créé par la migration 074). Les politiques autorisent ce rôle explicitement (`pg_has_role(current_user,'aurion_admin','member')`).

- Chaque opération d'administration est **journalisée** dans `platform_admin_access_log` (`logAdminAccess`).
- Le rôle applicatif **ne peut ni lire ni écrire** ce journal (REVOKE dans `migrate.ts`).
- Sans `AURION_ADMIN_DATABASE_URL`, l'isolation reste active et ces fonctions **refusent explicitement** (503 `ADMIN_DB_NOT_CONFIGURED`) au lieu de renvoyer des données vides ou trompeuses.

### Déploiement

```sql
-- À exécuter une fois par base (rôle de groupe créé par la migration 074) :
CREATE ROLE aurion_admin_app LOGIN PASSWORD '…' IN ROLE aurion_admin;
```

Puis définir `AURION_ADMIN_DATABASE_URL` (secret, jamais dans le blueprint) pointant vers ce rôle, sur chaque service Render concerné.

## Tables volontairement hors périmètre RLS

Tables d'identité accédées **avant** toute organisation active (connexion, inscription, sélection d'organisation, rafraîchissement de session, états OAuth lus par les callbacks publics) : `users`, `organizations`, `organization_members`, `native_sessions`, `password_reset_tokens`, `webauthn_challenges`, `webauthn_credentials`, `google_oauth_states`, `cloud_oauth_states`, `plans`, `modules`, `platform_admins`, `legal_documents`, `legal_acceptances`, `billing_webhook_events`, `admin_guest_invites`, `vip_guest_accounts`.

Ces tables restent protégées par les contrôles applicatifs existants (jetons à usage unique, hachage Argon2id, vérifications de membre…). Les fonctions trigger de synchronisation (`touch_account_sync`, `aurion_bump_*`) sont `SECURITY DEFINER` avec `search_path` verrouillé : elles incrémentent `account_sync_versions` pour l'organisation reçue en paramètre, y compris lors de la création d'organisation (hors contexte tenant).

## Tests

`backend/tests/tenant-isolation.rls.test.mjs` (intégration, PostgreSQL réel, rôle applicatif) :

1. politiques présentes sur les tables protégées ;
2. le rôle applicatif ne contourne pas la RLS (ni superuser, ni propriétaire, ni BYPASSRLS) ;
3. organisations A/B : lecture, écriture, suppression, recherche, tables de jointure — aucune fuite, données de B intactes ;
4. sans contexte : échec fermé (zéro ligne, insertion refusée) ;
5. tenant falsifié + connexions recyclées du pool : aucune fuite ;
6. pool d'administration : accès inter-entreprises journalisé, journal inaccessible au rôle applicatif ;
7. contrôles statiques de propagation du contexte dans le code.

Prérequis d'exécution : `npm run build`, `DATABASE_URL` (rôle applicatif), `AURION_ADMIN_DATABASE_URL`, `AURION_INTEGRATION_TESTS=1` — mis en œuvre dans la CI (`.github/workflows/aurion-ci.yml`).

## Limites connues et suivis

- Les tables d'identité restent hors RLS (voir ci-dessus) ; une protection par contexte utilisateur est envisageable dans un bloc ultérieur.
- `supplier_parts` protège par fournisseur ; une référence croisée vers une pièce d'une autre organisation via `part_id` est possible côté intégrité référentielle (aucune fuite de données : la pièce elle-même reste invisible).
- Coût : chaque requête tenant s'exécute dans une transaction (BEGIN / SET LOCAL / requête / COMMIT). Sur un réseau régional, cela ajoute des allers-retours mesurables ; à surveiller si le trafic augmente (regroupement de requêtes, prepared statements).
