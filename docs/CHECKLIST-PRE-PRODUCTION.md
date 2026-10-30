# Checklist de finalisation — Aurion 15.3.20

Cette checklist décrit le produit recentré sur les **entreprises déjà existantes**. Les cases cochées correspondent à des changements présents dans la branche 15.3.20 ; elles ne valent pas preuve de recette complète en production.

## Produit — périmètre 15.3.20

- [x] Retirer le parcours de création d'entreprise et le suivi des formalités administratives.
- [x] Retirer le studio d'identité visuelle, la génération de logo et le bundle de marque.
- [x] Conserver un accueil guidé de première configuration pour une entreprise déjà existante.
- [x] Demander nom et prénom à la création d'un compte.
- [x] Conserver la détection SIRET/SIREN dans la configuration initiale et les paramètres.
- [x] Déplacer la recherche par nom vers un outil autonome du tableau de bord.
- [x] Conserver la prévisualisation et la confirmation avant import de données.
- [x] Préserver les valeurs saisies manuellement lors de la fusion de données de registre.
- [x] Préserver les adresses d'intervention et le journal de bord général.
- [ ] Recette manuelle de création de compte et première configuration avec une entreprise de test.
- [ ] Recette du parcours de recherche par nom et de l'application des résultats sur des données connues.
- [ ] Recette de l'import clients, fournisseurs, articles, devis et factures sur copie de données.
- [ ] Vérifier que les fonctions métier historiques continuent de fonctionner après suppression des routes/UI non utilisées.
- [ ] Définir la purge ou l'archivage des données historiques provenant des anciennes fonctions, sans les supprimer par migration destructive.

## Qualité d'usage et accessibilité

- [x] Nommer la navigation principale et annoncer la vue active.
- [x] Déplacer le focus vers le titre de la nouvelle vue lors d'un changement de module.
- [x] Donner un retour différent pour agenda synchronisé, invitation iCalendar et notification client échouée.
- [x] Ne pas confirmer une création Google Agenda sans identifiant d'événement fournisseur.
- [x] Annoncer les erreurs du formulaire de messagerie et exposer l'état du bouton d'affichage du mot de passe.
- [x] Contrôler les couleurs des boutons primaires ajoutés (contraste texte/fond supérieur au seuil WCAG AA pour texte normal).
- [x] Prévoir des cibles tactiles de 44 px pour les boutons de navigation et actions compactes.
- [ ] Recette navigateur réelle : Chrome, Edge, Firefox et Safari selon plateformes supportées.
- [ ] Recette mobile portrait/paysage et clavier virtuel sur Android et iOS.
- [ ] Audit clavier complet, lecteur d'écran, zoom 200 %, contrastes de toutes les vues et messages d'erreur.
- [ ] Audit RGAA/WCAG indépendant ou justification documentée de toute dispense légale applicable.

## Messagerie et agenda

- [x] Clarifier le comportement Google Agenda direct versus invitation iCalendar envoyée par e-mail.
- [x] Distinguer échec d'e-mail au client et réussite de la synchronisation de l'agenda.
- [ ] Tester réellement la connexion SMTP, l'envoi, les pièces jointes, les accusés et les erreurs de fournisseur.
- [ ] Tester Google OAuth en environnement de recette : scopes, callback, refresh token, création, mise à jour et annulation.
- [ ] Vérifier qu'une déconnexion/expiration OAuth n'entraîne aucune fausse confirmation.
- [ ] Tester invitations et annulations iCalendar dans Google, Outlook et Apple Calendar.
- [ ] Vérifier les politiques SPF, DKIM, DMARC et la délivrabilité du domaine expéditeur.

## Sécurité, données et infrastructure

- [ ] Choisir et confirmer la base PostgreSQL de production dédiée à Aurion.
- [ ] Confirmer la région Neon, les rôles migrateur/runtime et les accès réseau.
- [ ] Configurer le service Render Frankfurt sur un plan payant et vérifier la configuration exacte.
- [ ] Provisionner le bucket OVH Object Storage privé, les clés minimales et le chiffrement.
- [ ] Migrer les fichiers privés de l'instance source vers S3 et vérifier nombre, taille et ouverture de chaque objet.
- [ ] Mettre en place une sauvegarde chiffrée indépendante pour PostgreSQL et les fichiers.
- [ ] Réaliser et documenter une restauration complète base + fichiers.
- [ ] Vérifier l'isolation multi-tenant, les autorisations, sessions, secrets, rate limits, CSRF et CSP.
- [ ] Mettre en place journalisation, alertes, procédure incident et rotation des secrets.
- [ ] Effectuer un test de sécurité externe avant ouverture à des clients.

## Juridique et commercial

- [ ] Vérifier l'identité de l'éditeur, son immatriculation, son adresse et les mentions TVA avec justificatifs.
- [ ] Faire relire CGU/CGV et politique de confidentialité par un professionnel compétent.
- [ ] Signer et vérifier les DPA, sous-traitants, régions et mécanismes de transfert de chaque fournisseur.
- [ ] Définir et implémenter les durées de conservation, export, effacement et purge des sauvegardes.
- [ ] Vérifier les prix, taxes, périodes, renouvellements, remboursements et récapitulatif de commande Stripe.
- [ ] Adhérer à un médiateur compétent et publier ses coordonnées officielles si B2C est ouvert.
- [ ] Tester la rétractation et l'accusé durable de bout en bout avant toute vente B2C.
- [ ] Vérifier et documenter le statut de la facturation électronique ; Aurion ne transmet pas actuellement les factures à une PA.
- [ ] Garder l'inscription/paiement verrouillés tant que les documents contractuels et les critères de publication ne sont pas validés.
- [ ] Préparer support, procédure de désabonnement, restitution des données et assistance client.

## État technique au 30 octobre 2026

- Branche de travail : `aurion/company-existing-only-15.3.20`.
- PR : #28, non fusionné.
- Le service Render Oregon reste sur le dernier déploiement live 15.3.18 ; la tentative manuelle 15.3.19 a échoué.
- Le service Frankfurt reste sur le dernier déploiement live 15.3.18, plan Free, sans configuration de production validée.
- Les exécutions GitHub Actions observées se terminent avant toute étape de job ; aucun build, typecheck ou test ne peut être déclaré réussi sur la base de ces exécutions.
- Aucun déploiement, aucune migration distante et aucune modification de variables Render n'ont été effectués pour la branche 15.3.20.
