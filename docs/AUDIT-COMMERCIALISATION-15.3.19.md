# Audit de préparation commerciale — Aurion 15.3.19

**État au 30 octobre 2026.** Le code 15.3.19 est poussé sur `main` à `c1bf397fd0f13e2a2c0ea879e39f36dc78c5b75f`. Render a enregistré `commit_ignored` pour ce commit : aucun service n’a été déployé. Les services sont reliés à `wooffey78/aurion`, branche `main`, et tous deux sont sur le plan gratuit avec l’auto-déploiement actif. Le service `aurion-web` en Oregon répond à `/health/db` avec HTTP 200. Le service `aurion` à Francfort n’a pas la configuration backend complète et redirige actuellement vers Oregon. Frankfurt n’est donc pas encore le backend canonique. Le domaine DNS exact reste à confirmer. La cible choisie reste le service Frankfurt existant, à passer sur un plan payant après confirmation du coût, puis à basculer après reprise contrôlée de la configuration, des clés et du stockage.

## Décision

**Aurion n’est pas prêt pour une commercialisation publique en l’état.** Cette version prépare des fonctions et les documents nécessaires, mais laisse volontairement les inscriptions et paiements fermés tant que les documents restent des brouillons. La mise en service réelle, les contrats des fournisseurs, les sauvegardes, les courriels transactionnels, la revue juridique et l’audit de sécurité n’ont pas été exécutés.

Une phase privée avec quelques testeurs autorisés peut être organisée après sauvegarde et sécurisation des comptes. Pour vendre à des clients, y compris seulement en B2B, il faut d’abord fiabiliser l’hébergement, les contrats, les factures, l’assistance, l’export et la suppression des données. L’ouverture B2C ajoute les exigences consommateurs, l’accusé de rétractation opérationnel et un médiateur auquel l’éditeur a effectivement adhéré.

## Avancement estimé

Ces pourcentages sont une estimation de préparation commerciale à partir du code et des états communiqués, pas une mesure certifiée ni le résultat de tests exécutés. La valeur globale utilise les poids indiqués.

| Domaine | Avancement | Poids | Contribution |
|---|---:|---:|---:|
| Fonctions cœur de gestion présentes | 75 % | 25 % | 18,75 |
| Installation Windows et IA locale | 60 % | 10 % | 6,00 |
| Hébergement, région, exploitation et migrations | 20 % | 15 % | 3,00 |
| Sécurité et continuité des données | 25 % | 15 % | 3,75 |
| Paiements et parcours consommateurs | 35 % | 10 % | 3,50 |
| Documents juridiques et preuve contractuelle | 30 % | 10 % | 3,00 |
| E-mails, support et médiation | 25 % | 5 % | 1,25 |
| Accessibilité et qualité d’usage | 45 % | 5 % | 2,25 |
| Facture électronique et e-reporting | 10 % | 5 % | 0,50 |
| **Préparation globale pondérée** |  | **100 %** | **42,00 %** |

La couverture des fonctions cœur est estimée à **75 %** et la préparation à la vente à **42 %**. Le code de l’installateur Ollama a été corrigé et validé syntaxiquement, mais le correctif n’a pas été exécuté sur le PC qui a produit l’erreur d’origine. Frankfurt existe déjà mais ne sert pas encore l’application : il redirige vers Oregon. Ces nombres ne remplacent ni un audit indépendant ni la validation des fournisseurs. L’accessibilité a reçu un score de qualité d’usage; son obligation légale doit être qualifiée au regard de la taille et des seuils de l’entreprise.

## Blocages à lever avant vente

### 1. Hébergement commercial à Francfort

