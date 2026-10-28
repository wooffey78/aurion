# Configuration Gmail, e-mails et assistants IA — Aurion 15.3.4

Ce guide configure les clés privées du serveur. Il ne pousse aucune donnée secrète dans le navigateur, le dépôt Git ou le ZIP distribué.

## 1. Autoriser Gmail à lire les réponses administratives

La lecture Gmail est une autorisation OAuth distincte de la configuration SMTP et de la connexion calendrier.

1. Ouvrir [Google Cloud Console](https://console.cloud.google.com/) et choisir/créer un projet dédié à Aurion.
2. Dans **APIs & Services → Library**, activer **Gmail API**. N'activer Google Calendar API que si la synchronisation du calendrier est également utilisée.
3. Dans **Google Auth Platform**, configurer Branding, Audience et Data Access. Renseigner le nom de l'application, l'e-mail d'assistance et les domaines autorisés. Ajouter les comptes de test si l'application reste en mode test. Les scopes Gmail peuvent exiger une vérification Google avant une diffusion publique.
4. Dans **Clients**, créer un client OAuth **Web application** (pas un client bureau pour une instance hébergée).
5. Pour une instance publique, ajouter les URI de redirection autorisées exactes :
   - `https://VOTRE-ORIGINE-AURION/integrations/google/callback`
   - `https://VOTRE-ORIGINE-AURION/administrative-mail/oauth/callback`
   - ajouter `https://VOTRE-ORIGINE-AURION/auth/google/callback` uniquement si l'authentification par compte Google est utilisée.
6. Copier le client ID et le secret OAuth dans les variables privées du backend :
   - `APP_BASE_URL=https://VOTRE-ORIGINE-AURION` (origine seulement, sans chemin final)
   - `GOOGLE_CLIENT_ID=...`
   - `GOOGLE_CLIENT_SECRET=...`
   - `GOOGLE_REDIRECT_URI=https://VOTRE-ORIGINE-AURION/integrations/google/callback`
   - `GOOGLE_TOKEN_ENCRYPTION_KEY=` une valeur secrète aléatoire d'au moins 32 caractères.
7. En production, laisser `COOKIE_SECURE=true`; ne pas copier le secret dans les fichiers sources. Redémarrer le backend après ajout des variables.
8. Dans Aurion, à l'étape 5, cliquer **Autoriser la lecture Gmail**. Sélectionner le compte Google souhaité, lire l'écran de consentement et autoriser la permission. De retour dans Aurion, vérifier l'adresse et l'état de connexion, puis cliquer sur **Synchroniser** pour lancer une recherche ciblée.

La lecture utilise le scope `https://www.googleapis.com/auth/gmail.readonly`. Aurion ne doit utiliser les e-mails comme source non fiable : il propose un rapprochement à confirmer et n'exécute ni instructions ni liens provenant du message.

## 2. Autoriser l'envoi d'e-mails via Gmail

1. Utiliser le même projet Google et le même client OAuth Web de l'étape précédente.
2. Vérifier que l'URI `.../administrative-mail/oauth/callback` est bien déclarée, et que `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_BASE_URL` et `GOOGLE_TOKEN_ENCRYPTION_KEY` sont définis.
3. Dans Aurion, cliquer séparément sur **Autoriser l'envoi Gmail** à l'étape 5 et accorder le scope `https://www.googleapis.com/auth/gmail.send`.
4. Vérifier l'état **Envoi Gmail autorisé**. La permission de lecture et la permission d'envoi sont indépendantes : autoriser l'une ne donne pas l'autre.

Aurion demande une confirmation explicite avant l'envoi d'un message administratif préparé. Préparer un brouillon n'envoie pas le message. Les restrictions de test/vérification et les limites d'envoi imposées par Google restent applicables.

## 3. Configurer la messagerie habituelle d'Aurion (SMTP)

Pour envoyer les devis et factures par l'intermédiaire d'une adresse professionnelle, ouvrir **Paramètres → Messagerie**, renseigner l'hôte SMTP, le port, la sécurité (SSL/TLS ou STARTTLS), l'identifiant, le mot de passe d'application si le fournisseur l'exige et l'adresse d'expédition, puis lancer **Tester la connexion** et enregistrer si le résultat est bon.

Cette configuration SMTP est différente de l'accès Gmail OAuth de l'étape 5. Elle ne donne pas à Aurion le droit de lire la boîte Gmail.

## 4. Activer les assistants IA

Dans la console développeur du fournisseur, créer une clé API et vérifier que l'organisation, le modèle et la facturation API sont activés. Une formule web ChatGPT/Gemini/Claude/Grok ne remplace pas nécessairement l'accès API et n'inclut pas automatiquement sa facturation.

Ajouter uniquement les clés souhaitées dans l'environnement privé du backend :

- `OPENAI_API_KEY` : génération/édition d'image via GPT Image et extraction/analyse IA des documents/étapes.
- `GEMINI_API_KEY` : génération/édition d'image via l'API Gemini.
- `ANTHROPIC_API_KEY` : création d'un SVG par Claude, converti ensuite en PNG par le navigateur ; Claude ne fournit pas ici une génération d'image native équivalente aux moteurs d'image.
- `XAI_API_KEY` : génération/édition via Grok Imagine.

Sur Render, aller dans le service **backend Aurion → Environment**, ajouter les variables, enregistrer puis redéployer/redémarrer le service selon le mode de déploiement de l'utilisateur. Ce ZIP ne modifie pas Render et ne contient aucune clé.

Dans Aurion, à l'étape 4, sélectionner l'assistant, vérifier le prompt généré et utiliser **Générer le logo** ou **Ajuster le logo**. Le résultat doit apparaître dans l'aperçu. Cliquer sur **Enregistrer ce logo dans Aurion** pour le conserver, puis utiliser **Télécharger mon identité visuelle (.zip)** pour obtenir le logo principal, les déclinaisons de fond/cadre, l'icône et le favicon. Les déclinaisons SVG adaptent l'affichage de l'image source et ne constituent pas un redessin vectoriel automatique.

Pour l'extraction de documents, cocher explicitement le consentement affiché avant l'envoi à l'API OpenAI. Sans cette autorisation, Aurion se limite au préclassement local disponible. Les résultats sont des suggestions modifiables et supprimables, pas des faits certifiés.

## 5. Confidentialité et dépannage

- Ne jamais enregistrer une clé API dans le front-end, `assets/`, un fichier versionné ou un ZIP partageable.
- Si un fournisseur indique une clé manquante, vérifier le nom de variable, l'environnement du bon service et le redémarrage du backend.
- Si Google refuse le retour OAuth, comparer caractère par caractère l'origine et le chemin de redirection. `APP_BASE_URL` ne doit contenir ni chemin, ni paramètre, ni fragment.
- Si Google signale une application non vérifiée, une audience de test ou une portée restreinte, suivre les exigences de Google Cloud avant la diffusion aux utilisateurs finaux.
- Les fournisseurs facturent leurs propres appels selon leurs tarifs, leurs politiques de conservation et leurs limites. Ne téléverser un document que si l'utilisateur a le droit de le transmettre au fournisseur.
