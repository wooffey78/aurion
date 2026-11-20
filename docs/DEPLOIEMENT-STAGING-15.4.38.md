# Déploiement staging — Aurion 15.4.38

> **Objet** : répéter sur staging le correctif d'inscription sans Stripe (15.4.38), avec sauvegarde
> vérifiée, migrations 091/092, contrôle d'un abonnement payant existant et plan de retour arrière.
> **La production n'est pas concernée par ce runbook.** Le service `aurion` est explicitement
> interdit comme cible.

## 0. Cible et garde-fous

| Élément | Valeur |
| --- | --- |
| Staging candidat | `aurion-v2` — `srv-dbltdd0ae00c73flv95g`, Francfort |
| URL publique | `https://aurion-v2-of15.onrender.com` |
| Version constatée le 20/11/2026 | **15.4.0** (`/health/db` : `database: reachable`) |
| Dernier déploiement live | `dep-dbrekt6i0phs73fkquag`, commit `65af132bf8fa61ee591ede7aeea5d980809a131a` |
| Base | PostgreSQL externe (Neon), pas la base Render `aurion-postgres-test` |
| Stripe | absent des variables du service : c'est bien une cible **sans facturation** pour le test d'inscription |
| Production — INTERDITE | `aurion` — `srv-dbfut4t9el5s73bcj0gg` |
| Ancien service | `aurion-web` — `srv-dbfv74ec6qcc73dq3ip0` (Oregon), ne pas utiliser |

**À confirmer avant toute action** : `aurion-v2` est bien l'environnement que l'éditeur appelle
« staging ». Aucun service Render ne porte ce nom ; c'est le seul service non-production qui
utilise une base PostgreSQL propre et une URL dédiée. Tant que ce point n'est pas confirmé,
le runbook reste en préflight et aucun déploiement n'est déclenché.

Garde-fou de cible, à exécuter dans le shell de l'opérateur :

```bash
export STAGING_SERVICE_ID="srv-dbltdd0ae00c73flv95g"
export PRODUCTION_SERVICE_ID="srv-dbfut4t9el5s73bcj0gg"
export STAGING_URL="https://aurion-v2-of15.onrender.com"
[ "$STAGING_SERVICE_ID" != "$PRODUCTION_SERVICE_ID" ] || { echo "REFUS : cible production"; exit 1; }
[ "$STAGING_URL" = "https://aurion-v2-of15.onrender.com" ] || { echo "REFUS : URL non staging"; exit 1; }
```

Les URL de base et les secrets ne doivent **jamais** être écrits dans ce document, dans un
commit, dans un log ou dans l'historique du shell. Les commandes ci-dessous supposent que
l'opérateur les a chargés depuis le gestionnaire de secrets dans des variables non exportées
vers les logs :

```bash
# À définir dans le shell, valeurs fournies par le gestionnaire de secrets Render/Neon.
# Ne pas les afficher, ne pas les coller dans une commande visible par un tiers.
: "${STAGING_MIGRATION_URL:?URL du rôle migrateur staging absente}"
: "${STAGING_RUNTIME_URL:?URL du rôle runtime staging absente}"
: "${STAGING_RESTORE_URL:?URL de la base jetable de restauration absente}"
```

## 1. État de départ et décision de séquence

Le staging est en **15.4.0**, alors que la production est en 15.4.35 et que l'archive à valider
est 15.4.38. Le dépôt local contient les migrations 090 à 092 non encore commitées ; `main`
contient 087 à 089. Un déploiement direct de 15.4.38 sur le staging appliquerait donc **087 à
092**, et pas seulement 091/092.

Deux séquences possibles :

### A. Séquence recommandée — aligner d'abord sur 15.4.35

1. Déployer `48326b1` (15.4.35, dernier commit de `main`) sur `aurion-v2`.
   Le démarrage applique 087 à 089 et le service revient à un socle connu.
2. Vérifier `/health/db`, l'inscription et l'absence d'erreur dans les logs.
3. Sauvegarder cette base (section 3), puis déployer 15.4.38 : seules 090 à 092 restent à appliquer.

