# Rapport de livraison — Aurion 15.4.1

Date : 13 novembre 2026. Base : archive `aurion-15.4.0_V2.zip` (version déclarée 15.4.0). Version livrée : **15.4.1**.
Ce rapport recense les blocs exécutés, les fichiers touchés, les migrations, les tests réellement exécutés avec leurs commandes et résultats exacts, les anomalies rencontrées, les corrections de documentation et les limites restantes. Rien n'est déclaré « fonctionnel » sans vérification exécutée. Aucun push GitHub ni déploiement Render n'a été effectué (livraison par archive ZIP, conformément au cahier des charges).

## 1. Environnement de vérification

| Élément | Valeur |
|---|---|
| Node.js | v24.22.2 (exigence ≥ 22.16.0) |
| Dépendances | `npm ci --prefix backend --include=dev` sur le fichier de verrouillage, argon2 natif vérifié (hachage + vérification) |
| PostgreSQL | 18.6 réel (embarqué), base `aurion_test` dédiée, rôles distincts : `aurion_test` (migration, propriétaire), `aurion_runtime` (applicatif), `aurion_admin_app` (administration) |
| Navigateur | Chromium 141 headless via Playwright 1.56.1 |
| Mode de validation | `node tools/verify-b0-baseline.mjs` avec `AURION_BASELINE_STRICT=1` |

## 2. BLOC 1 — CI fiable, baseline et qualité de build

**Objectif** : pipeline honnête, reproductible, strict, sans échecs historiques masqués.

### Constat initial (exécution réelle)

- `npm run build` et `npm run typecheck` : **réussis** dès la première exécution dans un environnement complet — le « build/typecheck non confirmé » du rapport 15.4.0 était bien environnemental.
- Suite complète : **326 tests, 326 réussis, 0 échec** — les 15 échecs rapportés en 15.4.0 et les 18 échecs de la baseline 15.3.20 sont **tous résolus** dans cette archive.
- `npm run check` échouait avant les tests smoke sur **une erreur ESLint réelle** : `renderRegistryPreview is not defined` (`assets/js/pages/dash/settings.js`).
- Le test navigateur échouait sur le parcours d'inscription : il attendait **l'ancien parcours à 3 étapes** (`#company`, `#detect-config`, `#finish-config`) alors que la 15.4.0 a livré le parcours en **8 étapes** (contrat documenté dans `docs/PARCOURS-15.4.0.md`).

### Corrections apportées

