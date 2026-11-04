# Avancement Aurion 15.4.0

Dernière mise à jour : 4 novembre 2026 (Europe/Paris).
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
| B0.3 Installer, compiler, typecheck, `npm run check`, `node --test` | Validation distante réelle sur GitHub Actions (Ubuntu 24.04, Node 22, PostgreSQL 17) : installation, build, typecheck et migrations réussis. La comparaison au commit exact 15.3.20 confirme les mêmes échecs de référence, sans nouvel échec : smoke 66 tests (59 réussis, 7 échecs) ; suite complète 296 tests (278 réussis, 18 échecs). Le navigateur Playwright garde le même timeout `#sidebar` que la référence. Le contrôleur comparatif passe, mais `npm run check` et `npm test` restent non verts en mode strict. | 50 % |
| B0.4 Créer le suivi et l'inventaire fichier:ligne | Présent dans `AVANCEMENT-15.4.0.md` et `INVENTAIRE-15.4.0-B0.md`. | 100 % |
| B0.5 Vérifier les prérequis GitHub/Render en lecture seule | Deux services Render inspectés sans écriture. Le service Frankfurt `aurion` reste sur Free avec l'ancien build/start et sans health check ; dernier démarrage observé le 4 novembre à 08:53 UTC, toujours fermé en mode sûr par `start-render-compat.mjs`. Le service Oregon `aurion-web` a un déploiement `update_failed`. La liste des variables d'environnement n'est pas exposée par le connecteur ; aucune valeur secrète n'a été consultée ou modifiée. | 50 % |

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

### Résultats d'exécution locaux — diagnostic initial du 31 octobre

Environnement : Node.js `v22.16.0`, npm `10.9.2`, Git `2.47.3`.

- `npm ci --prefix backend --include=dev --no-audit --no-fund` : délai dépassé ; les journaux npm indiquent `EAI_AGAIN registry.npmjs.org`.
- `npm run build` : dépendances manquantes, installation préalable bloquée.
- `npm run typecheck` : échec TS2688 pour les types `adm-zip`, `node`, `nodemailer`, `pdfkit`, `pg` et `smtp-server`, car l'installation n'a pas abouti.
- `npm run check` : arrêté à l'installation des dépendances, sans atteindre les étapes suivantes.
- `node --test backend/tests/production-readiness.test.mjs` après reprise des assertions de `main` : 9/9 réussis.
- `npm run test:smoke` : 66 tests, 59 réussis, 7 en échec. Les sept échecs sont ceux de la base déclarée dans le cahier des charges : contrôle de fond/texte CSS, contrat de recherche par nom, test de configuration initiale, trois contrats biométrie/passkeys, et contrat de route `GET /journal/events`. Aucun test n'a été désactivé ou modifié pour masquer ces résultats.
- `node --test` : 277 tests, 244 réussis, 31 en échec, 2 ignorés. Le premier échec d'import est lié au paquet `pg` absent ; les autres échecs ne sont pas tous attribués à une cause certaine à ce stade.
- Docker et `psql` ne sont pas installés dans l'environnement local ; PostgreSQL 17 jetable n'a donc pas pu être lancé ici.

### Validation CI comparative — 4 novembre 2026