- Le service Frankfurt démarre actuellement une redirection vers Oregon, tandis que l’Oregon répond au contrôle `/health/db`. Le code source mis à jour cible Frankfurt comme origine canonique et renvoie HTTP 503 sans configuration backend complète, afin d’éviter une boucle ou une fausse mise en service.
- Les deux services Render sont gratuits et auto-déploient `main`. Le commit 15.3.19 a utilisé `[skip render]` et a bien été ignoré. La prochaine publication doit viser explicitement Frankfurt; sinon la version serait aussi lancée en Oregon. Le connecteur ne lit pas les variables existantes et ne peut pas changer le plan. Le blueprint demande `starter`, mais ne met pas automatiquement à niveau un service existant non géré par Blueprint.
- Le projet Neon `aurion-production` est situé en `aws-eu-central-1` (Francfort), branche `main`, base `aurion`. L’historique de migration production va jusqu’à `069_user_contact_phones.sql`. Les migrations `070` à `072` restent à appliquer; leur aperçu a été exécuté sur une branche temporaire : table de rétractation créée, contrainte de statut étendue, plans à 1 400/15 120 centimes HT. La `072` modifie les tarifs mensuel et annuel. Rien n’a été appliqué à la production; le propriétaire doit confirmer avant le déploiement qui déclenchera ces migrations.
- Le déploiement local 15.3.19 ne migre pas automatiquement base, secrets ni pièces jointes. Le bucket OVH S3 à Francfort et les sauvegardes secondaires ne sont pas vérifiés/configurés. Ne pas envoyer de fichiers clients tant que le stockage persistant n’est pas garanti.
- Vérifier dans Neon la région exacte de la branche commerciale, le rôle de migration, les rôles applicatifs, le DPA et la restauration. « Région UE » doit être confirmé dans la console et dans les documents du compte.
- Le stockage S3 privé OVHcloud `de` est intégré au code, mais le bucket, les clés limitées, le chiffrement, la migration et la sauvegarde secondaire ne sont pas configurés.
- Le plan de migration des fichiers dépend de l’état réel du service Oregon. Vérifier si un disque persistant existe et inventorier les fichiers avant toute bascule. Le système de fichiers Render est éphémère par défaut sans disque persistant; ne pas supposer que les fichiers actuels sont conservés.
- Francfort réduit la localisation des données applicatives, mais ne règle pas automatiquement les accès de support ou transferts liés à Render, société américaine. Examiner le DPA, les sous-traitants et les garanties de transfert pour chaque flux.

### 2. Facture électronique et statut TVA

- Dans la version 15.3.19, Aurion exporte un JSON de préparation; il n’émet ni ne transmet de facture Factur-X/UBL par une Plateforme Agréée et ne transmet pas l’e-reporting. Ne pas présenter Aurion comme compatible, conforme ou transmetteur de factures électroniques.
- Les microentreprises doivent être en capacité de recevoir des factures électroniques depuis le 1er septembre 2026. L’émission B2B et l’e-reporting applicables aux microentreprises suivent leur échéance du 1er septembre 2027 selon leur situation et les opérations. La franchise en base n’écarte pas l’obligation de réception. Le statut communiqué « non assujetti TVA » doit être vérifié : la qualification courante peut être « assujetti non redevable / franchise en base » et ne produit pas les mêmes explications fiscales.
- Pour les factures de l’entreprise de l’éditeur, Tiime Free est retenue comme option à 0 € : l’offre officielle annonce la facturation électronique et l’accès PA gratuits; « TIIME PDP » figure dans la liste DGFiP des opérateurs satisfaisant aux conditions, incluant les tests d’interopérabilité, avec une date d’immatriculation du 18 décembre 2025. Créer le compte et vérifier ses conditions au moment de l’inscription. Ce choix ne connecte pas Aurion à Tiime : le code n’émet ni ne transmet de factures électroniques et n’assure pas l’e-reporting.
- L’entreprise Easyweb-dev doit pouvoir recevoir des factures électroniques depuis le 1er septembre 2026 si elle relève de la situation visée, même en franchise en base. Vérifier immédiatement la situation fiscale et sélectionner une PA effectivement immatriculée. Cela équipe l’éditeur pour ses propres flux, mais ne connecte pas Aurion aux PA des clients.
- Avant l’échéance d’émission de 2027 pour les clients concernés, décider si Aurion se connecte à une PA/solution compatible ou si les utilisateurs exportent et saisissent leurs opérations dans leur PA. Le JSON actuel ne suffit pas à automatiser cette obligation.

### 3. Rétractation B2C et e-mails

- La route publique `/#/withdrawal` est préparée sans connexion obligatoire. Le lien « Renoncer au contrat ici » apparaît sur la page d’accueil, la connexion et le menu de l’application; le formulaire confirme avec « Confirmer la rétractation ».
- La demande est conservée et un accusé contenant le texte et l’horodatage est envoyé via SMTP. Sans service SMTP configuré ou si l’envoi échoue, la demande reste enregistrée, mais l’accusé légal n’est pas envoyé automatiquement. L’ouverture B2C doit rester fermée tant qu’un domaine expéditeur et Brevo ne sont pas configurés et que l’envoi, l’accusé, le traitement et le remboursement ne sont pas vérifiés.
- La demande de rétractation et le remboursement sont deux opérations différentes. Le panneau administrateur aide au suivi, mais l’administrateur doit contrôler le délai et exécuter le remboursement auprès de Stripe séparément.
- L’offre Brevo gratuite annonce 300 envois par jour et inclut la marque Brevo dans les e-mails. Elle peut suffire au début, mais il faut un domaine expéditeur vérifié et les réglages DNS requis. Gmail seul n’est pas une identité de domaine commerciale.

