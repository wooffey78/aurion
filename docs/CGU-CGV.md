# Conditions générales d’utilisation et de vente — Aurion

Version **5.0**, révision du 23 novembre 2026 pour Aurion 15.4.51 (mise à jour de la version 4.0 du 20 novembre 2026 ; coordonnées et engagements du propriétaire inchangés). Cette révision couvre les fonctions livrées depuis la version 4.0 : portail client invités, partage de liens, webhooks sortants, contrats d’entretien récurrents, préparation de la facturation électronique et re-acceptation versionnée des documents contractuels. Les ajouts sont soumis à la validation juridique externe prévue avant ouverture commerciale.

**Éditeur : Coulibaly Damien, entrepreneur individuel sous le régime micro-entreprise, nom commercial Easyweb-dev. Adresse : 5 Rue Jacques Prevert, 85300 Challans, France. SIRET : 88848569500033 (SIREN : 888485695). TVA non applicable — article 293 B du CGI. Contact : easyfixit.reparation@gmail.com — 07 81 51 33 21.**

## 1. Objet, éditeur et clientèle

Aurion est un logiciel de gestion d’activité destiné aux professionnels disposant déjà d’une entreprise ou activité immatriculée. Il est accessible par le Web et, selon l’installation retenue, comme application web installable et application Windows. Un projet applicatif Android existe dans l’arborescence de développement mais n’est pas distribué : aucune application Android ou iOS n’est publiée sur Google Play ni sur l’App Store à cette version ; toute publication ultérieure suppose des builds signés et des comptes développeur effectivement validés par l’éditeur. Les fonctions peuvent comprendre la configuration d’une entreprise existante, les clients, fournisseurs, catalogue, devis, factures, interventions, rendez-vous, documents, échanges de courriels, tableaux de bord et automatisations, la lecture de bordereaux professionnels pour préparer un brouillon de facture, le rapprochement bancaire par import de relevés (CSV/OFX), les exports comptables (livre des recettes, journaux, fichier FEC) avec un accès « expert-comptable » en lecture seule, ainsi que la préparation et la transmission de facturation électronique via une Plateforme Agréée configurée. La création d’entreprise, la préparation ou le dépôt de formalités de création et la création d’identité visuelle de l’entreprise ne font pas partie du service. Les fonctions effectivement disponibles sont celles présentées dans la version et l’offre commandées; Le service propose également un fonctionnement hors connexion sur les accès web : les données autorisées sont répliquées localement sur l’appareil pour consultation, les décisions prises hors connexion sont conservées dans une file locale puis rejouées automatiquement au retour du réseau, la numérotation réglementaire et les identifiants définitifs restant attribués par le serveur au moment du rejeu ; les documents récents peuvent être téléchargés automatiquement selon la politique de récence configurable, et les données locales restent cloisonnées par compte, organisation et appareil. certaines fonctions décrites à l’article 3 ne sont activables qu’après configuration d’un prestataire et restent déclarées non opérationnelles tant que cette configuration et sa validation ne sont pas effectuées.

L’éditeur indiqué ci-dessus est ci-après « l’Éditeur ». Aurion s’adresse aux professionnels et, si l’offre est ouverte à cette catégorie, aux consommateurs. La qualité du client est déterminée d’après la finalité réelle de la commande; une case ou un libellé ne peut supprimer une protection légale.

## 2. Formation du contrat et compte

Le contrat comprend le récapitulatif de commande, les présentes conditions, les informations précontractuelles et la politique de confidentialité. L’Éditeur remet la confirmation et les documents applicables sur support durable et conserve la version acceptée.

Le Client fournit des données exactes, protège ses identifiants et habilite les utilisateurs de son espace. Il demeure responsable de la licéité des informations qu’il importe, de l’information des personnes, des bases juridiques, des destinataires et des documents envoyés. Il vérifie chaque donnée, calcul, taux, document et action avant utilisation externe.

## 3. Étendue et limites du service

Aurion est réservé à la gestion d’une entreprise déjà existante. Il ne constitue pas un service de création d’entreprise, ne prépare ni ne dépose des formalités de création, et ne produit pas d’identité visuelle ou de logo d’entreprise. La recherche d’entreprise par nom ou par SIRET/SIREN sert à retrouver et compléter des informations publiques d’une entreprise existante ; elle ne vaut ni preuve exhaustive de situation juridique ni validation administrative. Aurion ne fournit pas de conseil juridique, fiscal, social ou comptable, ne tient pas une comptabilité certifiée et ne garantit pas l’acceptation d’un document ou d’une opération par une administration, une banque ou un organisme.

