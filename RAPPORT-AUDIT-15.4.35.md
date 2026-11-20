# Rapport d’audit technique et fonctionnel — Aurion 15.4.35

**Audit : 20 novembre 2026 — source unique : `Aurion-15.4.35.zip`**  
**SHA-256 ZIP reçu :** `156495edba846153c582eb760ce2129c119c4638947c93a4679eb69ec3e81647`

## 1. Verdict exécutif

Aurion 15.4.35 constitue une base SaaS avancée : Fastify/TypeScript, PostgreSQL, RLS et rôles séparés, application web/PWA, synchronisation hors ligne, documents et stockage cloud, modules de gestion, parcours de configuration d'entreprises existantes, wrapper Capacitor Android/iOS, 86 migrations SQL et une suite de tests étendue.

**Avancement estimé : 60,5 %** sur la grille pondérée du §3. C'est un indicateur de maturité vers une exploitation commerciale robuste, pas un taux de couverture de tests.

Le produit n'est pas encore prêt pour une ouverture commerciale sans réserves. Deux défauts métier sont prioritaires : la détection automatique de la franchise de TVA et la classification des cotisations micro-sociales. Le traitement de suppression de compte présente aussi des risques transactionnels et de concurrence. Enfin, la conformité juridique n'est pas publiable, les intégrations externes ne sont pas activées et la CI stricte a des échecs résiduels décrits par le rapport de livraison.

**Publication :** ce rapport ne prétend pas que le push a été effectué. Le dépôt GitHub a été vidé précédemment et la branche `main` conservée. Le connecteur disponible ne permet pas de transférer en lot les 690 fichiers depuis ce bac à sable ; un script de publication local est fourni. **Render est conservé intact**, conformément à la demande d'annulation de son nettoyage. Aucun déploiement Render n'est demandé ou effectué.

## 2. Inventaire de la version

- 690 fichiers de source/configuration/documentation/tests dans l'archive analysée.
- Backend : 24 fichiers de routes, 65 fichiers de services et 159 fichiers de tests.
- Migrations : 86 fichiers SQL, 84 préfixes uniques, jusqu'au préfixe 089. Les collisions historiques 042 et 044 sont tolérées explicitement par le runner ; toute nouvelle collision reste bloquante.
- Frontend : 45 modules JavaScript dans `assets/js`, CSS, PWA/service worker et copie `dist-web`.
- Applications : wrapper Capacitor et projet Android présents ; le dossier natif `ios/` est absent de l'archive. Capacitor peut servir à générer le projet iOS, mais celui-ci, son build et sa recette ne sont pas livrés.
- Versions : manifestes et lockfiles cohérents sur 15.4.35.
- Aucun fichier `.env` réel ni clé privée identifiée dans l'archive source. Pas de `.git`, `node_modules` ou `backend/dist` dans l'archive originale.
- L'archive reçue contient aussi **17 fichiers dans `backend/storage/private/`** (documents opérationnels/fichiers privés, pas du code source). Ils sont exclus de l'archive prête à publier et ne seront pas ajoutés à Git. Conserve l'archive reçue comme copie d'origine et place ces données dans une sauvegarde privée appropriée si elles doivent être gardées ; ne les versionne pas.

### Copie embarquée `dist-web`

La copie `dist-web` contenait 16 modules JS divergents par rapport à `assets/js`. J'ai exécuté `node tools/build-web-dist.mjs` dans le dossier de travail et reconstruit `dist-web` depuis les sources. La copie JS/CSS et les ressources de plateforme contrôlées sont maintenant alignées. Cette reconstruction est incluse dans l'archive d'audit repackagée.

Le projet iOS natif n'est pas présent. Cela ne constitue pas non plus une compilation Android : `npx cap sync android`, puis un build Android, restent nécessaires ; la cible iOS demande de générer le projet (`npx cap add ios`/synchronisation selon l'état du projet) et de construire sous macOS.

## 3. Avancement pondéré

La pondération conserve la grille du précédent rapport de consolidation. Les dimensions Play Store (2 points) et système de paiement (3 points) sont exclues ; poids restant : 95.

