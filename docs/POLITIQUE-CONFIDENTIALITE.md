# Politique de confidentialité et annexe de sous-traitance — Aurion

> **DOSSIER DE PRÉPARATION — NE PAS PUBLIER EN L’ÉTAT.** Version 2.3, préparée le 30 octobre 2026 à partir du code 15.3.19 et des décisions de l’éditeur. La bascule du domaine canonique vers Francfort, le passage au plan payant, les contrats/DPA des fournisseurs, la migration des fichiers, les sauvegardes, les durées et les procédures d’effacement n’ont pas été exécutés ni audités. Les mentions d’hébergement décrivent une cible choisie, pas une configuration commerciale achevée.

**Responsable déclaré : Coulibaly Damien, entrepreneur individuel, nom commercial Easyweb-dev. Adresse communiquée : 5 Rue Jacques Prevert, 85300 Challans, France. Contact données personnelles : easyfixit.reparation@gmail.com.** SIREN déduit du SIRET communiqué 88848569500033 : 888485695. Ces informations ne sont pas vérifiées au RNE/Sirene. Elles ne remplacent pas la qualification juridique du responsable pour chaque traitement.

## 1. À qui cette politique s’applique

Aurion est destiné aux professionnels qui utilisent le service pour gérer une entreprise ou activité déjà existante. Le service ne propose pas de parcours de création d’entreprise ni de studio d’identité visuelle. L’Éditeur est responsable des traitements nécessaires à la gestion des comptes Aurion, la sécurité, le support, les commandes et ses obligations. Pour les dossiers et fichiers métier que le client professionnel saisit dans son espace, le client détermine en principe les finalités et agit comme responsable de traitement; l’Éditeur traite les données pour fournir le service et intervient comme sous-traitant. La qualification doit être réévaluée pour chaque intégration et usage propre à l’Éditeur.

## 2. Données et usages

Le service peut traiter les catégories suivantes selon les modules activés :

- compte : prénom, nom, e-mail, téléphone si renseigné, mot de passe haché, rôles et préférences;
- données professionnelles introduites par le client : coordonnées des clients et fournisseurs, SIREN/SIRET, devis, factures, achats, interventions, rendez-vous, garanties, échanges et historique;
- fichiers : pièces jointes, documents, modèles et documents générés;
- connexions : configuration e-mail, autorisations OAuth et calendrier si l’utilisateur les active;
- paiement de l’offre : identifiant de commande et statuts Stripe; les données de carte sont traitées par Stripe et ne doivent pas être stockées par Aurion;
- sécurité et support : données de session, empreinte d’adresse IP selon l’opération, journaux techniques, demandes au support et informations nécessaires aux déclarations de rétractation.

Finalités : ouvrir et administrer un compte, fournir les fonctionnalités, sauvegarder et restituer les données, traiter les paiements et factures de l’offre, envoyer les messages transactionnels, protéger le service, répondre au support, respecter les obligations légales et instruire une demande de rétractation.

L’IA locale envisagée dans l’application Windows exécute Ollama et le modèle `qwen3.5:4b-q4_K_M` sur la machine Aurion locale; ces requêtes ne sont pas envoyées à un fournisseur IA distant par cette fonction. Cela ne décrit pas une session SaaS dont le serveur est hébergé sur Render. Dans le SaaS, le serveur ne peut pas accéder au Ollama installé chez un client; aucune IA distante n’est réputée autorisée dans cette cible avant le choix, les contrats et l’information du fournisseur. Google (OAuth, agenda ou messagerie) est facultatif et activé seulement à l’initiative du client après configuration.

## 3. Bases juridiques et choix

Pour le compte, la fourniture, le paiement et le support de commande : exécution du contrat et mesures précontractuelles. Pour la sécurité, la prévention des abus, la continuité et la défense de droits : intérêts légitimes, après mise en balance et documentation. Pour les factures et obligations de conservation : obligation légale. Pour des traceurs non nécessaires : consentement préalable. Les clients professionnels restent responsables de la base légale, de l’information et de la minimisation des données de leurs propres contacts.

## 4. Destinataires et fournisseurs

Les accès sont limités aux personnes autorisées et aux fournisseurs nécessaires à la fonction activée. **Fournisseurs retenus pour la cible commerciale (à contracter et vérifier avant ouverture) :**

