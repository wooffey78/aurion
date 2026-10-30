# Audit de commercialisation — Aurion 15.3.18

**État au 30 octobre 2026.** Audit documentaire et vérification de configuration; il ne remplace ni une revue juridique, ni un audit de sécurité/RGAA, ni une recette exhaustive.

## Avancement estimé

**Environ 36 % avant commercialisation (incertitude d’au moins ±10 points).** Cette estimation pondère les fonctions déjà présentes et les travaux restant pour une offre B2B/B2C. Elle ne représente pas un pourcentage du code terminé.

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

## Déploiement et documents

- Aurion 15.3.17 a été vérifié en état `live` sur les deux services Render. La 15.3.16 a échoué au build du service web à cause d’un lockfile tronqué par le transfert; la 15.3.17 a restauré le lockfile complet et les déploiements sont repartis.
- Le commit 15.3.18 (`8c422d598db90e3a67d16183a848c7f32e6dbe62`) est ensuite passé `live` sur les deux services Render.
- La configuration montre que **`aurion-web` en Oregon (États-Unis) est l’application canonique** : ce service exécute le backend Node et répond à `/health/db`. Le service `aurion` situé à Francfort redirige vers la production active. Les appels applicatifs sont donc traités par le service américain.
- Neon est en région AWS `eu-central-1` (UE). Après déploiement 15.3.17, les cinq documents courants en base (mentions légales, CGV, confidentialité, cookies et accessibilité) sont version 2.1 et `is_draft=true`.
- Aurion 15.3.18 prépare la version 2.2 et exige `AURION_LEGAL_PUBLICATION_APPROVAL=2.2`, les champs obligatoires renseignés et l’absence de marqueurs de projet. Après déploiement, la requête Neon confirme les cinq documents 2.2 courants avec `is_draft=true`.
- L’inscription, l’acceptation d’invitation et le paiement sont refusés tant que les documents requis demeurent brouillons; les comptes existants peuvent se connecter.

## Informations d’éditeur reçues

Le 30 octobre 2026, l’éditeur a communiqué : nom « Coulibaly Damien », nom commercial « Easyweb-dev », SIRET `88848569500033`, e-mail `easyfixit.reparation@gmail.com`, marché B2B et B2C, Stripe et une IA distante. Ce sont des informations fournies par l’utilisateur, sans justificatif officiel vérifié. Le SIREN `888485695` est seulement déduit des neuf premiers chiffres du SIRET.

## Blocages avant toute vente

1. Vérifier sur un avis Sirene/RNE l’identité et la forme exactes, l’adresse professionnelle, le téléphone, le nom commercial, le SIRET/SIREN, le registre et la situation TVA. L’adresse de contact fournie doit être confirmée pour chacun de ses rôles (juridique, confidentialité, support et rétractation).
2. Nommer un médiateur de la consommation référencé, adhérer à son dispositif et publier ses coordonnées. Aucun médiateur n’a été choisi.
3. Compléter le parcours consommateur : qualité B2B/B2C, informations précontractuelles, prix TTC, caractéristiques, confirmation sur support durable et information sur les garanties légales des services numériques.
4. Développer et vérifier la rétractation gratuite directement en ligne, l’accusé durable, le traitement des demandes et remboursements. La règle est applicable aux contrats à distance conclus par interface en ligne depuis le 19 juin 2026.
5. Faire vérifier l’offre, les prix, le paiement Stripe, les virements éventuels, les remboursements et l’absence/présence de renouvellement. Le code examiné n’a pas établi de prélèvement automatique récurrent.
6. Faire relire les CGV/CGU, la politique de confidentialité et l’annexe de sous-traitance RGPD. Les textes 2.2 restent des projets et ne doivent pas être présentés comme définitifs.

## Risques opérationnels et techniques

- **Transfert vers les États-Unis :** le serveur applicatif canonique est en Oregon. Les requêtes qui lui sont adressées sont traitées sur cette région; les données métier peuvent transiter par cet hôte avant stockage Neon en UE. Les garanties contractuelles, l’entité Render et les mécanismes de transfert doivent être documentés. Déplacer le service applicatif dans l’UE est à évaluer.
- **Fichiers et restauration :** Render gratuit n’a pas de disque persistant; les fichiers envoyés peuvent disparaître au redémarrage ou au déploiement. Définir stockage objet privé, rétention, sauvegarde et test de restauration.
- **Sous-traitants inconnus :** Stripe et IA distante sont déclarés; fournisseur/modèle d’IA, SMTP/Brevo, Google, support, stockage et suivi d’erreurs doivent être confirmés avec entités, fonctions, régions, rétentions et DPA.
- **Conservation et effacement :** les durées, la purge coordonnées PostgreSQL/fichiers/sauvegardes, le délai de suppression et l’exercice de restauration ne sont pas documentés ou prouvés. Le mode lecture seule ne supprime pas les données.
- **E-mails et factures :** tester la livraison des messages; Render gratuit bloque les ports SMTP 25, 465 et 587. Aucune transmission via une plateforme agréée de facturation électronique n’a été établie.
- **Contrôles indépendants :** aucun audit de sécurité, rapport RGAA complet ni test de restauration n’a été identifié. Ne publier aucun taux de conformité avant évaluation réelle.

## Conclusion

**Ne pas ouvrir les ventes B2C et ne pas annoncer Aurion comme prêt à l’usage professionnel critique en l’état.** Le verrou d’inscription et de paiement préserve cette situation tant que les documents ne sont pas validés. Un pilote B2B limité exige au minimum les preuves d’identité, les conditions et sous-traitants exacts, un stockage de fichiers durable et des sauvegardes restaurables.

## Sources officielles

- [Mentions obligatoires d’un site professionnel — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F37351)
- [Vente à distance et rétractation en ligne — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F23455)
- [Obligations de médiation — Ministère de l’Économie](https://www.economie.gouv.fr/mediation-conso/vous-etes-un-professionnel/vos-principales-obligations-0)
- [Médiateurs référencés — Ministère de l’Économie](https://www.economie.gouv.fr/mediation-conso/vous-etes-un-professionnel/choisir-un-mediateur-de-la-consommation/mediateurs-references)
- [Sous-traitance et article 28 du RGPD — CNIL](https://www.cnil.fr/fr/securite-gerer-la-sous-traitance)
- [Déclaration d’accessibilité — RGAA](https://accessibilite.numerique.gouv.fr/obligations/declaration-accessibilite/)