| Fichier | Correction |
|---|---|
| `assets/js/pages/dash/settings.js` | Le bouton « Réinitialiser » de la fiche entreprise appelait `renderRegistryPreview()` non défini (le code restait bloqué à ce stade) ; comportement correct rétabli : effacement de l'aperçu du registre, identique au reste du parcours. |
| `assets/js/pages/dash/settings.js` + `assets/css/app.css` | Aperçu de signature : attribut `style` inline (rejeté par la CSP `style-src 'self'`, constaté en erreurs console) remplacé par la classe `.pre-wrap-anywhere`. |
| `backend/tests/frontend-browser.e2e.mjs` | Réécrit pour le parcours 8 étapes réel (Vous → Entreprise → Activité → Logo → Messagerie → Signature → Documents → Récapitulatif), avec diagnostic par étape. Décision documentée : le contrat métier a évolué en 15.4.0 ; le test suit le nouveau contrat sans affaiblissement (toutes les étapes sont traversées jusqu'au tableau de bord). Le bruit console attendu de la sonde `/admin/me` (403 pour un compte non administrateur, géré par le front) est filtré précisément avec justification en commentaire. |

### Vérification du workflow CI

- `.github/workflows/aurion-ci.yml` : le YAML est **valide** (parsing vérifié ; un artefact d'affichage avait fait croire à un en-tête cassé lors d'une analyse précédente — la mention initiale de « CI cassée » était une erreur d'interprétation, corrigée ici). Les étapes existantes (rôles séparés, migrations, baseline stricte, artefact source) sont conformes.
- Ajouts : rôle `aurion_admin`/`aurion_admin_app` créé en CI, `AURION_ADMIN_DATABASE_URL` fourni aux étapes migrations et validation, **audit npm explicite** (`npm audit --omit=dev --audit-level=high`) distinct de l'installation `--no-audit`.

### Résultat final (mode STRICT)

```
- OK — Smoke : 0 échec(s) de référence, aucun nouveau ; résolus depuis B0 : 7.
- OK — npm run check : toutes les commandes incluses ont réussi.
- OK — Régression complète : 0 échec(s) de référence, aucun nouveau ; résolus depuis B0 : 18.
Échecs smoke observés : 0
Échecs suite complète observés : 0
Conclusion : VALIDATION BASELINE B0 (mode STRICT)
```

## 3. BLOC 2 — Isolation multi-tenant par RLS PostgreSQL

**Objectif** : protéger les données entre organisations au niveau de la base, en complément des filtres applicatifs existants (433 références `organization_id` comptées dans le backend, toutes conservées).

### Conception (détaillée dans `docs/SECURITE-RLS.md`)

- **Migration `074_multi_tenant_rls.sql`** (additive, idempotente, rejouée intégralement sur base neuve) : `ENABLE ROW LEVEL SECURITY` + politique `tenant_isolation` (`USING` + `WITH CHECK`) sur **61 tables** : 54 portant `organization_id` + 7 liées via leur table mère.
- **Contexte tenant transactionnel** `SET LOCAL app.current_organization` : disparaît au COMMIT/ROLLBACK, aucune contamination du pool ; **échec fermé** sans contexte.
- **Propagation** : enveloppe AsyncLocalStorage du cycle de vie HTTP (y compris `app.inject` pour les tests, vérifié empiriquement), inscription par le plugin d'authentification, `withTenant`/`applyTenant`/`withClientTenant`/`beginTenant` pour inscription, invitation VIP, callbacks OAuth, services appelés hors requête.
- **Pool d'administration** (`AURION_ADMIN_DATABASE_URL`, rôle `aurion_admin`) : seul chemin inter-entreprises (console admin, travaux planifiés, webhook Stripe), **journalisé** dans `platform_admin_access_log`, inaccessible au rôle applicatif. Sans configuration : refus explicite 503, jamais de données vides.
- **Triggers de synchronisation** (`touch_account_sync`, `aurion_bump_*`) : `SECURITY DEFINER` avec `search_path` verrouillé (ils incrémentent `account_sync_versions` lors de créations d'organisation, hors contexte tenant).

### Anomalies découvertes et corrigées pendant le bloc (tests pilotés)

1. L'**inscription** créait l'activité et l'abonnement d'essai sans contexte tenant → erreur 500 sous RLS (constaté par les tests Fastify inject) → `applyTenant` après création de l'organisation.
2. Idem pour l'**invitation VIP** et `subscriptionState` (appelé à la connexion).
3. Les **grants du rôle admin** précédaient la création de la table d'audit dans la première rédaction de la migration → ordre corrigé + privilèges par défaut pour les tables futures (la protection de checksum des migrations a correctement refusé la modification d'une migration appliquée ; base de test réinitialisée et chaîne complète rejouée).
4. `app.inject()` n'emprunte pas le listener HTTP : le contexte tenant était absent des tests injectés → enveloppe du dispatch via `light-my-request` (déclaré en dépendance directe), comportement `ready()` de Fastify reproduit.

### Tests d'isolation exécutés (rôle applicatif, PostgreSQL réel)

`backend/tests/tenant-isolation.rls.test.mjs` — **7/7 réussis** :
1. politiques présentes sur les 61 tables ;
2. le rôle applicatif n'est ni superuser, ni propriétaire, ni BYPASSRLS ;
3. organisations A/B : lecture croisée, modification, suppression, recherche et tables de jointure — aucune fuite, données de B intactes, écriture croisée refusée par `WITH CHECK` ;
4. sans contexte : échec fermé (zéro ligne, insertion refusée même avec un `organization_id` valide) ;
5. tenant falsifié et connexions recyclées du pool : aucune fuite ;
6. pool d'administration : accès inter-entreprises journalisé, journal protégé en écriture contre le rôle applicatif ;
7. contrôles statiques de propagation du contexte dans le code source.

### Non-régression

- Suite complète : **333/333 tests réussis** (326 d'origine + 7 nouveaux), 0 ignoré, sous RLS active, rôle applicatif.
- Parcours navigateur E2E complet sous RLS : inscription immédiate, parcours d'accueil 8 étapes jusqu'au tableau de bord, navigation entre 9 vues, déconnexion et reconnexion, aucune erreur console.

### Limites documentées

- Tables d'identité (accès pré-tenant par conception : `users`, `organizations`, `organization_members`, `native_sessions`, états OAuth…) hors RLS ; protégées par les contrôles applicatifs existants.
- `supplier_parts` : isolation par fournisseur ; une référence `part_id` croisée reste possible côté intégrité référentielle (aucune fuite de données).
- Coût transactionnel par requête tenant (BEGIN/SET LOCAL/COMMIT) : à surveiller en charge.
- Réactivation de la vérification e-mail (062) : non traitée ici (décision 15.2.50 ; réactivation progressive exigée par le cahier des charges, bloc 17 complet).

## 4. BLOC 6 — Documentation fidèle au code

| Document | Constat vérifié | Correction |
|---|---|---|
| `docs/CGU-CGV.md` | Décrivait le mode IA/Ollama `qwen3.5:4b-q4_K_M` comme actif | Remplacé par la mention factuelle du retrait (15.4.0) ; aucune route `/ai/*` n'existe dans le code (vérifié) |
| `docs/POLITIQUE-CONFIDENTIALITE.md` | Décrivait l'IA locale Ollama comme fonctionnalité | Idem ; mention Drive personnel ajoutée (réalité 15.4.0) |
| `docs/ARCHITECTURE-PRODUCTION.md` | Mentionnait React/Vite, Redis, « IA / outils » actifs | Aligné : interface JavaScript vanilla sans build servie par Fastify, PostgreSQL avec RLS, stockage objet privé ; section IA conservée comme garde-fou pour toute réintroduction |
| `docs/SECURITY.md` | Listait comme « manquantes » des mesures déjà implémentées (passkeys, récupération de compte, CSP, S3, cookies Secure…) | Reclassées en **quatre états** (implémentée et testée / partielle / absente / non vérifiée) avec preuves, emplacements et date de contrôle |
| `docs/SECURITE-RLS.md` | — | **Nouveau** : architecture RLS, déploiement du rôle admin, périmètre, limites |
| `README.md`, `CHANGELOG-15.4.0.md`, `VERSION.txt` | — | Version 15.4.1, résumé des nouveautés |

## 5. BLOC 17 (partiel) — Dépendances et migrations

- **Dependabot** configuré (`.github/dependabot.yml`) : npm backend (hebdomadaire, correctifs+mineurs regroupés, 5 PR max) et GitHub Actions (mensuel), revue humaine exigée.
- **Audit npm en CI** : `npm audit --prefix backend --omit=dev --audit-level=high` — **réussi** (0 high/critical ; 1 moderate sur `glob`, transitive via `@fastify/static`, documentée ; le correctif forcerait une version hors plage déclarée : à traiter par Dependabot avec revue).
- **Préfixes dupliqués 042/044** : la détection existe déjà dans `migrate.ts` (avertissement à chaque exécution, constaté) ; aucune renumérotation (migrations déjà appliquées — conformément au cahier des charges).
- **Migration 062** (retrait de la vérification e-mail, 15.2.50) : auditée ; elle opère bien un retrait global et non un simple mode test. La réactivation progressive reste un travail ultérieur (bloc 17 complet) : elle exige renvoi de lien, expiration, reprise des comptes non vérifiés et assistance, sans verrouiller les comptes existants.
- `light-my-request@6.8.0` déclaré en dépendance directe (utilisé par l'enveloppe tenant de `app.inject`).

## 6. Tests exécutés — commandes et résultats exacts

| Commande | Résultat |
|---|---|
| `npm ci --prefix backend --include=dev --no-audit --no-fund` | installation complète depuis le verrouillage ; argon2 natif vérifié |
| `npm run build` | **réussi** (tsc) |
| `npm run typecheck` | **réussi** (0 erreur) |
| `npm run migrate` (rôles migration/runtime séparés, PostgreSQL 18.6) | **71 migrations appliquées** (001→074) sur base neuve ; idempotence vérifiée par ré-exécution |
| `node --test backend/tests/tenant-isolation.rls.test.mjs` | **7/7 réussis** |
| `npm --prefix backend test` (suite complète) | **333 tests, 333 réussis, 0 échec, 0 ignoré** |
| `npm run test:browser` (Playwright, Chromium 141) | **réussi** : parcours 8 étapes, 9 vues, aucune erreur console |
| `npm run lint:frontend` | **réussi** (0 erreur) |
| `node tools/verify-b0-baseline.mjs` (`AURION_BASELINE_STRICT=1`) | **VALIDATION BASELINE B0 — mode STRICT, code 0** |
| `npm audit --omit=dev --audit-level=high` | **réussi** (0 high/critical) |

## 7. Fichiers touchés (récapitulatif)

**Backend (src)** : `db.ts` (contexte tenant, pool admin, journalisation), `app.ts` (enveloppe ALS + inject), `plugins/auth.ts` (inscription du tenant), `config.ts` (`AURION_ADMIN_DATABASE_URL`), `migrate.ts` (REVOKE journal admin), `routes/auth.ts` (applyTenant inscription + VIP), `routes/account.ts` (webhook Stripe pool admin, checkout beginTenant), `routes/business.ts` (beginTenant ×4), `routes/admin.ts` (adminQuery + journal), `routes/integrations.ts`, `routes/cloud.ts` (callbacks withTenant), `services/account.ts` (beginTenant, subscriptionState withTenant), `services/cloud-drive.ts` (withClientTenant), `services/scheduler.ts` (adminQuery + withTenant).

**Migrations** : `074_multi_tenant_rls.sql` (nouvelle).

**Frontend** : `assets/js/pages/dash/settings.js` (2 corrections), `assets/css/app.css` (1 classe).

**Tests** : `frontend-browser.e2e.mjs` (parcours 8 étapes), `tenant-isolation.rls.test.mjs` (nouveau), `cloud-storage.integration.test.mjs`, `expense-reports.integration.test.mjs`, `stripe-billing.integration.test.mjs`, `account-sync-migration-057.test.mjs`, `deletion-workflows.test.mjs`, `regression-devis-facture-calculs.test.mjs` (adaptés au contexte tenant — sans aucun affaiblissement d'assertion).

**CI / configuration** : `.github/workflows/aurion-ci.yml` (rôles admin, audit, variables), `.github/dependabot.yml` (nouveau), `backend/package.json` (+light-my-request), `backend/.env.example`, `render.yaml` (secret `AURION_ADMIN_DATABASE_URL`).

**Documentation** : `docs/SECURITE-RLS.md` (nouveau), `docs/SECURITY.md`, `docs/ARCHITECTURE-PRODUCTION.md`, `docs/CGU-CGV.md`, `docs/POLITIQUE-CONFIDENTIALITE.md`, `README.md`, `CHANGELOG-15.4.0.md`, `VERSION.txt`.

## 8. Limites restantes et blocs non exécutés

- **Blocs 3 à 5 (facturation électronique)** : non exécutés dans cette livraison. Le JSON interne existant (`electronic-invoice.ts`) reste un modèle interne et n'est présenté nulle part comme conforme Factur-X/UBL/CII ; aucune fausse déclaration de conformité n'a été introduite. La réception (bloc 3) est le prochain chantier prioritaire (socle PA, adaptateur isolé, webhooks authentifiés, idempotence).
- **Blocs 7 à 16, 18 à 20** : non exécutés (micro-entreprises, cotisations, bordereaux, accents, Windows, champs, popups, migrations complètes, cryptographie, Render/GitHub, validation globale finale).
- **Vérifications externes non possibles ici** : statut réel de la PR #34 et des branches GitHub (aucun accès réseau au dépôt), OAuth Google réel (pas d'identifiants), déploiement Render.
- La suite reste verte sur PostgreSQL 18 ; la CI utilise PostgreSQL 17 (image `postgres:17-alpine`) — les deux versions acceptent l'intégralité des migrations.
