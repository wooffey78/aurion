# Aurion 15.4.38 — correctif bloquant : création d'espace sans Stripe

## Cause (confirmée dans les sources de la 15.4.37)

`backend/src/routes/auth.ts` créait, en l'absence de `STRIPE_SECRET_KEY`, un abonnement :

```sql
insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at)
values($1,'active',null,null)
```

Or `backend/migrations/009_accounts_legal_billing.sql` déclare :

```sql
trial_started_at timestamptz not null default now(),
trial_ends_at timestamptz not null,
```

PostgreSQL refuse donc l'insertion (`SQLSTATE 23502`, `null value in column "trial_started_at" … violates not-null constraint`). Comme cette insertion se trouve dans la transaction d'inscription, **toute la création d'espace était annulée** : entreprise, utilisateur, appartenance, activité et abonnement. Aucune inscription ne pouvait aboutir sur une installation locale ou auto-hébergée sans facturation configurée.

Second défaut de la même logique : `backend/src/services/account.ts` (`subscriptionState()`) créait automatiquement un essai de 60 jours lorsqu'aucun abonnement n'existait, sans vérifier la présence de Stripe. Il contredisait la règle « aucun essai imposé sans facturation » et pouvait recréer une échéance après coup.

## Corrections

| Élément | Correction |
| --- | --- |
| Schéma PostgreSQL | Migration additive `091_subscription_optional_trial.sql` : `trial_started_at` et `trial_ends_at` deviennent facultatifs (`drop not null`). `null` signifie désormais explicitement « aucun essai commercial ». Une contrainte `subscriptions_trial_dates_together` impose que les deux dates soient renseignées ensemble ou absentes ensemble. |
| Création d'espace | `routes/auth.ts` ne construit plus de SQL : elle appelle `createInitialSubscription(client, orgId)`. |
| `subscriptionState()` | Réutilise **le même** `createInitialSubscription` : plus aucune divergence possible entre les deux chemins. |
| Facturation | Sans Stripe : statut `no_billing`, dates d'essai nulles, accès complet, aucune échéance (voir la section suivante). Avec Stripe : essai `trialing` de 60 jours, avec fenêtre de conservation de 120 jours. Un seul insert `trialing` subsiste dans tout le service. |
| Consommateurs | `plugins/auth.ts` tolère `trial_ends_at` nul (`trialEnded` explicite) ; `subscriptionState` calcule `trialEnd = 0` si la date est absente. `admin.ts`, `business.ts` et l'interface (`account.js`, qui n'affiche l'encart d'essai que pour `trialing`) étaient déjà compatibles. |
| Tests | Nouveau contrat statique `signup-subscription-schema.contract.test.mjs` (ajouté à `test:smoke`) et nouveau test d'intégration PostgreSQL `signup-subscription.postgres.integration.test.mjs` (sans Stripe, avec Stripe, `subscriptionState` sans abonnement préexistant, et **abonnement payant existant inchangé**). Le contrat de parité ne valide plus la chaîne SQL fautive : il vérifie le helper partagé et la migration. |

## Amorçage administrateur — réservé au mode local

L'amorçage (le propriétaire de l'unique entreprise devient administrateur) pouvait se déclencher sur n'importe quel déploiement mono-entreprise, y compris une instance exposée. Il est désormais conditionné par `adminBootstrapAllowed()` :

| Situation | Amorçage |
| --- | --- |
| `NODE_ENV=production` (Render, instance exposée) | **toujours refusé**, y compris avec `AURION_ADMIN_BOOTSTRAP=true` |
| local / développement / test | actif par défaut |
| local + `AURION_ADMIN_BOOTSTRAP=false` | désactivé explicitement |

En production, le premier administrateur se crée volontairement : `npm run admin:create -- admin@exemple.fr` (`backend/src/create-admin.ts`), qui écrit lui-même `platform_admins` après création du compte. Aucune promotion implicite n'est possible sur une instance déployée.

Le contrôle de mode précède toute requête de promotion. L'écriture est isolée dans `insertPlatformAdmin()` : en cas d'échec (RLS, privilège, contrainte, base indisponible), l'erreur est journalisée (`[AURION] amorçage administrateur impossible (code) : accès administrateur refusé.`) et la fonction renvoie `false` — jamais d'exception, jamais de promotion supposée. `/admin/me` répond donc **403** proprement, pas 500, et aucune ligne `platform_admins` n'est créée. Le chemin idempotent (`on conflict do nothing` puis relecture) reste correct en cas de promotion concurrente.