Avantage : on sépare la mise à niveau de base (087–089) du correctif 15.4.38 (090–092). C'est la
répétition la plus fidèle avant la production, qui est déjà en 15.4.35.

### B. Déploiement direct 15.4.38

Possible car les migrations 087 à 092 sont additives, mais il mélange six migrations dans un seul
essai. À réserver au cas où le staging est déjà au niveau 089/090, ou si l'éditeur accepte
explicitement ce risque. Dans tous les cas, la sauvegarde et le contrôle du niveau de migration
restent obligatoires.

**Règle d'arrêt** : si `schema_migrations` n'est ni au niveau 089 ni au niveau 090, ne pas
déployer ; relever les migrations manquantes et faire valider la séquence.

### Preuves locales déjà acquises (hors staging)

Ces vérifications ne remplacent pas la recette staging ; elles sécurisent le code avant de
toucher l'environnement.

- répétition 091/092 sur PostgreSQL 18.7, base migrée jusqu'à 090 : le payant et l'essai
  existants restent inchangés, la ligne synthétique devient `no_billing`, le défaut
  `trial_started_at` est supprimé ;
- `signup-subscription.postgres.integration.test.mjs` : **4/4** avec le rôle runtime
  `aurion_runtime` soumis à RLS, dont le nouveau cas « abonnement payant existant » ;
- `npm run test:smoke` : **155/155** ; build backend OK.

## 2. Préflight (à faire avant la sauvegarde)

### 2.1 Outils et accès

- [ ] `psql`, `pg_dump`, `pg_restore` disponibles (`pg_dump --version`).
- [ ] Rôle migrateur staging : peut lire `schema_migrations`, `subscriptions`, `plans`, et créer
      des tables temporaires.
- [ ] Rôle runtime staging : peut lire/écrire les données applicatives, mais **pas** le DDL.
- [ ] Espace disque suffisant pour le dump et sa copie hors site (au moins 2 × la taille estimée).
- [ ] Accès Render au service `aurion-v2`, auto-deploy **désactivé** (confirmé : `autoDeploy: no`).
- [ ] Accès au gestionnaire de secrets pour les trois URL ; aucune valeur dans Git.

### 2.2 Version et état de migration

```bash
psql "$STAGING_MIGRATION_URL" -X -v ON_ERROR_STOP=1 -Atc \
  "select current_setting('server_version'), count(*), max(name) from schema_migrations;"
```

Consigner le résultat. Attendu avant 15.4.38 :

- version PostgreSQL ;
- nombre de migrations ;
- dernière migration = `089_...` (séquence A, avant 15.4.35) ou `090_...` (si déjà aligné) ;
- **aucune** ligne `091_...` ou `092_...`.

Lister les migrations présentes autour de la frontière :

```bash
psql "$STAGING_MIGRATION_URL" -X -v ON_ERROR_STOP=1 -Atc \
  "select name from schema_migrations where name >= '087' order by name;"
```

### 2.3 Photographie de l'abonnement existant

Ces requêtes ne renvoient que des compteurs et une empreinte, jamais un e-mail ou un nom.

```bash
psql "$STAGING_MIGRATION_URL" -X -v ON_ERROR_STOP=1 -Atc "
select 'total', count(*) from subscriptions
union all
select 'active_payant', count(*) from subscriptions
 where status='active' and plan_code is not null
union all
select 'active_synthetique', count(*) from subscriptions
 where status='active' and plan_code is null
   and trial_started_at is null and trial_ends_at is null
   and current_period_start is null and current_period_end is null
   and provider is null and provider_subscription_id is null
union all
select 'no_billing', count(*) from subscriptions where status='no_billing';"
```

Empreinte des abonnements payants, à comparer **à l'identique** après migration :

```bash
psql "$STAGING_MIGRATION_URL" -X -v ON_ERROR_STOP=1 -Atc "
select count(*), md5(string_agg(
  organization_id::text || '|' || coalesce(plan_code,'') || '|' || status || '|' ||
  coalesce(current_period_start::text,'') || '|' || coalesce(current_period_end::text,'') || '|' ||
  coalesce(provider,'') || '|' || coalesce(provider_subscription_id,''), E'\n' order by organization_id))
from subscriptions
where status='active' and plan_code is not null;"
```

