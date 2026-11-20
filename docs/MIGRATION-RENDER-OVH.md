# Procédure de migration Render → OVHcloud (Bloc 1, version 15.4.24)

> Objectif du prompt maître : « Écrire une procédure de migration de Render vers OVH incluant base, fichiers S3, secrets chiffrants, OAuth callbacks, cookies, domaine, DNS, CORS, tests, gel des écritures, reprise et rollback. » **Cette procédure n'est PAS exécutée** : toute bascule réelle exige l'autorisation explicite de l'éditeur, le provisionnement OVH et l'achat du domaine (non effectés à ce jour — cf. `docs/INFRA-OVH-COUTS.md` et la checklist pré-production).

## 0. Prérequis bloquants (état réel au 14 novembre 2026)

1. Compte OVH existant ; **provisionnement réel non confirmé** (aucune base, aucun bucket, aucun hôte applicatif créés).
2. Domaine Aurion **non acheté** ; adresses e-mail dédiées non créées (prérequis Brevo/SPF/DKIM/DMARC).
3. Secrets actuels : disponibles uniquement dans le tableau de bord Render (jamais dans le dépôt). L'éditeur les relève manuellement (jamais par e-mail/ticket).

## 1. Préparation OVH (sans bascule)

1. Provisionner l'hôte applicatif (option choisie : VPS ou Public Cloud) en région Francfort ; installer Node 24 et les dépendances depuis le ZIP/le commit validé (`npm ci --include=dev`, `npm run build`).
2. Provisionner PostgreSQL (managé ou auto-hébergé) : base `aurion`, rôles conformes à `docs/POSTGRES-ROLES.md` — `aurion_admin` (migrateur, propriétaire) et `aurion_runtime` (applicatif), RLS active (migration 074).
3. Provisionner le bucket S3 privé région `de` (`s3.de.io.cloud.ovh.net`) avec clés minimales (lecture/écriture sur ce seul bucket) ; chiffrer au repos si l'offre le permet.
4. Sauvegardes indépendantes : `npm run db:backup` quotidien + copie hors site (règle 3-2-1, `docs/RUNBOOK-PRODUCTION.md` §2) ; exercice `db:restore:drill` sur base jetable **avant** la bascule (§3 du runbook).

## 2. Configuration applicative OVH

Variables d'environnement (valeurs relevées du tableau de bord Render, saisies sur OVH — jamais dans le dépôt) : `DATABASE_URL`, `AURION_MIGRATION_DATABASE_URL`, `AURION_RUNTIME_DB_ROLE`, `AURION_ADMIN_DATABASE_URL`, `JWT_SECRET`, `AURION_ENCRYPTION_KEY` (+ `_PREVIOUS`, `_VERSION`) — **la clé de chiffrement doit être IDENTIQUE** pour déchiffrer les secrets/justificatifs existants ; `AURION_S3_*` (endpoint OVH), `PLATFORM_SMTP_*` (Brevo), `GOOGLE_*` (OAuth), `STRIPE_*`, `AURION_PA_*`, `AURION_SUPPORT_EMAIL`.

- `APP_BASE_URL=https://<domaine-ovh>` : sert à injecter la configuration canonique dans la page (`<meta name="aurion-api-base">`, livré en 15.4.24) et aux callbacks OAuth.
- `AURION_PUBLIC_ORIGIN=https://<domaine-ovh>` ; `CORS_ORIGIN=https://<domaine-ovh>` ; `COOKIE_SECURE=true`.
- `AURION_STORAGE_BACKEND=s3` (imposé en production par `backend/src/config.ts`).

## 3. Domaine, DNS, TLS

1. Acheter/connecter le domaine, créer les enregistrements DNS (A/CNAME vers OVH) et le certificat TLS (Let's Encrypt ou gestionnaire OVH).
2. Mettre à jour les **callbacks Google OAuth** (Console Cloud de l'éditeur) : `https://<domaine-ovh>/auth/google/callback` et l'URI Drive (`GOOGLE_DRIVE_REDIRECT_URI`) — action éditeur, jamais automatisée.
3. SPF/DKIM/DMARC du domaine pour Brevo (adresses dédiées).

## 4. Migration des données (fenêtre courte, gel des écritures)

1. **Annoncer la fenêtre** ; activer le mode maintenance si disponible ; **geler les écritures** Render (instance mise en pause ou base en lecture seule) — aucune nouvelle inscription/écriture pendant l'opération.
2. **Base** : sauvegarde complète Render (`npm run db:backup` côté Render ou pg_dump managé) → restauration OVH (`npm run db:restore:drill` sur une base jetable OVH d'abord, puis bascule) ; vérifier `schema_migrations` (80), tables, isolation.
3. **Fichiers S3** : synchronisation objet par objet (liste, tailles, checksums) depuis le bucket actuel vers OVH ; vérifier nombre, taille, **ouverture de chaque objet** (procédure checklist pré-production).
4. **Application OVH** : démarrage avec `dist/.version` conforme, migrations appliquées une fois (`[AURION MIGRATE] Migration terminee.`), `/health` et `/health/db` verts.
5. **Bascule DNS** : TTL réduit à l'avance (≤ 300 s) ; basculer les enregistrements vers OVH ; surveiller la propagation.

## 5. Reprise et vérifications post-bascule

1. Parcours complets de `docs/RECETTE-BETA-PRIVEE.md` (A1-A6, B1-B8, F, G) sur le domaine OVH.
2. Connexion Google réelle sur le nouveau domaine (cookies `Secure`, `SameSite=Strict`, callbacks) ; envoi e-mail de test Brevo ; webhook Stripe reconfiguré vers OVH (endpoint + secret) — avec l'éditeur.
3. Sortie/historiques : `/transparency` doit refléter la nouvelle configuration des sous-traitants ; mise à jour `docs/CHECKLIST-PRE-PRODUCTION.md`.
4. **Aucune donnée client de production ne reste sur Render** : après fenêtre de retour, supprimer les données du service Render (instance, base) — action éditeur tracée.

## 6. Rollback (fenêtre de retour)

Tant que la fenêtre de retour est ouverte : rebasculer les DNS vers Render (données Render figées = état à la date du gel) ; repasser `APP_BASE_URL`/`AURION_PUBLIC_ORIGIN`/`CORS_ORIGIN`/callbacks Google au domaine Render ; tout écart constaté post-bascule est consigné dans le journal d'incident (`docs/EXPLOITATION-SUPPORT.md` §3) avant de décider d'un retour ou d'une correction sur OVH.

## 7. Exécution effective

La présente procédure est prête et **non exécutée** (aucun provisionnement, aucune bascule, aucune donnée déplacée). Elle sera exécutée uniquement après autorisation distincte de l'éditeur, conformément aux règles du prompt maître (« Ne pas basculer la production ni déplacer des données réelles sans autorisation »).
