# Cible de déploiement Aurion — Render Frankfurt

> **État réel vérifié le 30 octobre 2026 :** les changements 15.3.20 se trouvent uniquement sur la branche privée `aurion/company-existing-only-15.3.20` dans le PR #28; ils ne sont pas intégrés à `main` et aucun déploiement de cette version n’a été effectué. Les deux services Render restent sur le plan Free, malgré les paramètres de build Starter indiqués dans le blueprint. `aurion-web` (Oregon) sert encore la version 15.3.18; la tentative manuelle de mise à jour 15.3.19 a échoué. `aurion` (Frankfurt) sert encore la version 15.3.18 et son contrôle de santé n’est pas configuré. La CI GitHub de la branche se termine en échec avant l’exécution de la moindre étape : build, types et tests ne sont pas certifiés. Ne pas déployer la branche ni synchroniser le blueprint avant la configuration Frankfurt, la sauvegarde de la base et la migration des fichiers.

Render a déjà un service `aurion` en région Frankfurt et un `aurion-web` en Oregon, tous deux sur le plan gratuit au contrôle du 30 octobre 2026. `aurion-web` répond à `/health/db` en Oregon; le service Frankfurt n’a pas de configuration backend complète et redirige actuellement vers Oregon. La version 15.3.20 de `render.yaml` cible le nom existant `aurion` et demande un plan `starter`. Le connecteur Render peut déclencher un déploiement et modifier les variables, mais ne permet pas de lire les variables déjà présentes ni de mettre à niveau directement le plan. Un sync de Blueprint peut modifier et redéployer ce service; vérifier le diff de ressources avant de confirmer. Le Blueprint ne crée ni base, ni bucket, ni fournisseur de courriel. Suivre d’abord [le plan de bascule Frankfurt 15.3.20](PLAN-BASCULE-FRANKFURT-15.3.20.md).

Le commit 15.3.20 (`c1bf397`) est maintenant poussé sur `main`; Render a enregistré `commit_ignored` et n’a déployé aucun service. Ne déclencher le déploiement Frankfurt qu’après passage au plan convenu, configuration DB/S3, copie contrôlée des secrets et approbation des migrations 070–072.

## Configuration attendue

- Runtime Node.js 22.16.0 ou supérieur, conformément aux manifests du projet.
- Build : `npm ci --prefix backend --include=dev --no-audit --no-fund && npm run build`.
- Start : `npm --prefix backend start`.
- Health check Blueprint : `GET /health/db`; vérifier aussi `GET /health`.
- `HOST=0.0.0.0`, `NODE_ENV=production`, `COOKIE_SECURE=true`.
- Variables sensibles : `DATABASE_URL`, `AURION_MIGRATION_DATABASE_URL`, `AURION_RUNTIME_DB_ROLE`, `JWT_SECRET`, `AURION_ENCRYPTION_KEY`, et les clés SMTP, S3, Stripe et OAuth activées.
- Variables de domaine : `CORS_ORIGIN` et `APP_BASE_URL` doivent correspondre à l’URL HTTPS exacte de ce service.

## Base de données

Le Blueprint ne provisionne aucune base PostgreSQL. Il faut réutiliser uniquement une base déjà dédiée à Aurion et dont la sauvegarde est disponible. Ne pas utiliser la base Aurion comme base de VYRATY, ni l’inverse. Vérifier le serveur et la base cibles sans recopier le mot de passe dans les journaux. Exécuter les migrations via la procédure de déploiement prévue par le projet, avec un rôle limité et après sauvegarde.

## Données persistantes

En production, le mode local n’est pas autorisé : la version 15.3.20 exige `AURION_STORAGE_BACKEND=s3` et des clés de stockage configurées. La cible utilise un bucket OVHcloud privé à Francfort (`https://s3.de.io.cloud.ovh.net`, région `de`). Render indique que le système de fichiers est éphémère par défaut sans disque persistant; ne pas l’utiliser comme archive des documents Aurion. Configurer le bucket, la migration depuis le service existant, les règles de rétention et une sauvegarde indépendante en UE, puis tester une restauration.

## Sécurité des secrets

- Ne jamais ajouter `.env`, clés, URL PostgreSQL avec mot de passe ou sauvegardes au ZIP/Git.
- `JWT_SECRET` et `AURION_ENCRYPTION_KEY` doivent rester stables et sauvegardés hors dépôt. Modifier la clé de chiffrement peut rendre les secrets déjà enregistrés indéchiffrables.
- Les paramètres Google OAuth, SMTP et paiements ne doivent être activés que lorsque leurs identifiants et URL de rappel sont valides.
- Le statut `/health` indique seulement que le processus répond ; il ne prouve pas que les parcours métier, la base, les courriels ou les restaurations sont validés.

## Ancien script de déploiement manuel

Après une publication GitHub vérifiée, si le service existant est bien relié à `wooffey78/aurion`, branche `main`, mais que l’auto-déploiement Render est désactivé :

1. Définir `RENDER_API_KEY` dans la session PowerShell uniquement (ne jamais le placer dans un fichier du dépôt).
2. Depuis une extraction propre, lancer `.\tools\Deploy-Aurion-Render.ps1 -ServiceId srv-...` et confirmer avec `DEPLOYER`.
3. Le script refuse un dépôt, une branche, un type de service ou un plan inattendu ; il n’effectue aucune modification des variables d’environnement et ne crée pas de base. Il ne lance pas de second déploiement si l’auto-déploiement est activé.
4. Après le build, vérifier `/health`, `/health/db`, les journaux et les parcours fonctionnels. La clé API Render n’est jamais affichée par le script.

`tools/Deploy-Aurion-Render.ps1` ne prépare pas le service Frankfurt existant et ne migre ni la base ni les fichiers. Il ne doit pas servir à déplacer le trafic. Le plan Frankfurt ci-dessus est la procédure de référence pour cette cible; aucune action externe n’a été exécutée pour cette livraison locale.
