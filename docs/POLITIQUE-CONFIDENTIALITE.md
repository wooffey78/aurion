# Politique de confidentialité et annexe de sous-traitance — Aurion

Version **5.1**, révision du 25 novembre 2026 pour Aurion 15.5.0 (mise à jour de la version 5.0 du 23 novembre 2026 ; coordonnées et engagements inchangés). Cette révision décrit les données introduites par le portail client invités, les webhooks sortants, la supervision des lettres mortes, la chaîne d’intégrité documentaire et les photographies des fiches clients (avatars téléversés par le professionnel). Ajouts restant soumis à la validation juridique externe prévue avant ouverture commerciale.

**Responsable de traitement : Coulibaly Damien, entrepreneur individuel, nom commercial Easyweb-dev. Adresse : 5 Rue Jacques Prevert, 85300 Challans, France. SIREN : 888485695. Contact données personnelles : easyfixit.reparation@gmail.com.** Cette politique décrit les traitements du service ; pour les dossiers que le client professionnel saisit dans son espace, le client demeure responsable de ses propres contacts (voir l’article 1).

## 1. À qui cette politique s’applique

Aurion est destiné aux professionnels qui utilisent le service pour gérer une entreprise ou activité déjà existante. Le service ne propose pas de parcours de création d’entreprise ni de studio d’identité visuelle. L’Éditeur est responsable des traitements nécessaires à la gestion des comptes Aurion, la sécurité, le support, les commandes et ses obligations. Pour les dossiers et fichiers métier que le client professionnel saisit dans son espace, le client détermine en principe les finalités et agit comme responsable de traitement; l’Éditeur traite les données pour fournir le service et intervient comme sous-traitant. La qualification est réévaluée pour chaque intégration et usage propre à l’Éditeur.

## 2. Données et usages

Le service peut traiter les catégories suivantes selon les modules activés :

- compte : prénom, nom, e-mail, téléphone si renseigné, mot de passe haché, rôles et préférences; rôles invités (notamment accès « expert-comptable » en lecture seule);
- données professionnelles introduites par le client : coordonnées des clients et fournisseurs, SIREN/SIRET, devis, factures, achats, interventions, rendez-vous, garanties, échanges et historique;
- relevés bancaires importés : opérations et coordonnées bancaires (dont IBAN) contenues dans les relevés CSV/OFX importés par le client pour le rapprochement; aucun flux bancaire automatique n’est établi;
- fichiers : pièces jointes, documents, modèles et documents générés;
- connexions : configuration e-mail, autorisations OAuth et calendrier si l’utilisateur les active;
- paiement de l’offre : identifiant de commande et statuts Stripe; les données de carte sont traitées par Stripe et ne sont pas stockées par Aurion; liens de paiement des factures émises : référence, montant et statut du paiement seulement, sans numéro de carte;
- sécurité et support : données de session, empreinte d’adresse IP selon l’opération, journaux techniques, demandes au support et informations nécessaires aux déclarations de rétractation.

Finalités : ouvrir et administrer un compte, fournir les fonctionnalités, sauvegarder et restituer les données, traiter les paiements et factures de l’offre, envoyer les messages transactionnels, protéger le service, répondre au support, respecter les obligations légales et instruire une demande de rétractation.

Le service ne comporte aucune fonction de génération automatique de contenu et ne délègue aucun traitement à un service de ce type : les détections et analyses (recherche d’entreprise par nom ou SIRET/SIREN, lecture des bordereaux, rapprochement bancaire) s’exécutent dans l’application selon des règles déterministes. Google (OAuth, agenda, messagerie ou Drive personnel pour le stockage documentaire) est facultatif et activé seulement à l’initiative du client après configuration.

## 3. Bases juridiques et choix

Pour le compte, la fourniture, le paiement et le support de commande : exécution du contrat et mesures précontractuelles. Pour la sécurité, la prévention des abus, la continuité et la défense de droits : intérêts légitimes, après mise en balance et documentation. Pour les factures et obligations de conservation : obligation légale. Pour des traceurs non nécessaires : consentement préalable. Les clients professionnels restent responsables de la base légale, de l’information et de la minimisation des données de leurs propres contacts.

## 4. Destinataires et fournisseurs

