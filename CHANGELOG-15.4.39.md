# Aurion 15.4.39 — intégration SSO Auth0

Base : Aurion 15.4.38, qui corrige la création d'espace sans Stripe et introduit le statut `no_billing`.

## Intégration Auth0

- Ajout d'une connexion SSO Auth0 optionnelle via OpenID Connect Authorization Code + PKCE.
- Routes serveur `/auth/auth0/status`, `/auth/auth0/start` et `/auth/auth0/callback`.
- Validation de `state`, `nonce`, PKCE, signature RS256 via JWKS Auth0, `iss`, `aud`, `exp` et `email_verified`.
- Le compte Aurion est résolu uniquement par adresse e-mail vérifiée. Aucun compte ni espace n'est créé implicitement par le callback Auth0 ; un compte absent ou ambigu est refusé.
- Après authentification, Aurion délivre ses propres cookies de session, avec les contrôles habituels de révocation et d'isolation multi-tenant.
- Le bouton Auth0 est affiché uniquement dans l'onglet « Se connecter » et uniquement lorsque la configuration serveur est complète.
- Variables Auth0 documentées dans `backend/.env.example`, `render.yaml` et `docs/AUTH0-CONFIGURATION.md`.

## Préservation des fonctions existantes

- La création d'espace sans Stripe de la 15.4.38 (`no_billing`, migrations 091/092) est conservée.
- Mot de passe, WebAuthn, Google OAuth, sessions Aurion, données et parcours d'accueil ne sont pas remplacés par Auth0.

## Limites de validation

La connexion Auth0 de bout en bout nécessite un tenant Auth0, une application Regular Web Application et les secrets fournis par l'éditeur. Les tests locaux ne peuvent pas valider l'échange avec un tenant sans ces paramètres. Avant activation en production, suivre `docs/AUTH0-CONFIGURATION.md` et exécuter le parcours de test complet.


## Vérifications de préparation effectuées

- `node --test backend/tests/auth0-login.contract.test.mjs backend/tests/signup-subscription-schema.contract.test.mjs` : **10/10**.
- `npm run test:frontend` : **46 fichiers** JavaScript contrôlés, imports relatifs et exports vérifiés dans **45 modules**.
- `node --experimental-strip-types --check backend/src/config.ts` et `backend/src/routes/auth.ts` : syntaxe TypeScript acceptée par Node.
- `node tools/build-web-dist.mjs` : copie `dist-web` régénérée depuis `assets/js`.
- `npm run test:smoke` : **166/168** dans cet environnement sans dépendances installées. Les deux échecs sont liés à l'absence de `backend/dist` (généré par le build préalable) et à l'absence du module `dotenv` dans le test CLI Google. `npm ci` n'a pas pu compléter l'installation, le registre npm étant inaccessible depuis l'environnement de préparation.
- Le build TypeScript complet, le typecheck, Playwright et le test avec un tenant Auth0 réel **n'ont pas été validés** ici. La connexion Auth0 reste désactivée tant que les variables d'environnement du tenant ne sont pas configurées.