## Statut d'abonnement honnête : `no_billing`

Un statut `active` sans formule ni période était trompeur : il s'affiche « Actif », se compte comme abonnement payant dans la console d'administration et laisse supposer une échéance. Il est remplacé par **`no_billing`** (migration 092) : « aucune facturation n'est configurée sur cette installation ». Ce n'est ni un abonnement payant, ni un essai, ni un accès expiré : accès complet, sans paiement et sans date.

| Écran / contrôle | Comportement avec `no_billing` |
| --- | --- |
| Compte (`account.js`) | Chip « Sans abonnement » et encart explicatif ; aucun encart d'essai, aucune date affichée. Les tarifs et les boutons « Souscrire » sont masqués tant qu'aucun moyen de paiement n'est configuré, au lieu d'un bouton qui échoue. Dès qu'un paiement est configuré, les offres réapparaissent. |
| Accès expiré sans paiement | L'avis ne promet plus « Vous pouvez souscrire à tout moment » alors que les offres et le bouton sont masqués : il indique qu'aucun moyen de paiement n'est configuré, qu'aucun abonnement ne peut être souscrit et invite à contacter l'éditeur. La promesse de souscription reste réservée au cas où `paymentEnabled` est vrai. Contrat de non-régression dans `signup-subscription-schema.contract.test.mjs`. |
| Accueil | `trialDaysLeft = 0` : aucune alerte d'essai, aucune échéance inventée. |
| Console administrateur | Catégorie `no_billing` dédiée et compteur « Sans facturation (accès libre) ». Ces entreprises ne sont plus comptées dans `subscribed`, `monthly`, `yearly` ni dans « sans statut classé ». |
| Écritures (`plugins/auth.ts`) | Seul un accès réellement expiré est restreint ; `no_billing` reste en écriture complète. |
| Planificateur | Ne sélectionne que `active` avec `current_period_end` : `no_billing` est ignoré, aucune expiration ne peut être fabriquée. |
| Résiliation / reprise | Refus explicite `409 NO_ACTIVE_SUBSCRIPTION` si le statut n'est ni `trialing` ni `active` ; aucun drapeau de résiliation ne peut être posé sur une absence d'abonnement. |
| Facture d'abonnement | Jointure sur `plan_code` : aucune facture émise pour `no_billing`. |
| Conversion des essais | Cohorte limitée à `trial_started_at is not null` : `no_billing` est exclu du calcul. |

La migration 092 :

