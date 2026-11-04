# Aurion 15.3.20 — État du déploiement B0

Date du diagnostic actualisée : 4 novembre 2026. Base applicative : archive 15.3.20, commit `eba2a831d9a37a194bef266cf6c57985d7c29787`.

## GitHub

- Dépôt privé : `wooffey78/aurion`.
- Branche d'intégration : `integration/15.4.0`, base choisie : commit archive `eba2a831d9a37a194bef266cf6c57985d7c29787`.
- Le blocage initial de runner a été levé. La PR [#33](https://github.com/wooffey78/aurion/pull/33) a été fusionnée dans l'intégration par squash (`2d4d493add404a3f982dea1022b2f6c4e93347f1`).
- Cause technique du blocage Playwright : `ubuntu-latest` a fourni Ubuntu 26.04 alors que Playwright 1.56.1 ne prend pas en charge Chromium sur cette image. Le workflow est maintenant fixé sur `ubuntu-24.04` ; l'installation Playwright, les dépendances système et Chromium sont séparées en étapes CI observables.
- Run comparatif [#241](https://github.com/wooffey78/aurion/actions/runs/41826643139) terminé avec succès sur le commit de correction CI. Le contrôleur confirme zéro nouvel échec par rapport à la baseline exacte 15.3.20.
- Runs de confirmation sur `integration/15.4.0` : push [#242](https://github.com/wooffey78/aurion/actions/runs/41827260107) et pull_request [#243](https://github.com/wooffey78/aurion/actions/runs/41827269343), tous deux terminés avec succès.
- Résultat de test détaillé : référence 15.3.20, smoke 65/58/7 et suite complète 295/277/18 ; intégration, smoke 66/59/7 et suite complète 296/278/18. Les mêmes 7 tests smoke et 18 tests complets échouent dans les deux cas ; un test supplémentaire de l'intégration réussit. Le timeout Playwright sur `#sidebar` est identique.
- Le statut vert de la CI est un succès du contrôleur de non-régression baseline, pas un succès strict de toutes les suites. `npm run check` et `npm test` restent non verts tant que les tests historiques ne sont pas corrigés. Aucun test n'a été ignoré ou désactivé pour faire passer la comparaison.
- PR documentaire B0 [#31](https://github.com/wooffey78/aurion/pull/31) : encore ouverte pendant la mise à jour de ces rapports ; aucun push direct vers `main`.

## Render — service canonique

- Workspace : `My Workspace`.
- Service canonique : `aurion`, ID `srv-dbfut4t9el5s73bcj0gg`, région Frankfurt, URL `https://aurion-2hye.onrender.com`, branche `main`, plan actif `free`, auto-déploiement activé.
- Configuration observée : build `npm run build && npm run migrate`, démarrage `npm start`, aucun `healthCheckPath`. Le Blueprint de l'archive cible Starter, `npm ci --prefix backend --include=dev --no-audit --no-fund && npm run build`, `npm --prefix backend start`, health check `/health/db` et stockage S3 ; la configuration active diverge de cette cible.
- Dernier déploiement : `dep-dbilajqjnfac73auq9q0`, commit `5de3380d67412dcc2f32096edaef2db3de6cfb95`, backend 15.3.19, déclenché manuellement le 31 octobre 2026. Render le déclare `live` au niveau plateforme.
- Logs applicatifs récents du 4 novembre 2026 à 08:53:45 UTC : `npm start` lance `tools/start-render-compat.mjs`, qui affiche `[Aurion] Configuration de production incomplète sur l’origine canonique; service fermé en sécurité.` Fastify n'est pas démarré. Le statut plateforme `live` ne prouve pas une réponse applicative saine ; le service reste en mode 503.
- Aucun nouveau déploiement n'a été créé depuis le 31 octobre selon l'historique Render consulté. Aucune migration de production ni action de release n'a été déclenchée pendant le présent travail.
- Service Oregon `aurion-web`, ID `srv-dbfv74ec6qcc73dq3ip0`, URL `https://aurion-web-o6ah.onrender.com`, plan Free, branche `main`, health check `/health/db`. Son dernier déploiement listé (`dep-dbilam8u01pc73d924v0`) reste `update_failed` depuis le 31 octobre ; ne pas le substituer à Frankfurt.
- Les outils Render disponibles ne donnent pas la liste des noms de variables existantes. Les exigences du code sont indiquées ci-dessous ; il est impossible d'affirmer quelles variables précises manquent. Aucune valeur de secret n'a été lue ou modifiée.

## Configuration minimale exigée par le code

La fonction `hasProductionBackendConfig()` dans `tools/render-backend-config.mjs` renvoie faux et le backend n'est pas démarré tant que les exigences ci-dessous ne sont pas satisfaites. Pour un service Render en production, elle contrôle :

| Variable | Règle vérifiée |
|---|---|
| `NODE_ENV` | `production` |
| `COOKIE_SECURE` | `true` |
| `DATABASE_URL` | Connexion PostgreSQL du rôle runtime |
| `JWT_SECRET` | Secret de signature |
| `AURION_ENCRYPTION_KEY` | Au moins 32 caractères ; ne pas remplacer sans plan de rotation et vérification des données chiffrées |
| `AURION_ENCRYPTION_KEY_VERSION` | Non vide |
| `APP_BASE_URL` | Origine HTTPS publique, sans chemin |
| `CORS_ORIGIN` | Une ou plusieurs origines HTTPS publiques, séparées par virgules |
| `AURION_SUPPORT_EMAIL` | Adresse e-mail valide |
| `AURION_MIGRATION_DATABASE_URL` | Connexion de migration distincte |
| `AURION_RUNTIME_DB_ROLE` | Nom du rôle runtime PostgreSQL |
| `AURION_STORAGE_BACKEND` | `s3` |
| `AURION_S3_BUCKET` | Nom du bucket OVH S3 |
| `AURION_S3_ACCESS_KEY` | Clé d'accès OVH S3 |
| `AURION_S3_SECRET_KEY` | Secret OVH S3 |

Conditions supplémentaires si les intégrations sont activées :

- Stripe : `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` doivent être tous deux renseignés ou tous deux absents.
- Google : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` cohérente avec `APP_BASE_URL` et `GOOGLE_TOKEN_ENCRYPTION_KEY` d'au moins 32 caractères.

Ce tableau énumère les conditions du code ; il ne prouve pas quelles variables sont effectivement absentes. Les outils Render disponibles dans cette session ne fournissent pas la liste des clés d'environnement du service. Aucune valeur de variable n'a été consultée, affichée, inventée ou modifiée.

## Ordre sûr de remise en service

1. La CI GitHub fonctionne désormais sur Ubuntu 24.04 ; conserver cette image tant que Playwright 1.56.1 est utilisé. Ne pas réintroduire `ubuntu-latest` sans vérifier la compatibilité du navigateur.
2. Dans Render Dashboard, ouvrir le service Frankfurt `aurion` et vérifier les noms des variables listées ci-dessus. Renseigner les valeurs existantes de Neon et OVH directement dans Render, sans les transmettre dans le chat. Ne pas générer de nouvelle clé de chiffrement ou JWT pour remplacer une valeur possiblement utilisée par des données existantes.
3. Confirmer la sauvegarde Neon avant toute release susceptible d'appliquer des migrations. Le démarrage `backend/package.json` applique les migrations avant le serveur.
4. Vérifier le stockage S3 et les URLs CORS/APP_BASE_URL, puis adopter une seule source de vérité de configuration (Blueprint ou Dashboard). Ne pas synchroniser un Blueprint incomplet.
5. Après démarrage réussi du backend, configurer le health check HTTP `/health/db` et vérifier qu'il répond 2xx/3xx.
6. Déployer le commit exact, suivre le déploiement jusqu'au statut Render `live`, vérifier `/health/db`, puis consulter les journaux d'exécution.

## Actions non exécutées

Aucun secret ni variable Render modifié ; aucun service Render reconfiguré ; aucun upgrade payant ; aucune migration de production appliquée ; aucun déploiement Render supplémentaire ; aucune fusion dans `main`. L'intégration CI GitHub est opérationnelle, mais l'application Frankfurt reste en mode fermeture sûre/503 au dernier log consulté le 4 novembre 2026 à 08:53:45 UTC.
