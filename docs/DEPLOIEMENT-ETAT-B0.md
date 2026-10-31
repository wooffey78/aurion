# Aurion 15.3.20 — État du déploiement B0

Date du diagnostic : 31 octobre 2026. Base applicative : archive 15.3.20, commit `eba2a831d9a37a194bef266cf6c57985d7c29787`.

## GitHub

- Dépôt privé : `wooffey78/aurion`.
- Branche de travail : `integration/15.4.0`.
- PR B0 : [#31](https://github.com/wooffey78/aurion/pull/31), vers `integration/15.4.0`.
- Exécution Actions : run `41158823161`, tentative 1 puis tentative 2 après relance.
- Les deux tentatives terminent avant la première étape : `runner_id=0`, `runner_name` vide, `steps=[]`. L'exécution ne démontre donc ni échec de compilation ni échec de test ; elle démontre que le runner n'a pas été attribué.
- La relance via l'API GitHub a été acceptée mais n'a pas changé le résultat.
- Les journaux de ce run répondent `404 BlobNotFound`.
- Après la mise à jour documentaire de la PR, une troisième exécution distincte a été créée : run `41159454170` (run number 226), échouée en 2 secondes avec `runner_id=0`, `runner_name` vide et `steps=[]`. La PR reste sans exécution CI réelle.
- Cause racine non déterminée : disponibilité des runners hébergés, paramètres Actions du dépôt/compte ou limite de facturation/quota à vérifier dans les paramètres GitHub. Il ne faut ni désactiver le workflow ni contourner les vérifications.
- La PR reste ouverte et non fusionnée ; aucun push direct vers `main`.

## Render — service canonique

- Workspace : `My Workspace`.
- Service canonique observé : `aurion`, ID `srv-dbfut4t9el5s73bcj0gg`, région Frankfurt, branche liée `main`, plan actif Free.
- Dernier déploiement : `dep-dbig3e2vcj2c73fb1450`, commit `eba2a831d9a37a194bef266cf6c57985d7c29787`, statut plateforme `live`.
- Les journaux montrent toutefois que `tools/start-render-compat.mjs` démarre en mode de fermeture sûre et affiche : configuration de production incomplète sur l'origine canonique. Ce lanceur répond HTTP 503 au lieu de démarrer Fastify. Le statut `live` dans Render ne signifie donc pas que l'application est opérationnelle.
- La configuration active relevée : build `npm run build && npm run migrate`, démarrage `npm start`, aucun `healthCheckPath`. Le Blueprint de l'archive définit un build via `npm ci --prefix backend --include=dev --no-audit --no-fund && npm run build`, démarrage `npm --prefix backend start` et health check `/health/db`.
- Service distinct `aurion-web`, ID `srv-dbfv74ec6qcc73dq3ip0`, région Oregon, Free : ses journaux indiquent qu'en l'absence de backend complet le lanceur le redirige vers l'origine canonique. Il ne doit pas être substitué au service Frankfurt.
- Le service Frankfurt a été déployé sur Free alors que le Blueprint demande Starter. Le passage sur Starter pourrait entraîner une facturation ; aucun changement de plan n'a été appliqué.

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

1. Dans GitHub, rétablir l'exécution des GitHub-hosted runners (vérifier Actions autorisées sur le dépôt, quota/facturation et disponibilité du runner), puis relancer la PR #31. La PR ne doit pas être fusionnée avant que les contrôles requis soient réellement exécutés et verts.
2. Dans Render Dashboard, ouvrir le service Frankfurt `aurion` et vérifier les noms des variables listées ci-dessus. Renseigner les valeurs existantes de Neon et OVH directement dans Render, sans les transmettre dans le chat. Ne pas générer de nouvelle clé de chiffrement ou JWT pour remplacer une valeur possiblement utilisée par des données existantes.
3. Confirmer la sauvegarde Neon avant toute release susceptible d'appliquer des migrations. Le démarrage `backend/package.json` applique les migrations avant le serveur.
4. Vérifier le stockage S3 et les URLs CORS/APP_BASE_URL, puis adopter une seule source de vérité de configuration (Blueprint ou Dashboard). Ne pas synchroniser un Blueprint incomplet.
5. Après démarrage réussi du backend, configurer le health check HTTP `/health/db` et vérifier qu'il répond 2xx/3xx.
6. Déployer le commit exact, suivre le déploiement jusqu'au statut Render `live`, vérifier `/health/db`, puis consulter les journaux d'exécution.

## Actions non exécutées

Aucun secret ni variable Render modifié ; aucun service Render reconfiguré ; aucun upgrade payant ; aucune migration appliquée ; aucun déploiement supplémentaire ; aucune fusion dans `main`. L'application est encore en mode 503 sur l'origine canonique au moment du diagnostic.
