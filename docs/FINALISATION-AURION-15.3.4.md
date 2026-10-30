# Finalisation Aurion 15.3.4 — audit de l’archive `main`

Date : 29 octobre 2026. Ce rapport décrit uniquement l’archive source nommée ci-dessous. Le prompt fourni est le cahier des charges ; les anciens rapports conservés dans `docs/` sont des traces historiques, pas des résultats de cette exécution.

## A. Source

- Archive reçue : `aurion-main.zip`.
- SHA-256 vérifié : `52193fcec1ff916f9fb3fe1612d24dbca1ef47d2b4ddc88e5eabba5bad9da956`.
- Taille : 445 969 098 octets, environ 425,3 MiB. Le ZIP contient 12 751 entrées : 11 086 fichiers et 1 665 répertoires ; sa racine est `aurion-main/`.
- Version vérifiée dans `VERSION.txt`, `package.json` et `backend/package.json` : `15.3.4`. Stack : Node.js `>=22.16.0`, JavaScript ES modules, TypeScript/Fastify, PostgreSQL, migrations SQL et PWA/service worker.
- Composants lourds ou locaux observés par nom et taille : environ 10 627 fichiers `node_modules` (377 MiB), le MSI LibreOffice `26.8.2` (375 934 976 octets), 61 fichiers `backend/dist`, deux journaux et 21 entrées de stockage/données locales. L’archive contenait également un `.env` réel sous `backend/` ; sa valeur n’a jamais été lue ni copiée dans ce rapport.
- L’archive source fournie n’a pas été modifiée. Le `.env` réel a été retiré de la copie de travail ; si l’archive a circulé hors d’un espace de confiance, son propriétaire doit considérer les identifiants comme potentiellement exposés et les renouveler.

## B. État initial

Commandes exécutées avant modification, sous Windows 11/PowerShell, Node.js `v24.11.1` et npm `11.6.2` :

- `npm test` : build TypeScript réussi, puis 272 tests backend : 265 réussis, 3 échoués, 4 ignorés.
- Les trois échecs initiaux sont les scénarios SMTP de `backend/tests/mail.test.mjs`. Le faux serveur SMTP démarre sur loopback, mais la connexion locale échoue avec `EACCES` dans cet environnement. Un test TCP minimal vers `127.0.0.1` a reproduit le même refus. Aucun service distant ni compte e-mail réel n’a été utilisé.
- `npm run test:frontend` : réussi ; 34 fichiers contrôlés par `node --check`, imports/exports de 33 modules vérifiés.
- `npm run test:smoke` : 48/48 réussis.
- `npm run test:brand` : 4/4 réussis avant ajout du contrôle de ZIP réel.

## C. Travaux réalisés

1. `README.md` et `README-INSTALLATION.md` annoncent maintenant la version source réelle `15.3.4`. Les changelogs historiques et les numéros de version du produit n’ont pas été réécrits.
2. La documentation d’installation précise que le MSI LibreOffice n’est pas livré dans les archives source ni setup, que son téléchargement en ligne est facultatif, et qu’il est nécessaire aux conversions DOCX/ODT en PDF.
3. Ajout de `tools/Build-Source-Archive.ps1` : il vérifie la cohérence des trois fichiers de version et la présence du lockfile, conserve la racine du projet, puis exclut les `.env` réels, dépendances, builds, MSI, logs, caches et données locales. Il rouvre et inspecte l’archive qu’il vient de créer avant d’annoncer sa taille et son empreinte.
4. Ajout d’un test `test:brand` qui construit puis rouvre un vrai ZIP en mémoire. Il vérifie les actifs annoncés et l’identité octet par octet du logo PNG intégré au SVG de présentation.
5. Le MSI de 358,5 MiB a été classé comme cache non requis : `tools/Build-Setup.ps1` exclut déjà `runtime/`, le guide d’installation exige Internet et le script principal poursuit l’installation lorsque LibreOffice échoue. Le script existant garde `Invoke-WebRequest -OutFile`, ses tentatives bornées, la vérification Authenticode et l’option facultative ; aucun BITS ni progression coûteuse n’a été ajouté.
6. Aucun changement n’a été apporté aux calculs, devis/factures, paiements, authentification, permissions, routes métier, migrations, modèles de données ou flux d’export d’organisation. Aucun paquet npm ni numéro de version n’a été ajouté ou modifié.