| Service prévu | Données/finalité | Région ciblée | État au 30/10/2026 |
|---|---|---|---|
| Render — service applicatif Node | Requêtes applicatives, contenu en mémoire, journaux techniques | Frankfurt, Allemagne pour la cible commerciale | Service `aurion` déjà actif à Frankfurt en gratuit; un autre service `aurion-web` reste actif dans l’Oregon; domaine canonique à vérifier; plan payant et paramètres commerciaux non activés |
| Neon — PostgreSQL | Comptes, données métier, commandes et demandes de rétractation | branche PostgreSQL dans l’UE, région actuelle à confirmer lors du choix de branche commerciale | Base existe; la cible et le contrat/DPA de production ne sont pas confirmés |
| OVHcloud Object Storage — S3 | Fichiers privés, pièces et rendus | `de`, Francfort | Code S3 préparé; bucket, clés, chiffrement, sauvegarde et migration non effectués |
| Brevo — SMTP transactionnel | E-mails de sécurité, accusés de réception, confirmations | prestataire français/UE; région de traitement et DPA à confirmer au compte | choix technique proposé; compte, domaine expéditeur, SPF/DKIM/DMARC et credentials non configurés; quota gratuit annoncé 300 envois/jour avec marque Brevo |
| Stripe Payments Europe | Paiement et état de commande | EEE selon contrat et configuration Stripe | Stripe est le prestataire retenu; compte, mode de production, commission, DPA et flux exacts à valider |
| Google APIs, optionnelles | OAuth, agenda ou messagerie selon activation du client | déterminée par le produit Google et le compte | aucune connexion active par défaut dans la cible; DPA, scopes, lieux et transferts à documenter avant activation |
| IA distante, optionnelle | prompts et pièces éventuellement envoyées | non choisie | désactivée/non autorisée pour les données de clients tant que prestataire, version, région, rétention et conditions ne sont pas inscrits ici |

Les entités contractantes exactes et coordonnées officielles, les rôles RGPD, les sous-traitants ultérieurs, les finalités, régions, durées et garanties de transfert doivent être copiés des contrats/DPA signés. Render est une société américaine; une région d’exécution allemande ne suffit pas, à elle seule, à exclure tout accès ou transfert depuis un pays tiers. Aucune garantie de transfert n’est déclarée sans examen du contrat, du DPA et des mécanismes effectivement applicables.

## 5. Hébergement et flux

**Cible retenue pour l’application SaaS :** service Render payant à Francfort, base Neon en région UE et objets privés OVHcloud `de` à Francfort. Render a déjà un service `aurion` actif à Francfort et un `aurion-web` actif dans l’Oregon. Au contrôle du 30 octobre 2026 en soirée, les deux services étaient toujours au plan Free et reliés à `main`. Le dernier déploiement live relevé était 15.3.18 sur les deux services; une tentative manuelle de mise à jour 15.3.19 sur Oregon avait échoué. Les modifications 15.3.20 restent sur une branche de travail et ne sont pas déployées. Le domaine canonique n’est pas confirmé. Passer Frankfurt en payant, vérifier les données et services, puis basculer le domaine. Tant que cette bascule et la désactivation du trafic Oregon ne sont pas achevées, **ne pas présenter la production comme exclusivement hébergée à Francfort**.

Les sauvegardes secondaires chiffrées dans l’UE ne sont pas encore opérationnelles. Définir le lieu et la rétention, séparer les clés, automatiser une sauvegarde cohérente base/fichiers et réussir un exercice de restauration avant données réelles. Le stockage principal OVH S3 ne constitue pas à lui seul une sauvegarde indépendante.

## 6. Durées de conservation et suppression

Les durées exactes ne sont pas encore documentées ou implémentées par catégorie. **Aucune durée de purge complète ne peut être annoncée à la date de cette version.** Avant commercialisation, l’Éditeur doit publier des durées concrètes et justifiées et mettre en place le traitement correspondant pour PostgreSQL, les objets, les exports, journaux, prestataires et sauvegardes. La fermeture de compte ou le passage en lecture seule ne prouve pas l’effacement. La demande de rétractation est enregistrée dans PostgreSQL avec un état d’envoi de reçu; une durée opérationnelle et une purge doivent être fixées avant ouverture B2C.