Le service ne comporte aucune fonction de génération automatique de contenu. Les détections, imports et analyses (recherche d’entreprise par nom ou SIRET/SIREN, lecture des bordereaux professionnels, rapprochement bancaire) s’exécutent dans l’application selon des règles déterministes et produisent des propositions que l’utilisateur peut corriger avant tout enregistrement; ces propositions peuvent être inexacts ou incomplets.

Aurion 15.4.22 comprend la préparation de factures électroniques structurées (formats Factur-X, UBL et CII), une boîte de réception des factures fournisseurs et des déclarations e-reporting, activables uniquement après configuration d’une Plateforme Agréée (variable `AURION_PA_PROVIDER`). Au 14 novembre 2026, aucune plateforme agréée n’est connectée ni validée en environnement de test : la génération d’un fichier conforme ne vaut pas transmission, et une facture n’est réputée transmise qu’après un accusé réel de la plateforme. Tant qu’aucune plateforme n’est configurée, la réception est refusée et aucun document produit par Aurion ne doit être présenté comme une facture électronique acheminée au sens de la réforme française.

## 4. Prix, essai, commande et paiement

Les plans issus du choix de l’éditeur sont un essai de 60 jours sans carte enregistrée ni prélèvement automatique à son échéance, puis des périodes commandées ponctuellement au tarif affiché avant paiement : **14,00 € par mois** ou **151,20 € par an**, nets de taxe (TVA non applicable, article 293 B du CGI), sans reconduction automatique. Le tarif affiché avant le paiement fait foi, sous réserve des règles impératives.

L’abonnement est réglé par Stripe lorsque les identifiants et le compte marchand sont activés. Un lien de paiement peut accompagner une facture émise lorsque le prestataire de paiement client est configuré (variable `AURION_PAY_PROVIDER`); ce prestataire n’est pas encore choisi (décision D3) et le service n’est pas opérationnel au 14 novembre 2026 ; aucun numéro de carte n’est stocké par Aurion. Aucun paiement n’est réputé confirmé avant vérification auprès du prestataire. Le virement bancaire n’est proposé que si l’Éditeur a renseigné et vérifié les coordonnées affichées. Les moyens proposés sont indiqués avant la commande.

Pour chaque commande B2C, l’écran récapitulatif doit afficher les caractéristiques essentielles, le prix total à payer, les éventuels frais, la durée, l’absence de renouvellement automatique, les moyens de paiement, le droit de rétractation et le bouton de commande non ambigu. L’Éditeur doit confirmer le contrat sur support durable.

Pour un client professionnel, les factures précisent la date d’échéance et les pénalités légalement requises. En cas de retard, les pénalités et l’indemnité forfaitaire de recouvrement de 40 € s’appliquent dans les conditions du Code de commerce; les frais supplémentaires justifiés sont réservés. Cette clause ne s’applique pas aux consommateurs.

## 5. Rétractation des consommateurs

Le consommateur bénéficie du délai légal de rétractation applicable au contrat à distance, normalement de 14 jours à compter de sa conclusion pour le service concerné, sous réserve des exceptions prévues par la loi. Le formulaire gratuit est accessible depuis le lien **« Renoncer au contrat ici »**, visible sur la page d’accueil, l’écran de connexion et dans l’espace connecté pendant la période applicable, ainsi que par l’URL `/#/withdrawal`. La page propose le bouton **« Confirmer la rétractation »**, permet d’identifier le contrat, consigne le contenu, la date et l’heure de réception et fournit une référence de suivi.

Depuis le 19 juin 2026, la loi impose une fonctionnalité gratuite, facile, directe et permanente pour les contrats conclus à distance par interface en ligne. Lorsqu’une déclaration est transmise par cette interface, un accusé de réception doit être communiqué sans délai sur support durable. Aurion envoie cet accusé à l’adresse fournie lorsque le service SMTP est opérationnel. **La déclaration est enregistrée même si l’e-mail échoue** ; la demande de rétractation n’est pas rejetée pour une défaillance technique de l’e-mail.

L’Éditeur examine la demande, vérifie le contrat et l’éligibilité, répond au consommateur et effectue le remboursement dans le délai légal lorsqu’il est dû. La réception automatique ne signifie ni acceptation ni remboursement déjà exécuté.

