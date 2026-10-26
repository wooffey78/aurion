# Déploiement Aurion sur Render

## Configuration attendue

- Runtime Node.js, version compatible avec Node 20+ (Node 22 recommandé).
- Build : `npm ci --prefix backend --include=dev --no-audit --no-fund && npm run build`.
- Start : `npm --prefix backend start`.
- Health check : `GET /health`.
- `HOST=0.0.0.0`, `NODE_ENV=production`, `COOKIE_SECURE=true`.
- Variables sensibles : `DATABASE_URL`, `JWT_SECRET`, `AURION_ENCRYPTION_KEY`.
- Variables de domaine : `CORS_ORIGIN` et `APP_BASE_URL` doivent correspondre à l’URL HTTPS exacte de ce service.

## Base de données

Le Blueprint ne provisionne aucune base PostgreSQL. Il faut réutiliser uniquement une base déjà dédiée à Aurion et dont la sauvegarde est disponible. Ne pas utiliser la base Aurion comme base de VYRATY, ni l’inverse. Vérifier le serveur et la base cibles sans recopier le mot de passe dans les journaux. Exécuter les migrations via la procédure de déploiement prévue par le projet, avec un rôle limité et après sauvegarde.

## Données persistantes : limite à traiter

Les pièces jointes sont enregistrées sous `backend/storage/private`. Le système de fichiers local des services web Render gratuits n’offre pas une persistance documentaire fiable entre redéploiements/redémarrages. Le déploiement peut servir à une validation fonctionnelle, mais il ne doit pas être présenté comme prêt à accueillir durablement des documents clients avant migration vers un stockage objet privé, règles de rétention et test de restauration.

## Sécurité des secrets

- Ne jamais ajouter `.env`, clés, URL PostgreSQL avec mot de passe ou sauvegardes au ZIP/Git.
- `JWT_SECRET` et `AURION_ENCRYPTION_KEY` doivent rester stables et sauvegardés hors dépôt. Modifier la clé de chiffrement peut rendre les secrets déjà enregistrés indéchiffrables.
- Les paramètres Google OAuth, SMTP et paiements ne doivent être activés que lorsque leurs identifiants et URL de rappel sont valides.
- Le statut `/health` indique seulement que le processus répond ; il ne prouve pas que les parcours métier, la base, les courriels ou les restaurations sont validés.

## Déploiement manuel sans toucher aux ressources

Après une publication GitHub vérifiée, si le service existant est bien relié à `wooffey78/aurion`, branche `main`, mais que l’auto-déploiement Render est désactivé :

1. Définir `RENDER_API_KEY` dans la session PowerShell uniquement (ne jamais le placer dans un fichier du dépôt).
2. Depuis une extraction propre, lancer `.\tools\Deploy-Aurion-Render.ps1 -ServiceId srv-...` et confirmer avec `DEPLOYER`.
3. Le script refuse un dépôt, une branche, un type de service ou un plan inattendu ; il n’effectue aucune modification des variables d’environnement et ne crée pas de base. Il ne lance pas de second déploiement si l’auto-déploiement est activé.
4. Après le build, vérifier `/health`, `/health/db`, les journaux et les parcours fonctionnels. La clé API Render n’est jamais affichée par le script.

Le script requiert GitHub à jour (`main` local identique à `origin/main`), une variable `DATABASE_URL` présente directement sur le service (pas seulement via un groupe d’environnement) et un plan gratuit. Pour un plan payant explicitement voulu, le paramètre `-AllowNonFreePlan` doit être ajouté.
