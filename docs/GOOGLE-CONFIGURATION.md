# Connexion Google (Gmail + Google Calendar)

Aurion peut utiliser le compte Google de l'utilisateur pour envoyer les devis/factures et créer les rendez-vous dans Google Calendar.

## Configuration
1. Dans Google Cloud Console, créer un projet.
2. Activer Gmail API et Google Calendar API.
3. Configurer l'écran de consentement OAuth.
4. Créer un identifiant OAuth de type « Application de bureau » ou client web selon le mode choisi.
5. Déclarer `http://127.0.0.1:4000/integrations/google/callback` comme URI de redirection autorisée si le type de client le permet.
6. Copier `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans `backend/.env`.
7. Relancer Aurion puis Paramètres → Connecter Gmail + Agenda.

Aurion demande uniquement les scopes Gmail Send et Calendar nécessaires aux fonctions d'envoi et de synchronisation. Les jetons sont chiffrés en base si `GOOGLE_TOKEN_ENCRYPTION_KEY` est configurée.


## Connexion Aurion avec un compte Google (fonction distincte de Gmail/Agenda)

La connexion Google est un mode d'authentification supplémentaire. Elle utilise uniquement OpenID Connect `openid email profile` pour identifier un compte existant ; elle ne demande pas les autorisations Gmail ou Calendar et ne crée pas automatiquement de nouvel espace Aurion. Un e-mail Google vérifié doit correspondre à un compte Aurion existant.

1. Utiliser le même projet OAuth web et les mêmes `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` que l'intégration actuelle.
2. Ajouter **une deuxième URI de redirection autorisée** dans Google Cloud Console : `https://VOTRE-ORIGINE-AURION/auth/google/callback`.
3. Ne pas supprimer l'URI existante `https://VOTRE-ORIGINE-AURION/integrations/google/callback`, qui reste nécessaire à l'intégration Gmail/Calendar.
4. Conserver `GOOGLE_REDIRECT_URI` côté serveur sur le callback historique `/integrations/google/callback` : la connexion Aurion construit son callback distinct depuis `APP_BASE_URL`.
5. Tester avec un compte Aurion existant dont l'adresse correspond à une adresse Google vérifiée, puis vérifier qu'un compte non reconnu ne peut pas être créé via cette route.

Le flux vérifie l'état anti-CSRF, utilise PKCE, vérifie le jeton d'identité côté serveur (audience du client OAuth et adresse vérifiée) et crée une session Aurion à l'aide du mécanisme de session/jeton de renouvellement déjà en place. Si `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` ou `APP_BASE_URL` est absent, le bouton Google est masqué et le mode mot de passe / clés d'accès reste disponible.