### 4. Identité et documents juridiques

- Les mentions, CGV/CGU, politique de confidentialité, cookies et accessibilité sont des projets 2.3, non des documents définitifs. Ils ne doivent pas être publiés comme avis juridique final ni servir à vendre avant validation.
- Le nom, l’adresse, le SIRET, le statut TVA, le téléphone et l’e-mail fournis par l’éditeur doivent être comparés à ses justificatifs officiels. La clé de contrôle du SIRET est valide, mais cela ne prouve pas l’immatriculation ou l’adresse.
- Les contrats exacts, entités contractantes, sous-traitants, durées de conservation, procédure d’export/suppression, conservation des sauvegardes et clauses de transfert doivent venir des comptes Render, Neon, OVHcloud, Stripe et Brevo effectivement utilisés.
- CM2C est retenu comme médiateur candidat à vérifier pour cette offre de logiciel SaaS. L’éditeur doit confirmer sa compétence sectorielle et adhérer; le consommateur n’a pas de frais, mais le professionnel paie l’adhésion et, selon le tarif publié, la médiation.
- Faire relire les CGV et l’information RGPD par un juriste français après finalisation des prix, du domaine, des fournisseurs et du parcours de vente. La qualification de la TVA et la mention légale sur les factures sont à confirmer avec le service des impôts ou un expert-comptable.

### 5. Données, sécurité et continuité

- Les documents actuels ne permettent pas d’annoncer des durées de conservation et de purge complètes. Définir les durées par catégorie et prouver l’effacement des comptes, objets, exports, journaux et sauvegardes.
- Configurer une copie de sauvegarde chiffrée dans une région européenne distincte, avec clés séparées et un essai de restauration réel base + fichiers. Un bucket principal n’est pas une sauvegarde indépendante.
- Réaliser une revue externe des contrôles d’accès, permissions par organisation, upload de fichiers, sécurité OAuth, journaux, secrets, webhooks Stripe, dépendances et réponse aux incidents. Le code observé ne vaut pas certification.
- Aucun test automatisé, test navigateur, audit de sécurité ni test de restauration n’a été exécuté pour ce dossier; ils restent à faire avant les clients réels.

### 6. IA et description du produit

- Le modèle texte/vision local retenu est `qwen3.5:4b-q4_K_M` via Ollama. Le script a été renforcé pour attendre uniquement le processus d’installation, démarrer le service et borner le téléchargement. Ce correctif n’a pas pu être exécuté de bout en bout sur le PC à l’origine de l’erreur; en cas de nouvel échec, consulter `logs/aurion.log`, `logs/aurion-ollama-server-error.log` et `logs/aurion-ollama-model-error.log`.
- La création de compte en `NODE_ENV=development` peut fonctionner en mode local d’évaluation avec un avertissement. Elle ne publie pas les brouillons et ne les enregistre pas comme acceptés; l’inscription de production et les paiements restent verrouillés.
- Aucun fournisseur d’IA distante n’a été choisi. Sur le SaaS hébergé, les fonctions qui en dépendent doivent rester désactivées ou afficher clairement leur indisponibilité. Choisir une IA distante implique coûts, région, contrat, rétention des prompts et information des utilisateurs.
- La présence d’icônes de plateformes ou d’une PWA ne démontre pas l’existence d’applications natives publiées sur iOS ou Android. Présenter le produit comme application Web installable tant qu’un binaire natif réel et son processus de distribution n’ont pas été vérifiés.

### 7. Accessibilité

La loi française issue de la directive Accessibilité prévoit une dispense pour certaines microentreprises fournissant des services, sous conditions d’effectif et de seuils financiers. Si l’entreprise remplit ces conditions, une déclaration RGAA de conformité ne doit pas être inventée ni présentée comme obligatoire sans qualification. Consigner la vérification des seuils et conserver les éléments justifiant l’exemption. Poursuivre les corrections de contraste, clavier, mobile et lecteur d’écran pour la qualité et l’accès de tous.

## Architecture retenue

