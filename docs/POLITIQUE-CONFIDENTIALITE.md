# Politique de confidentialité et annexe de traitement — Aurion

> **PROJET DE DOCUMENT — NE PAS UTILISER POUR UNE COMMERCIALISATION.** Le texte reflète l’examen statique du dépôt Aurion 15.3.18. Les durées de conservation, les lieux de traitement, les fournisseurs effectivement configurés et l’identité du responsable restent à confirmer. Compléter ces informations, le registre des traitements et les procédures opérationnelles, puis faire valider avant publication.

**Version projet : 2.2 — Date de rédaction : 30 octobre 2026 — Contact données personnelles : {{AURION_PRIVACY_CONTACT_EMAIL}}**

## 1. Responsable et rôles

Aurion est édité par {{AURION_LEGAL_PUBLISHER_NAME}}, {{AURION_LEGAL_PUBLISHER_FORM}}, SIREN {{AURION_LEGAL_PUBLISHER_SIREN}}, siège {{AURION_LEGAL_PUBLISHER_ADDRESS}}. Pour toute question concernant les données propres au compte Aurion : {{AURION_PRIVACY_CONTACT_EMAIL}}.

Pour la gestion des comptes Aurion, l’accès, la sécurité du service, le support et la facturation de l’offre, l’éditeur détermine les finalités et agit comme responsable du traitement. Pour les données métier importées par un Client — clients, prospects, fournisseurs, devis, factures, interventions, courriels et pièces jointes — le Client détermine en principe les finalités et agit comme responsable de traitement; l’éditeur agit comme sous-traitant lorsqu’il traite ces données afin de fournir Aurion.

Le rôle doit être déterminé pour chaque fonctionnalité et chaque finalité. Cette qualification doit être vérifiée lorsque les données sont utilisées pour une finalité propre à l’éditeur ou par un fournisseur d’intégration.

## 2. Données et personnes concernées

Selon les fonctions activées et les choix du Client, Aurion peut traiter :

- les données de compte : nom, adresse e-mail, mot de passe sous forme hachée, rôles, organisation et préférences;
- les données professionnelles de tiers saisies par le Client : identité, coordonnées, entreprise, SIREN/SIRET, échanges et historique de relation;
- les données de gestion : devis, factures, paiements, taxes, achats, interventions, rendez-vous, garanties, pièces, modèles, paramètres et états d’avancement;
- les contenus de courriels et de documents importés, ainsi que les informations extraites ou proposées par des automatismes et fonctions d’IA;
- les données d’intégration : configuration de messagerie, autorisations OAuth, calendrier et statuts de paiement, dans la mesure où ces intégrations sont activées;
- les données techniques et de sécurité : adresse IP utilisée pour la protection ou la preuve de certaines opérations, journaux d’accès, informations de session, événements d’erreur et demandes adressées au support.

Les personnes concernées peuvent être les utilisateurs du Client, ses clients, prospects, fournisseurs, interlocuteurs administratifs ou autres personnes mentionnées dans les données qu’il dépose. Le service n’est pas conçu pour traiter des données de santé, des données biométriques, des données relatives aux infractions ou d’autres catégories particulières sans accord spécifique et analyse préalable.

## 3. Finalités et bases juridiques

Pour les traitements dont l’éditeur est responsable, les finalités sont la création et l’administration du compte, la fourniture du service, la gestion des commandes et paiements, la sécurité et la prévention des abus, le support et le respect des obligations légales. Les bases juridiques sont, selon le traitement, l’exécution du contrat, le respect d’une obligation légale ou l’intérêt légitime à sécuriser et maintenir le service.

Pour les données métier, les finalités sont fixées par le Client : organisation de son activité, gestion commerciale, préparation de documents, suivi des interventions, traitement de courriels, assistance et calculs. L’éditeur ne réutilise pas ces données à des fins publicitaires propres. Toute nouvelle finalité doit faire l’objet d’une analyse juridique, d’une information et, si nécessaire, d’une base juridique propre.

## 4. Intelligence artificielle et courriels

Le Client choisit les contenus de courriels, documents ou textes soumis à l’extraction, au classement ou à l’interprétation automatisée. Il doit limiter les données transmises à ce qui est nécessaire, disposer d’une base légale et informer les personnes lorsque cela est requis.

Le code comporte un mode local Ollama qui interroge un moteur local lorsqu’il est installé et accessible; le service examiné ne prévoit pas de repli cloud automatique lorsque ce mode échoue. Le blueprint Render configure un mode géré, mais les fichiers audités ne permettent pas d’identifier le fournisseur distant réellement utilisé, son pays, sa conservation ou ses garanties. Ces éléments doivent être ajoutés à la liste des sous-traitants avant de proposer ce mode avec des données réelles. Les résultats sont des suggestions à vérifier par un professionnel et ne doivent pas produire seuls une décision ou une transmission.

## 5. Destinataires et sous-traitants ultérieurs

