# AURION 15.4.52 → 100 % commercialisable : prompt maître de configuration finale

> Document d'exécution unique. Il se compose d'un **PRÉAMBULE COMMUN** (à préfixer à chaque
> prompt avant transmission) et de **12 prompts autoportants (G1 à G12)** qui couvrent la
> totalité de ce qui reste après la 15.4.52 : infrastructure, déploiement, recettes,
> supervision, messagerie, paiements, SSO, publication légale, e-facturation, qualité,
> publication publique et pilote client. Chaque prompt peut être transmis tel quel à un agent
> (ou suivi pas-à-pas par l'éditeur dans les consoles) : il contient ses dépendances, ses
> fichiers cibles vérifiés dans le dépôt, ses étapes numérotées, ses preuves attendues et son
> critère d'acceptation. Toutes les références ci-dessous ont été vérifiées dans l'archive
> 15.4.52 le 23 novembre 2026.

**Livrable visé** : passer de l'état 15.4.52 (produit fonctionnel et testé, go/no-go encore
fermé) à **100 % « ouvert à la commercialisation »**, tel que défini dans
`docs/GO-LIVE-15.4.51.md` : restauration prouvée, publication légale validée, Stripe testé de
bout en bout, pilote 10 clients conclu.

---

## ÉTAT DE DÉPART — vérifié dans l'archive 15.4.52 (ne pas refaire)

Ce qui est **FAIT** (code + tests, preuve dans `CHANGELOG-15.4.52.md` et
`RAPPORT-LIVRAISON-15.4.52.md`) :

- Correctifs runtime 15.4.52 : exécuteur SQL sur 7 routes, `Content-Type` dans `authFetch`,
  création de chantier (schéma null-tolérant, garde FK, message exact), comptes catalogue
  cohérents (`{added, alreadyPresent, totals}` + journal `catalog_enriched`), détection
  automatique depuis les documents émis, cycle de vie chantier (`PATCH /chantiers/:id`).
- Phases A→D de la série précédente : recettes/`db:backup`/`db:restore:drill`,
  `backup-nightly.mjs`, alertes lettres mortes (`AURION_OPS_ALERT_EMAIL`),
  `/health` enrichi, mentions bloquantes à l'émission, documents contractuels 5.0 rédigés.
- Suite : **732 tests — 647 pass, 16 échecs préexistants, 69 skip** (liste exacte en
  annexe B) ; lint et check-frontend verts ; 21/21 sondes HTTP réelles ; parcours navigateur
  complet validé (création chantier, statut, suggestions catalogue, contrat d'entretien,
  portail public).
- Documentation opérationnelle déjà rédigée : `docs/DEPLOIEMENT-RENDER.md`,
  `docs/MIGRATION-RENDER-OVH.md`, `docs/POSTGRES-ROLES.md`, `docs/INFRA-OVH-COUTS.md`,
  `docs/CONFIGURATION-STRIPE.md`, `docs/GOOGLE-CONFIGURATION.md`,
  `docs/AUTH0-CONFIGURATION.md`, `docs/CLOUD-STOCKAGE-15.4.0.md`,
  `docs/PLATEFORME-AGREEE.md`, `docs/RUNBOOK-PRODUCTION.md`,
  `docs/EXPLOITATION-SUPPORT.md`, `docs/PREPARATION-PLAY-STORE.md`,
  `docs/CONTRAT-PILOTE.md`, `docs/PILOTE-SUIVI.md`, `docs/TARIFS-ABONNEMENT.md`,
  `docs/REGISTRE-TRAITEMENTS.md`, `docs/SOUS-TRAITANTS.md`, `docs/CHECKLIST-PRE-PRODUCTION.md`.
- Démo rejouable : `npm --prefix backend run db:demo` (garde-fou anti-production).

Ce qui reste est **exclusivement** : des opérations console (`BLOQUÉ-éditeur`), des recettes
à exécuter sur des services réels (`NON FAIT`), la correction des 16 échecs de tests, la
publication publique et le pilote. Le tracker à tenir à jour est
`docs/GO-LIVE-15.4.51.md` (créer `docs/GO-LIVE-15.4.52.md` en le copiant au démarrage de G1).

---

## §0. PRÉAMBULE COMMUN — à préfixer à CHAQUE prompt avant transmission

