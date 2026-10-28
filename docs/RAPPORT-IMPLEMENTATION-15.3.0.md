# Aurion 15.3.0 — rapport d’implémentation

## A. Base de départ

- Source unique : archive utilisateur `aurion-main (1)(1).zip`.
- Version identifiée dans la source : **15.2.50** (`VERSION.txt`, métadonnées des packages).
- SHA-256 de l’archive source : `c72e83dcb8743c2d870260d9cbcf907c4cb148d5f30745101362d552312c3a52`.
- Stack trouvée : frontend HTML/CSS/JavaScript, backend Node.js 22+ avec Fastify et TypeScript, PostgreSQL, migrations SQL additives, scripts de vérification Node.
- Version de sortie : **15.3.0**.
- Aucune archive VYRATY ou Pro-Vision n’était jointe ; leur code n’a pas été audité ni importé.

## B. Modifications

### Parcours guidé et persistance

- Ajout de `backend/src/routes/journey.ts` et branchement dans `backend/src/app.ts`.
- Ajout d’un état de parcours persistant côté serveur : situation, étape active, réponses, sauvegarde, pause, reprise et fin déclarée par l’utilisateur.
- Seuls les nouveaux espaces reçoivent un parcours initial ; les espaces historiques n’y sont pas inscrits rétroactivement.
- Écran de parcours à sept étapes dans `assets/js/pages/guided-onboarding.js` ; navigation précédente/suivante, passage d’étape, sauvegarde/reprise et accès au tableau de bord.
- Redirection de première connexion et comportement de connexion ajustés dans `assets/js/main.js` et `assets/js/pages/auth.js`. Le routeur interroge uniquement `/journey/entry-state` (état minimal) pour déterminer la redirection ; le brouillon complet ne se charge que dans l’écran du parcours.
- Fin du tutoriel et complétude de configuration métier sont distinguées : terminer le guide ne certifie pas artificiellement que toutes les données métier sont complètes.

### Adresses d’intervention

- Migration additive `backend/migrations/065_guided_journey_administrative_addresses.sql`.
- Plusieurs adresses d’intervention par client, libellé, valeur par défaut et archivage ; l’adresse de facturation existante reste distincte.
- Les adresses déjà présentes sont reprises dans la nouvelle table sans supprimer l’ancienne colonne.
- L’adresse choisie est conservée dans le document de devis/facture via un instantané. Les chemins de rendu PDF, DOCX et ODT utilisent cet instantané ; les documents historiques ne sont pas réécrits.
- Routes métier et interfaces adaptées dans `backend/src/routes/business.ts`, `assets/js/pages/dash/other.js` et `assets/js/pages/dash/quote.js`.

### Journal de bord

- Ajout d’événements persistants et dédupliqués via `dashboard_journal_events`, affichés dans le journal du tableau de bord déjà présent, sans deuxième écran de journal.
- Actions lu/non lu, résoudre, priorité des actions à traiter et liens internes vers les étapes.
- Une note non intrusive est créée lors de la migration pour les organisations déjà présentes dont la configuration est marquée incomplète.

### Dossier administratif et e-mails

- Suivi des formalités avec applicabilité, certitude, source, informations manquantes, prérequis, actions, notes, historiques et états distincts pour déclaration utilisateur et preuve.
- Téléversement privé (limite 25 Mio), contrôle des extensions et des signatures de fichiers pour les formats pris en charge, association facultative à une formalité.
- Préparation d’e-mail distincte de l’envoi. L’envoi administratif demande une confirmation explicite, dispose d’un verrou anti-double-envoi par préparation et ne passe en état « envoyé » que si Gmail renvoie un identifiant de message. En cas de résultat fournisseur ambigu, la tentative est bloquée jusqu’à nouvelle préparation explicite afin d’éviter un doublon.
- Connexions Gmail de lecture et d’envoi administratif demandées séparément par OAuth, scopes restreints (lecture `gmail.readonly`, envoi `gmail.send`) et jetons conservés dans des tables séparées ; synchronisation déclenchée manuellement, recherches ciblées sur les domaines connus, point de reprise par pagination et verrou anti-concurrence. Le contenu intégral des courriels et leurs pièces jointes ne sont pas importés.
- Les réponses détectées restent des rapprochements potentiels. Elles ne changent pas automatiquement le statut d’une formalité.
- Aucun envoi n’est présenté comme un dépôt officiel. Outlook n’est pas implémenté pour la détection administrative.

