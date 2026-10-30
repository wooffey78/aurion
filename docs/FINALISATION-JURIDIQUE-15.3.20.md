# Préparation juridique et commerciale — Aurion 15.3.20

**État : dossier de travail, non validé juridiquement, à ne pas publier et à ne pas utiliser pour ouvrir les ventes.** Ce document décrit les points à finaliser pour le produit Aurion 15.3.20 et ne constitue pas un avis juridique.

## 1. Périmètre du service

Aurion 15.3.20 s'adresse aux professionnels disposant déjà d'une entreprise ou activité existante. Le premier parcours sert à configurer leur espace Aurion, renseigner la fiche de l'entreprise, vérifier SIRET/SIREN et choisir les modules métier.

Les fonctionnalités suivantes ne font plus partie du produit :
- création ou préparation de création d'entreprise ;
- suivi des formalités de création ;
- studio de création d'identité visuelle, génération de logos et bundle de marque.

La recherche publique par nom demeure disponible dans un écran indépendant du tableau de bord. Les données de registre ne sont jamais appliquées silencieusement : l'utilisateur choisit un résultat, vérifie les champs proposés et confirme le complément. Les valeurs saisies manuellement gardent la priorité.

Les données historiques des anciennes fonctionnalités ne sont pas supprimées par cette version. Les routes et interfaces correspondantes sont retirées, mais l'existence de données résiduelles en base ou en stockage doit être prise en compte dans le registre des traitements, les durées de conservation et les procédures d'export/effacement.

## 2. Documents actuels

Les documents ci-dessous sont alignés sur le périmètre 15.3.20, mais restent des brouillons :
- CGU/CGV ;
- politique de confidentialité et annexe de sous-traitance ;
- mentions légales ;
- politique cookies ;
- note d'accessibilité.

Leur intégration dans le dépôt ou leur chargement dans la base ne vaut ni validation juridique, ni publication, ni approbation de l'éditeur. Le verrou de publication ne doit pas être activé avant la vérification des éléments factuels et contractuels.

## 3. Vérifications qui restent nécessaires

### Éditeur et facturation
- Vérifier l'identité juridique, l'immatriculation, l'adresse professionnelle, le régime TVA et les mentions exactes de facture à partir de justificatifs récents.
- Vérifier les tarifs dans Stripe, les taxes, le libellé TTC/HT, les périodes achetées, l'absence ou la présence de renouvellement, les frais, les remboursements et les factures émises.
- Vérifier le parcours de commande sur support durable et l'acceptation des versions exactes des conditions.

### B2B et B2C
- Confirmer la clientèle réellement visée et les parcours de commande correspondants.
- Si les consommateurs sont acceptés, vérifier le droit de rétractation, la fonctionnalité en ligne, l'accusé de réception durable, le remboursement et le médiateur de la consommation.
- Confirmer l'adhésion à un médiateur compétent pour l'activité SaaS et publier ses coordonnées officielles avant toute vente B2C.
- Ne pas déclarer le service conforme à la réforme de facture électronique : le code actuel ne transmet pas les factures ni l'e-reporting à une Plateforme Agréée.

### RGPD et fournisseurs
- Établir les rôles de responsable/sous-traitant selon les traitements réels.
- Signer et vérifier les DPA et annexes de sous-traitance de Render, Neon, OVHcloud, Brevo, Stripe et tout fournisseur effectivement activé.
- Documenter les sous-traitants ultérieurs, régions d'hébergement, accès de support, transferts hors EEE et mécanismes juridiques applicables.
- Établir le registre des traitements, bases légales, notices, destinataires, droits des personnes et procédures de violation de données.
- Définir des durées concrètes par catégorie (comptes, données métier, pièces, journaux, sauvegardes, paiements, demandes de rétractation) et mettre en place les purges correspondantes.
- Tester l'export, la fermeture du compte, l'effacement et la restauration des sauvegardes.

### Accessibilité
- Les changements ciblés de 15.3.20 (focus, navigation, contrastes de boutons, cibles tactiles, annonces) ne constituent pas un audit RGAA complet.
- Réaliser une recette clavier/lecteur d'écran/zoom/mobile et un audit RGAA ou documenter avec preuve si une dispense légale est applicable.
- Ne publier aucun taux ou statut de conformité sans résultat d'audit et périmètre daté.

## 4. Infrastructure commerciale non validée

Au contrôle Render du 30 octobre 2026 en soirée :
- `aurion-web` est en Oregon, plan Free ; dernier déploiement live relevé 15.3.18.
- `aurion` est à Frankfurt, plan Free ; dernier déploiement live relevé 15.3.18.
- La tentative manuelle 15.3.19 sur Oregon s'est terminée en échec.
- Les modifications 15.3.20 sont sur une branche non fusionnée et ne sont pas déployées.

La cible technique décrite par le blueprint est Frankfurt sur Starter, avec une base PostgreSQL externe et un stockage S3 privé OVH. Cette cible n'est pas encore réalisée. Avant tout trafic commercial, il faut confirmer la base Neon et sa région, configurer les rôles DB, le bucket S3, les secrets persistants, SMTP, Stripe, DNS et OAuth, migrer les fichiers de l'instance source, créer des sauvegardes indépendantes et réussir une restauration base + fichiers.

Aucune migration de production, copie de secret ou bascule DNS n'a été effectuée pour cette version.

## 5. Conditions avant publication

La commercialisation ne doit être ouverte que lorsque :
1. les informations éditeur, fiscales et contractuelles ont été vérifiées ;
2. les textes ont été relus et validés par un professionnel compétent ;
3. les fournisseurs et DPA sont contractés et documentés ;
4. les prix/commandes/paiements et, si applicable, la rétractation B2C sont testés ;
5. les durées de conservation, droits RGPD, export/effacement et restauration fonctionnent ;
6. l'infrastructure Frankfurt, S3 et Neon est active et testée ;
7. la compilation, les tests de régression, les tests navigateur et la recette manuelle ont été passés avec des résultats enregistrés.

Ne pas renseigner un marqueur d'approbation juridique ni ouvrir les inscriptions/paiements pour contourner ces conditions.