Consigner les deux valeurs (nombre + MD5). Si le staging ne contient aucun abonnement payant,
le test devra utiliser une **fixture de test** (section 5.3), pas une vraie ligne client.

### 2.4 Conditions fonctionnelles

- [ ] `STRIPE_SECRET_KEY` est bien absent du service staging (sinon le test « sans Stripe » ne
      prouve rien). Vérifier le nom de la variable, pas sa valeur.
- [ ] Les documents légaux sont publiés sur staging. Sans publication, `POST /auth/register`
      répond `503 LEGAL_DOCUMENTS_UNPUBLISHED` : c'est un blocage de configuration, pas un défaut
      du correctif. Ne pas contourner avec `AURION_LOCAL_EVALUATION_MODE=true` en production.
- [ ] Un compte de test jetable peut être créé et supprimé (pas de données client réelles).
- [ ] Le staging n'est pas utilisé par des utilisateurs réels pendant la fenêtre.

## 3. Sauvegarde vérifiée (obligatoire avant tout déploiement)

### 3.1 Dump

> Utiliser l'URL **directe** du rôle migrateur, pas l'URL « pooler » du fournisseur, pour
> `pg_dump` et `pg_restore`. Le client PostgreSQL doit être au moins de la version du serveur.

```bash
export BACKUP_DIR="/var/backups/aurion-staging"
mkdir -p "$BACKUP_DIR"

AURION_MIGRATION_DATABASE_URL="$STAGING_MIGRATION_URL" \
DATABASE_URL="$STAGING_RUNTIME_URL" \
PG_DUMP_PATH="$(command -v pg_dump)" \
PG_RESTORE_PATH="$(command -v pg_restore)" \
node backend/scripts/backup-db.mjs --out "$BACKUP_DIR" --prune-days 30
```

Le script :

- utilise le rôle migrateur en priorité ;
- écrit un `pg_dump --format=custom --no-owner` horodaté ;
- refuse d'écraser un dump existant ;
- vérifie la lisibilité avec `pg_restore --list` (mais un échec de `pg_restore` n'est que
  **warning** : la vérification ci-dessous est donc obligatoire).

### 3.2 Vérification indépendante

```bash
export DUMP="$(ls -1t "$BACKUP_DIR"/aurion-db-*.dump | head -1)"
test -s "$DUMP" || { echo "ÉCHEC : dump vide"; exit 1; }
pg_restore --list "$DUMP" >/dev/null || { echo "ÉCHEC : dump illisible"; exit 1; }
sha256sum "$DUMP" | tee "$DUMP.sha256"
stat -c '%n %s octets' "$DUMP"
```

- [ ] `pg_restore --list` sort en **0**.
- [ ] Le fichier est non vide.
- [ ] Le SHA-256 est noté dans le ticket de déploiement.
- [ ] Le dump est copié vers un emplacement distinct, chiffré, hors du serveur qui l'a produit.

### 3.3 Test de restauration sur base jetable

Créer une base **vide et jetable** (jamais `DATABASE_URL` ni la base staging) :

```bash
# Créer la base via la console du fournisseur (rôle propriétaire), puis renseigner son URL :
# export STAGING_RESTORE_URL="postgresql://.../aurion_restore_15438"
# AURION_RESTORE_TARGET_URL doit pointer vers cette base jetable, pas vers le staging.
```

Puis :

```bash
AURION_RESTORE_TARGET_URL="$STAGING_RESTORE_URL" \
DATABASE_URL="$STAGING_RUNTIME_URL" \
AURION_MIGRATION_DATABASE_URL="$STAGING_MIGRATION_URL" \
PG_RESTORE_PATH="$(command -v pg_restore)" \
node backend/scripts/restore-db.mjs --from "$DUMP" --confirm
```

- [ ] `pg_restore` termine sans erreur.
- [ ] `schema_migrations` contient le même nombre de lignes que le staging.
- [ ] Les tables principales existent.
- [ ] La base jetable est supprimée après l'exercice.