Les accès sont limités aux personnes habilitées et aux prestataires nécessaires à l’exploitation ou activés par le Client. Les fournisseurs susceptibles d’intervenir, selon la configuration effective, sont :

| Fournisseur ou service | Rôle potentiel | État à vérifier avant publication |
| --- | --- | --- |
| Render | Hébergement de l’application | Le service `aurion-web` en Oregon (États-Unis) est l’application canonique et répond à `/health/db`; le service `aurion` à Francfort redirige vers cette production. Le backend traite donc les requêtes sur le service américain. Entité contractante, contact juridique et mécanisme/garanties de transfert à documenter avant publication |
| Neon | Hébergement PostgreSQL | Région confirmée : AWS eu-central-1 (UE). Entité contractante, adresse juridique et garanties à renseigner |
| Stripe | Paiement par carte | Usage déclaré par l’éditeur; activation en production, rôles, entité et transferts à confirmer |
| Google | Connexion OAuth, calendrier ou messagerie, si activés | Services précis, régions et transferts à confirmer |
| Service SMTP ou messagerie choisi/configuré | Envoi ou synchronisation de courriels | Nom, rôle, région et conditions à préciser pour chaque offre |
| Fournisseur d’IA distante | Analyse ou génération | Usage distant déclaré par l’éditeur; le fournisseur, les données transmises, la région, la rétention et les garanties restent à définir |

La liste effective, les contacts, les finalités, les lieux de traitement, les transferts et les garanties applicables doivent être publiés sous {{AURION_SUBPROCESSORS}} et tenus à jour. Cette liste partielle est une déclaration de configuration vérifiée uniquement pour l’hébergement Render et Neon; les autres prestataires restent à confirmer. Les transferts hors Espace économique européen ne peuvent intervenir qu’avec une base et des garanties conformes au chapitre V du RGPD.

## 6. Hébergement et durée de conservation

La configuration Render observée le 30 octobre 2026 montre que `aurion-web` en Oregon (États-Unis) est l’application canonique : le service exécute le backend Node et répond au contrôle de santé PostgreSQL. Le service `aurion` à Francfort redirige vers cette production. La base Neon est en région AWS eu-central-1 (UE). Les appels applicatifs sont donc traités sur l’hôte américain; les flux exacts vers les modèles d’IA, la messagerie et les autres intégrations restent à vérifier. L’entité contractante Render, le mécanisme juridique et les garanties de transfert doivent être établis avant toute publication ou commercialisation avec des données personnelles.

La version examinée utilise Neon pour la base de données et enregistre les fichiers téléversés dans le répertoire local du service applicatif. La documentation Render précise que le disque local d’un service gratuit ne fournit pas une persistance fiable entre redémarrages ou redéploiements. Tant que les pièces ne sont pas migrées vers un stockage durable et que la restauration n’est pas testée, l’éditeur ne peut pas garantir leur conservation.

| Catégorie | Règle technique observée | Information à finaliser |
| --- | --- | --- |
| Données métier de l’espace | Accès en lecture seule après expiration de la période; le code prévoit ensuite une échéance d’accès de 60 jours supplémentaires | La purge effective de la base, des fichiers et des sauvegardes n’est pas démontrée; définir et implémenter la suppression et la restitution |
| Compte et authentification | Conservation pendant que le compte existe et traitement de jetons temporaires avec échéance | Fixer la durée après fermeture, les délais de sécurité et les exceptions |
| Paiement et justificatifs de l’offre Aurion | Traitement selon le moyen effectivement activé | Définir les durées légales, l’archivage et les accès aux factures |
| Journaux de sécurité et support | Collecte technique et traitement des demandes | Définir une durée précise par catégorie |
| Paramètres d’intégrations et courriels synchronisés | Conservés pendant l’activation de la connexion et l’utilisation des fonctions concernées | Définir suppression à la déconnexion et à la clôture; confirmer les durées des fournisseurs |
| Sauvegardes | Dépendent des configurations des hébergeurs et des fichiers | Publier fréquence, rétention, localisation et test de restauration |

**Cette section n’est pas suffisante pour une publication tant que les durées en attente ne sont pas fixées et que la suppression de bout en bout n’est pas prouvée.** Le passage en lecture seule ou le blocage d’accès ne constitue pas en soi une suppression.

## 7. Sécurité et violations de données

Le code examiné utilise notamment le hachage Argon2id pour les mots de passe, des cookies de session HttpOnly/Secure selon la configuration et des contrôles d’accès par organisation. Cela ne constitue pas une certification ni la preuve d’un audit indépendant. Les fichiers sont actuellement stockés sur le disque du service applicatif, avec le risque de durabilité décrit ci-dessus.

L’éditeur documente ses mesures techniques et organisationnelles dans une annexe de sécurité tenue à jour. En cas de violation affectant des données traitées pour le compte du Client, l’éditeur l’informe sans délai indu, communique les éléments raisonnablement disponibles et coopère à la réponse. Le responsable de traitement décide des notifications à la CNIL et aux personnes concernées qui lui incombent. Le point de contact opérationnel est {{AURION_PRIVACY_CONTACT_EMAIL}}.