| Élément | Cible | État |
|---|---|---|
| Serveur Aurion | Render payant, Francfort (Allemagne) | service Frankfurt existant en plan gratuit, incomplet et redirigeant vers Oregon |
| PostgreSQL | Neon, Francfort (`aws-eu-central-1`) | projet `aurion-production`, branche `main`, base `aurion`; migrations 070–072 non appliquées |
| Fichiers | OVHcloud Object Storage S3 privé, région `de` Francfort | adaptation présente, bucket et migration absents |
| Copie de secours | autre emplacement / compte en UE, chiffré | à choisir et mettre en œuvre |
| Courriels plateforme | Brevo SMTP | candidat, aucun domaine ni identifiant configuré |
| Paiement Aurion | Stripe Payments Europe | prestataire retenu, compte réel et conditions à vérifier |
| PA de l’éditeur | Tiime Free, 0 € annoncé | L’offre gratuite et l’immatriculation TIIME PDP sont annoncées par Tiime et visibles dans la liste DGFiP des opérateurs ayant satisfait aux conditions, tests compris; vérifier les conditions à l’ouverture du compte |
| Médiation B2C | CM2C, sous réserve de compétence et adhésion | candidat non adhéré |
| IA distante | aucune | désactivée/non retenue |

L’option « site Web hébergé entièrement chez OVH » n’est plus la cible choisie. Une vitrine statique est plus simple à héberger, mais le SaaS Aurion garde les mêmes obligations de vente, données, facture, rétractation, assistance et continuité. Migrer toute l’application vers OVH ajouterait une migration du backend, de PostgreSQL, du stockage, des secrets et de l’exploitation. Un produit Web n’est donc pas automatiquement plus facile à commercialiser qu’une application installable.

## Les applications Play Store en comparaison

Tu peux avoir raison pour des applications précises, mais sans noms, versions et preuves comparables, on ne peut pas conclure qu’Aurion est plus fiable ou plus sûr que des produits commercialisés. Le fait qu’une application soit sur le Play Store ne prouve pas sa qualité; cela ne prouve pas non plus la préparation d’Aurion. Pour comparer, il faut mesurer les mêmes critères : fonctions, erreurs, disponibilité, sauvegarde/restauration, sécurité, accessibilité, support et conformité.

## Ordre rapide de mise en route

1. **Valider les données éditeur** sur les justificatifs RNE/Sirene et TVA; réserver le domaine qui servira aussi aux e-mails.
2. **Créer les comptes de production** et contrats: Render Frankfurt payant, Neon avec branche UE vérifiée, OVH S3 Frankfurt, Brevo et Stripe. Choisir une sauvegarde chiffrée distincte en UE.
3. **Préparer les données puis basculer** : sauvegarder PostgreSQL, inventorier les fichiers du Render Oregon, migrer les pièces vers S3 et mettre à niveau le service Frankfurt existant avant le DNS. Le guide associé détaille l’ordre et le retour arrière.
4. **Activer l’exploitation commerciale** : courriel de rétractation, Stripe/webhooks, politique de prix et de TVA, adhésion médiateur, PA définitivement immatriculée pour l’éditeur, rétention, export, suppression et restauration.
5. **Revue finale avant ouverture** : juriste, contrats/DPA et transferts, audit sécurité, vérifications RGPD/accessibilité, essai d’achat, facture, e-mail et rétractation. Lever les portes de blocage seulement après cela.

## Sources officielles consultées

- [Rétractation en ligne, accusé durable et remboursement — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F23455)
- [Calendrier et champ de la facture électronique — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F39785)
- [Liste DGFiP des plateformes agréées](https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees) : la première liste correspond aux opérateurs satisfaisant à l’ensemble des conditions, tests inclus; « TIIME PDP » y figure avec une date d’immatriculation du 18 décembre 2025. Le nom technique du PDF téléchargé mentionne encore l’attente d’un rapport d’audit, mais ne signifie pas attente des tests d’interopérabilité.
- [Choisir et désigner un médiateur référencé — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F33338)
- [CM2C — tarifs professionnels](https://www.cm2c.net/tarifs.php)
- [Tiime — offre micro-entreprise](https://www.tiime.fr/tarifs?tab=micro-entreprise) et [FAQ officielle sur l’offre gratuite et la PA](https://www.tiime.fr/faq-facturation-electronique)
- [Règles Render sur les régions](https://render.com/docs/regions)
- [DPA Render](https://render.com/dpa) et [conditions de service Render](https://render.com/terms)
- [CNIL — encadrer les transferts hors UE](https://www.cnil.fr/fr/les-outils-de-la-conformite/transferer-des-donnees-hors-de-lue)
- [Accessibilité des services et dispense de certaines microentreprises — loi du 9 mars 2023, art. 16](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047281777)
- [Offre gratuite Brevo — limites d’envoi](https://help.brevo.com/hc/fr/articles/208580669-FAQ-Quels-sont-les-limites-de-l-offre-Gratuit)