> Le script de restauration refuse une cible identique à `DATABASE_URL` ou
> `AURION_MIGRATION_DATABASE_URL`. C'est volontaire : ne jamais neutraliser ce garde-fou.

## 4. Application des migrations

### 4.1 Point important : le déploiement migre tout seul

Sur Render, la commande de démarrage est `npm start` → `node dist/migrate.js` puis le serveur.
**Chaque déploiement applique les migrations en attente au démarrage.** Il ne faut donc pas
lancer un second `npm run migrate` en parallèle : le verrou PostgreSQL de `migrate.ts` protège
contre deux exécutions simultanées, mais un lancement manuel concurrent n'apporte rien et
brouille les logs.

Séquence :

1. sauvegarde et test de restauration terminés (section 3) ;
2. déploiement du commit 15.4.38 sur `aurion-v2` ;
3. lecture des logs Render : `application de 090_...`, `091_...`, `092_...`, puis
   `Migration terminee.` ;
4. démarrage du serveur et `GET /health/db`.

### 4.2 Prérequis de livraison du code

Le dépôt local est en 15.4.38 mais **rien n'est commité** : `main` est encore en 15.4.35.
Le déploiement staging ne peut pas utiliser « Deploy latest commit » tant que le commit 15.4.38
n'existe pas sur la branche déployée. Il faut, dans l'ordre et avec accord explicite :

- [ ] revue du diff et des tests ;
- [ ] commit 15.4.38 sur une branche dédiée (ne pas réutiliser `main` sans décision) ;
- [ ] push de la branche ;
- [ ] création/configuration du déploiement Render sur cette branche, ou fusion contrôlée vers
      la branche suivie par `aurion-v2` ;
- [ ] vérification que le commit déployé est bien celui de 15.4.38 (`RENDER_GIT_COMMIT` / logs).

Tant que cette étape n'est pas faite, le runbook reste au stade « prêt à exécuter », pas
« déployé ».

### 4.3 Lecture des logs

Rechercher, dans l'ordre :

```text
[AURION MIGRATE] application de 090_account_deletion_transactional.sql
[AURION MIGRATE] OK 090_account_deletion_transactional.sql
[AURION MIGRATE] application de 091_subscription_optional_trial.sql
[AURION MIGRATE] OK 091_subscription_optional_trial.sql
[AURION MIGRATE] application de 092_subscription_no_billing_status.sql
[AURION MIGRATE] OK 092_subscription_no_billing_status.sql
[AURION MIGRATE] Migration terminee.
```

Si le staging est déjà au niveau 090, les lignes 090 seront « déjà appliquée » et seules 091/092
seront appliquées.

**En cas d'échec** : ne pas relancer à l'aveugle ; relever le nom de la migration, le SQLSTATE et
la fin de transaction. Une migration échouée est annulée par `migrate.ts` (transaction par
fichier). Le service ne démarre pas ; appliquer la procédure de rollback (section 7).

## 5. Vérifications après déploiement

**Ordre d'exécution** : 5.1 → 5.2 → **5.4** (création du compte de test et contrôle
`no_billing`) → **5.3** (contrôle global puis fixture payante sur ce même compte) → 5.5.
Les numéros sont conservés pour la revue ; l'ordre ci-dessus évite de transformer le compte de
test en abonnement payant avant d'avoir prouvé l'inscription sans Stripe.

### 5.1 Santé et version

```bash
curl -fsS "$STAGING_URL/health" | tee /tmp/aurion-staging-health.json
curl -fsS "$STAGING_URL/health/db" | tee /tmp/aurion-staging-health-db.json
```

Attendu :

```json
{"ok":true,"service":"aurion-api","version":"15.4.38","database":"reachable"}
```

- [ ] `version` = `15.4.38`.
- [ ] `database` = `reachable` sur `/health/db`.
- [ ] Aucun `500` dans les logs Render après le démarrage.

### 5.2 État des migrations et conversion 092