Lorsque le consommateur demande expressément que la prestation commence avant la fin du délai et que les conditions légales sont réunies, les conséquences d’une rétractation et toute éventuelle perte du droit ne s’appliquent que dans les formes et limites prévues par la loi. Aucune renonciation générale n’est imposée.

## 6. Garanties, réclamations et médiation

Les garanties légales applicables aux contenus et services numériques demeurent intégralement applicables. Le Client peut signaler une difficulté à **easyfixit.reparation@gmail.com** ou au **07 81 51 33 21**. Aucun délai de réponse garanti n’est promis.

Après une réclamation écrite préalable restée sans solution, un consommateur peut recourir gratuitement au médiateur de la consommation désigné par l’Éditeur, dans les conditions légales. **Médiateur désigné : CM2C** ([https://www.cm2c.net](https://www.cm2c.net)) [À compléter : coordonnées officielles CM2C à publier — adresse électronique et adresse postale de saisine — une fois l’adhésion de l’Éditeur enregistrée]. La médiation est gratuite pour le consommateur ; les frais éventuels supportés par l’Éditeur sont à sa charge.

## 7. Durée, résiliation et données

Les accès d’essai durent 60 jours. Une période payée est celle indiquée au récapitulatif. Les périodes payées sont commandées séparément, sans renouvellement automatique. Le Client peut demander la fermeture du compte à l’adresse de contact. Après la fin de l’abonnement, l’espace passe en lecture seule soixante jours après l’expiration; les documents comptables et factures obéissent ensuite aux obligations de conservation des documents commerciaux.

Un export complet de l’organisation (clients, fournisseurs, devis, factures, paiements, dépenses, notes de frais, justificatifs d’origine, journal d’événements et paramètres non secrets) est disponible en formats ouvrables (CSV, JSON et fichiers d’origine) sans frais ni démarche particulière. L’état réel des contrôles de sécurité et de la liste des sous-traitants est publié sur la page « Sécurité et contrôles » accessible publiquement. Les données sont conservées pendant les durées légales applicables (obligations comptables et commerciales), puis supprimées ; les durées détaillées figurent dans la politique de confidentialité.

Les contenus du Client restent sous ses droits. Il autorise les traitements et l’hébergement strictement nécessaires à la fourniture du service et selon les instructions documentées. Les rôles, sous-traitants, transferts, durées et droits sont décrits dans la politique de confidentialité et son annexe de l’article 28 RGPD.

## 8. Disponibilité, propriété intellectuelle et responsabilité

Aurion est fourni avec des dépendances et intégrations tierces soumises à leurs propres conditions. Les droits portant sur Aurion restent à leurs titulaires respectifs; le Client conserve ses droits sur ses données. L’Éditeur met en œuvre des moyens raisonnables d’exploitation et de correction, sans disponibilité garantie ni SLA dans cette offre.

Aucune clause n’exclut une garantie ou responsabilité qui ne peut légalement être exclue, ne limite les droits impératifs du consommateur, ni n’écarte l’accès aux juridictions compétentes. Les interruptions peuvent résulter d’opérations de maintenance, d’un incident ou de la défaillance d’un fournisseur.

## 9. Données personnelles, modifications et loi

La politique de confidentialité, son annexe de sous-traitance et la politique cookies complètent le contrat. Les fournisseurs présents dans la configuration sont Render pour l’hébergement du service applicatif (région Francfort, Allemagne — le blueprint `render.yaml` déclare un service unique ; l’instance historique Oregon n’est qu’une voie de retour arrière temporaire), une base PostgreSQL gérée en région européenne, le stockage OVHcloud Object Storage région `de` (Francfort) pour les fichiers privés, le stockage Google Drive (facultatif, activé par le client pour son archivage documentaire), un serveur SMTP choisi par le client pour l’envoi des documents et relances, et Stripe pour l’abonnement Aurion. Un prestataire de paiement client (`AURION_PAY_PROVIDER`) et une plateforme agréée (`AURION_PA_PROVIDER`) ne s’ajoutent à cette liste qu’après leur configuration effective et leurs contrats. La liste réelle, calculée automatiquement depuis la configuration, est publiée sur la page « Sécurité et contrôles ».

Les modifications substantielles sont portées à la connaissance du Client et une nouvelle acceptation est recueillie lorsque la loi ou le contrat l’exige. Le droit français s’applique sans priver le consommateur des règles impératives de sa résidence.

## 10. Formulaire type

À l’attention de Coulibaly Damien, entrepreneur individuel, nom commercial Easyweb-dev, 5 Rue Jacques Prevert, 85300 Challans, France, easyfixit.reparation@gmail.com :

« Je vous notifie par la présente ma rétractation du contrat portant sur Aurion conclu le [date], référence [commande/paiement/facture]. Nom et prénom : [à remplir]. Adresse e-mail du compte : [à remplir]. Date : [à remplir]. Signature uniquement en cas de formulaire papier. »

**Entrée en vigueur : les présentes conditions s’appliquent aux contrats conclus à compter de leur publication dans l’application.**

## Références

- [Code de la consommation, article L. 221-21](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053310520/2026-08-27)
- [Service Public Entreprendre — rétractation en ligne](https://entreprendre.service-public.gouv.fr/vosdroits/F23455)
- [Médiation de la consommation : obligations professionnelles](https://entreprendre.service-public.gouv.fr/vosdroits/F33338)
- [Service Public — calendrier de la facture électronique](https://entreprendre.service-public.gouv.fr/vosdroits/F39785)

## Article 15-bis — Portail client invités et acceptation de devis en ligne

Le service permet à l'abonné de créer, pour chacun de ses clients, un accès au « portail client » : une page publique désignée par un lien à jeton aléatoire, consultable sans création de compte et sans cookie de suivi. Le portail présente exclusivement les devis que l'abonné y a expressément partagés. Le client invité peut y accepter un devis en indiquant son nom de signataire ; l'acceptation est horodatée par le serveur, conservée comme preuve technique (registre des acceptations et, depuis la 15.4.51, chaîne d'intégrité documentaire) et reste opposable dans les limites de la preuve technique : elle ne remplace pas les formalités que l'abonné est seul à maîtriser (signature électronique qualifiée, double exemplaire, etc.). L'abonné demeure seul responsable des devis qu'il publie sur le portail, de leur exactitude et de leur conformité aux obligations d'information précontractuelles qui lui incombent. L'accès peut être révoqué à tout moment par l'abonné ; le lien révoqué cesse de fonctionner immédiatement et un message neutre est présenté au visiteur (aucune information n'est révélée sur l'existence ou l'absence d'un accès).

## Article 15-ter — Webhooks sortants

L'abonné peut enregistrer des URL de réception (« webhooks ») auxquelles le service transmet des notifications d'événements métier, signées numériquement (HMAC). L'abonné reconnaît être seul responsable des URL qu'il configure, de la légalité du transfert de données vers ses propres récepteurs et du traitement de ces données par ses outils. La livraison s'efforce d'être fiable (tentatives répétées avec délai croissant) sans garantie de délai ni d'exclusivité : après épuisement des tentatives, l'événement est placé en « lettre morte », consultable par l'abonné et par l'éditeur à des fins de support. L'abonné peut rejouer manuellement un événement en échec en motivant l'opération, qui est conservée dans l'audit.

## Article 15-quater — Facturation électronique préparatoire et plateforme agréée

Le service prépare la facturation électronique : génération d'un fichier structuré conforme pour les factures émises et affichage d'un statut explicite « préparé, non transmis ». Tant qu'aucune Plateforme Agréée n'est souscrite et configurée par l'éditeur, AUCUNE transmission automatique n'est effectuée et le service ne peut être présenté comme conforme au régime d'obligation d'émission électronique applicable à partir du 1er septembre 2026. La transmission suppose un contrat séparé avec la plateforme retenue ; les coordonnées de celle-ci, les flux et les responsabilités respectives seront décrits dans la présente convention lors de l'activation effective. L'abonné reste responsable de ses obligations déclaratives entre-temps.

## Article 15-quinquies — Contrats d'entretien récurrents

Le service permet de créer des contrats d'entretien périodiques avec un client et de proposer les occurrences à venir (propositions déterministes, validées par l'abonné, jamais automatisées fermées). Les occurrences deviennent des interventions ordinaires après validation de l'abonné ; la facturation reste celle des articles existants.

## Article 16-bis — Acceptation versionnée des documents contractuels

Les présentes conditions, la politique de confidentialité, la politique cookies, les mentions légales et le contrat de sous-traitance de traitement (DPA) sont versionnés. À chaque montée de version substantielle, le compte est informé au prochain accès au service et invité à accepter les documents à jour ; l'acceptation est datée et conservée. La consultation publique des documents reste possible sans compte à l'adresse légale du service.
