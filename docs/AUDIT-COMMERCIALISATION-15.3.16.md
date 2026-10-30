# Addendum à l’audit de commercialisation — Aurion 15.3.16

**État au 30 octobre 2026.** Cet addendum remplace l’hypothèse « marché à déterminer » de l’audit 15.3.14 : l’éditeur a confirmé un marché B2B et B2C et a fourni des coordonnées d’entreprise à vérifier. Il s’agit d’une estimation documentaire, pas d’un audit juridique, sécurité ou recette exhaustive.

## Avancement estimé

**Environ 36 % avant commercialisation (incertitude d’au moins ±10 points).** L’estimation précédente d’environ 39 % reposait sur un périmètre moins précis. La confirmation d’une vente aux consommateurs ajoute des parcours, informations, garanties et recours qui ne sont pas constatés dans le produit actuel.

| Domaine | Poids | Niveau estimé | Contribution |
| --- | ---: | ---: | ---: |
| Parcours et fonctions cœur | 25 % | 75 % | 18,75 |
| Hébergement et durabilité des données | 15 % | 20 % | 3,00 |
| Authentification, sécurité et preuves de contrôle | 15 % | 45 % | 6,75 |
| Commande, paiement et parcours B2C | 10 % | 30 % | 3,00 |
| Contrats et protection des données | 15 % | 5 % | 0,75 |
| Courriels et assistance | 5 % | 30 % | 1,50 |
| Accessibilité | 5 % | 10 % | 0,50 |
| Facturation électronique réglementaire | 10 % | 20 % | 2,00 |
| **Total** | **100 %** |  | **36,25 %** |

Le dépôt contient des textes de travail version 2.1, pas des documents définitifs. Les points d’identité reçus — nom « Coulibaly Damien », nom commercial « Easyweb-dev », SIRET 88848569500033 et e-mail easyfixit.reparation@gmail.com — sont des déclarations de l’éditeur, non des mentions vérifiées à partir d’un justificatif officiel. Le SIREN 888485695 est seulement déduit du SIRET fourni.

## État applicatif et garde-fous

- La version 15.3.15 a été observée déployée sur les deux services Render au moment du contrôle précédent. Neon indiquait les documents juridiques 2.0 comme brouillons.
- La version 15.3.16 candidate met les textes de travail en version 2.1, maintient les documents en brouillon et exige aussi `AURION_LEGAL_PUBLICATION_APPROVAL=2.1` avant tout passage à l’état publié. Les champs obligatoires et les marqueurs de projet doivent également être résolus.
- La création de compte, l’acceptation d’invitation et la souscription payante restent bloquées tant que les quatre documents contractuels requis ne sont pas publiés. Ce verrou bloque actuellement l’ouverture aux nouveaux clients B2B comme B2C; la connexion des comptes existants reste possible.
- Le verrou documentaire ne remplace ni les fonctionnalités de conformité ni une validation juridique. Il ne rend pas Aurion prêt à vendre aux consommateurs.

## Blocages B2C avant la première vente

1. Justifier l’identité et la forme exacte de l’éditeur, l’adresse professionnelle, les coordonnées, le régime de TVA et les registres applicables à partir d’un avis Sirene/RNE à jour.
2. Choisir et contractualiser avec un médiateur de la consommation référencé, puis afficher ses nom, coordonnées et site sur le service et dans les CGV.
3. Ajouter la qualification consommateur/professionnel, le récapitulatif précontractuel, les prix TTC, les conditions de fourniture, la remise des conditions sur support durable et l’information sur les garanties légales des services numériques.
4. Créer le parcours gratuit et direct de rétractation en ligne, l’accusé de réception durable, le traitement et le remboursement. L’obligation de permettre la rétractation en ligne s’applique depuis le 19 juin 2026 aux contrats à distance conclus par interface en ligne.
5. Faire vérifier les écrans de commande, les paiements Stripe et virement, le renouvellement (aucun prélèvement automatique n’a été constaté dans le code examiné), les remboursements et la résiliation. Ne pas présenter un essai gratuit comme une absence de contrat sans analyse juridique.
6. Faire relire les CGV/CGU, la politique de confidentialité et l’annexe article 28 du RGPD par un juriste français. La présence et la version des textes dans l’application ne constituent pas une validation.

Le médiateur et le parcours de rétractation sont des conditions de mise en vente B2C, pas de simples champs rédactionnels. À défaut, ne pas ouvrir les commandes aux consommateurs.

## Risques techniques et opérationnels prioritaires

- **Perte de fichiers :** les pièces jointes résident sur le disque applicatif; un service Render gratuit ne fournit pas de disque persistant et peut perdre ces fichiers au redémarrage, redéploiement ou arrêt. Migrer vers un stockage privé durable puis restaurer un jeu d’essai.
- **Hébergement et transferts :** deux services de production ont été observés, l’un en Oregon (États-Unis), l’autre à Francfort (Allemagne). Confirmer lequel traite effectivement les données et documenter les garanties de tout accès ou transfert hors EEE. Neon est en région AWS eu-central-1 (UE); le planning de snapshots consulté était vide.
- **Fournisseurs :** Stripe et une IA distante ont été déclarés. Le fournisseur/modèle d’IA, SMTP/Brevo, Google, le support et les autres sous-traitants actifs restent à identifier avec leurs entités, régions, traitements, durées, DPA et mécanismes de transfert.
- **Données :** les durées de conservation, l’effacement coordonné base/fichiers/sauvegardes, la restauration et les procédures de violation ne sont pas prouvés. L’état lecture seule d’un compte n’est pas une suppression.
- **Courriels :** vérifier un vrai envoi/réception de chaque e-mail transactionnel. Render gratuit bloque les ports SMTP sortants 25, 465 et 587.
- **Factures électroniques :** le dépôt produit des données ou fichiers de facture mais ne prouve pas l’acheminement par une plateforme agréée; ne pas promettre cette conformité avant l’intégration ou la qualification d’un partenaire.
- **Sécurité et accessibilité :** aucun audit indépendant de sécurité, essai de restauration, ni audit RGAA complet n’a été constaté. Déclarer la conformité uniquement sur la base de contrôles et rapports réels.

## Décision commerciale

**Ne pas lancer les ventes B2C et ne pas annoncer Aurion comme prêt pour un usage professionnel critique en l’état.** Un pilote B2B limité ne devrait commencer qu’après vérification d’identité, contrats, sous-traitants, persistance/sauvegarde et parcours de support. Le verrou actuel empêche déjà les nouvelles inscriptions et les paiements tant que les documents restent en brouillon.

## Sources officielles

- [Mentions obligatoires d’un site professionnel — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F37351)
- [Vente à distance et rétractation en ligne — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F23455)
- [Obligations de médiation de la consommation — Ministère de l’Économie](https://www.economie.gouv.fr/mediation-conso/vous-etes-un-professionnel/vos-principales-obligations-0)
- [Médiateurs référencés — Ministère de l’Économie](https://www.economie.gouv.fr/mediation-conso/vous-etes-un-professionnel/choisir-un-mediateur-de-la-consommation/mediateurs-references)
- [Sous-traitance et article 28 du RGPD — CNIL](https://www.cnil.fr/fr/securite-gerer-la-sous-traitance)
- [Déclaration d’accessibilité — RGAA](https://accessibilite.numerique.gouv.fr/obligations/declaration-accessibilite/)