## 8. Droits des personnes

Pour les données dont l’éditeur est responsable, les personnes peuvent exercer les droits prévus par le RGPD, selon leur applicabilité, en contactant {{AURION_PRIVACY_CONTACT_EMAIL}}. Une vérification proportionnée de l’identité peut être demandée. Une réclamation peut être adressée à la CNIL.

Pour les données métier enregistrées par un Client, la personne concernée s’adresse au Client responsable de traitement. L’éditeur l’assiste dans la mesure prévue par le contrat et l’article 28 du RGPD. Le Client demeure responsable de l’information des personnes, de la base juridique, des durées métier et du traitement de leurs demandes.

## 9. Cookies et stockage du navigateur

Les cookies et stockages locaux nécessaires à l’authentification et au fonctionnement sont décrits dans la politique cookies. L’examen du dépôt n’a pas mis en évidence d’outil publicitaire ou de mesure d’audience; cette observation doit être vérifiée sur le site réellement déployé et après toute activation d’un service tiers. Tout traceur non exempté doit être bloqué avant consentement, avec un refus aussi simple que l’acceptation et une possibilité de retrait.

## 10. Modifications

La présente politique est mise à jour en cas de modification importante des données, finalités, durées, fournisseurs ou transferts. Les changements substantiels sont portés à la connaissance des utilisateurs et des Clients selon les règles applicables.

# Annexe — Clauses de traitement de données au titre de l’article 28 du RGPD

## A. Objet, durée, nature et finalités

L’éditeur traite les données métier pour fournir l’espace Aurion, stocker et restituer les informations, produire les documents demandés, exécuter les intégrations activées, assister le Client, protéger le service et traiter les incidents. Le traitement dure pendant la relation contractuelle, puis le temps nécessaire à la restitution, à la suppression effective et aux sauvegardes selon des délais à renseigner avant publication.

## B. Personnes concernées et données

Les catégories et personnes concernées figurent aux sections 2 et 4. Le Client détermine les données saisies et s’abstient d’importer des catégories particulières sans instruction documentée, analyse juridique et mesures adaptées.

## C. Instructions du Client

L’éditeur traite les données uniquement sur instructions documentées du Client, y compris pour les transferts, sauf obligation légale applicable; dans ce cas, il en informe le Client avant le traitement, sauf interdiction légale. L’éditeur avertit le Client s’il estime qu’une instruction viole le RGPD ou une autre règle de protection des données.

## D. Obligations de l’éditeur sous-traitant

L’éditeur s’engage à :

1. veiller à ce que les personnes autorisées à traiter les données soient soumises à la confidentialité;
2. appliquer des mesures techniques et organisationnelles adaptées au risque et fournir leur description actualisée;
3. respecter les conditions applicables à l’autorisation et au recours à des sous-traitants ultérieurs, informer préalablement le Client de tout ajout ou remplacement et lui permettre de présenter une objection motivée;
4. assister le Client, compte tenu de la nature du traitement, pour répondre aux demandes des personnes et respecter les obligations relatives à la sécurité, aux violations, aux analyses d’impact et aux consultations préalables;
5. notifier au Client toute violation de données personnelles sans délai indu et lui transmettre les éléments utiles à sa documentation et à ses notifications;
6. mettre à sa disposition les informations nécessaires pour démontrer le respect de l’article 28 et permettre des audits raisonnables, sous réserve de la confidentialité et de la sécurité des autres clients;
7. au choix du Client après la fin du service, restituer ou supprimer les données personnelles et supprimer les copies existantes, sauf obligation légale de conservation; les durées techniques et de sauvegarde doivent être convenues et documentées avant publication;
8. ne pas transférer des données hors EEE sans instruction ou mécanisme de transfert conforme et information du Client.

## E. Obligations du Client responsable de traitement

Le Client documente ses instructions, choisit une base légale, informe les personnes, définit les durées métier, configure les accès, vérifie les contenus et destinataires et traite les demandes qui lui sont adressées. Il ne dépose que les données nécessaires et dispose des droits requis pour les intégrer à Aurion et les faire traiter par les fournisseurs activés.

## F. Sous-traitants ultérieurs et transferts

La liste, les fonctions, les pays et mécanismes de transfert doivent être ajoutés par l’éditeur avant la publication. L’autorisation générale du Client ne s’applique qu’aux fournisseurs effectivement identifiés, soumis à des obligations au moins équivalentes et utilisés pour les finalités décrites. Toute nouvelle utilisation est notifiée avant qu’elle ne commence.

## G. Mesures de sécurité et documentation

Une annexe technique distincte doit préciser les mesures réellement déployées : contrôle des accès, sauvegardes et restauration, chiffrement au repos et en transit, journalisation, protection des secrets, gestion des vulnérabilités, continuité et suppression. Ne pas présenter une mesure comme effective sans preuve et configuration vérifiée.