```bash
psql "$STAGING_MIGRATION_URL" -X -v ON_ERROR_STOP=1 -Atc "
select 'max', max(name) from schema_migrations
union all
select 'nb', count(*)::text from schema_migrations
union all
select 'active_synthetique', count(*)::text from subscriptions
 where status='active' and plan_code is null
   and trial_started_at is null and trial_ends_at is null
   and current_period_start is null and current_period_end is null
   and provider is null and provider_subscription_id is null
union all
select 'no_billing', count(*)::text from subscriptions where status='no_billing';"
```

Attendu :

- `max` = `092_subscription_no_billing_status.sql` ;
- `active_synthetique` = **0** ;
- `no_billing` = valeur d'avant + nombre de lignes synthétiques converties (le nombre exact est
  celui relevé en 2.3) ;
- aucune ligne payante (`plan_code` non nul) ne devient `no_billing`.

### 5.3 Abonnement payant existant

Deux contrôles complémentaires.

**a) Contrôle global (obligatoire)** — l'empreinte de la section 2.3 doit être **identique** :

```bash
psql "$STAGING_MIGRATION_URL" -X -v ON_ERROR_STOP=1 -Atc "
select count(*), md5(string_agg(
  organization_id::text || '|' || coalesce(plan_code,'') || '|' || status || '|' ||
  coalesce(current_period_start::text,'') || '|' || coalesce(current_period_end::text,'') || '|' ||
  coalesce(provider,'') || '|' || coalesce(provider_subscription_id,''), E'\n' order by organization_id))
from subscriptions
where status='active' and plan_code is not null;"
```

Si le staging n'a aucun abonnement payant réel, cette requête renvoie `0` et une empreinte vide :
ce n'est pas une preuve. Passer au contrôle (b).

**b) Fixture de test (si aucun payant réel)** — réutiliser le compte jetable créé en 5.4, puis
remplacer son abonnement par une ligne `active` avec formule et période, via le rôle migrateur.
Utiliser des identifiants de test explicites et supprimer l'organisation à la fin :

```sql
-- Remplacer :org par l'UUID de l'organisation de test créée à l'inscription.
update subscriptions
   set status='active',
       plan_code='monthly',
       trial_started_at=null,
       trial_ends_at=null,
       current_period_start=now()-interval '10 days',
       current_period_end=now()+interval '20 days',
       provider='stripe',
       provider_customer_id='cus_staging_15438',
       provider_subscription_id='sub_staging_15438',
       cancel_at_period_end=false,
       canceled_at=null,
       updated_at=now()
 where organization_id=':org';
```

Puis, avec le jeton de ce compte de test :

```bash
curl -fsS -H "Authorization: Bearer $TEST_TOKEN" \
  "$STAGING_URL/billing/subscription"
```

Attendu : `status: "active"`, `planCode: "monthly"`, `readOnly: false`, `trialStartedAt: null`,
`trialEndsAt: null`, période inchangée. Refaire la lecture une seconde fois : la ligne ne doit
pas être modifiée (même statut, même formule, même période).

Nettoyage : supprimer l'organisation de test (cascade sur `subscriptions`, `users` via les
contraintes prévues) ou utiliser la procédure de suppression de compte de staging.

### 5.4 Inscription sans Stripe

Créer un compte de test unique (jamais une adresse réelle) :

```bash
export TEST_EMAIL="staging-15438-$(date +%s)@example.invalid"
export TEST_PASSWORD="MotDePasse-Staging-15438!"
curl -sS -D /tmp/aurion-register.headers -o /tmp/aurion-register.json \
  -X POST "$STAGING_URL/auth/register" \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"acceptLegal\":true}"
cat /tmp/aurion-register.headers
cat /tmp/aurion-register.json
```

Attendu :

- HTTP **201** ;
- réponse avec `user`, `organization`, `accessToken` ;
- aucun `23502` dans les logs Render ;
- la transaction crée bien l'organisation, l'utilisateur, l'appartenance, l'activité et
  l'abonnement (pas seulement l'utilisateur).

Contrôle en base :

