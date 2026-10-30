# Préparation juridique — Aurion 15.3.19

**Version de travail 2.3 · 30 octobre 2026 · ne pas publier ni utiliser pour vendre.** Les documents se trouvent dans `docs/` et sont copiés dans `legal/`. Ils reprennent les informations déclarées par l’éditeur, la cible d’hébergement choisie et le code local de la version 15.3.19. Ils ne sont pas un avis juridique et ne deviennent pas définitifs par le seul fait d’être intégrés au projet.

## Informations communiquées

- Coulibaly Damien, entrepreneur individuel sous le régime micro-entreprise, nom commercial Easyweb-dev.
- Adresse professionnelle déclarée : 5 Rue Jacques Prevert, 85300 Challans.
- SIRET déclaré : 88848569500033; SIREN calculé à partir des neuf premiers chiffres : 888485695. La clé de contrôle SIRET est valide, mais l’immatriculation et l’adresse n’ont pas été vérifiées sur un extrait RNE/Sirene.
- TVA : l’éditeur déclare « non assujetti ». Ce libellé doit être confirmé : une entreprise en franchise en base est généralement assujettie mais non redevable de la TVA. Le régime exact détermine les mentions de facture, l’e-invoicing et l’e-reporting.
- Téléphone 07 81 51 33 21; contact, support, rétractation et données : easyfixit.reparation@gmail.com. Directeur de publication déclaré : Coulibaly Damien.
- Clientèle B2B et B2C, paiements via Stripe, marché France. Tarifs envisagés dans l’application : 14,00 €/mois et 151,20 €/an, paiement par période sans reconduction automatique d’après le code examiné; récapitulatif Stripe et CGV à contrôler.

## Cible et fournisseurs envisagés

- Render `aurion` existant à Francfort (à mettre sur plan payant et à rendre canonique); Neon PostgreSQL en UE; OVHcloud Object Storage privé à Francfort.
- Brevo SMTP pour les e-mails transactionnels, offre gratuite candidate; Stripe Payments Europe pour les paiements.
- Tiime Free est retenue pour gérer les factures de l’entreprise de l’éditeur : son offre officielle annonce la facturation et l’accès à sa PA gratuitement. « TIIME PDP » figure dans la liste DGFiP des opérateurs satisfaisant aux conditions, tests d’interopérabilité inclus, avec une date d’immatriculation du 18 décembre 2025. Créer le compte et contrôler les conditions/prix au moment de l’inscription. Aurion n’est pas raccordé à Tiime; cette solution ne rend pas l’application compatible et ne règle pas le flux de facturation des clients Aurion.
- CM2C comme médiateur candidat, sous réserve de compétence pour le SaaS et d’adhésion.
- Aucune IA distante choisie; Ollama local et Qwen3.5 restent réservés au fonctionnement local.

Une vérification Render en lecture seule le 30 octobre 2026 a trouvé deux services actifs sur la branche `main` et le même commit 15.3.18 : `aurion-web` en Oregon, plan gratuit, et `aurion` à Francfort, plan gratuit. La bascule du domaine canonique vers Francfort n’est pas confirmée. Les services de stockage, SMTP et PA restent à provisionner. Render est contracté avec Render Services, Inc.; une région allemande n’exclut pas à elle seule les accès, sous-traitants ou transferts à qualifier. Remplacer les mentions candidates par les contrats/DPA et régions réellement associés au compte.

## Dossier intégré

- `docs/CGU-CGV.md` : projet conditions B2B/B2C, offre sans reconduction automatique observée, droit de rétractation et médiateur candidat.
- `docs/POLITIQUE-CONFIDENTIALITE.md` : projet d’information et d’annexe de sous-traitance RGPD, flux et régions cible.
- `docs/LEGAL-NOTICE.md` : projet de mentions légales.
- `docs/COOKIES.md` : inventaire statique des cookies et stockages à vérifier en navigateur.
- `docs/DECLARATION-ACCESSIBILITE.md` : note d’état, non une déclaration de conformité. Une microentreprise fournissant un service peut bénéficier d’une dispense sous conditions d’effectif et de seuils financiers; consigner l’analyse avant de publier un statut.

Les mêmes fichiers sont reproduits dans `legal/` pour les vues et procédures du projet. Les textes portent un bandeau de préparation. Le code maintient `is_draft=true` tant que les marqueurs de préparation, les données requises ou l’approbation de publication manquent. Le verrou `AURION_LEGAL_PUBLICATION_APPROVAL=2.3` n’est pas présent dans le blueprint; ne l’ajouter qu’après validation effective de la version des documents. Cela maintient fermés l’inscription et le paiement.

