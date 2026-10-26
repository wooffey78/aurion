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