Fichiers modifiés : `README.md`, `README-INSTALLATION.md`, `tools/Build-Source-Archive.ps1`, `backend/tests/brand-assets-runtime.mjs`, `docs/AUDIT-VALIDATION-15.3.4-2026-10-28.md` (balisage historique) et ce rapport.

## D. Non-régression

- La commande racine `npm test` compile d’abord le backend, puis lance les tests qui chargent `backend/dist`. La compilation a réussi dans la copie source.
- Après modifications : `npm test` donne encore 265 réussis, 3 échoués et 4 ignorés sur 272. Les trois échecs sont les mêmes tests SMTP, bloqués par le refus loopback `EACCES` reproduit indépendamment.
- `npm run typecheck` : réussi.
- `npm run test:frontend` : réussi, 34 fichiers et 33 modules.
- `npm run test:smoke` : réussi, 48/48.
- `npm run test:brand` : réussi, 5/5, y compris la réouverture du ZIP et le contrôle du logo intégré.
- Le ZIP livré a été extrait avant test dans un dossier neuf, sans `backend/dist` ni `node_modules`. Après ajout temporaire des dépendances locales uniquement dans cette extraction, `npm test` a recompilé le backend et a donné les mêmes 265 réussis, 3 échecs loopback et 4 ignorés. Frontend, smoke, marque et typecheck ont aussi été relancés depuis cette extraction.

## E. État par domaine

| Domaine | État | Preuve ou limite |
|---|---|---|
| Parcours guidé | Partiel | Contrats présents et exécutables dans la suite ; reprise avec une base PostgreSQL et un navigateur non validée ici. |
| Règles administratives | Partiel | Le moteur existant est conservé ; les formalités, sources officielles et échéances n’ont pas fait l’objet d’une validation juridique exhaustive. |
| Documents historiques | Implémenté mais test externe requis | Modèles et code inchangés ; génération sur une base réelle et conversion LibreOffice non exécutées. |
| Messagerie et détection | Partiel | Les contrats SMTP unitaires sont limités par le refus loopback ; OAuth, Gmail et envoi réel non configurés ni testés. |
| Journal de bord | Partiel | Contrats de rendu présents ; intégration persistée et isolation par organisation non testées sur PostgreSQL. |
| Identité visuelle | Implémentée, ZIP de marque testé | Les ressources réelles du bundle et le logo intégré sont vérifiés ; qualité graphique métier et rendu dans des logiciels externes restent à valider. Les SVG raster ne sont pas présentés comme de la vectorisation. |
| Signature | Implémentée mais test externe requis | Aucun envoi ni rendu dans un client de messagerie réel. |
| Export complet | Partiel | Le ZIP de marque est couvert par un test ; l’export complet d’une organisation et son cloisonnement n’ont pas été exercés avec une base de test. |
| Adresses d’intervention | Partiel | Code et migration existants conservés ; migration et snapshots non testés sur PostgreSQL. |
| Responsive/accessibilité | Partiel | Règles CSS mobiles existantes conservées et contrôles smoke réussis ; aucune recette visuelle, mesure de contraste complète ou validation sur appareil n’a été effectuée. |
| Sécurité | Partiel | Paquet source assaini et contrats de confidentialité existants réussis ; audit global et test inter-organisation E2E non exécutés. |
| Performance | Non mesurée | Aucun profilage représentatif de l’application n’a été mené. |
| Installation Windows/LibreOffice | Implémentée mais test Windows réel requis | Le téléchargement HTTP direct, l’authentification du MSI et la poursuite facultative sont présents ; installation MSI, UAC, téléchargement distant et cas d’échec n’ont pas été exécutés. |

