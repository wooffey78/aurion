# Aurion 15.3.0 — guide de configuration

## 1. Prérequis et sécurité

- Node.js **22.16.0 ou supérieur** selon la contrainte du projet.
- PostgreSQL de test séparé de la production pour la recette.
- Installation complète à partir des fichiers de verrouillage avec accès au registre npm.
- Ne jamais copier des secrets de production dans le ZIP, dans les journaux ou dans un ticket.
- Conserver `AURION_MIGRATION_DATABASE_URL` exclusivement pour le processus de migration, avec un rôle DDL dédié. Ne pas réutiliser le rôle de l’application web.

## 2. Variables d’environnement

Commencer par `backend/.env.example`. Les nouvelles fonctions réutilisent les variables et services déjà présents :

- `APP_BASE_URL` : URL d’origine de l’instance Aurion, obligatoire pour construire le callback OAuth de lecture Gmail.
- `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` : identifiants OAuth Google côté serveur.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` : clé dédiée, d’au moins 32 caractères, utilisée pour chiffrer les jetons Google enregistrés en base. Ne pas utiliser `JWT_SECRET` comme remplacement.
- `GOOGLE_REDIRECT_URI` : callback existant `/integrations/google/callback` pour l’intégration Google générale.
- `DATABASE_URL` et `AURION_MIGRATION_DATABASE_URL` : utiliser exclusivement des bases de développement/test pour la recette de la migration.
- Les autres clés existantes se configurent selon `docs/ARCHITECTURE-PRODUCTION.md` et `docs/GOOGLE-CONFIGURATION.md`.

Aucun secret n’est fourni dans ce dépôt. Copier le fichier exemple dans un fichier `.env` local seulement lorsque nécessaire et ne pas ajouter ce fichier au contrôle de version.

## 3. OAuth Google

Trois usages doivent rester distincts :

1. L’intégration Google existante d’Aurion, configurée avec son callback `/integrations/google/callback`, qui sert aux fonctions déjà présentes (notamment envoi et agenda).
2. La connexion administrative de lecture Gmail, qui demande séparément les scopes `openid`, `email` et `https://www.googleapis.com/auth/gmail.readonly` avec le callback :

   `<APP_BASE_URL>/administrative-mail/oauth/callback`

Dans la console Google Cloud, déclarer chaque URL de callback exactement, activer l’API Gmail et vérifier l’écran de consentement. L’origine doit utiliser HTTPS en environnement publié. Pour une installation locale, conserver les URL locales cohérentes avec la configuration.

3. L’autorisation administrative d’envoi Gmail, demandée séparément avec `openid`, `email` et `https://www.googleapis.com/auth/gmail.send` sur le même callback dédié. Cette autorisation est conservée dans une connexion distincte de la lecture et les envois administratifs utilisent ce jeton dédié.

La lecture administrative n’utilise jamais le mot de passe Gmail. Le statut « connecté » est annoncé à partir des informations persistées côté serveur. Lors de la révocation, Aurion tente de révoquer le jeton et supprime les jetons de la connexion de lecture ; le journal et les métadonnées déjà collectées sont conservés.

La détection de réponses est disponible pour **Gmail uniquement**. Elle est lancée manuellement, se limite aux domaines d’expéditeurs associés aux formalités suivies et exige une confirmation pour les correspondances incertaines. La connexion Outlook et sa synchronisation administrative ne sont pas implémentées.

## 4. Envoi de courriels administratifs

L’envoi est différent d’une demande de lecture Gmail. L’utilisateur doit inspecter et confirmer le destinataire, l’objet, le contenu et les pièces jointes dans Aurion. Un message n’est considéré « envoyé » qu’après confirmation d’envoi du fournisseur par un identifiant de message. Cet envoi reste un courriel, pas un dépôt officiel auprès d’un organisme.

Pour les courriels professionnels habituels, Aurion réutilise les services de messagerie configurés dans les paramètres. Un prestataire externe que Aurion ne contrôle pas peut ne pas appliquer la signature configurée.

## 5. Stockage des fichiers et antivirus

Les documents administratifs sont conservés dans le stockage privé de l’organisation. Le type annoncé et les signatures de fichiers sont vérifiés pour les formats pris en charge ; la taille maximale de téléversement administratif est de 25 Mio. Une validation de signature ne remplace pas une analyse antivirus : le scan antivirus n’est pas implémenté dans cette version et l’API le signale avec `virusScan: not_available`.

Ne rendez pas public le répertoire de stockage privé. En test, vérifiez que les comptes d’organisations différentes ne peuvent jamais télécharger les documents les uns des autres.

## 6. Migration et vérification

1. Créer une base jetable de test et prendre une sauvegarde avant toute migration sur une base non jetable.
2. Installer toutes les dépendances définies par `backend/package-lock.json`.
3. Exécuter le mécanisme de migration existant du projet sur la base de test, avec le rôle DDL dédié.
4. Vérifier que la migration `065_guided_journey_administrative_addresses.sql` est enregistrée comme appliquée et qu’elle n’a pas été exécutée deux fois de façon destructive.
5. Exécuter `npm run build`, `npm run typecheck`, les tests `npm --prefix backend test` et les scénarios d’intégration avec la variable d’environnement et la base jetable définies selon les conventions du projet.
6. Tester l’export sur une organisation de test : contrôler l’ouverture du ZIP, la présence des documents et métadonnées attendus, ainsi que l’absence de jetons/secrets et de données d’autres organisations.

Le build et la migration PostgreSQL n’ont pas pu être exécutés dans l’environnement ayant produit ce ZIP, car l’installation des paquets échouait à joindre le registre npm et `psql` n’était pas disponible. Ne considérer ces étapes comme validées qu’après exécution dans un environnement équipé.
