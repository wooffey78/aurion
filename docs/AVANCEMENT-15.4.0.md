# Avancement Aurion 15.4.0

Dernière mise à jour : 31 octobre 2026 (Europe/Paris).
Base retenue par le propriétaire : archive Aurion 15.3.20, commit `eba2a831d9a37a194bef266cf6c57985d7c29787`.
Branche d'intégration : `integration/15.4.0`.
Mode de déploiement : `final` (aucun déploiement intermédiaire).

## Règles de mesure

Chaque tâche vaut 0 % (non commencée), 50 % (exécutée/écrite mais non validée) ou 100 % (preuve et validation acquises). Le pourcentage d'un bloc est la moyenne arithmétique de ses tâches. Le pourcentage global est la somme des poids multipliés par les pourcentages des blocs.

## Tableau des blocs

| Bloc | Intitulé | Poids | Avancement |
|---|---|---:|---:|
| B0 | Cadrage et base de référence | 5 % | 80 % |
| B1 | Retrait complet de l'IA | 10 % | 0 % |
| B2 | Retrait de la recherche par nom + détection SIRET/SIREN améliorée | 12 % | 0 % |
| B3 | Modèle de données et propagation (source unique) | 12 % | 0 % |
| B4 | Parcours : conception et étapes 1 à 3 | 15 % | 0 % |
| B5 | Parcours : logo, messagerie, signature, récapitulatif | 15 % | 0 % |
| B6 | Mon compte et rétractation | 8 % | 0 % |
| B7 | Charte graphique unifiée du parcours | 10 % | 0 % |
| B8 | Nettoyage config, Brevo, documentation, versions, sécurité | 5 % | 0 % |
| B9 | Non-régression finale | 5 % | 0 % |
| B10 | Release et déploiement | 3 % | 0 % |
| | **Total** | **100 %** | |

**Avancement global : 4,00 %** (5 % × 80 % pour B0 ; tous les autres blocs sont à 0 %).

## Détail B0 — Cadrage (5 %)