Les accès sont limités aux personnes autorisées et aux fournisseurs nécessaires à la fonction activée. **La liste réelle, calculée automatiquement depuis la configuration effective, est publiée sur la page « Sécurité et contrôles » (route publique `/transparency`).** Les fournisseurs du service sont :

| Service | Données/finalité | Région | Rôle |
|---|---|---|---|
| Render — service applicatif (`aurion`) | Requêtes applicatives, contenu en mémoire, journaux techniques | Francfort (Allemagne) — région unique du blueprint `render.yaml` | Hébergeur |
| PostgreSQL gérée (Render) | Comptes, données métier, commandes et demandes de rétractation | région européenne (Francfort) | Hébergeur de base de données |
| OVHcloud Object Storage — S3 | Fichiers privés, pièces et rendus | `de`, Francfort | Hébergeur de fichiers |
| Brevo — SMTP transactionnel | E-mails de sécurité, accusés de réception, confirmations | prestataire français/UE | Prestataire d’e-mails transactionnels |
| Stripe Payments Europe | Paiement de l’abonnement Aurion et état de commande | EEE selon contrat et configuration Stripe | Prestataire de paiement de l’abonnement |
| Google APIs, optionnelles | OAuth, agenda ou messagerie et Drive personnel selon activation du client | déterminée par le produit Google et le compte | Activés seulement à l’initiative du client |

