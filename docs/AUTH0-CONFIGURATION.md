# Connexion Auth0 — Aurion 15.4.39

Aurion ajoute une option de connexion SSO Auth0, sans remplacer l'authentification Aurion existante (mot de passe, clés d'accès/WebAuthn, sessions internes). L'intégration utilise OpenID Connect Authorization Code avec PKCE côté serveur. Le backend valide la signature RS256, l'émetteur, l'audience, le nonce et `email_verified` avant de créer une session Aurion.

## Modèle de rattachement des comptes

- Auth0 n'effectue pas l'inscription Aurion et ne crée pas d'entreprise automatiquement.
- L'utilisateur crée d'abord son compte et son espace dans Aurion avec le formulaire habituel.
- Lors d'une connexion Auth0, l'adresse doit être déclarée vérifiée par Auth0 et correspondre à l'adresse du compte Aurion existant.
- Aurion refuse une adresse non vérifiée, un compte absent, une correspondance ambiguë ou un utilisateur rattaché à plusieurs espaces. Il ne choisit jamais un espace arbitrairement.
- Après validation, Aurion émet ses propres cookies de session et de renouvellement. Les tokens Auth0 ne sont pas exposés au navigateur ni utilisés comme jetons Aurion.

## Créer l'application Auth0

Dans Auth0 Dashboard, créer une application **Regular Web Application**. Garder l'authentification client en `POST` (client secret dans le corps du token exchange). Activer une connexion (par exemple Username-Password-Authentication, Google ou une connexion d'entreprise) et s'assurer que l'adresse e-mail est vérifiée.

Déclarer exactement les URLs autorisées suivantes pour le développement local :

- Allowed Callback URLs : `http://127.0.0.1:4000/auth/auth0/callback`
- Allowed Logout URLs : `http://127.0.0.1:4000`
- Allowed Web Origins : `http://127.0.0.1:4000`

Pour l'instance Render actuelle (à adapter si le domaine change) :

- Allowed Callback URLs : `https://aurion-2hye.onrender.com/auth/auth0/callback`
- Allowed Logout URLs : `https://aurion-2hye.onrender.com`
- Allowed Web Origins : `https://aurion-2hye.onrender.com`

## Variables serveur

À saisir dans `backend/.env` localement ou dans les variables d'environnement du service Render. Ne jamais mettre le client secret dans le frontend, Git ou un ZIP partagé.

```dotenv
APP_BASE_URL=http://127.0.0.1:4000
AUTH0_DOMAIN=your-tenant.eu.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_REDIRECT_URI=http://127.0.0.1:4000/auth/auth0/callback
```

En production, `AUTH0_REDIRECT_URI` doit être exactement `APP_BASE_URL/auth/auth0/callback` en HTTPS. `AUTH0_DOMAIN` est le nom d'hôte uniquement, sans `https://` ni chemin. L'intégration est désactivée lorsque les trois paramètres principaux sont absents ; une configuration partielle fait échouer le démarrage pour éviter un bouton SSO inutilisable.

## Parcours de test

1. Créer un compte Aurion avec une adresse e-mail qui pourra être vérifiée dans Auth0.
2. Renseigner les quatre variables, démarrer Aurion et vérifier `GET /auth/auth0/status` (`configured: true`).
3. Ouvrir la connexion Aurion : le bouton « Continuer avec Auth0 » n'apparaît que lorsque la configuration est complète.
4. Authentifier l'utilisateur sur Universal Login Auth0 ; vérifier le retour vers `/#/dashboard`.
5. Vérifier qu'une adresse non vérifiée, un e-mail inconnu, un état/nonce invalide ou un callback expiré est refusé et qu'aucune session Aurion n'est créée.
6. Vérifier que les connexions par mot de passe et WebAuthn fonctionnent toujours et que les données existantes sont inchangées.

## Endpoints

- `GET /auth/auth0/status` : état non sensible de la configuration.
- `GET /auth/auth0/start` : démarrage du flux OIDC (state, nonce, PKCE).
- `GET /auth/auth0/callback` : échange du code, vérification de l'ID token et émission d'une session Aurion.

La session Auth0 du navigateur est indépendante de la session Aurion ; le bouton de connexion est donc une méthode d'authentification additionnelle et non un remplacement du système de session existant.