| Tâche | Résultat | Avancement |
|---|---|---:|
| B0.1 Vérifier l'identité du dépôt et comparer l'archive à `origin/main` | Archive identifiée exactement au commit `eba2a831`. Divergence expliquée : archive +3 commits depuis l'ancêtre commun, `main` +1 commit. Le propriétaire a choisi explicitement l'archive 15.3.20 et la reprise du changement de test utile de `main`. | 100 % |
| B0.2 Créer `integration/15.4.0` et activer la CI sur `integration/**` | Branche créée depuis `eba2a831`. Contrôles de préparation repris dans un commit atomique ; workflow étendu aux événements push et pull_request sur `integration/**`. Aucun contrôle supprimé ou affaibli. | 100 % |
| B0.3 Installer, compiler, typecheck, `npm run check`, `node --test` | Exécution partielle. `npm ci` bloqué par la résolution DNS du registre npm (`EAI_AGAIN)); compilation et `npm run check` interrompus pendant l'installation. `typecheck` échoue faute de types installés. Tests de fumée : 66 tests, 59 réussis, 7 échecs de référence. Suite `node --test` : 277 tests, 244 réussis, 31 échecs, 2 ignorés ; dépendances absentes dont `pg`. | 50 % |
| B0.4 Créer le suivi et l'inventaire fichier:ligne | Présent dans `AVANCEMENT-15.4.0.md` et `INVENTAIRE-15.4.0-B0.md`. | 100 % |
| B0.5 Vérifier les prérequis GitHub/Render en lecture seule | Accès GitHub administrateur confirmé. Deux services Render relevés ; le service Frankfurt cible est encore sur Free et sa configuration active diverge du Blueprint. Le connecteur disponible ne permet pas de lire la liste des noms de variables d'environnement ; aucune valeur de secret n'a été demandée ou affichée. | 50 % |

**Moyenne B0 : (100 + 100 + 50 + 100 + 50) / 5 = 80 %.**

## Détails techniques et preuves

### Références Git

- Archive : `aurion-15.3.20.zip`, SHA-256 `aa7962a20f8ea521388636d17f237c090de6fcf70450614f841c9b6b0bcd7e48`.
- Versions cohérentes dans `VERSION.txt`, `package.json` et `backend/package.json` : `15.3.20`.
- Commit archive : [`eba2a831d9a37a194bef266cf6c57985d7c29787`](https://github.com/wooffey78/aurion/commit/eba2a831d9a37a194bef266cf6c57985d7c29787).
- Ancêtre commun avec `main` : `8301e97405c3817d0ca0fb662c81204a874f06d1`.
- Commit supplémentaire de `main` examiné : [`5de3380d67412dcc2f32096edaef2db3de6cfb95`](https://github.com/wooffey78/aurion/commit/5de3380d67412dcc2f32096edaef2db3de6cfb95). Il modifie uniquement `backend/tests/production-readiness.test.mjs`.
- Reprise contrôlée du test sur `integration/15.4.0` : commit `5b764e65fc33a50f96ebaafa8b70c07498bf8303`.
- Activation des déclencheurs CI : commit `21972416d1e5b832fd7083ead8d46af71bc31f51`.
- Comparaison GitHub de l'intégration à l'archive : 2 commits, 2 fichiers, sans divergence supplémentaire.
- Le clone Git local n'a pas abouti : `github.com` n'était pas résolu par le DNS de l'environnement. Les références distantes ont été vérifiées au moyen de l'accès GitHub connecté. L'archive ne contient pas de dossier `.git`.

### Résultats d'exécution locaux

Environnement : Node.js `v22.16.0`, npm `10.9.2`, Git `2.47.3`.

- `npm ci --prefix backend --include=dev --no-audit --no-fund` : délai dépassé ; les journaux npm indiquent `EAI_AGAIN registry.npmjs.org`.
- `npm run build` : dépendances manquantes, installation préalable bloquée.
- `npm run typecheck` : échec TS2688 pour les types `adm-zip`, `node`, `nodemailer`, `pdfkit`, `pg` et `smtp-server`, car l'installation n'a pas abouti.
- `npm run check` : arrêté à l'installation des dépendances, sans atteindre les étapes suivantes.
- `node --test backend/tests/production-readiness.test.mjs` après reprise des assertions de `main` : 9/9 réussis.
- `npm run test:smoke` : 66 tests, 59 réussis, 7 en échec. Les sept échecs sont ceux de la base déclarée dans le cahier des charges : contrôle de fond/texte CSS, contrat de recherche par nom, test de configuration initiale, trois contrats biométrie/passkeys, et contrat de route `GET /journal/events`. Aucun test n'a été désactivé ou modifié pour masquer ces résultats.
- `node --test` : 277 tests, 244 réussis, 31 en échec, 2 ignorés. Le premier échec d'import est lié au paquet `pg` absent ; les autres échecs ne sont pas tous attribués à une cause certaine à ce stade.
- Docker et `psql` ne sont pas installés dans l'environnement local ; PostgreSQL 17 jetable n'a donc pas pu être lancé ici.

### Contrôles GitHub et Render en lecture seule

- Dépôt privé `wooffey78/aurion`, branche par défaut `main`, permission GitHub `admin` confirmée.
- PR B0 : [#31](https://github.com/wooffey78/aurion/pull/31), ouverte vers `integration/15.4.0`, non fusionnée.
- Exécution GitHub Actions associée à la PR : run `41158823161`. Deux tentatives ont échoué avant attribution d'un runner : `runner_id=0`, nom de runner vide, aucune étape (`steps=[]`), échec au bout de 3 à 4 secondes. La relance `rerun_failed_workflow_run_jobs` a été acceptée, mais la tentative 2 a reproduit le même échec. Les journaux GitHub ne sont pas disponibles (`404 BlobNotFound`). Aucune commande du workflow n'a été exécutée ; cause côté GitHub Actions non déterminée (quota/facturation, politique d'exécution ou indisponibilité des runners à vérifier dans les paramètres GitHub).  PR non fusionnée. Une troisième exécution distincte (run `41159454170`, run number 226) sur le dernier commit de la PR a reproduit l'échec immédiat sans runner (`runner_id=0`, aucune étape).
- Workspace Render : `My Workspace`.
- Service Frankfurt `aurion` : ID `srv-dbfut4t9el5s73bcj0gg`, région Frankfurt, plan Free, branche `main`, auto-déploiement activé, commande de build `npm run build && npm run migrate`, démarrage `npm start`, aucun health check configuré dans les détails du service. Dernier déploiement `dep-dbig3e2vcj2c73fb1450` (commit `eba2a831`) : statut Render `live`, mais les journaux applicatifs montrent que `start-render-compat.mjs` a refusé de démarrer le backend et sert une réponse 503 en mode sûr (« configuration de production incomplète »). `hasProductionBackendConfig()` exige notamment `DATABASE_URL`, `JWT_SECRET`, `AURION_ENCRYPTION_KEY` (32 caractères minimum), `AURION_ENCRYPTION_KEY_VERSION`, `APP_BASE_URL`, `CORS_ORIGIN`, `AURION_SUPPORT_EMAIL`, `COOKIE_SECURE=true`, `NODE_ENV=production`, ainsi que `AURION_MIGRATION_DATABASE_URL`, `AURION_RUNTIME_DB_ROLE`, `AURION_STORAGE_BACKEND=s3`, `AURION_S3_BUCKET`, `AURION_S3_ACCESS_KEY` et `AURION_S3_SECRET_KEY` sur Render. Le connecteur ne permet pas d'identifier lesquelles manquent sans lire les variables ; leurs valeurs n'ont pas été demandées, consultées, ni modifiées.
- Service Oregon `aurion-web` : ID `srv-dbfv74ec6qcc73dq3ip0`, plan Free, branche `main`, auto-déploiement activé, health check `/health/db`.
- Le `render.yaml` de l'archive cible le service `aurion` en Frankfurt en plan `starter`, avec health check `/health/db` et stockage S3. La configuration active relevée ne correspond pas encore à cette cible.
- Les variables d'environnement Render n'ont pas été modifiées. Le connecteur en lecture seule utilisé ne permet pas de lister les noms de variables existantes ; leur présence n'est donc pas certifiée.

## État du bloc et conditions de reprise

**B0 : PARTIEL — non validé.** L'intégration est fondée sur le commit demandé et son cadrage est documenté, mais la compilation, le typecheck, `npm run check`, la base PostgreSQL 17 et l'état CI distant ne sont pas certifiés. GitHub Actions ne parvient pas à attribuer un runner. Render affiche le déploiement Frankfurt en état plateforme `live`, mais le serveur applicatif renvoie 503 en mode sûr en raison d'une configuration de production incomplète. Aucun nouveau déploiement ne doit être déclenché avant résolution des paramètres de production indispensables et vérification de la sauvegarde Neon si une migration est prévue.

**Aucun démarrage de B1 tant que B0 n'est pas validé.** Aucun déploiement, aucune migration de production, aucune modification des services ou variables Render, aucun changement de Neon/Stripe/Google, et aucune publication juridique n'ont été effectués.

Le rapport fichier:ligne de l'inventaire initial est dans [`INVENTAIRE-15.4.0-B0.md`](INVENTAIRE-15.4.0-B0.md).