```
Tu interviens sur AURION 15.4.52, application de gestion d'affaires pour TPE du bâtiment,
de l'artisanat et des services à domicile en France (entreprises déjà existantes uniquement).
Aucune IA, aucun LLM, aucune prédiction dans le produit : règles explicites, calculs
déterministes, événements, seuils et validation humaine. La branche main reste protégée ;
la CI (.github/workflows/aurion-ci.yml) valide build + typecheck + tests avant merge.

RÈGLES INVARIANTES (série « 70 vers 100 », inchangées) :
1. AUDIT FACTUEL PRÉALABLE : vérifie chaque référence de fichier et de variable avant
   d'agir ; les numéros de ligne peuvent avoir bougé depuis la 15.4.50.
2. MIGRATIONS ADDITIVES UNIQUEMENT ; idempotentes ; jamais de données métier en migration.
3. TESTS AVANT/APRÈS : suite complète avant et après (référence 15.4.52 : 732 tests,
   647 pass, 16 échecs préexistants listés en annexe B, 69 skip). 0 régression, nouveaux
   tests verts, typecheck vert. Les 16 échecs ne se « corrigent » qu'au prompt G9.
4. JAMAIS DE VALEUR INVENTÉE : SIRET, IBAN, domaines, comptes console, prix, adresses —
   toute information manquante est demandée à l'éditeur ou marquée BLOQUÉ-éditeur, jamais
   fabriquée. Aucun secret dans Git ni dans un ZIP (référence : backend/.env.example).
5. STATUTS HONNÊTES : chaque item du tracker GO-LIVE est FAIT (preuve datée collée),
   NON FAIT ou BLOQUÉ-éditeur (accès console requis). Aucune case ne se coche sans preuve.
6. MULTI-TENANT : organization_id partout, zod sur les entrées, RLS respectée.
7. LANGUE : tout texte utilisateur en français ; identifiants techniques sans accents.
8. TRAÇABILITÉ : chaque prompt Gx qui touche le code produit un rapport
   RAPPORT-LIVRAISON-15.4.5x.md, met à jour CHANGELOG, VERSION.txt et les deux
   package.json à la même version ; commit atomique « 15.4.5x : <résumé> — N tests verts ».
9. VALIDATION FINALE (ordre obligatoire) : npm run build ; npm run typecheck ;
   npm --prefix backend test ; npm run test:smoke ; npm run test:frontend ;
   npm run lint:frontend. Puis ZIP de livraison vérifié hors node_modules et dist.
10. ZONE DE TRAVAIL : ne jamais modifier les fichiers upload/ ; livrables dans download/.

ÉTAT TECHNIQUE DE DÉPART : voir « ÉTAT DE DÉPART » ci-dessus (15.4.52, tout le code des
phases A→D livré). Le prochain numéro de migration est 121. La base de travail locale
existe (build/aurion-modifie/aurion) ; aucune migration nouvelle n'est attendue avant G9.
```

---

## §1. LES 12 PROMPTS DE CONFIGURATION FINALE

### G1 — Infrastructure OVH : PostgreSQL managé + rôles + Object Storage (éditeur + agent)

**Objectif.** Créer les fondations de production : base managée région UE, rôles séparés
migrateur/runtime/admin, bucket privé S3 région `de`.

**Références vérifiées.** `docs/POSTGRES-ROLES.md` (rôles et privilèges),
`docs/MIGRATION-RENDER-OVH.md`, `docs/INFRA-OVH-COUTS.md` (budget),
`docs/CLOUD-STOCKAGE-15.4.0.md`.

**Étapes.**
1. Créer le PostgreSQL managé OVH région UE ; créer les trois rôles exactement selon
   `docs/POSTGRES-ROLES.md` (admin = migrations, runtime = lecture/écriture RLS sans DDL,
   comptable de supervision si prévu).
2. Créer le bucket Object Storage privé région `de` + clés d'accès minimales (S3).
3. Consigner les références hors Git : `DATABASE_URL`, `AURION_MIGRATION_DATABASE_URL`,
   `AURION_ADMIN_DATABASE_URL`, `AURION_RUNTIME_DB_ROLE`, `AURION_S3_BUCKET`,
   `AURION_S3_ACCESS_KEY`, `AURION_S3_SECRET_KEY` (backend/.env de production, jamais Git).