Le prestataire de paiement des factures clients (`AURION_PAY_PROVIDER`, décision D3) et la plateforme agréée (`AURION_PA_PROVIDER`) s’ajoutent à cette liste uniquement après leur configuration effective et leurs contrats ; au 14 novembre 2026, aucun des deux n’est connecté. Les entités contractantes exactes et coordonnées officielles, les rôles RGPD, les sous-traitants ultérieurs, les finalités, régions, durées et garanties de transfert sont repris des contrats/DPA signés Au 25 novembre 2026, les entités déjà identifiées par l’architecture du service sont : l’hébergement et l’exécution applicative (Render Services, Inc., États-Unis — https://render.com), le paiement des abonnements (Stripe Payments Europe, Ltd, cf. article Paiements) et la messagerie sortante configurée par l’Éditeur avec ses propres identifiants SMTP. Les rôles RGPD, sous-traitants ultérieurs, finalités, régions et garanties de transfert sont décrits dans la présente politique et son annexe de sous-traitance, et sont mis à jour à chaque connexion effective d’une nouvelle intégration.. Render est une société américaine; une région d’exécution allemande ne suffit pas, à elle seule, à exclure tout accès ou transfert depuis un pays tiers : les garanties de transfert suivent les contrats et DPA effectivement applicables.

## 5. Hébergement et flux

**Cible de production :** service Render `aurion` unique en région Francfort (Allemagne), base PostgreSQL gérée en région européenne, fichiers privés sur OVHcloud Object Storage région `de` (Francfort) — configuration déclarée dans `render.yaml` et décrite dans `docs/RUNBOOK-PRODUCTION.md`. L’instance historique `aurion-web` (Oregon) ne sert que de voie de retour arrière pendant la bascule et est supprimée après bascule DNS et fenêtre de retour ; aucun trafic de production ne lui est routé après la bascule.

**Sauvegardes :** les sauvegardes indépendantes de l’Éditeur (base de données exportée quotidiennement et avant chaque déploiement, fichiers privés synchronisés vers un second emplacement UE, clés de chiffrement conservées séparément) sont décrites et encadrées par `docs/RUNBOOK-PRODUCTION.md`, avec un test de restauration complète exécuté avant l’exploitation de données réelles puis périodiquement. Le stockage principal S3 ne constitue pas à lui seul une sauvegarde indépendante.

## 6. Durées de conservation et suppression

À l’expiration de l’abonnement, le compte passe au statut « expired », puis en lecture seule soixante jours après la fin de l’abonnement (`data_read_only_until`); les pièces comptables et factures obéissent ensuite aux obligations de conservation des documents commerciaux (dix ans pour les documents comptables, autres durées légales selon la nature des documents). Les journaux techniques sont conservés pour une durée limitée à la finalité de sécurité. Les sauvegardes sont purgées selon leur cycle de rétention publié. La demande de rétractation est conservée pendant la durée nécessaire à son traitement et aux obligations de preuve. À l’échéance des durées applicables, les données sont supprimées de la base, des fichiers et des sauvegardes.

À documenter dans le registre : compte/organisations; données métier et pièces; devis, factures et preuves comptables; relevés bancaires importés; e-mails et jetons OAuth; demandes support; paiement et liens de paiement; demandes consommateurs; journaux sécurité; sauvegardes. En cas de suppression, les données conservées au titre d’une obligation légale ou pour défendre un droit sont isolées, limitées, justifiées et effacées à l’échéance applicable.

**Droit à l'effacement en ligne (15.4.35).** La demande de suppression est faite depuis l'application (Mon compte → Suppression du compte, avec confirmation par le mot de passe actuel) ou depuis la page publique `/legal/suppression-compte`, accessible sans installer l'application : cette page décrit les catégories supprimées, celles archivées pour obligation légale, le délai de traitement (30 jours au plus) et le moyen de contact, et répond de façon neutre pour ne jamais révéler si une adresse possède un compte. Le traitement effectif est réalisé par l'Éditeur après vérification d'identité : sessions et jetons révoqués, secrets d'intégration supprimés, espaces mono-utilisateur fermés, données personnelles effacées ; une trace minimale (référence d'audit, empreinte de l'adresse, dates, statut) est conservée sans donnée personnelle en clair. La demande reste annulable tant qu'elle n'est pas traitée.

## 7. Sécurité

Aurion utilise notamment Argon2id pour les mots de passe, cookies configurables Secure/HttpOnly, isolation des données entre organisations par politiques Row-Level Security PostgreSQL accompagnées de contrôles applicatifs (défense en profondeur) et de tests d’isolation dédiés, redaction systématique des champs sensibles (mots de passe, jetons, en-tête d’autorisation, IBAN) avant toute écriture des journaux, identifiant de requête renvoyé dans l’en-tête `X-Request-Id`, gestionnaires d’erreurs fatales qui arrêtent le processus proprement, chiffrement applicatif de secrets d’intégration et stockage S3 privé en mode de production obligatoire. Ces mesures ne démontrent pas l’absence de vulnérabilité ni une certification ; les accès fournisseur sont limités, HTTPS est activé, les clés sont distinctes et le stockage applique le chiffrement au repos, la rotation des secrets, les sauvegardes testées et un journal d’incident. Aucun secret n’est inclus dans les journaux ou les archives exportées.

En cas de violation, l’Éditeur documente l’incident, informe le responsable de traitement client sans délai indu lorsqu’il agit comme sous-traitant et coopère. Le responsable de traitement apprécie les notifications CNIL et personnes concernées requises.

## 8. Droits et demandes

Les personnes peuvent demander l’accès, la rectification, l’effacement, la limitation, l’opposition et la portabilité dans les conditions légales. Adresse : **easyfixit.reparation@gmail.com**. Une vérification proportionnée de l’identité peut être demandée. Les personnes peuvent saisir la CNIL. Pour les contacts métier contenus dans l’espace d’un client, s’adresser d’abord à ce client; l’Éditeur l’assiste selon le contrat de sous-traitance.

## 9. Cookies et stockage local

Les cookies strictement nécessaires à la session et à la sécurité sont listés dans `COOKIES.md`. Le stockage local du navigateur contient des préférences et l’e-mail du dernier compte. Aucun service publicitaire ou d’audience n’est intégré au service. Google ou autres services ne sont activés qu’à l’initiative du client. Tout traceur non exempté serait précédé d’une information, d’un choix préalable et d’un retrait aussi simple.

## 10. Annexe de sous-traitance — Article 28 RGPD

### Objet, durée, nature et finalité

L’Éditeur héberge, sauvegarde, classe, restitue et rend accessibles les données métier, produit les documents demandés, assure la sécurité et exécute les intégrations activées. La durée suit le contrat et les instructions, puis les durées de restitution, suppression et sauvegarde publiées dans la présente politique.

### Instructions et confidentialité

L’Éditeur traite les données métier sur instructions documentées, s’assure que les personnes autorisées sont soumises à confidentialité et ne les utilise pas pour sa propre publicité ni pour développer ou enrichir ses propres services. Le client garantit que ses instructions et données sont licites.

### Sécurité, assistance et audits

L’Éditeur fournit les informations raisonnablement disponibles sur les mesures techniques, assiste le client pour les demandes, violations, analyses d’impact et consultations préalables dans la mesure requise, et permet les audits selon des modalités proportionnées.

### Sous-traitants ultérieurs et transferts

La liste des sous-traitants techniques réellement utilisés est publiée et maintenue à jour sur la page « Sécurité et contrôles » (`/transparency`), calculée automatiquement depuis la configuration effective; tout nouveau sous-traitant y apparaît à sa configuration. Le client reçoit les informations de changement et le moyen d’exercer ses droits prévus au contrat. Aucun transfert hors EEE n’est déclaré couvert sans base légale et garanties contrôlées pour le fournisseur, l’entité, le service et le flux concernés.

### Fin de service

Au choix du client et selon les obligations légales applicables, l’Éditeur restitue ou supprime les données personnelles après la fin du service, puis efface les copies selon le calendrier de sauvegarde publié. L’export complet de l’organisation, disponible sans frais en formats ouvrables, permet la restitution.

## Références

- [CNIL — gérer la sous-traitance](https://www.cnil.fr/fr/securite-gerer-la-sous-traitance)
- [RGPD, article 28 — sous-traitant](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=fr)
- [RGPD, chapitre V — transferts](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=fr)

## 14-bis — Données du portail client invités

Le portail client (accès par jeton, sans compte) traite les données suivantes pour le compte de l'abonné, responsable de traitement : l'adresse de courriel du contact saisi par l'abonné, le nom du contact facultatif, un jeton technique stocké exclusivement sous forme hachée, les dates de création, d'activation, de dernier accès, d'expiration et, le cas échéant, de révocation de l'accès, ainsi que les acceptations de devis (nom du signataire tel que saisi, horodatage serveur, empreinte technique de la demande). Base de traitement : exécution du service demandé par l'abonné (art. 6-1-b) dans l'intérêt légitime de disposer d'une preuve de l'accord du client. Conservation : pendant la durée de vie de l'accès, puis suppression avec le compte de l'abonné ou sur demande. Le visiteur du portail n'est soumis à aucun cookie de suivi ; seuls des journaux techniques de sécurité (limitation de débit) sont conservés à des fins de protection du service.

## 14-ter — Webhooks sortants et supervision des lettres mortes

Lorsque l'abonné configure des webhooks, les données de notification qu'il choisit sont transmises aux URL qu'il désigne : l'abonné demeure responsable de ces transferts et de ses récepteurs. Les échecs de livraison sont conservés sous forme technique (type d'événement, nombre de tentatives, dernier message d'erreur tronqué, horodatages) pour permettre le rejeu motivé et le support ; le résumé quotidien adressé à l'adresse d'exploitation de l'éditeur ne contient aucun contenu métier, uniquement ces éléments techniques. Conservation : 90 jours glissants pour les événements clos.

## 14-quater — Chaîne d'intégrité documentaire

À chaque émission de facture, une empreinte du contenu canonique du document (identifiant, numéro, client, totaux, lignes, échéance) et un horodatage serveur sont enregistrés dans une chaîne d'intégrité « append-only », chaînée à l'empreinte précédente de l'entreprise. Cette chaîne ne contient ni pièce jointe ni contenu libre : uniquement ces empreintes et horodatages, conservés tant que le document de l'abonné existe, pour offrir une preuve technique d'intégrité depuis l'émission.

## 14-quinquies — Photographies des fiches clients (avatars)

Depuis la révision 5.1, l'abonné peut téléverser une photographie pour chaque fiche client (avatar) et, pour son propre compte, un avatar de compte. Ces images sont stockées dans l'espace de stockage privé de l'organisation, ne sont servies qu'aux utilisateurs authentifiés de cette organisation (aucune URL publique, aucun indexation par les moteurs de recherche) et sont remplacées ou supprimées avec la fiche ou le compte. Elles servent uniquement à l'identification visuelle du client dans l'interface ; l'abonné demeure responsable de la licéité des images qu'il téléverse (autorisation des personnes photographiées).