## F. Erreurs et limites restantes

- **Tests SMTP — environnement** : `backend/tests/mail.test.mjs` échoue sur trois scénarios car les connexions loopback sont refusées (`EACCES`). À rejouer sur une machine où le processus peut joindre son serveur SMTP local de test.
- **Parcours, export et migrations — intégration** : aucune `DATABASE_URL` de test migrée, Docker ou `psql` n’est disponible. `npm run test:browser` s’arrête avant Playwright ; le paquet Playwright est également absent de l’installation locale.
- **Recette utilisateur** : les écrans n’ont pas été testés sur navigateur, téléphone ou tablette ; le protocole existant `docs/RECETTE-RESPONSIVE-15.3.4.md` reste à exécuter.
- **Secret source** : le ZIP reçu contenait un `.env` réel. Aucune valeur n’est reproduite. Renouveler ses secrets si cette archive a été partagée au-delà d’un espace de confiance.
- **Commercialisation** : les paramètres OAuth/SMTP, obligations juridiques, politique de stockage/restauration, génération documentaire réelle et sécurité inter-organisation restent à valider dans un environnement de recette dédié.

## G. Validation technique

Environnement : PowerShell `7.6.5`, Node.js `v24.11.1`, npm `11.6.2`.

| Commande | Résultat |
|---|---|
| `npm test` | Build réussi ; 265/272 réussis, 3 SMTP échoués sur loopback refusé, 4 ignorés. |
| `npm run typecheck` | Réussi. |
| `npm run test:frontend` | Réussi : 34 fichiers et imports/exports de 33 modules. |
| `npm run test:smoke` | Réussi : 48/48. |
| `npm run test:brand` | Réussi : 5/5, avec vrai ZIP en mémoire. |
| `npm run test:browser` | Bloqué avant navigateur : pas de `DATABASE_URL` de test migrée ; Playwright absent. |
| `npm run lint:frontend` | Non exécuté : ESLint absent et installation réseau non disponible dans cet environnement. |
| `npm ci --offline --prefix backend` | Échoué : `ENOTCACHED`, `zod@4.6.7` absent du cache npm. Aucun accès réseau ni changement de versions n’a été tenté. Les tests d’extraction ont ensuite utilisé une copie temporaire des dépendances déjà installées ; ces dépendances ne sont pas dans le ZIP. |
| Migrations PostgreSQL | Non exécutées : aucun serveur/base de test disponible. |
| Test Windows MSI/UAC | Non exécuté ; aucun téléchargement ni `msiexec` réel n’a été lancé. |

## H. ZIP final

Archive livrée : `aurion-main-final-15.3.4.zip`, racine `aurion-main/`. Elle est construite avec `tools/Build-Source-Archive.ps1`, qui préserve les lockfiles et exclut `.env` réels, `node_modules`, `backend/dist`, `runtime/` (dont le MSI), logs, données locales, caches et ZIP temporaires. Le bundle de sources conserve les ressources et scripts nécessaires ; le setup Windows continue à préparer les composants requis et à télécharger LibreOffice si l’utilisateur en a besoin.

La vérification finale confirme 395 fichiers source et 420 entrées ZIP. La taille mesurée à la livraison est d’environ 0,86 MiB (la taille exacte est indiquée avec le fichier ci-dessous). Le ZIP s’extrait avec la version 15.3.4 et le lockfile présent ; les scans de noms confirment l’absence de `.env` réel, MSI, `node_modules`, `backend/dist`, logs, dumps et fichiers ZIP imbriqués. Avant l’installation des dépendances de test, l’extraction ne contenait ni `node_modules` ni `backend/dist`; `npm test` les a ensuite régénérées/localisées dans cette seule copie de validation. Le SHA-256 et la taille exacte de l’archive sont fournis à côté du fichier dans la livraison pour éviter une empreinte auto-référentielle dans l’archive.

## I. Actions distantes

Aucun push GitHub, aucune fusion et aucun déploiement Render n’ont été réalisés.