4. Vérifier la jonction : `psql` avec chaque rôle ; le rôle runtime ne doit PAS pouvoir
   exécuter de DDL.

**Preuves à coller dans GO-LIVE.** Captures console datées + sortie des tests de privilèges.
**Critère d'acceptation.** Les trois rôles se connectent, le runtime est sans DDL, le
bucket rejette toute lecture publique.

---

### G2 — Déploiement Render : toutes les variables exactes + premier go vert (éditeur)

**Objectif.** Premier déploiement de production avec `/health` et `/health/db` à 200 et des
migrations appliquées puis rejouées **sans effet**.

**Références vérifiées.** `render.yaml` (variables et `sync: false`),
`docs/DEPLOIEMENT-RENDER.md`, `docs/RENDER-GITHUB.md`, garde-fous de
`backend/src/config.ts` (relevés et cités en annexe A : ils refusent de démarrer si une
variable manque — c'est la checklist vivante).

**Étapes.**
1. Connecter le dépôt GitHub au service Render (build : `npm run build`, start :
   `npm start` = migrations puis serveur).
2. Renseigner dans le tableau de bord Render (jamais dans Git) les variables
   `sync: false` de `render.yaml` : `DATABASE_URL`, `AURION_MIGRATION_DATABASE_URL`,
   `AURION_ADMIN_DATABASE_URL`, `AURION_RUNTIME_DB_ROLE`, `AURION_OPS_ALERT_EMAIL`,
   `AURION_ENCRYPTION_KEY` (+ `_VERSION`), `JWT_SECRET`, `AURION_S3_BUCKET`,
   `AURION_S3_ACCESS_KEY`, `AURION_S3_SECRET_KEY`, `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET` (quand Stripe est prêt, G5).
3. Définir les variables publiques : `NODE_ENV=production`, `HOST=0.0.0.0`,
   `COOKIE_SECURE=true`, `AURION_STORAGE_BACKEND=s3`, `APP_BASE_URL=https://<domaine>`,
   `CORS_ORIGIN=https://<domaine>`, `AURION_SUPPORT_EMAIL`, `AURION_PUBLIC_ORIGIN`.
4. Déployer ; vérifier : `GET /health` 200 avec `version`, `uptimeSeconds`,
   `outboxDeadLettered`, `lastBackupAt` ; `GET /health/db` 200.
5. Lancer les migrations via le rôle admin puis **relancer** : aucune modification (idempotence
   prouvée). En cas d'échec de démarrage, lire le message du garde-fou de config.ts : il nomme
   la variable manquante (liste complète en annexe A).

**Preuves.** Captures Render + sorties curl datées des deux endpoints de santé.
**Critère.** Deux déploiements successifs, migrations rejouées sans effet, santé verte.

---

### G3 — Sauvegardes + restauration prouvée + supervision (éditeur + agent)

**Objectif.** Prouver la capacité à restaurer (condition non négociable du go/no-go) et
activer la supervision livrée en 15.4.51.

**Références vérifiées.** `backend/scripts/backup-nightly.mjs`, scripts npm
`db:backup` / `db:restore:drill` (livrés), `docs/RUNBOOK-PRODUCTION.md`,
`docs/OBSERVABILITE.md`.

**Étapes.**
1. Sur un VPS OVH : installer le cron quotidien de `backup-nightly.mjs`
   (dump → vérification → journal JSON → copie secondaire → purge).
2. Exécuter `db:restore:drill` : dump → base jetable → les 7 vérifications fonctionnelles
   du runbook. Coller la sortie datée dans GO-LIVE.
3. Renseigner `AURION_OPS_ALERT_EMAIL` (adresse d'exploitation) ; vérifier la réception de
   l'alerte quotidienne en injectant une lettre morte de test puis en la rejouant depuis
   `/admin/outbox/dead-lettered`.
4. Créer une supervision externe sur `/health/db` (fournisseur au choix) avec alerte e-mail.
5. Vérifier `lastBackupAt` sur `/health` après la première sauvegarde réelle.

**Preuves.** Sortie du drill complet, e-mail d'alerte reçu, capture de supervision externe.
**Critère.** Restauration tracée prouvée ET alerte lettres mortes reçue ET supervision externe active.

---

### G4 — Messagerie plateforme + e-mail support (éditeur)

**Objectif.** Envoyer les e-mails transactionnels et le support avec un domaine authentifié.

**Références vérifiées.** Variables `PLATFORM_SMTP_HOST/PORT/SECURITY/USER/PASS/FROM`
(`backend/src/config.ts`), `docs/EXPLOITATION-SUPPORT.md`, `docs/EMAIL-VERIFICATION.md`.

**Étapes.**
1. Créer la boîte support (valeur d'`AURION_SUPPORT_EMAIL`) et la boîte d'envoi
   (`PLATFORM_SMTP_FROM`).
2. Configurer SMTP (port 465 SSL par défaut) ; renseigner les variables sur Render.
3. Publier SPF, DKIM et DMARC sur le domaine d'envoi (enregistrements DNS) ; vérifier avec
   un testeur externe.
4. Tester de bout en bout : inscription d'un compte de test → e-mail de vérification reçu ;
   oubli de mot de passe → e-mail reçu ; réponse au support → boîte reçue.

**Critère.** Les trois e-mails arrivent en boîte principale, SPF/DKIM/DMARC au vert.

---

### G5 — Stripe de bout en bout : test puis production (éditeur + agent)

**Objectif.** Abonnement testé en intégration réelle (checkout, webhook, activation,
facture), puis bascule en clés de production.

**Références vérifiées.** `docs/CONFIGURATION-STRIPE.md` (procédure),
`docs/TARIFS-ABONNEMENT.md` (prix unique, aucun identifiant en dur), code :
`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` obligatoires ensemble en production ;
webhook public signé `POST /payments/webhook/:token` (corps brut préservé,
`backend/src/routes/payments.ts`) ; paiements client via l'adaptateur
`AURION_PAY_PROVIDER`/`AURION_PAY_API_BASE`/`AURION_PAY_API_KEY`/`AURION_PAY_WEBHOOK_SECRET`
(facultatif : sans provider, la fonction reste désactivée proprement — ne pas l'activer
sans décision).

**Étapes.**
1. Console Stripe (mode test) : créer le produit + prix unique conformes à
   `docs/TARIFS-ABONNEMENT.md` ; créer le endpoint webhook pointant vers
   `https://<domaine>/payments/webhook/<token>` ; copier le secret de signature.
2. Renseigner `STRIPE_SECRET_KEY` (test) + `STRIPE_WEBHOOK_SECRET` (test) sur Render.
3. Exécuter le scénario complet en mode test : inscription → checkout → paiement → webhook
   reçu et vérifié → statut d'abonnement actif → facture d'abonnement générée ; puis
   annulation → statut à jour. Coller chaque preuve datée dans GO-LIVE.
4. Vérifier les cas limites livrés : essai commercial de 60 jours, résiliation/réactivation,
   aucun double comptage.
5. Bascule production : nouveaux prix live, endpoint webhook live, clés live sur Render ;
   refaire le scénario avec un paiement réel d'un euro remboursé.

**Critère.** Scénario complet vert en test ET en production, preuves collées.

---

### G6 — Google (OAuth + Drive + messagerie) et Auth0 optionnel (éditeur)

**Objectif.** Brancher les intégrations Google si choisies, avec les redirect URI exacts
garantis par les garde-fous de config.

**Références vérifiées.** `docs/GOOGLE-CONFIGURATION.md`, `docs/AUTH0-CONFIGURATION.md`,
garde-fous `backend/src/config.ts` : `GOOGLE_REDIRECT_URI` doit être **exactement**
`APP_BASE_URL/integrations/google/callback`, `GOOGLE_DRIVE_REDIRECT_URI` exactement
`APP_BASE_URL/cloud/google/callback`, `GOOGLE_TOKEN_ENCRYPTION_KEY` ≥ 32 caractères ;
Auth0 : les trois variables ensemble, redirect `APP_BASE_URL/auth/auth0/callback`.

**Étapes.**
1. Projet Google Cloud : OAuth consent screen, client web ; redirect URI exacts ci-dessus ;
   scopes minimaux (Gmail/agenda/Drive selon `docs/GOOGLE-CONFIGURATION.md`).
2. Renseigner `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_TOKEN_ENCRYPTION_KEY` (générer 32+ caractères aléatoires, hors Git).
3. Tester : connexion Google d'un compte de test, envoi d'un devis par e-mail, événement
   agenda, sauvegarde cloud Drive. 4. (Optionnel) Auth0 : créer l'application, redirect
   exact, tester la connexion SSO.

**Critère.** Chaque intégration activée est testée de bout en bout ; aucune intégration
partielle (config incomplète = refusée au démarrage, c'est voulu).

---

### G7 — Publication légale 5.0 : validation externe puis mise en ligne (éditeur + agent)

**Objectif.** Publier effectivement les documents contractuels 5.0 avec re-acceptation
versionnée — la plus grande case « conformité légale » restante.

**Références vérifiées.** Documents livrés : `docs/CGU-CGV.md`,
`docs/POLITIQUE-CONFIDENTIALITE.md`, `docs/COOKIES.md`, `docs/LEGAL-NOTICE.md`,
`docs/DPA-RGPD.md`, `docs/REGISTRE-TRAITEMENTS.md`, `docs/SOUS-TRAITANTS.md`,
`docs/MENTIONS-OBLIGATOIRES.md`, `docs/DECLARATION-ACCESSIBILITE.md`. Commande de contrôle :
`npm --prefix backend run check:legal` (elle liste les blocages un par un). Variable de
publication : `AURION_LEGAL_PUBLICATION_APPROVAL=5.0` + variables d'identité éditeur
(nom légal, SIRET, RCS, adresse, médiateur, hébergeur — toutes listées par check:legal).

**Étapes.**
1. **Validation juridique externe** des cinq documents 5.0 par un professionnel du droit
   (coût/qualité : une relecture d'avocat spécialisé e-commerce/B2B). Consigner l'avis.
2. Exécuter `npm --prefix backend run check:legal` ; compléter chaque blocage avec les
   informations réelles de l'éditeur (aucune valeur inventée).
3. Définir `AURION_LEGAL_PUBLICATION_APPROVAL=5.0` + variables d'identité sur Render ;
   redéployer.
4. Vérifier : les cinq documents servis publiquement depuis l'application, versions et
   dates affichées ; un compte existant voit l'écran de re-acceptation à la prochaine
   connexion et le journal d'acceptation se remplit.
5. Si l'activité relève d'un régime avec plateforme agréée : voir G8 (distinct).

**Critère.** check:legal sans blocage, documents servis, re-acceptation enregistrée sur un
compte réel de test.

---

### G8 — E-facturation : contrat plateforme agréée (PDP) (éditeur, externe)

**Objectif.** Décider et contractualiser la conformité e-facture (obligation 2026-2027 selon
le calendrier public), avec le flux sortant livré en code.

**Références vérifiées.** `docs/PLATEFORME-AGREEE.md` (critères de choix et calendrier),
code : `AURION_PA_PROVIDER` + `AURION_PA_WEBHOOK_SECRET` (≥ 32 caractères, obligatoire si
provider configuré), réception/accusés avec timeout `AURION_PA_OUT_TIMEOUT_MS`,
idempotence d'émission.

**Étapes.**
1. Choisir une plateforme agréée (comparaison selon PLATEFORME-AGREEE.md : coût, couverture,
   API) ; signer le contrat (démarche éditeur).
2. Obtenir les identifiants API + secret de webhook ; renseigner
   `AURION_PA_PROVIDER`, `AURION_PA_WEBHOOK_SECRET`, l'URL de webhook côté PDP pointant vers
   l'endpoint de réception livré.
3. Test d'intégration : émission d'une facture de test → accusé de réception PDP → statut
   « confirmé » dans l'interface ; cas d'échec → « issue non confirmée » + reprise avec le
   même identifiant d'idempotence (comportement livré, à vérifier en réel).

**Critère.** Une facture de test a un accusé PDP réel collé dans GO-LIVE. Tant que le
contrat n'est pas signé, la case reste BLOQUÉ-éditeur/externe (le reste du produit
fonctionne sans).

---

### G9 — Les 16 échecs de tests préexistants : qualification puis correction (agent)

**Objectif.** Passer de « 16 échecs connus » à « 0 échec ou échec qualifié environnemental
avec preuve ». C'est le seul prompt qui modifie du code pour la qualité.

**Référence.** Liste exacte en **annexe B** (noms littéraux de la suite 15.4.52). Règles :
aucun test supprimé ni édulcoré ; chaque échec est soit **corrigé** (code ou référentiel
daté, avec test), soit **qualifié environnemental** (il passe dans un environnement complet,
preuve à l'appui : par exemple cloud-storage exige un S3 réel — l'exécuter avec les clés
G1 ; les tests PostgreSQL réels avec `AURION_PG_RECIPE=1`).

**Étapes.**
1. Exécuter la suite complète et classer les 16 : environnemental (exige un service réel
   désormais disponible grâce à G1–G5) vs bug réel vs référentiel daté à mettre à jour.
2. Les environnementaux : les ré-exécuter dans l'environnement complet ; s'ils passent,
   les retirer de la liste avec preuve.
3. Les bugs réels : corriger dans les services concernés (fiscal-detection, référentiels
   2026, calibration v2, FEC/journalisation, parité locale), avec test de non-régression.
4. Objectif chiffré : **0 échec en fin de G9** (skip légitimes conservés), suite verte sur
   CI, preuve collée.

**Critère.** `npm --prefix backend test` : 0 fail ; `npm run typecheck` : 0 erreur.

---

### G10 — Recette finale de bout en bout (agent + éditeur)

**Objectif.** La preuve complète que le produit est prêt, sur l'infrastructure de G1–G5.

**Références vérifiées.** `tools/recette-e2e.sh`, `tools/recette-smoke.mjs`,
`tools/parity-doctor.mjs`, `tools/capture-public-screens.mjs`, recette PostgreSQL réelle
`AURION_PG_RECIPE=1` (concurrence numérotation, paiements concurrents, RLS, outbox, webhooks
signés, réplication), `docs/CHECKLIST-PRE-PRODUCTION.md`, `docs/RECETTE-BETA-PRIVEE.md`.

**Étapes.**
1. Sur la production de G2 : `AURION_PG_RECIPE=1` → recette PostgreSQL réelle complète.
2. `tools/recette-e2e.sh` + `tools/recette-smoke.mjs` contre l'URL de production.
3. Parcours manuel navigateur (le même que la vérification 15.4.52, sur production) :
   inscription → profil métier → catalogue → devis → facture → paiement → chantier →
   rentabilité → portail invité → journal ; vérifier la cohérence notif/compteurs du
   catalogue et les statuts chantier.
4. `tools/capture-public-screens.mjs` → jeu de captures datées pour l'argumentaire.
5. Vérifier l'accessibilité minimale (navigation clavier, contrastes) et le responsive
   mobile (375 px) sur les écrans principaux.
6. Remplir `docs/CHECKLIST-PRE-PRODUCTION.md` item par item avec les statuts et preuves.

**Critère.** Recettes vertes sur production + checklist remplie sans case « non vérifiée ».

---

### G11 — Publication publique : domaine, PWA, stores (éditeur)

**Objectif.** Être joignable publiquement sur le domaine final, installable, et présent sur
les stores si la stratégie mobile l'exige.

**Références vérifiées.** `docs/APPLICATIONS-NATIVES.md`, `docs/PREPARATION-PLAY-STORE.md`,
`capacitor.config.json` + `dist-web/` (webDir), manifeste PWA + `sw.js`
(cache-bumping `v=15.4.52-r1` à suivre à chaque livraison), landing publique existante
(`index.html`), `docs/COMMERCIAL-ARGUMENTAIRE.md` pour les textes.

**Étapes.**
1. Acheter/brancher le domaine final ; DNS → Render ; HTTPS automatique ; vérifier que
   `APP_BASE_URL`/`CORS_ORIGIN` correspondent exactement à ce domaine (garde-fous de
   config : origine racine HTTPS, sans chemin).
2. PWA : vérifier installation (manifeste, service worker, hors ligne shell) sur Chrome
   desktop et Android ; bump du cache `sw.js` si assets modifiés.
3. Android : build Capacitor selon PREPARATION-PLAY-STORE.md, Play Console (fiche,
   politique de confidentialité liant vers les documents publiés en G7, release interne →
   fermée → production). iOS : build macOS requis — à planifier selon la stratégie
   (documenter la décision si reporté).
4. Supprimer les accès de démonstration publiés et vérifier qu'aucun secret n'est exposé
   (test : `/backend/.env` doit être non accessible — contrôle déjà présent dans le
   lanceur).

**Critère.** Domaine final en HTTPS, PWA installable, release Play Store au moins en
interne ; iOS explicitement décidée (lancée ou reportée par écrit).

---

### G12 — Pilote 10 clients et décision GO/NO-GO (éditeur, 12 semaines)

**Objectif.** La dernière étape : preuve terrain, puis décision de commercialisation
consignée.

**Références vérifiées.** `docs/CONTRAT-PILOTE.md` (cadre contractuel),
`docs/PILOTE-SUIVI.md` (7 critères chiffrés et rythme de mesure),
`docs/GUIDE-DEMARRAGE-CLIENT.md` (onboarding), `docs/EXPLOITATION-SUPPORT.md` (SLA pilote),
`backend/scripts/demo-dataset.mjs` (démo rejouable, garde-fou anti-production).

**Étapes.**
1. Sélectionner 10 entreprises pilotes (métiers couverts par les 30 profils) ; signer les
   contrats pilotes ; charger le jeu de démonstration si demandé.
2. Onboarding individuel avec GUIDE-DEMARRAGE-CLIENT ; suivi hebdomadaire selon
   PILOTE-SUIVI (mesures, tickets, temps de support).
3. Boucle de feedback : anomalies → corrections versionnées (14.4.53+), suggestions
   → arbitrage produit documenté.
4. À 12 semaines : mesurer les 7 critères chiffrés de PILOTE-SUIVI ; consigner la décision
   GO/NO-GO dans GO-LIVE avec les données. Le GO ouvre la commercialisation ; le NO-GO
   liste les chantiers de reprise.

**Critère.** 10 pilotes onboardés, mesures complètes, décision signée et consignée.

---

## §2. ORDRE D'EXÉCUTION ET PARALLÉLISATION

```
G1 ──► G2 ──► G3 ──► G10 ──► G11 ──► G12
         │      │                 ▲
         │      └── G4 (messagerie, parallèle dès G2)
         ├── G5 (Stripe, après G2 ; live après G7)
         ├── G6 (Google/Auth0, après G2)
G7 (légal) ── indépendant — à lancer dès le début (délai avocat) ──► G5 live
G8 (PDP) ── externe, parallèle, non bloquant pour le reste
G9 (16 tests) ── parallèle, avant G10 obligatoirement
```

Délai critique : **G7** (validation juridique externe) et **G8** (contrat PDP) — lancer les
démarches dès la première semaine. Les prompts G1→G3 conditionnent tout le reste.

## §3. DÉFINITION DE « 100 % » (critère de fin)

1. `docs/GO-LIVE-15.4.52.md` : **aucune case NON FAIT ni BLOQUÉ-éditeur** (hors décisions
   explicites consignées, ex. iOS reporté par écrit).
2. Suite de tests : **0 échec** (G9), recette PostgreSQL réelle verte (G10).
3. Restauration complète prouvée (G3) et supervision active (alertes reçues).
4. Stripe vert en production (G5) ; publication légale 5.0 effective (G7) ;
   PDP contractualisée ou décision d'attente documentée selon le calendrier d'obligation
   (G8).
5. Domaine public HTTPS + PWA + stores selon décision (G11).
6. Pilote : 10 clients, mesures complètes, GO/NO-GO consigné (G12).
7. Livraison finale : CHANGELOG + RAPPORT-LIVRAISON de la version de publication, ZIP
   vérifié, tag Git de publication.

---

## ANNEXE A — Variables d'environnement de production (relevées de `backend/src/config.ts` et `render.yaml`, garde-fous qui refusent le démarrage si elles manquent)

**Obligatoires dès G2 (blocantes en production) :**
`DATABASE_URL`, `AURION_MIGRATION_DATABASE_URL` (rôle admin, migrations), `JWT_SECRET`
(≥ 32), `COOKIE_SECURE=true`, `AURION_ENCRYPTION_KEY` (≥ 32) +
`AURION_ENCRYPTION_KEY_VERSION`, `APP_BASE_URL` (origine HTTPS racine, sans chemin),
`CORS_ORIGIN` (origines HTTPS publiques uniquement, pas de localhost),
`AURION_SUPPORT_EMAIL`, `NODE_ENV=production`, `AURION_STORAGE_BACKEND=s3` +
`AURION_S3_BUCKET` + `AURION_S3_ACCESS_KEY` + `AURION_S3_SECRET_KEY`
(endpoint/région OVH par défaut : `https://s3.de.io.cloud.ovh.net`, `de`).

**Conditionnelles (obligatoires seulement si la fonction est activée — les garde-fous
refusent toute configuration partielle) :**
`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (ensemble) ;
`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REDIRECT_URI`
(= `APP_BASE_URL/integrations/google/callback`) + `GOOGLE_TOKEN_ENCRYPTION_KEY` (≥ 32) ;
`GOOGLE_DRIVE_REDIRECT_URI` (= `APP_BASE_URL/cloud/google/callback`) si Drive ;
`AUTH0_DOMAIN` + `AUTH0_CLIENT_ID` + `AUTH0_CLIENT_SECRET` + `AUTH0_REDIRECT_URI`
(= `APP_BASE_URL/auth/auth0/callback`) ; `AURION_PA_PROVIDER` + `AURION_PA_WEBHOOK_SECRET`
(≥ 32) ; `AURION_PAY_PROVIDER` + `AURION_PAY_API_BASE` + `AURION_PAY_API_KEY` +
`AURION_PAY_WEBHOOK_SECRET` (paiement client — facultatif, ne pas activer sans décision).

**Recommandées (supervision et exploitation) :** `AURION_OPS_ALERT_EMAIL`,
`AURION_ADMIN_DATABASE_URL`, `AURION_RUNTIME_DB_ROLE`, `PLATFORM_SMTP_HOST/PORT/SECURITY/
USER/PASS/FROM`, `MAIL_FROM_NAME`, `RATE_LIMIT_MAX`, `LOG_LEVEL=info`,
`BILLING_VAT_RATE_BPS`, `AURION_PUBLIC_ORIGIN`, `AURION_ENCRYPTION_KEY_PREVIOUS` +
`AURION_ENCRYPTION_KEY_PREVIOUS_VERSION` (rotation), `AURION_PA_MAX_FILE_BYTES`,
`AURION_PA_OUT_TIMEOUT_MS`, `AURION_CLOUD_QUOTA_THRESHOLDS`.

**Publication légale (G7) :** `AURION_LEGAL_PUBLICATION_APPROVAL=5.0` + variables
d'identité éditeur — la liste exacte et à jour est sortie par
`npm --prefix backend run check:legal` (aucune valeur à deviner).

## ANNEXE B — Les 16 échecs préexistants (suite 15.4.52, noms littéraux)

1. `15.4.45: moteur — le signal secondaire augmente le score et cite sa raison, sans jamais décider`
2. `bloc10: unitaire — seuils 2026 officiels, jours fériés, report au jour ouvré, échéances`
3. `bloc14: FEC officiel 18 champs équilibré, exports reproductibles, rôle comptable lecture seule`
4. `bloc24: journalisation structurée, X-Request-Id, redaction testée, erreurs fatales, métriques sans donnée personnelle`
5. `bloc7: unitaire (build) — options EI uniquement, refus société, historique intact`
6. `bloc8: proposition APE/NAF — indicatrice, jamais appliquée automatiquement`
7. `bloc8: unitaire (build) — taux, dates d'effet, validation et ventilation sans double comptage`
8. `tests/cloud-storage.integration.test.mjs` (exige un S3 réel → ré-exécuter après G1)
9. `tests/fiscal-detection-2026.contract.test.mjs`
10. `tests/local-parity-15.4.37.contract.test.mjs`
11. `tests/profiles-catalogue-15.4.36.contract.test.mjs`
12. `tests/v2-profile-calibration.contract.test.mjs`
13. `v2 15.4.47: unitaire (build) — contradiction NAF/texte détectée, « très élevé » impossible`
14. `v2 15.4.47: unitaire (build) — données manquantes expliquées dans les raisons affichées`
15. `v2: unitaire (build) — correspondance incertaine = demande de confirmation, jamais une affectation`
16. `v2: unitaire (build) — plusieurs profils classés, confiance expliquée, déterminisme`

## ANNEXE C — Commandes de vérification standard (à coller dans chaque preuve)

```
npm run build && npm run typecheck
npm --prefix backend test                    # suite complète, référence G9
npm run test:smoke && npm run test:frontend && npm run lint:frontend
curl -s https://<domaine>/health             # version, uptime, outboxDeadLettered, lastBackupAt
curl -s https://<domaine>/health/db
npm --prefix backend run check:legal         # publication légale G7
AURION_PG_RECIPE=1 npm --prefix backend test # recette PostgreSQL réelle G10
```