| Domaine | Poids | Avancement | État |
|---|---:|---:|---|
| A. Calculs et fonctions métier | 12 | 90 % | Couverture élevée, réserves fiscales critiques |
| B. Synchronisation et mode hors ligne | 16 | 78 % | Architecture présente, essais multi-appareils réels à compléter |
| C. Documents, stockage et appareils | 7 | 71 % | Fonctionnalités présentes, stockage externe à configurer |
| D. Web/PWA/Windows/Android/iOS hors stores | 8 | 42 % | Web/PWA avancés, builds et essais natifs manquants |
| E. Infrastructure, migrations, sauvegardes/restauration | 12 | 29 % | Migrations présentes, exploitation cible et restauration à prouver |
| F. Sécurité, RLS, secrets, RGPD, supervision | 10 | 70 % | Bon socle, effacement de compte à fiabiliser |
| G. Intégrations externes hors paiement | 9 | 35 % | Adaptateurs présents, fournisseurs non opérationnels |
| H. Juridique, commercial et tarification | 8 | 50 % | Révisions faites, publication et données contractuelles manquantes |
| I. Tests, accessibilité, bêta, support et opérations | 13 | 63 % | Contrats solides, CI/browser et recette réelle incomplets |
| **Total** | **95** | **60,5 %** | **Prototype SaaS avancé, pas prêt pour commercialisation sans réserves** |

Calcul : somme (poids × pourcentage) / 95 = 60,45 %, arrondie à 60,5 %. Cette valeur reste une estimation d'avancement par domaine.

## 4. Anomalies, erreurs et incohérences

### P0 — Franchise en base de TVA déduite à tort du statut micro

Dans `backend/src/services/fiscal-detection.ts`, `vatFranchise` est défini par `isMicro`. Ainsi toute entreprise individuelle au régime micro reçoit automatiquement `vatRate: 0` et le libellé « Franchise en base de TVA », sans vérifier le chiffre d'affaires, le type d'activité, un dépassement de seuil ou une option volontaire pour la TVA.

C'est une confusion entre régime micro et franchise de TVA. Pour 2026, les seuils de franchise restent notamment 37 500 €/41 250 € pour les services et 85 000 €/93 500 € pour les ventes. Une entreprise peut rester micro tout en devenant redevable de TVA. Conséquence possible : facturation sans TVA alors que celle-ci est due.

Sources officielles :
- https://entreprendre.service-public.gouv.fr/vosdroits/F21746
- https://www.impots.gouv.fr/professionnel/questions/en-tant-que-micro-entrepreneur-puis-je-etre-redevable-de-la-tva

**Correction nécessaire :** ne jamais déduire la franchise du seul statut micro. Demander le régime TVA, les données de CA nécessaires et/ou conserver « à confirmer » tant que la situation n'est pas vérifiée.

### P0 — Cotisations micro : CFP BIC et CIPAV mal classées dans la détection

Dans `backend/src/services/fiscal-detection.ts` :
- les prestations BIC sont affectées par défaut à 21,2 % de cotisations + 0,3 % de CFP (taux artisan), même quand il s'agit d'une activité commerciale dont la CFP est 0,1 % ;
- le mot-clé `CIPAV` déclenche la branche BNC générique à 25,6 %, alors que le référentiel prévu dans `backend/src/services/micro-referential.ts` attribue 23,2 % aux professions CIPAV ;
- la catégorie `services_bnc_cipav` existe dans le type et le référentiel, mais n'est attribuée à aucun profil dans `PROFILE_MICRO_CATEGORY`.

Bpifrance Création récapitule pour 2026 les taux sociaux 12,3 % vente, 21,2 % services BIC, 25,6 % BNC et 23,2 % CIPAV, avec CFP différenciée : 0,1 % commerçant, 0,3 % artisan, 0,2 % BNC/CIPAV.
Source : https://bpifrance-creation.fr/boiteaoutils/travailleurs-independants-cotisations-a-verser-debut-dactivite-regime-normal

**Correction nécessaire :** séparer commerce/artisanat, représenter CIPAV explicitement, et faire confirmer les classifications ambiguës au lieu d'imposer un taux par défaut.

