# Rapport d'audit — Aurion 15.4.39

Date : 20 novembre 2026  
Base source : archive utilisateur `Aurion-15.4.38.zip`, reprise en version candidate 15.4.39.  
Périmètre : correction d'inscription 15.4.38 conservée ; ajout d'une connexion Auth0 facultative ; contrôle de cohérence des versions, des tests présents et de la préparation du paquet.

## 1. Verdict exécutif

La 15.4.38 traite le blocage critique découvert en 15.4.37 lors de la création d'espace sans Stripe. La 15.4.39 candidate conserve ces corrections et ajoute une méthode de connexion Auth0 qui s'appuie sur OpenID Connect Authorization Code + PKCE, le contrôle de l'ID Token côté serveur et les sessions Aurion existantes.

**Avancement pondéré estimé : 64,1 %** (grille constante de 95 points). Il s'agit d'un indicateur de maturité produit/technique, pas d'une couverture de tests. La progression par rapport à la 15.4.36 (62,8 %) est limitée : l'authentification Auth0 est intégrée dans le code mais elle n'est pas encore configurée ni essayée contre un tenant réel.

**Statut : candidate à recette, non prête à publication distante.** Le build TypeScript, le typecheck complet, Playwright, la suite d'intégration complète et l'authentification réelle Auth0 n'ont pas pu être validés dans cet environnement, faute d'installation des dépendances et de secrets Auth0.

## 2. Avancement pondéré

| Domaine | Poids | 15.4.36 | 15.4.39 candidate | État |
|---|---:|---:|---:|---|
| A. Fonctions métier et calculs | 12 | 95 % | 95 % | Métier avancé ; les réserves fiscales précédentes restent à confirmer sur les données réelles |
| B. Synchronisation et mode hors ligne | 16 | 78 % | 78 % | Architecture présente ; essais multi-appareils réels à compléter |
| C. Documents, stockage et appareils | 7 | 74 % | 74 % | Téléchargement et stockage avancés ; restauration complète à prouver |
| D. Web/PWA/Windows/Android/iOS | 8 | 42 % | 42 % | Web/PWA avancés ; builds natifs et recette sur appareils manquants |
| E. Infrastructure, migrations, sauvegardes | 12 | 29 % | 29 % | Infrastructure cible et restauration non démontrées |
| F. Sécurité, RLS, secrets, RGPD | 10 | 78 % | 78 % | Authentification existante préservée ; Auth0 suit les contrôles OIDC, mais doit être testé réellement |
| G. Intégrations externes | 9 | 35 % | 45 % | Auth0 ajouté au code ; tenant, paramètres et test réel manquants |
| H. Juridique et commercial | 8 | 50 % | 50 % | Informations éditeur, médiation et publication restent à compléter |
| I. Tests, accessibilité, bêta, support | 13 | 68 % | 70 % | Contrats supplémentaires ; build/CI/navigateur ne sont pas certifiés dans cette préparation |
| **Total pondéré** | **95** | **62,8 %** | **64,1 %** | **Candidate non publiée, recette technique incomplète** |

Calcul : `(12×95 + 16×78 + 7×74 + 8×42 + 12×29 + 10×78 + 9×45 + 8×50 + 13×70) / 95 = 64,05 %`, arrondi à **64,1 %**.

## 3. Correction héritée de 15.4.38 — création d'espace sans Stripe

La 15.4.37 insérait un abonnement `active` avec `trial_started_at = NULL` et `trial_ends_at = NULL`, alors que la migration 009 imposait `NOT NULL`. PostgreSQL rejetait l'écriture avec `23502` et annulait la transaction d'inscription.

La 15.4.38 corrige ce défaut avec :

- migration 091 : dates d'essai facultatives, avec contrainte imposant que les deux dates soient présentes ensemble ou absentes ensemble ;
- migration 092 : statut `no_billing` pour une installation où aucun moyen de facturation n'est configuré ;
- fonction partagée `createInitialSubscription()` utilisée à la création d'espace et dans la lecture d'état d'abonnement ;
- préservation des abonnements payants déjà configurés ;
- aucune période d'essai inventée lorsque Stripe n'est pas configuré.

L'archive 15.4.38 contient un rapport de recette qui déclare une reproduction sur PGlite/PostgreSQL 18.7 et un test d'intégration d'inscription 4/4. Dans la présente préparation, les contrats statiques du schéma et du comportement ont passé ; le test PostgreSQL complet n'a pas été rejoué ici.

## 4. Auth0 ajouté en 15.4.39

### Architecture retenue

- OIDC Authorization Code + PKCE côté serveur, avec `state`, `nonce` et cookie de transaction `HttpOnly`, `SameSite=Lax`, limité au chemin callback et expirant après 10 minutes.
- Validation de l'ID Token via `jose` (déjà présent dans les dépendances du backend) : signature RS256 via JWKS Auth0, `iss`, `aud`, âge du jeton, `nonce` et `email_verified`.
- Le callback exige un compte Aurion déjà existant dont l'adresse e-mail correspond à l'adresse déclarée vérifiée par Auth0.
- Les comptes inconnus, les correspondances multiples et les utilisateurs rattachés à plusieurs espaces sont refusés. Le callback ne crée ni compte ni organisation et ne choisit pas arbitrairement un espace.
- Après validation, Aurion délivre son propre cookie de session et son refresh token. Les jetons Auth0 ne sont pas transmis au frontend ni utilisés comme jetons Aurion.
- Le bouton n'apparaît que dans l'écran de connexion et seulement lorsque la configuration Auth0 est complète.
- Le mot de passe, WebAuthn, Google OAuth, les sessions Aurion et les données existantes restent en place.

