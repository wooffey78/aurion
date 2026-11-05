# Aurion 15.4.0

Application de gestion pour entreprises déjà immatriculées, avec interface web/PWA et API Node.js/Fastify/PostgreSQL.

Aurion ne propose ni parcours de création d’entreprise, ni studio d’identité visuelle, ni intelligence artificielle, ni recherche d’entreprise par nom. À la première connexion, un parcours en 8 étapes (Vous, Entreprise avec détection SIRET/SIREN au clic, Activité, Logo facultatif, Messagerie, Signature e-mail, Documents dans le cloud, Récapitulatif) écrit directement dans les fiches lues par Paramètres et « Mon compte ».

Nouveautés 15.4.0 : stockage documentaire dans le Google Drive de l’utilisateur (file d’attente hors ligne, reprise automatique, quota et alertes dans le journal de bord), notes de frais intégrées à la comptabilité et à la trésorerie, rétractation déplacée dans « Mon compte ». Voir `CHANGELOG-15.4.0.md`, `docs/CLOUD-STOCKAGE-15.4.0.md` et `docs/PARCOURS-15.4.0.md`.

## Développement local

1. Installer Node.js 22.16.0 ou supérieur et PostgreSQL.
2. Copier `backend/.env.example` en `backend/.env` et configurer une base **réservée à Aurion**.
3. Depuis la racine : `npm ci --prefix backend`, puis `npm run build`.
4. Appliquer les migrations selon la procédure décrite dans `backend/package.json`, puis lancer `npm start`.
5. Contrôler `http://127.0.0.1:4000/health/db` (base joignable) et exécuter `npm run check`.

Pour l’installation Windows autonome, suivre `README-INSTALLATION.md`. Pour Render, lire `docs/DEPLOIEMENT-RENDER.md`. `render.yaml` décrit les deux services existants (Frankfurt `aurion` et Oregon `aurion-web`), avec déploiement automatique désactivé ; il ne crée ni la base Neon ni le stockage S3.

L’archive de sources ne contient ni dépendances installées, ni secrets locaux, ni journaux ou données d’exécution. Installez les dépendances à partir du fichier de verrouillage avant le build. LibreOffice est téléchargé en ligne par l’installateur Windows si nécessaire ; le MSI n’est pas inclus dans l’archive source.

Après avoir exécuté les contrôles, créez une archive de sources propre avec `pwsh tools/Build-Source-Archive.ps1 -Out <chemin-de-sortie.zip>`. Le script conserve la racine du projet et ses fichiers de verrouillage, vérifie les trois versions déclarées et exclut les dépendances, builds et données locales.

## Publication

Ne jamais commiter les fichiers `.env`, `backend/storage/`, exports de base ou secrets. Toute mise en production doit conserver une base dédiée à Aurion, les clés de chiffrement persistantes et une stratégie de sauvegarde/restauration vérifiée.

Pour une première publication, utiliser `tools/Publish-Aurion.ps1` depuis une extraction propre. Pour un service Render existant dont l’auto-déploiement est désactivé, utiliser `tools/Deploy-Aurion-Render.ps1` après avoir configuré `RENDER_API_KEY` dans la session PowerShell. Ces scripts refusent de remplacer une branche distante existante ou de modifier les ressources/variables Render.