### P1 — Suppression de compte : traitement non atomique et concurrence possible

`backend/src/services/account-deletion.ts` effectue ses opérations par plusieurs appels `adminQuery`. Dans `backend/src/db.ts`, `adminQuery` appelle directement `adminDb.query` : il n'y a pas de transaction commune englobant le traitement complet.

Conséquences :
- si le traitement échoue au milieu, des opérations déjà validées peuvent rester appliquées, tandis que le statut est remis à `pending` ;
- deux opérateurs peuvent lire une même demande `pending` avant qu'un des deux ait réservé son traitement ;
- les échecs de `bumpSessions(userId)` et `deletePrivateObject(avatarKey)` sont avalés sans remonter une erreur, même si la demande est ensuite marquée comme traitée.

**Correction nécessaire :** réserver atomiquement la demande (`UPDATE ... WHERE status='pending' RETURNING` ou verrou de ligne), journaliser les étapes, rendre les opérations relationnelles transactionnelles, et ne confirmer les révocations/suppressions externes qu'après preuve de succès. Clarifier aussi « espace fermé » : le code retire l'adhésion mais conserve les données organisationnelles, ce qui doit correspondre à une politique explicite de conservation/archivage.

### P1 — CI stricte et échecs connus

Le `RAPPORT-LIVRAISON-15.4.35.md` fourni avec le ZIP déclare 517 tests backend : 513 réussis, 0 ignoré et 4 échecs. Trois sont présentés comme des échecs de référence ; un autre concerne la réexécution des migrations par le rôle administrateur. Le même rapport précise que Playwright n'a pas été lancé localement.

Or `.github/workflows/aurion-ci.yml` passe `AURION_BASELINE_STRICT: "1"` à `tools/verify-b0-baseline.mjs`. Ce mode rejette explicitement tout échec résiduel, même présent dans la baseline, et rejette le timeout navigateur de référence. Le workflow peut donc être rouge malgré la qualification de ces échecs comme « connus ».

**Correction nécessaire :** corriger les quatre tests/conditions et exécuter Playwright dans CI, ou redéfinir en connaissance de cause la politique de tolérance et ses preuves. Ne pas annoncer CI verte avant un run réussi.

### P1 — Juridique : 0/5 document prêt

`npm --prefix backend run check:legal` s'exécute mais indique 0/5 document prêt à publier. Il manque notamment des éléments d'identité et coordonnées de l'éditeur, des paramètres de publication, les coordonnées de médiation, des précisions sur les sous-traitants/DPA et des données de l'accessibilité. La révision technique 4.0 n'équivaut donc pas à une publication juridique validée.

### P1 — Intégrations non configurées

`npm --prefix backend run check:integrations` identifie cinq familles non configurées ou non finalisées :
- SMTP ;
- Stripe ;
- OAuth Google ;
- prestataire PA / e-reporting ;
- paiement client en ligne.

Certains connecteurs peuvent être optionnels. Les parcours concernés ne doivent cependant pas être présentés comme actifs tant que les identifiants, webhooks et essais bout en bout ne sont pas réalisés.

### P1 — Infrastructure de production et reprise

Le ZIP ne prouve pas la création effective de la base PostgreSQL de production, du bucket objet OVH S3, des sauvegardes automatisées, d'une restauration testée, ni la supervision avec alertes réellement reçues. Les migrations présentes et l'essai PostgreSQL local décrits par le rapport de livraison ne remplacent pas une recette sur l'environnement cible.

### P1 — Configuration Render différente des services existants

`render.yaml` déclare un service unique `aurion` avec `autoDeploy: true`. Les trois services web existants relevés dans le workspace Render (`aurion-v2`, `aurion-web`, `aurion`) avaient `autoDeploy` désactivé. Un push GitHub ne synchronise pas automatiquement ces services avec le Blueprint.

**Le nettoyage Render a été annulé à la demande de l'utilisateur.** Ce rapport ne demande aucune suppression, modification, synchronisation Blueprint ou mise en production Render.

### P2 — Documentation et procédure