À documenter dans le registre : compte/organisations; données métier et pièces; devis, factures et preuves comptables; e-mails et jetons OAuth; demandes support; paiement; demandes consommateurs; journaux sécurité; sauvegardes. En cas de suppression, les données conservées au titre d’une obligation légale ou pour défendre un droit doivent être isolées, limitées, justifiées et effacées à l’échéance applicable.

## 7. Sécurité

Le code 15.3.19 utilise notamment Argon2id pour les mots de passe, cookies configurables Secure/HttpOnly, contrôles d’accès par organisation, chiffrement applicatif de secrets d’intégration et stockage S3 privé en mode de production obligatoire. Ces observations du code ne démontrent pas l’activation de chaque réglage, l’absence de vulnérabilité ni une certification. Avant la vente : limiter les accès fournisseur, activer HTTPS, clés distinctes, politique de moindre privilège, chiffrement OVH au repos, rotation et stockage des secrets, alertes, sauvegardes, journal d’incident, antivirus/document quarantine et restauration testée. Ne pas inclure de secrets dans les journaux ou les ZIP.

En cas de violation, l’Éditeur documente l’incident, informe le responsable de traitement client sans délai indu lorsqu’il agit comme sous-traitant et coopère. Le responsable de traitement apprécie les notifications CNIL et personnes concernées requises.

## 8. Droits et demandes

Les personnes peuvent demander l’accès, la rectification, l’effacement, la limitation, l’opposition et la portabilité dans les conditions légales. Adresse : **easyfixit.reparation@gmail.com**. Une vérification proportionnée de l’identité peut être demandée. Les personnes peuvent saisir la CNIL. Pour les contacts métier contenus dans l’espace d’un client, s’adresser d’abord à ce client; l’Éditeur l’assiste selon le contrat de sous-traitance.

## 9. Cookies et stockage local

Les cookies strictement nécessaires à la session et à la sécurité sont listés dans `COOKIES.md`. Le stockage local du navigateur contient des préférences et l’e-mail du dernier compte. Le code vérifié n’a pas fait apparaître de service publicitaire ou d’audience; un contrôle du site réel demeure requis. Google ou autres services ne sont activés qu’à l’initiative du client. Tout traceur non exempté nécessite une information, un choix préalable et un retrait aussi simple.

## 10. Annexe de sous-traitance — Article 28 RGPD

### Objet, durée, nature et finalité

L’Éditeur héberge, sauvegarde, classe, restitue et rend accessibles les données métier, produit les documents demandés, assure la sécurité et exécute les intégrations activées. La durée suit le contrat et les instructions, puis les durées de restitution, suppression et sauvegarde à déterminer avant publication.

### Instructions et confidentialité

L’Éditeur traite les données métier sur instructions documentées, s’assure que les personnes autorisées sont soumises à confidentialité et ne les utilise pas pour sa publicité ou l’entraînement de modèles d’IA. Le client garantit que ses instructions et données sont licites.

### Sécurité, assistance et audits

L’Éditeur fournit les informations raisonnablement disponibles sur les mesures techniques, assiste le client pour les demandes, violations, analyses d’impact et consultations préalables dans la mesure requise, et permet les audits selon des modalités proportionnées. Les preuves de ces mesures doivent être constituées avant publication.

### Sous-traitants ultérieurs et transferts

Les prestataires de la section 4 sont une liste cible et ne constituent pas encore une autorisation contractuelle exhaustive. Le client doit recevoir les informations de changement et le moyen d’exercer ses droits prévus au contrat. Aucun transfert hors EEE ne sera déclaré couvert sans base légale et garanties contrôlées pour le fournisseur, l’entité, le service et le flux concernés.

### Fin de service

Au choix du client et selon les obligations légales applicables, l’Éditeur restitue ou supprime les données personnelles après la fin du service, puis efface les copies selon le calendrier de sauvegarde publié. Cette capacité doit encore être vérifiée dans le code et lors d’un exercice réel avant de transformer cette annexe en engagement définitif.

## Références

- [CNIL — gérer la sous-traitance](https://www.cnil.fr/fr/securite-gerer-la-sous-traitance)
- [RGPD, article 28 — sous-traitant](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=fr)
- [RGPD, chapitre V — transferts](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=fr)