### Identité visuelle et signature

- Le parcours utilise les paramètres de marque/thème et le stockage du logo déjà présents.
- Bundle ZIP réel généré à la demande à partir des ressources effectivement enregistrées ; les variantes de logo, favicon et typographies non générées ne sont pas simulées.
- Édition de la signature texte/HTML et activation par catégories. Les contenus fournis par l’utilisateur sont échappés, les liens sont limités à HTTPS, et le HTML est construit côté serveur.
- Les envois pris en charge ajoutent la signature HTML et texte ; le logo privé est joint en CID lorsque le fichier enregistré est disponible et lisible. La signature juridique électronique n’est pas revendiquée.

### Export et mobile

- L’export existant `GET /documents/export-all.zip` conserve son format d’archive et ajoute les métadonnées du parcours, des formalités, des messages rapprochés, du journal, des adresses d’intervention, de la signature, des modèles/fichiers présents et le bundle d’identité visuelle.
- Les jetons OAuth et secrets ne sont pas inclus dans les nouvelles sections de l’export.
- Les indications supplémentaires des champs sont conditionnelles à une largeur mobile inférieure à 700 px ; les placeholders sont restaurés sur écran large.
- Version du cache du service worker et références de ressources mises à jour en `15.3.0-r1`.

### Fichiers principaux modifiés/ajoutés

- `VERSION.txt`, `package.json`, `backend/package.json`, `backend/package-lock.json`, `index.html`, `sw.js`.
- `backend/migrations/065_guided_journey_administrative_addresses.sql`.
- `backend/src/app.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/business.ts`, `backend/src/routes/documents.ts`, `backend/src/routes/integrations.ts`, `backend/src/routes/settings.ts`, `backend/src/routes/journey.ts`.
- `backend/src/services/google.ts`, `backend/src/services/mail.ts`, `backend/src/services/signature.ts`, `backend/src/services/document-layout.ts`, `backend/src/services/document-renderer.ts`, `backend/src/services/pdf.ts`, `backend/src/services/scheduler.ts`, `backend/src/services/calendar.ts`.
- `assets/js/core/api.js`, `assets/js/main.js`, `assets/js/pages/auth.js`, `assets/js/pages/guided-onboarding.js`, `assets/js/pages/dash/other.js`, `assets/js/pages/dash/quote.js`, `assets/js/pages/dash/settings.js`.
- `backend/tests/guided-journey-15.3.contract.test.mjs` et ajustements des tests ciblés existants.
- Guides et changelog 15.3.0 dans `docs/`.

### Variables et services externes

Les noms de configuration restent ceux du projet : `DATABASE_URL`, `AURION_MIGRATION_DATABASE_URL` (migration uniquement), `APP_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` et les clés existantes. Voir `backend/.env.example` et `docs/GUIDE-CONFIGURATION-15.3.0.md`. Aucun secret réel n’est inclus.

## C. Tests et résultats exacts

### Référence avant modification

Commande : `node --test backend/tests/*.test.mjs`

- Tests découverts : **234**
- Réussis : **211**
- Échoués : **21**
- Ignorés : **2**

Résultat conservé en dehors du projet pendant le travail : `/mnt/data/aurion_baseline_tests.log`.

### Vérifications après modification

- Syntaxe des fichiers JavaScript `assets/js/**/*.js` via `node --check` : **succès**.
- Transpilation syntaxique indépendante des 59 fichiers TypeScript de `backend/src` avec le compilateur TypeScript global (`transpileModule`) : **59 fichiers, 0 erreur de syntaxe**. Ce contrôle ne remplace pas une vérification sémantique complète.
- Tests ciblés : `node --test backend/tests/guided-journey-15.3.contract.test.mjs backend/tests/step14-invoice-independent-edit.test.mjs backend/tests/step31-journal-priority.test.mjs backend/tests/home-delete-mobile-controls.test.mjs` : **14/14 réussis**.
- Suite complète : `node --test backend/tests/*.test.mjs` : **241 tests, 219 réussis, 20 échoués, 2 ignorés**.
- Les 20 noms de tests encore en échec sont tous présents dans les 21 échecs de référence du ZIP initial ; le test de navigation native d’accueil qui échouait dans la référence passe désormais. Aucun nouveau nom d’échec n’est apparu.
- Les échecs persistants comprennent des tests de configuration/production et de modules qui attendent `backend/dist` ou des dépendances installées, des contrats de thème/temps de synchronisation, le test de nombre de colonnes historiques (attend 50 alors que la source est à 52), une attente SQL de 44 paramètres face à 40 attendus par le test, et des attentes de prévision anciennes. Ils ne sont pas déclarés résolus.