- `docs/EXPLOITATION-SUPPORT.md` indique `node scripts/rotate-secrets.mjs`, mais le script se trouve dans `backend/scripts/rotate-secrets.mjs` et dépend de `backend/dist` ; chemin et prérequis à corriger.
- `docs/APPLICATIONS-NATIVES.md` porte encore le repère 15.4.29 et affirme que les assets web sont déjà dans `android/app/src/main/assets/public/`. Ce dossier est absent de l'archive et ignoré par Git ; `npx cap sync android` est nécessaire avant un build.
- `MISSION-ETAT.md` cite encore la 15.4.33 ; certaines checklists restent sur 15.4.30/15.4.29. Les snapshots doivent être mis à jour ou marqués historiques.
- `README.md` affirme qu'il n'existe pas de recherche d'entreprise par nom alors que `/suppliers/lookup` permet la recherche de fournisseurs par nom. La détection de l'entreprise de l'utilisateur reste, elle, basée sur SIRET/SIREN dans le parcours et les paramètres : la documentation doit distinguer ces deux fonctions.

## 5. Tests et contrôles effectivement exécutés pendant cet audit

| Contrôle | Résultat |
|---|---|
| `npm run test:smoke` | 118/118 réussis |
| `npm run test:business` | 42/42 réussis |
| `npm run test:frontend` | 45 fichiers JS syntax-checkés ; imports/exports dans 44 modules |
| `npm run test:company-config` | 10/10 réussis |
| `npm run test:ui-a11y` | 2/2 réussis |
| Contrats de fusion 15.4.35 | 16/16 réussis |
| Génération `dist-web` | exécutée et copie frontend régénérée |
| `npm --prefix backend run check:legal` | 0/5 documents prêts |
| `npm --prefix backend run check:integrations` | intégrations externes non configurées |
| `npm ci`, build, typecheck, ESLint complets | non revalidés dans ce bac à sable : accès au registre npm en échec (`EAI_AGAIN`), installation incomplète |
| Suite backend complète | non rejouée ici ; résultat 517/513/4 repris du rapport de livraison fourni |
| Playwright/Chromium | non exécuté ici |
| PostgreSQL/RLS/migrations sur cible | non vérifiés ici ; le rapport de livraison affirme un essai local PostgreSQL 17, non reproduit dans cet audit |
| Builds Android/iOS signés | non produits ni vérifiés |

Les groupes de tests se recoupent : leurs totaux ne doivent pas être additionnés pour annoncer un nombre de tests uniques.

## 6. Priorités avant commercialisation

1. Corriger TVA, taux social et CFP ; ajouter des cas de test commerce/artisanat/BNC/CIPAV, activité mixte, seuils de TVA et option volontaire.
2. Fiabiliser la suppression de compte : verrou atomique, transaction, journal d'étapes, reprise fiable et erreurs externes visibles.
3. Obtenir un workflow CI vert, y compris la suite backend stricte et Playwright.
4. Compléter et faire valider les informations légales, sous-traitants, médiation et déclaration d'accessibilité.
5. Provisionner et valider PostgreSQL, S3, secrets, sauvegardes et restauration.
6. Exécuter Capacitor sync, builds et essais sur appareils Android/iOS.
7. Aligner les documents d'exploitation, les procédures et les snapshots de version.

## 7. Publication GitHub

L'état GitHub précédemment vérifié était :
- dépôt conservé : `wooffey78/aurion` ;
- seule branche : `main` ;
- `main` vidée et pointant sur le commit vide `930583be97058f6f8b46d20fdfe1471fb8e7f400`.

Le connecteur GitHub ne dispose pas d'une opération de transfert en lot depuis l'archive locale, et le shell de ce bac à sable ne possède pas la session d'authentification du poste Windows. Pour éviter un push partiel, `tools/Publish-Aurion-15.4.35.ps1` est fourni. Il contrôle le SHA distant, refuse toute divergence, valide les commandes locales, crée un commit depuis la `main` vide et pousse sans `--force`.

**Aucun push n'est déclaré comme effectué par ce rapport.** Le push réel est confirmé seulement après exécution du script et vérification du SHA distant. Render reste inchangé.