```bash
psql "$STAGING_MIGRATION_URL" -X -v ON_ERROR_STOP=1 -Atc "
select s.status, s.plan_code, s.trial_started_at, s.trial_ends_at,
       s.current_period_start, s.current_period_end, s.provider
from subscriptions s
join users u on u.email = '$TEST_EMAIL'
join organization_members om on om.user_id = u.id
where om.organization_id = s.organization_id;"
```

Attendu : `no_billing`, aucune formule, **deux dates nulles**, aucune période, aucun fournisseur.

Puis, avec le jeton retourné :

```bash
export TEST_TOKEN="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/aurion-register.json','utf8')).accessToken)")"
curl -fsS -H "Authorization: Bearer $TEST_TOKEN" "$STAGING_URL/account" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(JSON.stringify(j.subscription,null,2))})"
```

Attendu : `status: "no_billing"`, `planCode: null`, `readOnly: false`, `trialStartedAt: null`,
`trialEndsAt: null`, `daysLeft: 0`.

Nettoyage : supprimer l'organisation/utilisateur de test à la fin de la recette.

### 5.5 Non-régression d'un abonnement payant réel

Si le staging possède un vrai abonnement payant (contrôle 5.3a), vérifier en plus :

- [ ] l'empreinte globale est identique avant/après ;
- [ ] le nombre d'abonnements `active` avec formule est identique ;
- [ ] aucun `no_billing` ne porte de `plan_code`, de période ou de fournisseur ;
- [ ] aucune facture d'abonnement n'est générée pour `no_billing` ;
- [ ] la console admin ne compte pas les `no_billing` dans les payants.

## 6. Critères de succès (Go/No-Go)

Le staging est déclaré **conforme 15.4.38** si et seulement si :

- [ ] sauvegarde écrite, lisible, SHA-256 noté, restauration jetable réussie ;
- [ ] 091 et 092 appliquées, `max(schema_migrations)` = 092 ;
- [ ] `/health/db` répond `15.4.38` et `database: reachable` ;
- [ ] inscription sans Stripe : HTTP 201, `no_billing`, dates nulles, aucun 23502 ;
- [ ] abonnement payant existant : empreinte identique, ou fixture active inchangée après deux
      lectures ;
- [ ] aucun `500`/erreur de migration dans les logs ;
- [ ] aucune ligne `no_billing` avec formule, période ou fournisseur ;
- [ ] les parcours de lecture (compte, tableau de bord, admin) ne montrent pas d'échéance inventée.

Sinon : **No-Go**, rollback (section 7), consignation de l'écart.

## 7. Plan de retour arrière

### 7.1 Principe

Les migrations 091/092 sont **additives** : elles assouplissent des colonnes, ajoutent une valeur
de statut et convertissent des lignes synthétiques. Elles ne suppriment aucune colonne ni aucune
donnée payante. Le retour arrière **applicatif** est donc possible sans inverser le schéma, mais
le retour arrière **de schéma** n'est pas une simple migration inverse :

- 091 a rendu les dates facultatives ; remettre `NOT NULL` échouerait sur les lignes
  `no_billing` (dates nulles) ;
- 092 a ajouté `no_billing` à la contrainte ; retirer cette valeur échouerait sur les lignes
  converties.

**Ne jamais exécuter un `ALTER TABLE ... SET NOT NULL` ou une suppression de contrainte à la main
pour « annuler » 091/092.** La seule remise en état fiable est la restauration de la sauvegarde
pré-déploiement, dans une base neuve ou après gel des écritures.

### 7.2 Déclencheurs

- échec d'une migration (le service ne démarre pas) ;
- `/health/db` indisponible après 5 minutes ;
- inscription sans Stripe en `500` / `23502` ;
- abonnement payant modifié (empreinte différente) ;
- conversion 092 incorrecte (ligne payante devenue `no_billing`, ou ligne synthétique restée
  `active`) ;
- erreurs `500` récurrentes ou régression fonctionnelle bloquante.

### 7.3 Rollback applicatif (rapide)

1. Geler les écritures / prévenir les testeurs.
2. Dans Render, ouvrir `aurion-v2` → **Deploys** → sélectionner le dernier déploiement live
   **antérieur à 15.4.38** : `dep-dbrekt6i0phs73fkquag` / commit `65af132` (15.4.0) en séquence B,
   ou le déploiement 15.4.35 en séquence A. Puis **Redeploy** / **Deploy previous commit**.
