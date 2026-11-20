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

## Stockage documentaire (15.4.0)

Ajouter l’URI `https://<ORIGINE>/cloud/google/callback` et activer Google Drive API : voir `docs/CLOUD-STOCKAGE-15.4.0.md`.

## Pré-vol Google réel (refresh, calendriers, scopes, quota Drive)

Le pré-vol `check:integrations` ne se limite plus à la présence des variables : lorsqu’un jeton
de test est fourni, il rafraîchit réellement un token OAuth, vérifie les scopes accordés, liste
les calendriers accessibles et lit le quota de stockage Drive. Tous les appels sont en lecture
seule ; aucun événement, fichier ou e-mail n’est créé.

### 1. Diagnostic des configurations manquantes

Le diagnostic peut comparer plusieurs fichiers `.env` sans les fusionner et sans afficher leurs
valeurs :

```bash
# Depuis la racine du dépôt
npm run check:integrations -- \
  --local .env.local \
  --staging .env.staging \
  --production .env.production
```

Chaque ligne indique l’état de l’environnement et, si Google est partiellement configuré, les
**noms** de variables manquantes :

```text
✖ Google configuration (local) : ÉCHEC — incomplet — manquant : GOOGLE_CLIENT_SECRET ; GOOGLE_TOKEN_ENCRYPTION_KEY (32 caractères minimum)
— Google configuration (production) : NON CONFIGURÉ — désactivé (aucune variable Google)
```

`--strict` sort en erreur si une configuration est incomplète ou si un contrôle échoue. Les
fichiers absents sont refusés explicitement, sans lancer l’application.

### 2. Fournir un jeton de test

Créer un compte Google de test, puis obtenir un refresh token avec les scopes nécessaires :

- `openid email profile`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/drive.file` (pour le quota Drive)

Le plus simple est le [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) :
renseigner votre propre `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` dans les paramètres, cocher
ces scopes, autoriser avec le compte de test, puis échanger le code contre des jetons et copier
le `refresh_token`. Ne jamais utiliser un compte client réel.

Le jeton de pré-vol est un secret : le garder dans le gestionnaire de secrets ou dans un `.env`
non versionné, jamais dans Git, un ticket ou un journal. Il n’est jamais lu par l’application.

```bash
export GOOGLE_PREFLIGHT_REFRESH_TOKEN='…'
# Facultatif si le jeton principal ne porte pas drive.file :
export GOOGLE_PREFLIGHT_DRIVE_REFRESH_TOKEN='…'
```

Si le jeton principal porte déjà `drive.file`, le second n’est pas nécessaire. Le jeton doit
appartenir au même client OAuth que `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### 3. Lancer le contrôle réel

```bash
# Charge la configuration applicative locale, puis exécute le contrôle réel
npm run check:integrations -- \
  --env-file backend/.env \
  --environment local \
  --google-live
```

Pour un environnement staging ou production, charger le fichier correspondant ; le jeton doit
être fourni par l’environnement ou le gestionnaire de secrets, pas recopié dans le fichier :

```bash
GOOGLE_PREFLIGHT_REFRESH_TOKEN='…' \
npm run check:integrations -- --env-file .env.staging --environment staging --google-live
```

Le contrôle affiche :

- le rafraîchissement du jeton (sans jamais afficher le jeton) ;
- les scopes fonctionnels présents ou manquants ;
- la liste des calendriers accessibles (nom, calendrier principal, rôle), sans identifiant ;
- la présence de `GOOGLE_CALENDAR_ID` dans cette liste ;
- le quota Drive : espace utilisé / limite, pourcentage et niveau `ok`, `warning`, `alert`,
  `critical` ou `full` selon `AURION_CLOUD_QUOTA_THRESHOLDS` (80/90/95/100 par défaut).

Un quota au-dessus du seuil d’alerte est signalé sans bloquer ; un quota `full` est bloquant.
Un scope fonctionnel manquant, un refresh token révoqué ou une API Google désactivée sont des
échecs. `--google-live` sort en erreur si le contrôle réel ne peut pas être exécuté.

### 4. Scopes attendus

| Usage | Scopes fonctionnels exigés |
| --- | --- |
| Gmail + Agenda | `gmail.send`, `calendar` |
| Identité Google | `openid`, `email`, `profile` (avertissement si absents) |
| Stockage Drive | `drive.file` |

Après un changement de scopes dans Google Cloud, refaire un consentement complet
(`prompt=consent`) : un ancien refresh token peut ne pas porter les nouveaux scopes.

### 5. Limites

Le contrôle réel nécessite un vrai refresh token et un accès réseau à Google. Sans jeton, le
pré-vol reste au diagnostic statique et l’indique (`NON TESTÉ` ; avec `--google-live`, il sort
en erreur), sans faire semblant d’avoir vérifié. Il ne teste ni l’envoi d’e-mail ni la création
d’événement, qui restent des parcours fonctionnels de recette.