- Workflow exécuté sur `ubuntu-24.04`, Node.js 22 et PostgreSQL 17 jetable. `npm ci`, build TypeScript, typecheck et migrations PostgreSQL 17 : réussis.
- Playwright 1.56.1, dépendances système Chromium et binaire Chromium : installés avec succès. Le runner Ubuntu 24.04 est épinglé parce que Playwright 1.56.1 ne prend pas en charge Chromium sur Ubuntu 26.04.
- Référence exécutée sur le commit exact 15.3.20 `eba2a831d9a37a194bef266cf6c57985d7c29787` (run [#236](https://github.com/wooffey78/aurion/actions/runs/41824863953)) : smoke 65 tests (58 réussis, 7 échecs) ; suite complète 295 tests (277 réussis, 18 échecs) ; timeout navigateur sur `#sidebar`.
- Intégration contrôlée (run [#241](https://github.com/wooffey78/aurion/actions/runs/41826643139)) : smoke 66 tests (59 réussis, 7 échecs) ; suite complète 296 tests (278 réussis, 18 échecs) ; même timeout navigateur. L'intégration comporte un test supplémentaire réussi ; aucun échec supplémentaire n'a été introduit.
- Le contrôleur `verify-b0-baseline.mjs` confirme : aucun nouvel échec smoke, aucun nouvel échec de régression complète, timeout Playwright identique à la référence. Le job `quality` est vert.
- Confirmation sur la branche `integration/15.4.0` après fusion de la correction CI : runs push [#242](https://github.com/wooffey78/aurion/actions/runs/41827260107) et pull_request [#243](https://github.com/wooffey78/aurion/actions/runs/41827269343), tous deux verts.
- Important : le statut vert est celui de la comparaison à la baseline. Les 7 échecs smoke et 18 échecs complets restent présents ; `npm run check`, `npm test` et le parcours navigateur ne sont pas encore verts en validation stricte. Aucun test n'a été désactivé.

### Contrôles GitHub et Render en lecture seule — 4 novembre 2026

**GitHub**

- Dépôt privé `wooffey78/aurion`, branche par défaut `main`, permission GitHub `admin` confirmée.
- La PR de correction CI [#33](https://github.com/wooffey78/aurion/pull/33) a été fusionnée dans `integration/15.4.0` par squash, commit `2d4d493add404a3f982dea1022b2f6c4e93347f1`. Elle fixe le runner sur Ubuntu 24.04, sépare les étapes Playwright et ajoute la comparaison stricte aux échecs de référence sans les masquer.
- La PR documentaire B0 [#31](https://github.com/wooffey78/aurion/pull/31) est encore ouverte pendant l'actualisation de ces documents ; elle cible `integration/15.4.0`. Aucun push direct sur `main`.
- Le workflow `quality` s'exécute maintenant réellement. Runs #241, #242 et #243 ont terminé avec succès au niveau du contrôleur comparatif. Le détail de la baseline et des résultats est consigné ci-dessus.

**Render**

- Workspace : `My Workspace`.
- Service Frankfurt `aurion` : ID `srv-dbfut4t9el5s73bcj0gg`, URL `https://aurion-2hye.onrender.com`, région Frankfurt, branche `main`, plan actif `free`, auto-déploiement activé. Configuration active observée : build `npm run build && npm run migrate`, démarrage `npm start`, aucun health check (`healthCheckPath` vide).
- Dernier déploiement listé : `dep-dbilajqjnfac73auq9q0`, commit `5de3380d67412dcc2f32096edaef2db3de6cfb95`, version backend 15.3.19, déclenché manuellement le 31 octobre ; Render le marque `live` au niveau plateforme.
- Logs applicatifs les plus récents disponibles, le 4 novembre 2026 à 08:53:45 UTC : `npm start` puis `node tools/start-render-compat.mjs`, suivi de `[Aurion] Configuration de production incomplète sur l’origine canonique; service fermé en sécurité.` Le statut plateforme `live` ne prouve donc pas la santé de l'application ; le backend Fastify n'est pas démarré.
- Service Oregon `aurion-web` : ID `srv-dbfv74ec6qcc73dq3ip0`, URL `https://aurion-web-o6ah.onrender.com`, plan actif `free`, branche `main`, health check `/health/db`. Son dernier déploiement observé (`dep-dbilam8u01pc73d924v0`) est `update_failed` depuis le 31 octobre.
- Le Blueprint de l'archive cible Frankfurt en plan `starter`, build `npm ci --prefix backend --include=dev --no-audit --no-fund && npm run build`, démarrage `npm --prefix backend start`, health check `/health/db` et stockage S3. La configuration active de Frankfurt diverge de cette cible.
- Le connecteur ne permet pas de lire la liste des variables Render ; il n'est donc pas possible de dire précisément lesquelles manquent. Aucune variable, valeur secrète, configuration de service ou plan n'a été modifié.

## État du bloc et conditions de reprise

**B0 : PARTIEL — 80 %, non validé.** Le cadrage, l'inventaire, le build, le typecheck et les migrations PostgreSQL 17 sont documentés et exécutés. La CI comparative est verte et prouve l'absence de nouvelle régression par rapport à 15.3.20. Toutefois, 7 tests smoke et 18 tests complets restent en échec (déjà présents dans la référence) et le test navigateur garde son timeout historique. Render Frankfurt reste en fermeture sûre faute de configuration de production complète. Le B0 n'est donc pas clôturé en validation stricte ; B1 ne démarre pas. Aucun nouveau déploiement ne doit être déclenché avant correction des tests de référence et remise en état contrôlée de Render.

**Aucun démarrage de B1 tant que B0 n'est pas validé.** Aucun déploiement, aucune migration de production, aucune modification des services ou variables Render, aucun changement de Neon/Stripe/Google, et aucune publication juridique n'ont été effectués.

Le rapport fichier:ligne de l'inventaire initial est dans [`INVENTAIRE-15.4.0-B0.md`](INVENTAIRE-15.4.0-B0.md).
