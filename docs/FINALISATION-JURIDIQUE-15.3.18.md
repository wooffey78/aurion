# Finalisation juridique — Aurion 15.3.18

Les documents 2.2 sont intégrés dans `docs/` et reproduits dans `legal/`. Ils ne sont pas définitifs ni validés juridiquement. Le marché B2B/B2C est confirmé par l’éditeur. L’inscription et la souscription payante restent bloquées tant que les documents nécessaires ne sont pas publiés.

## Informations communiquées par l’éditeur

- Nom fourni : « Coulibaly Damien »; nom commercial déclaré : « Easyweb-dev ».
- SIRET fourni : `88848569500033`. Le SIREN `888485695` est déduit des neuf premiers chiffres. Aucune pièce Sirene/RNE n’a été obtenue pour vérifier l’identité, l’établissement ou le nom commercial.
- E-mail communiqué : `easyfixit.reparation@gmail.com`; son usage comme contact juridique, vie privée, assistance et rétractation reste à confirmer.
- Activité envisagée : B2B et B2C.
- Prestataires déclarés : Stripe et fournisseur d’IA distante non identifié. Les autres fournisseurs restent à confirmer.

## Vérifications d’identité indispensables

Obtenir un avis de situation Sirene ou justificatif RNE récent puis remplir à partir de celui-ci : identité légale exacte (si entrepreneur individuel, nom/prénom et mention EI; si société, dénomination, forme et capital), adresse de domiciliation/siège, SIREN/SIRET, inscription RNE/RCS applicable, statut et numéro ou motif de non-applicabilité de TVA. Confirmer le nom commercial et le directeur de publication. Confirmer adresse postale, téléphone et rôles de l’adresse e-mail de contact.

## Vente aux consommateurs

- Choisir un médiateur référencé et compétent, contractualiser/adhérer, puis publier nom, coordonnées et site dans les CGV et sur le service.
- Ajouter les informations précontractuelles, la qualité consommateur/professionnel, les prix TTC, la confirmation sur support durable, les garanties légales de conformité des services numériques et le parcours de réclamation.
- Développer la rétractation directe et gratuite depuis l’interface, son accusé de réception sur support durable et le traitement/remboursement. Service Public Entreprendre indique cette obligation pour les contrats à distance conclus en ligne à compter du 19 juin 2026.
- Vérifier la résiliation en ligne si l’offre devient un abonnement au sens des règles applicables; le code audité réalisait des paiements ponctuels sans renouvellement automatique constaté.
- Faire valider les conditions par un juriste français. La commercialisation B2C reste fermée tant que les points précédents et la revue ne sont pas terminés.

## Hébergement et données personnelles vérifiés

- Render : l’application canonique `aurion-web` fonctionne dans l’Oregon (États-Unis), exécute le backend Node et répond au contrôle `/health/db`. Le service `aurion` de Francfort redirige vers cette production; il n’héberge pas le backend actif observé.
- Neon : PostgreSQL en région AWS `eu-central-1` (UE). Après le déploiement 15.3.17, les cinq documents courants 2.1 étaient en brouillon. Le planning de snapshots consulté sur la branche de production était vide.
- Render est sur un plan gratuit et le disque applicatif n’est pas durable. Les pièces jointes peuvent être perdues lors d’un arrêt, redémarrage ou redéploiement.
- Le traitement applicatif a lieu dans une région américaine alors que la base est dans l’UE. L’entité contractante, le DPA, les clauses et mécanismes de transfert, l’évaluation des flux et les garanties doivent être vérifiés. Une migration de l’application en région UE est à évaluer avant usage de données réelles.

## Fournisseurs, IA, conservation et mesures

Identifier l’entité contractante, les sous-traitants, leurs finalités, données reçues, régions, durées, DPA, transferts et garanties pour Render, Neon, Stripe, l’IA distante, SMTP/Brevo, Google/OAuth, calendriers, messagerie, stockage, suivi d’erreurs et support. Confirmer les modèles IA et si les contenus sont conservés ou utilisés pour entraîner les modèles.

Définir des durées justifiées par catégorie et implémenter l’effacement des données dans PostgreSQL, les fichiers et sauvegardes. Configurer un stockage objet privé durable, les sauvegardes et la rétention; tester une restauration complète. Vérifier le fonctionnement des e-mails transactionnels. Réaliser les audits RGAA et sécurité nécessaires, avec rapports réels.

## Garde-fou technique de publication

La version 15.3.18 prépare les documents juridiques en version 2.2. `AURION_LEGAL_PUBLICATION_APPROVAL` doit valoir exactement `2.2` pour permettre de publier un texte; les champs d’environnement requis doivent tous être fournis et les marqueurs de brouillon/complétion supprimés. Cette valeur ne doit pas être ajoutée avant la complétion factuelle et la revue juridique. Après déploiement, confirmer dans Neon que les documents 2.2 sont courants et restent `is_draft=true`.

## Sources officielles

- [Avis de situation Sirene — Insee](https://avis-situation-sirene.insee.fr/)
- [Annuaire des entreprises](https://annuaire-entreprises.data.gouv.fr/)
- [Mentions légales des sites — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F37351)
- [Vente à distance et rétractation en ligne — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F23455)
- [Médiation de la consommation — obligations](https://www.economie.gouv.fr/mediation-conso/vous-etes-un-professionnel/vos-principales-obligations-0)
- [Sous-traitance RGPD — CNIL](https://www.cnil.fr/fr/securite-gerer-la-sous-traitance)