### Variables à configurer

`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_REDIRECT_URI` et `APP_BASE_URL`. Le secret reste exclusivement côté serveur. Le guide `docs/AUTH0-CONFIGURATION.md` donne les URLs callback locales et Render.

**Limite importante :** aucun tenant ni identifiant Auth0 n'a été fourni. Le bouton reste masqué tant que les paramètres ne sont pas installés. Le parcours Universal Login → callback → session Aurion doit encore être testé avec une application Auth0 réelle. L'intégration présente est une implémentation OIDC serveur avec la bibliothèque de validation déjà utilisée par le backend ; elle ne prétend pas avoir connecté ou créé le tenant Auth0.

## 5. Vérifications exécutées pendant cette préparation

| Vérification | Résultat |
|---|---|
| Contrats Auth0 + abonnement sans Stripe | **10/10 réussis** |
| `npm run test:frontend` | **46 fichiers** JavaScript contrôlés ; imports/exports dans **45 modules** |
| `node --experimental-strip-types --check backend/src/config.ts` | OK |
| `node --experimental-strip-types --check backend/src/routes/auth.ts` | OK |
| `node tools/build-web-dist.mjs` | OK, `dist-web` régénéré |
| `npm run test:smoke` | **166/168** dans cet environnement ; 2 erreurs d'environnement détaillées ci-dessous |
| `npm ci` / build TypeScript / typecheck complet | Non validés : installation des dépendances impossible ici (registre npm inaccessible) |
| Playwright / Chromium | Non exécuté |
| PostgreSQL complet et migrations 001→092 | Non rejoués pendant cette préparation ; le rapport 15.4.38 déclare ses essais précédents |
| Connexion Auth0 réelle | Non testée : tenant, Client ID et secret absents |

### Deux erreurs de la suite smoke

1. `admin-bootstrap-gate.contract.test.mjs` importe `backend/dist/routes/support.js`. Le répertoire `backend/dist` n'existe pas dans une archive source propre ; il est produit par `npm run build`, qui n'a pas pu être lancé faute de dépendances.
2. `google-preflight.test.mjs` lance `backend/scripts/check-integrations.mjs`, mais `dotenv` n'est pas présent dans l'environnement car `npm ci` n'a pas pu terminer. Le sous-processus ne produit donc pas le texte attendu.

Ces deux erreurs ne démontrent pas une régression dans la logique métier, mais empêchent de déclarer la suite complète verte. La réussite du build/typecheck doit être confirmée après `npm ci` dans un environnement connecté.

## 6. Sécurité du paquet

- `android/.gradle` est un cache local et doit être exclu du paquet.
- `.env` réels et secrets de signature ne doivent jamais être inclus.
- Le ZIP livré doit conserver `backend/.env.example`, le code source, les migrations, les scripts, les tests, `dist-web` et le projet Android, mais exclure `.gradle`, `.git`, `node_modules`, `backend/dist`, les données privées et les fichiers de clés/keystores.
- L'archive 15.4.38 examinée ne contenait pas de `keystore.properties`, `.jks` ou `.keystore` ; les règles d'exclusion de livraison ont été renforcées pour éviter leur inclusion future.

## 7. État GitHub / Render et limites de publication

État distant précédemment vérifié : GitHub `wooffey78/aurion`, branche `main`, commit 15.4.35 `48326b15f8bcc7ac53d9a1ef56e74e5b5d7a41d1` ; Render service `aurion` à Francfort sur ce même commit. La 15.4.39 est une archive locale candidate.

Aucun push ni déploiement de la 15.4.39 n'a été effectué dans cette préparation : le conteneur de travail ne dispose pas de l'authentification GitHub/Render locale ni d'une capacité de transfert en lot de l'arborescence entière vers le dépôt. Les connecteurs disponibles ne permettent pas de pousser de manière fiable ces centaines de fichiers source en une seule publication. Il serait dangereux de pousser seulement les quelques fichiers modifiés ou de déclencher Render sur le commit ancien.

**Ne pas annoncer la 15.4.39 comme publiée ou déployée avant vérification du SHA distant et du déploiement Render.** Après publication, configurer les secrets Auth0 sur le service Render et faire la recette réelle.

## 8. Priorités avant ouverture commerciale

1. Exécuter `npm ci --prefix backend --include=dev --no-audit --no-fund`, build et typecheck sur Windows ou CI.
2. Rejouer smoke, business, intégration PostgreSQL et Playwright, et obtenir une CI GitHub verte.
3. Créer/configurer l'application Auth0, renseigner les quatre variables serveur et valider les cas succès/échec ; conserver les logins historiques.
4. Traiter les audits npm de dépendances, la sauvegarde/restauration, la plateforme agréée/e-reporting et la préparation juridique.
5. Exécuter les builds et recettes Android/iOS.