3. Attendre `live`, puis vérifier `/health/db` (version du commit redéployé) et les logs.
4. Ne pas relancer de migration manuelle : l'ancien code ne connaît pas les migrations 090–092,
   mais le schéma reste compatible (colonnes nullables, statut supplémentaire). Les lignes
   `no_billing` restent lisibles comme un statut inconnu de cette version ; si des lignes
   `no_billing` ont été créées, ne pas s'arrêter à un simple rollback code : passer au rollback
   données (7.4) pour retrouver un état strictement cohérent.

### 7.4 Rollback données (si le schéma ou les données doivent revenir à l'état pré-déploiement)

**Option recommandée : restauration dans une base neuve, puis bascule.**

1. Geler toutes les écritures staging.
2. Créer une base PostgreSQL neuve (même région, même version).
3. Restaurer le dump vérifié (URL de la nouvelle base fournie par le gestionnaire de secrets) :

   ```bash
   : "${NEW_STAGING_DB_URL:?URL de la nouvelle base staging absente}"
   AURION_RESTORE_TARGET_URL="$NEW_STAGING_DB_URL" \
   DATABASE_URL="$STAGING_RUNTIME_URL" \
   AURION_MIGRATION_DATABASE_URL="$STAGING_MIGRATION_URL" \
   node backend/scripts/restore-db.mjs --from "$DUMP" --confirm
   ```

4. Vérifier `schema_migrations`, les tables, l'empreinte des abonnements payants.
5. Mettre à jour `DATABASE_URL` et `AURION_MIGRATION_DATABASE_URL` du service `aurion-v2` vers la
   nouvelle base (via le gestionnaire de secrets Render, jamais dans un fichier).
6. Redéployer le commit antérieur à 15.4.38 (`65af132` en séquence B, `48326b1` en séquence A).
7. Vérifier `/health/db`, une connexion de test et l'absence d'erreur.

**Dernier recours : restauration en place** (destructive, uniquement staging, après accord) :
même commande avec l'URL de la base staging comme cible, après arrêt du service et gel des
écritures. Ne jamais faire cela sur la production.

### 7.5 Après rollback

- [ ] `/health/db` répond et la version correspond au commit redéployé.
- [ ] L'inscription de test fonctionne selon le comportement de la version restaurée.
- [ ] Les abonnements payants sont identiques à la sauvegarde.
- [ ] Le dump utilisé, l'heure, le commit et le résultat sont consignés.
- [ ] La cause est analysée avant toute nouvelle tentative ; ne pas rejouer la même séquence sans
      correction.

## 8. Ce qui reste hors de ce runbook

- **Production** : aucune action. `aurion` reste en 15.4.35 ; ne pas déployer, ne pas migrer,
  ne pas modifier ses variables.
- **Commit/push** : le code 15.4.38 est encore non commité. Un déploiement staging exige un
  commit et un push explicites, puis une revue.
- **Stripe** : le staging est sans clé Stripe. Le parcours d'essai 60 jours avec Stripe reste
  couvert par le test d'intégration local/CI, pas par ce staging.
- **Données réelles** : ne pas utiliser de compte client réel pour les tests ; utiliser des
  comptes `@example.invalid` et les supprimer.

## 9. Journal d'exécution

| Date/heure | Étape | Résultat | Preuve (fichier, SHA, log, ticket) | Opérateur |
| --- | --- | --- | --- | --- |
|  | Cible confirmée staging |  |  |  |
|  | Préflight migrations |  |  |  |
|  | Sauvegarde + SHA-256 |  |  |  |
|  | Restauration jetable |  |  |  |
|  | Déploiement 15.4.38 |  |  |  |
|  | 091/092 appliquées |  |  |  |
|  | Inscription sans Stripe |  |  |  |
|  | Abonnement payant inchangé |  |  |  |
|  | Go/No-Go |  |  |  |
|  | Rollback éventuel |  |  |  |
