# Aurion 15.2.31

Application de gestion pour indépendants et petites entreprises, avec interface web/PWA et API Node.js/Fastify/PostgreSQL.

## Développement local

1. Installer Node.js 20 ou supérieur et PostgreSQL.
2. Copier `backend/.env.example` en `backend/.env` et configurer une base **réservée à Aurion**.
3. Depuis la racine : `npm ci --prefix backend`, puis `npm run build`.
4. Appliquer les migrations selon la procédure décrite dans `backend/package.json`, puis lancer `npm start`.
5. Contrôler `http://127.0.0.1:4000/health` et exécuter `npm run check`.

Pour l’installation Windows autonome, suivre `README-INSTALLATION.md`. Pour Render et ses limites de stockage, lire `docs/DEPLOIEMENT-RENDER.md`. La configuration Render de référence est dans `render.yaml`.

## Publication

Ne jamais commiter les fichiers `.env`, `backend/storage/`, exports de base ou secrets. Toute mise en production doit conserver une base dédiée à Aurion, les clés de chiffrement persistantes et une stratégie de sauvegarde/restauration vérifiée.

Pour une première publication, utiliser `tools/Publish-Aurion.ps1` depuis une extraction propre. Pour un service Render existant dont l’auto-déploiement est désactivé, utiliser `tools/Deploy-Aurion-Render.ps1` après avoir configuré `RENDER_API_KEY` dans la session PowerShell. Ces scripts refusent de remplacer une branche distante existante ou de modifier les ressources/variables Render.