1. remplace la contrainte de statut par une liste incluant `no_billing` (l'ancienne contrainte est retrouvée par son contenu, quel que soit son nom) ;
2. convertit uniquement les lignes synthétiques de la 15.4.38 — `active`, sans formule, sans aucune date, sans fournisseur. Un véritable abonnement Stripe/virement porte une formule et une période : il n'est jamais touché ;
3. supprime le défaut `now()` de `trial_started_at`, pour qu'une insertion sans essai reste bien `null/null` au regard de la contrainte de solidarité de la migration 091.

## Relecture du diff 15.4.37

- **Navigation centralisée** : les libellés, icônes et règles de visibilité vivent désormais dans `assets/js/core/navigation.js`. `dashboard.js` ne duplique plus la liste du menu ni le cas spécial « Catalogue métier » ; `navigate()` ne fixe plus deux fois la vue demandée et ne réaffiche plus une vue dépassée par une navigation plus récente.
- **Amorçage administrateur** : `adminBootstrapAllowed()` se limite à deux règles — production toujours refusée, `AURION_ADMIN_BOOTSTRAP=false` pour désactiver en local. Les alias `0`/`off`/`no`/`non` ont été retirés. `isAdmin()` accepte un runner et une autorisation injectables pour être testé sans base réelle.
- **Tests** : la navigation et l'amorçage admin sont maintenant testés par comportement (visibilité du menu, promotion unique, refus en production) au lieu de régexer le source ; les contrôles de chaînes supprimés ne vérifiaient que la forme du code. Le test de parité est renommé `local-parity-15.4.37.contract.test.mjs`.
- `npm run test:smoke` : **137/137** ; contrats ciblés navigation / amorçage / parité : **21/21**.

## Audit des six domaines — écarts restants

Audit mené dans le code, pas seulement dans l'interface. Chaque point ci-dessous est soit déjà couvert par un contrat, soit corrigé dans cette version.

| Domaine | Constat | État |
|---|---|---|
| Comptabilité | `monthlyAccounting()` additionnait `mileage_total` quel que soit `mileage_mode`. En mode « marge », ce montant est le coût interne du déplacement (taux interne) et n'est jamais inscrit sur la facture. Dans `accounting-report.ts`, seul `estimateDocumentContributions` filtrait `client_price` ; le détail PDF et l'export CSV affichaient encore `mileage_total` brut pour les deux modes. Le KPI et les exports étaient donc incohérents. | **Corrigé** : règle unique `mileageAccounting()` ; le KPI, le PDF et le CSV ne retiennent que `client_price` comme frais facturés. Le CSV expose aussi `Mode km` et `Frais km internes` ; en mode `margin`, le coût interne n'entre qu'une fois dans les coûts directs et jamais dans les frais facturés. |
| Comptabilité | Part imputée au mois, achats HT/TVA, notes de frais, provision sur encaissements HT, encaissements et TVA encaissée : formules vérifiées et déjà couvertes par `accounting-engine-coherence`. | Déjà correct |
| Prévisionnel | Le modèle est testé (1 000 − 530 = 470), mais le tableau mélangeait des entrées/coûts TTC et une provision HT sans l'indiquer, et le solde ne mentionnait pas la TVA collectée à reverser. | **Libellés corrigés** : « Sorties estimées (TTC + provision HT) », « Solde estimé (avant TVA à reverser) », phrase de méthode. Aucun calcul modifié. |
| Conversion | Une facture créée depuis un devis conservait le `sent_at` du devis. Elle pouvait donc être considérée comme envoyée sans l'avoir été : SAV ouvert, relances programmées, document présenté comme envoyé. | **Corrigé** : `sent_at=null` à la conversion ; seul un envoi réel (e-mail ou action explicite) le renseigne. Totaux et lignes du devis restent inchangés. |
| Compteurs admin | `no_billing` est compté dans « Sans facturation » et exclu des payants (correctif précédent) ; la cohorte de conversion exclut les comptes gratuits et les lignes sans essai. Aucun autre écart de calcul trouvé. | Déjà corrigé / conforme |
| Fiche client | « Temps Aurion » affichait « 0,0 min » et « Temps mesuré » sans aucune session terminée, alors que l'estimation n'est plus utilisée. Les documents annulés/refusés apparaissaient dans l'historique sans statut, alors que les KPI les excluent. | **Corrigé** : compteur de sessions, affichage « — / Aucune session terminée », mention « Annulé »/« Refusé ». |
| Fiche client | Factures émises TTC, payé, restant dû, devis en attente : formules vérifiées, annulés/rejetés exclus des totaux. | Déjà correct |
| Libellés | Accueil : « CA HT du mois » affichait en réalité des encaissements ; comptabilité mensuelle : « CA encaissé HT ». | **Corrigés** : « Encaissements HT du mois » (paiements reçus), « Encaissements HT ». |

Aucun autre écart de calcul n'a été identifié dans ces six domaines. Les limites restantes sont des limites de vérification, pas des écarts connus : pas de navigateur ni de serveur PostgreSQL 17 réel ici, et migrations 091/092 à appliquer avant déploiement.

## Pré-vol Google étendu

`backend/scripts/check-integrations.mjs` va désormais au-delà du format du `client_id` : lorsqu’un jeton de test est fourni, il exécute un vrai rafraîchissement OAuth puis des lectures Google réelles, sans créer d’objet.

| Contrôle | Comportement |
| --- | --- |
| Diagnostic par environnement | `--local`, `--staging`, `--production` comparent des fichiers `.env` et listent les **noms** de variables manquantes (secret, URI, clé de chiffrement, `APP_BASE_URL` en production), sans afficher aucune valeur. |
| Refresh token réel | `GOOGLE_PREFLIGHT_REFRESH_TOKEN` est échangé contre un access token ; le jeton, le secret client et la réponse Google ne sont jamais journalisés. Un refresh révoqué, un client refusé ou une panne réseau donnent un message lisible. |
| Scopes | Vérification de `gmail.send` + `calendar` pour Gmail/Agenda et de `drive.file` pour Drive ; `openid/email/profile` sont signalés en avertissement. Les scopes manquants bloquent la liste des calendriers ou le quota concerné. |
| Calendriers | `calendarList.list` liste les calendriers accessibles (nom, principal, rôle) sans identifiant, et vérifie que `GOOGLE_CALENDAR_ID` est présent. |
| Quota Drive | `about.get?fields=storageQuota` affiche utilisé/limite, pourcentage et niveau selon `AURION_CLOUD_QUOTA_THRESHOLDS` ; un quota `full` est bloquant, les seuils intermédiaires sont des avertissements. |
| Jeton Drive distinct | `GOOGLE_PREFLIGHT_DRIVE_REFRESH_TOKEN` permet de tester le quota quand le jeton principal ne porte pas `drive.file`. |

Le contrôle réel n’est exécuté que si le jeton est fourni ; sinon le pré-vol l’indique explicitement (`NON TESTÉ`) et ne prétend pas avoir vérifié Google. `--google-live` exige le contrôle et sort en erreur s’il ne peut pas être exécuté. Les commandes et l’obtention d’un jeton de test sont documentées dans `docs/GOOGLE-CONFIGURATION.md`.

## Vérifications exécutées

- **Reproduction sur un vrai moteur PostgreSQL** (PGlite 0.5.17, PostgreSQL 18.7) avec le schéma exact de la migration 009 : l'insertion 15.4.37 échoue bien en **23502**. Après application de la migration 091 livrée, le code compilé (`dist/services/account.js`) crée : sans Stripe `no_billing` + dates nulles ; avec Stripe `trialing` à 60 jours. Une date d'essai isolée est refusée en 23514 ; la création est idempotente.
- **Migration 092 sur le même moteur PostgreSQL réel** : avant migration, `no_billing` est refusé (23514) ; après, la ligne synthétique `active` de la 15.4.38 est convertie en `no_billing`, un abonnement payant réel (`monthly` + période + fournisseur) reste inchangé, `no_billing` est accepté, et le code compilé crée bien `no_billing` sans formule ni date.
- **Répétition 091/092 sur une base pré-091** (PostgreSQL 18.7 embarqué, 87 migrations jusqu'à 090) : 091 accepte l'insertion `active` sans dates sans toucher au payant ni à l'essai existants ; 092 convertit la seule ligne synthétique, laisse le payant et l'essai intacts, accepte `no_billing` et supprime le défaut `now()` de `trial_started_at`.
- **Test d'intégration `signup-subscription.postgres.integration.test.mjs`** : **4/4** sur PostgreSQL 18.7, exécuté avec le rôle runtime `aurion_runtime` soumis à RLS. Le nouveau cas vérifie qu'un abonnement `active` avec `plan_code`, période et identifiants Stripe reste strictement inchangé après `subscriptionState()`, et n'est pas converti en `no_billing`.
- **Scénario doré `financial-golden-scenarios.postgres.integration.test.mjs`** : **1/1** sur PostgreSQL 18.7. Il vérifie maintenant l'export CSV en plus du KPI : `Frais km` = **78 €** pour la facture `client_price`, **0 €** pour la facture `margin` dont le coût interne de **50 €** apparaît séparément, `€/km` = **0,65** côté client et **0,50** côté interne, et `Achats HT` = **200 €** pour cette dernière (aucun double comptage). Le même scénario génère réellement le PDF comptable.
- **Requête de détail du PDF** : le rendu réel a révélé une parenthèse excédentaire dans l'imbrication `json_agg` / `json_build_object` (erreur PostgreSQL `42601`, position 890), jusqu'ici silencieusement ignorée par l'export ZIP. La requête est corrigée et couverte par la génération PDF du scénario doré.
- `npm --prefix backend run build` et `typecheck` : OK.
- Amorçage administrateur, sur le même moteur PostgreSQL réel : production + `AURION_ADMIN_BOOTSTRAP=true` → refus ; local sans variable → amorçage ; local + `false` → refus ; insertion réelle → promotion ; seconde tentative → idempotente ; insertion refusée par un trigger `42501` → `false`, aucune ligne, avertissement journalisé, aucune exception.
- `npm run test:google-preflight` : **13/13** sur un faux serveur Google local (refresh, `invalid_grant`, scopes, calendriers, quota, jeton Drive distinct, diagnostic CLI par environnement, absence de fuite de secrets). Ces tests couvrent le protocole HTTP et les décisions, pas un appel réel à Google : le réseau Google réel reste à vérifier avec un refresh token de test.
- **Intégration conversion devis → facture / kilométrage** : nouveau test `quote-invoice-mileage.postgres.integration.test.mjs`, **1/1** sur PostgreSQL 18.7 embarqué, via les routes Fastify réelles. Un devis portant un `sent_at` non nul est converti en facture et relu avec `sent_at = null` ; deux factures au même kilométrage (une en `client_price`, une en `margin`) sont payées, et `GET /accounting/summary` ne totalise que le kilométrage `client_price` (10 €, pas 20 €).
- `npm run test:smoke` : **169/169** (dont `google-preflight.test.mjs` 13/13, `admin-bootstrap-gate.contract.test.mjs` 6/6, `navigation.test.mjs` 6/6, le contrat de schéma d'abonnement `no_billing` et d'avis d'accès expiré, le doctor de parité et les nouveaux contrôles d'audit).
- Contrats ciblés (schéma d'abonnement, parité 15.4.37, amorçage admin, fusion 15.4.35, modale d'abonnement) : **35/35** ; fusion seule : 16/16.
- Audit des six domaines : comptabilité/prévisionnel/libellés **20/20**, conversion devis → facture **5/5**.
- Relecture du diff 15.4.37 : navigation / amorçage admin / parité **21/21**.
- `npm run test:frontend` : 45 fichiers vérifiés, 44 modules avec imports/exports validés.
- `npm run lint:frontend` : OK.
- `node tools/build-web-dist.mjs` et `npm run sync-pricing` : OK (`dist-web` en 15.4.38).
- Versions harmonisées 15.4.38 : manifestes, lockfiles, `VERSION.txt`, `sw.js`, `index.html`, `README.md`.

## Limites de cette préparation

- Le test d'intégration PostgreSQL a été exécuté ici sur PostgreSQL **18.7 embarqué** avec le rôle runtime et RLS, pas sur le service PostgreSQL **17** de la CI. La CI doit confirmer le même résultat sur sa version 17.
- Aucun navigateur : le parcours complet (inscription → connexion → espace → tableau de bord) n'a pas été cliqué ici. Il reste à valider sur l'installation locale et sur Render après déploiement.
- Google Agenda/Drive exigent toujours des identifiants OAuth propres à l'installation (configuration, pas code).

## Paquet source et secret Android

L'archive **exclut désormais** `android/keystore.properties`, `android/keystore/`, `*.jks`, `*.keystore` — en plus de `.env*`, `node_modules`, `dist`, `storage`, `dist-artifacts` et des archives existantes. `.gitignore` couvre également ces fichiers.

**Action requise de votre côté :** `android/keystore.properties` contenait des valeurs non vides (mot de passe de keystore et de clé de 24 caractères) et figure dans l'archive 15.4.37 diffusée. Si cette archive a circulé hors de votre environnement privé, **régénérez le keystore de signature Android et ses mots de passe**, puis mettez à jour `android/keystore.properties` localement (jamais versionné).

## État des environnements

- GitHub `main` : **15.4.35** (`48326b1`), inchangé — aucun commit ni push effectué.
- Render `aurion` : **15.4.35** en ligne.
- Cette archive : **15.4.38**, non déployée. L'échec d'inscription décrit ne peut donc provenir que d'une installation locale de la 15.4.37 : le code de la 15.4.35 déployée renseigne toujours les deux dates d'essai à l'inscription.

## Après déploiement

1. Appliquer les migrations (dont 091) : `npm run migrate` / `node dist/migrate.js` selon la procédure d'exploitation.
2. Créer un espace sur une instance sans `STRIPE_SECRET_KEY`, puis sur une instance avec clé de test : statut `no_billing` sans essai dans le premier cas, `trialing` 60 jours dans le second. Vérifier que Compte affiche « Sans abonnement » sans tarifs ni bouton de souscription, et que la console admin le compte dans « Sans facturation ».
3. Vérifier le parcours complet et l'absence d'encart d'essai sur l'installation locale.