### Limites d’exécution

- `npm ci --prefix backend` n’a pas pu terminer, l’accès au registre npm a échoué (`EAI_AGAIN registry.npmjs.org`). Les dépendances locales sont donc incomplètes.
- Le contrôle TypeScript sémantique complet (`tsc -p backend/tsconfig.json --noEmit`) s’arrête sur six définitions de types absentes (`adm-zip`, `node`, `nodemailer`, `pdfkit`, `pg`, `smtp-server`). Le build complet et les tests d’intégration exécutant les migrations dans PostgreSQL n’ont pas pu être validés ; `psql` n’est pas disponible dans cet environnement. Aucune migration n’a été appliquée à une base.
- Aucun OAuth réel, envoi Gmail/SMTP réel, scan antivirus, intégration officielle de dépôt administratif ni test navigateur avec des comptes réels n’a été exécuté.

## D. État des fonctionnalités

| Fonction | État au livrable |
|---|---|
| Parcours à sept étapes, sauvegarde serveur, première connexion des nouveaux comptes | Implémenté ; contrats et syntaxe ciblés testés ; test de bout en bout avec base non exécuté |
| Accès au tableau de bord à toute étape | Implémenté dans l’interface ; validation navigateur complète non exécutée |
| Adresses d’intervention et instantané de document | Implémenté dans migration, routes, interface et rendu ; test PostgreSQL/document réel non exécuté |
| Journal de bord persistant unifié dans le tableau de bord | Implémenté ; contrat ciblé réussi |
| Formalités administratives et historiques | Implémenté comme moteur de suivi ; catalogue d’obligations officielles préremplies non fourni, les obligations sont donc à vérifier manuellement |
| Téléversement administratif | Contrôle de signature de fichier implémenté ; analyse antivirus absente et affichée comme indisponible |
| Envoi administratif Gmail | Confirmation explicite et confirmation fournisseur implémentées ; nécessite les connexions et autorisations Gmail existantes, non testé en conditions réelles |
| Réponses Gmail | OAuth de lecture dédié, détection heuristique et confirmation utilisateur implémentés ; synchronisation réelle non testée ; classement non définitif par conception |
| Outlook pour détection de réponses | Non implémenté |
| Identité visuelle | Bundle et paramètres existants réutilisés ; seules les ressources réellement enregistrées sont incluses, variantes graphiques non produites |
| Signature e-mail | HTML/texte, catégories et logo CID ajoutés aux chemins d’envoi pris en charge ; pas de tests de rendu chez les fournisseurs réels |
| Export complet | Sections et fichiers réels ajoutés au code d’export ; génération réelle de l’archive depuis une base n’a pas pu être exécutée ici |
| Placeholders mobile | Implémentés sous breakpoint mobile ; vérification JS réussie, tests visuels réels non exécutés |
| Build/typecheck complet et migration DB | Bloqués par les dépendances réseau/PostgreSQL manquantes ; à exécuter dans l’environnement de test Aurion |

## E. Livrable

Le fichier ZIP final, son poids, son empreinte SHA-256 et le contrôle d’ouverture sont indiqués dans le compte rendu final remis avec le lien de téléchargement. Le code source inclut ce rapport, les guides et la migration 065.

Contrôle effectué sur une extraction neuve de l’archive finale : `zip -T` valide l’archive ; les fichiers essentiels (version, lockfile, migration 065, tests et quatre guides/rapports) sont présents ; aucune clé privée, aucun `.env` réel, jeton de secret détectable, dossier `.git`, `node_modules`, build transitoire, dump ou journal temporaire n’est livré. Depuis l’extraction, les tests ciblés passent **14/14**, la syntaxe JavaScript passe, les 59 fichiers TypeScript passent le contrôle de syntaxe et la suite complète rend le même bilan de **241 tests, 219 réussis, 20 échoués, 2 ignorés**. Le contrôle sémantique TypeScript reste bloqué par les définitions absentes listées plus haut.

## F. Opérations distantes

Aucun push GitHub, aucune fusion, aucun déploiement Render, aucune modification de secret distant et aucune modification d’une base de production n’ont été effectués.
