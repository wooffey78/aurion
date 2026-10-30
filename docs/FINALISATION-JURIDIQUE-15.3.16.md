# Finalisation juridique et données encore manquantes — Aurion 15.3.16

Les projets version 2.1 sont intégrés dans docs/ et reproduits dans legal/. Ils restent brouillons et l’inscription ainsi que la souscription payante restent bloquées tant que les documents nécessaires ne sont pas complétés et publiés. Les informations envoyées le 30 octobre 2026 sont consignées ci-dessous; elles ne sont pas toutes vérifiées par un justificatif officiel.

## Informations fournies par l’éditeur

- Nom fourni : « Coulibaly Damien »; nom commercial déclaré : « Easyweb-dev ».
- SIRET fourni : 88848569500033. Le SIREN 888485695 est déduit des neuf premiers chiffres du SIRET; faire correspondre les deux au document officiel de l’établissement.
- E-mail communiqué : easyfixit.reparation@gmail.com; confirmer qu’il peut être publié comme contact juridique, confidentialité, support et rétractation.
- Marché confirmé : clients professionnels et consommateurs (B2B et B2C).
- Prestataires déclarés : Stripe et IA distante. Le fournisseur d’IA et les autres prestataires restent à identifier.

## Justificatif d’identité professionnelle à confirmer

- Raison ou nom légal exact et forme juridique tels qu’inscrits au RNE/SIRENE; vérifier que le SIRET fourni désigne bien l’éditeur d’Aurion et le nom commercial Easyweb-dev.
- Adresse du siège et adresse postale de réclamation/rétractation; numéro de téléphone professionnel si requis.
- Capital social si applicable; RCS ou registre des métiers si applicable.
- Régime de TVA, numéro intracommunautaire ou motif précis de non-applicabilité.
- Nom du directeur ou de la directrice de publication.
- Coordonnées e-mail et téléphone pour juridique, support, confidentialité et accessibilité.
- Fournir ou consulter l’avis de situation Sirene ou l’attestation d’immatriculation RNE avant de publier les mentions.

## Consommateurs : prérequis à la vente B2C

- Choisir un médiateur de la consommation référencé, adhérer à son dispositif et insérer ses coordonnées exactes dans les CGV et le site.
- Ajouter au parcours de commande le statut consommateur/professionnel, les informations précontractuelles, le récapitulatif TTC, la confirmation sur support durable et l’information sur les garanties légales des services numériques.
- Développer et vérifier la fonctionnalité de rétractation en ligne applicable aux contrats conclus par interface en ligne. Aucun parcours correspondant n’a été trouvé dans le dépôt 15.3.16.
- Ajouter le formulaire type de rétractation et le processus de remboursement et de traitement des demandes.
- Conserver l’absence de renouvellement automatique constatée ou décider explicitement d’un autre modèle et adapter le parcours et les conditions en conséquence.

## Hébergement, prestataires et transferts

Configuration observée le 30 octobre 2026 :

- Render : service aurion-web en Oregon (États-Unis) et service aurion à Francfort (Allemagne), tous deux publiquement accessibles et sur plan gratuit. Confirmer le service canonique, les appels réels et si des données personnelles sortent de l’EEE.
- Neon : base PostgreSQL en région AWS eu-central-1 (UE). Le planning Neon des snapshots consulté pour la branche de production était vide.
- Stripe : utilisation déclarée; confirmer l’activation effective, l’entité contractante, les conditions de traitement et les transferts.
- IA distante : usage déclaré; indiquer le fournisseur, les modèles, les données envoyées, les régions, les durées et l’usage pour entraînement.
- Google, messagerie SMTP/Brevo, suivi d’erreurs, support et stockage objet : confirmer pour chacun s’il est utilisé, son rôle, son entité, ses régions, son DPA et ses transferts.

La liste publiée doit nommer les entités légales, leurs fonctions, données traitées, régions, durées et mécanismes de transfert. Pour toute route de données vers les États-Unis, valider le mécanisme de transfert applicable et les garanties avant mise en production.

## Conservation, sécurité et accessibilité

- Définir les durées de conservation pour chaque catégorie et implémenter la suppression coordonnée de PostgreSQL, des fichiers et des sauvegardes.
- Migrer les pièces jointes vers un stockage objet privé durable et tester la restauration complète.
- Fixer rétention, fréquence et procédure de sauvegarde de Neon et des fichiers; le planning de snapshots était vide lors de la vérification.
- Identifier le fournisseur SMTP réellement utilisé et tester la livraison des courriels transactionnels; Render gratuit bloque 25, 465 et 587.
- Réaliser l’audit RGAA si le service y est assujetti; renseigner la déclaration à partir du rapport réel.
- Effectuer une revue juridique française des conditions B2C/B2B, du RGPD, des transferts et de la facturation électronique.

## Verrou de publication applicatif

Depuis Aurion 15.3.16, la variable d’environnement `AURION_LEGAL_PUBLICATION_APPROVAL` doit être exactement égale à `2.1` pour qu’un document puisse sortir de l’état brouillon. Cette validation explicite ne suffit pas seule : tous les champs requis doivent être renseignés, aucun marqueur de projet ne doit rester et chaque texte doit avoir été revu et approuvé. Ne pas ajouter cette variable avant la validation humaine et juridique.

## Sources officielles

- [Avis de situation Sirene — Insee](https://avis-situation-sirene.insee.fr/)
- [Annuaire des entreprises](https://annuaire-entreprises.data.gouv.fr/)
- [Vente à distance et règles de rétractation — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F23455)
- [Médiation de la consommation — obligations des professionnels](https://www.economie.gouv.fr/mediation-conso/vous-etes-un-professionnel/vos-principales-obligations-0)
- [CGV — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F33527)
- [RGPD et sous-traitance — CNIL](https://www.cnil.fr/fr/securite-gerer-la-sous-traitance)