## Modifications intégrées au code

- Parcours public de rétractation `/#/withdrawal`, liens visibles et bouton de confirmation; demande horodatée, enregistrée en base, suivie dans l’interface d’administration avec renvoi d’accusé.
- L’accusé durable s’envoie via SMTP configuré. En cas d’échec, la demande reste enregistrée et doit être traitée par l’administrateur; l’ouverture B2C est bloquée tant que l’envoi automatique n’est pas opérationnel.
- État des factures structuré explicitement comme `prepared_not_transmitted`; le JSON indique qu’il ne s’agit pas d’un format transmis à une PA. Migration `071` ajoute cet état.
- Stockage de pièces privées S3 OVH prêt dans le code; le bucket, les clés et la migration de données restent à faire.
- Le blueprint cible le service Render Frankfurt existant `aurion`, le configure pour un plan payant et ne crée pas un troisième service. Il ne bascule pas le domaine et ne désactive pas l’instance Oregon.
- Migration `072` aligne les montants de plans sur 14,00 €/151,20 € avec un taux TVA configuré à 0 %. Elle ne doit être appliquée à la production qu’après confirmation du statut TVA et des prix contractuels.

## Éléments qui manquent pour une publication définitive

1. Justificatif RNE/Sirene et validation de l’adresse professionnelle; qualification TVA exacte et mention de facture.
2. Domaine Aurion et domaine d’expédition; identité et adresse de l’hébergeur contractuel reprises du compte Render; région réelle de Neon; entité OVH, région, DPA et bucket; DPA Stripe/Brevo et sous-traitants de chaque service.
3. Durées de conservation et purge vérifiées pour comptes, pièces, journaux, commandes, demandes consommateurs, exports et sauvegardes; processus d’export/restauration/suppression.
4. Vérification du prix affiché, frais, conditions B2C, commande, preuve sur support durable, remboursement et absence de reconduction automatique.
5. Adhésion et compétence sectorielle du médiateur; coordonnées officielles dans l’application et les documents commerciaux.
6. Courriels SMTP effectivement reçus; webhooks Stripe; migration base/fichiers, sauvegarde et essai de restauration; procédure d’incident.
7. Ouvrir le compte Tiime Free pour l’entreprise et valider son usage. Pour les utilisateurs d’Aurion, décider et construire un connecteur à une PA compatible; aucun flux de facture électronique ni e-reporting n’est fourni par le code actuel.
8. Revue juridique française, revue fiscale et contrôle des flux de données/transferts avant publication.

## Repères réglementaires vérifiés

- La fonction de rétractation en ligne doit être gratuite, visible et disponible pendant la période applicable, avec la mention « renoncer au contrat ici » ou équivalente et un accusé durable contenant notamment le contenu, la date et l’heure. Le code prépare le parcours, mais le SMTP et les essais de réception doivent être achevés.
- Les entreprises de taille micro doivent pouvoir recevoir des factures électroniques depuis le 1er septembre 2026; l’émission B2B et l’e-reporting sont progressifs jusqu’à l’échéance micro-entreprise de septembre 2027, selon l’assujettissement et le type d’opérations. Une PA est un opérateur immatriculé par l’État; Aurion 15.3.19 n’en est pas une.
- Un professionnel qui traite des consommateurs doit choisir un médiateur référencé compétent, adhérer au dispositif et publier ses coordonnées.
- L’accessibilité des services numériques peut être dispensée pour certaines microentreprises sous conditions précises. La qualification de l’entreprise doit être documentée; l’amélioration de l’accessibilité reste recommandée.

## Sources officielles

- [Service Public — commerce en ligne et rétractation](https://entreprendre.service-public.gouv.fr/vosdroits/F23455)
- [Service Public — facture électronique](https://entreprendre.service-public.gouv.fr/vosdroits/F39785)
- [DGFiP — liste des plateformes agréées](https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees) et [Tiime — offre gratuite et PA](https://www.tiime.fr/faq-facturation-electronique)
- [Service Public — médiation de la consommation](https://entreprendre.service-public.gouv.fr/vosdroits/F33338)
- [Loi n° 2023-171, article 16 — accessibilité et dispense microentreprise](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047281777)
- [CNIL — transferts de données hors UE](https://www.cnil.fr/fr/les-outils-de-la-conformite/transferer-des-donnees-hors-de-lue)
