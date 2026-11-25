# Checklist de finalisation — Aurion 15.4.30

Cette checklist décrit le produit recentré sur les **entreprises déjà existantes**, à l'issue des livraisons 15.4.22 à 15.4.30 (fiabilisation métier, hors connexion, design et juridique — dernière consolidation : `docs/AUDIT-FINAL-15.4.30.md`). Les cases cochées correspondent à des changements présents dans la version 15.4.30 ; elles ne valent pas preuve de recette complète en production. Le provisionnement, les sauvegardes et le test de restauration sont encadrés par `docs/RUNBOOK-PRODUCTION.md`.

## Produit — périmètre courant

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
- [ ] Recette de l'installation Windows autonome réelle : installation neuve (migrations via `aurion_admin`, application sur `aurion_runtime`), relance, mise à jour d'une installation existante, logo, devis/facture PDF/DOCX/ODT.
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
- [ ] Confirmer la région européenne (Francfort), les rôles migrateur/runtime et les accès réseau (`docs/POSTGRES-ROLES.md`, `docs/RUNBOOK-PRODUCTION.md` §1).
- [ ] **Décision éditeur : Render reste GRATUIT et TEMPORAIRE** (développement/démonstration uniquement, `render.yaml` = `plan: free`) — aucune formule Render payante ne doit être souscrite. La production cible est OVHcloud (backend + PostgreSQL + Object Storage région `de`), à provisionner selon `docs/RUNBOOK-PRODUCTION.md` §1 et `docs/INFRA-OVH-COUTS.md` ; aucune donnée client réelle ne doit rester sur Render après la bascule. Supprimer l'instance historique Oregon après bascule DNS et fenêtre de retour.
- [ ] Provisionner le bucket OVH Object Storage privé, les clés minimales et le chiffrement.
- [ ] Migrer les fichiers privés de l'instance source vers S3 et vérifier nombre, taille et ouverture de chaque objet.
- [ ] Mettre en place des sauvegardes indépendantes chiffrées pour PostgreSQL et les fichiers (`docs/RUNBOOK-PRODUCTION.md` §2 ; exécutable livré : `npm run db:backup`), hors de la base de production.
- [ ] Réaliser et documenter une restauration complète base + fichiers (`docs/RUNBOOK-PRODUCTION.md` §3 ; exécutable livré : `npm run db:restore:drill` sur base jetable, refus automatique de toute cible de production).
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

## État technique au 14 novembre 2026

- Version courante : **15.4.30** (fiabilisation métier/design/juridique livrée le 14 novembre 2026 : 85 migrations ×2 idempotentes sur PostgreSQL réel, `npm run check` exit 0 — 79/79 fumée + parcours hors connexion, `npm test` 466/466 ; résultats rejoués dans `docs/AUDIT-FINAL-15.4.30.md` §1).
- Le blueprint `render.yaml` ne déclare plus que le service `aurion` (Francfort) ; l'instance historique `aurion-web` (Oregon) est hors blueprint, maintenue comme voie de retour arrière.
- Les textes juridiques docs/ sont en version de publication 5.1 (plus aucun marqueur « dossier de préparation ») ; leur publication effective exige `AURION_LEGAL_PUBLICATION_APPROVAL=5.1`, les variables d'identité complètes (`backend/.env.example`) et la résolution des placeholders restants (coordonnées hébergeur contractuel et médiateur après souscription/adhésion).
- La publication applicative des documents juridiques passe par `ensureLegalDocuments()` : un document contenant encore un placeholder non résolu reste en brouillon (échec fermé).
- Toute exécution GitHub Actions doit fournir ses journaux ; un déploiement de production reste conditionné aux sections ci-dessus.
