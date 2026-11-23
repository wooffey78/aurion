# PROMPT GLOBAL — AURION 15.4.50

> À transmettre tel quel à l'agent (ou à l'équipe) chargé de la suite d'AURION.
> Il reprend la globalité du projet, les directions possibles, les améliorations possibles
> (existant + ce qui a été négligé ou oublié) et la liste technique restante avant
> commercialisation. Méthode du dépôt obligatoire : audit factuel préalable, migrations
> additives, tests avant/après exécutés, statuts honnêtes, traçabilité, ZIP complet par livraison.

---

Tu interviens sur **AURION 15.4.50**, gestion d'affaires pour TPE du bâtiment, de l'artisanat et
des services à domicile en France (entreprises déjà existantes uniquement). Aucune IA, aucun LLM,
aucune prédiction dans le produit : règles explicites, calculs déterministes, événements, seuils,
workflows et validation humaine. La branche `main` et les données de production restent figées
sans autorisation expresse.

## 1. État du projet (résumé fidèle)

- **Base** : backend Fastify + PostgreSQL (118 migrations additives, RLS tenant, réplication
  inter-instances 086), Auth0 + WebAuthn, stockage S3, Render, PWA/service worker, Capacitor
  Android réel, CI GitHub. 30 profils métiers versionnés (2026.11), moteur de calcul unique
  avec miroir navigateur à parité testée, outbox événementielle transactionnelle (109).
- **15.4.50 (livraison courante)** a ajouté, sans retirer ni modifier l'existant :
  chantiers et rentabilité réelle avec dérive devis→coûts (B1) ; garde-fou de dérive
  devis→facture avec justification exigée (B6) ; contrats d'entretien récurrents avec
  occurrences déterministes proposées (B2) ; portail client invités + acceptation de devis
  horodatée transactionnelle (A1/A2) ; 4 nouveaux déclencheurs de workflows + simulation à
  blanc sur fenêtre historique (A5) ; emplacements de stock (A6) ; expansion des récurrences
  d'agenda en lecture seule (A7) ; chaîne d'intégrité documentaire append-only (B5) ;
  fiabilité de paiement par client (B3) ; bibliothèque de prestations par profil (B3-bis) ;
  alertes de prix matériaux depuis les achats réels (B4) ; rapport mensuel du dirigeant (B7) ;
  webhooks sortants signés HMAC (B8) ; **modularité par métier** (fonctionnalités proposées
  uniquement lorsque le profil les rend pertinentes, masquage transparent) ; graphiques SVG
  au choix de l'utilisateur (barres, courbe, bougies, camembert — types mensongers refusés).
- **Vérification** : 721 tests — 650 pass, 8 échecs préexistants environnementaux (PostgreSQL
  réel non provisionné + 2 helpers absents de l'archive), 63 skip ; `tsc` + build 0 erreur.
  Détail : `CHANGELOG-15.4.50.md` et `docs/TRAÇABILITE-15.4.50.md` dans le ZIP.

## 2. Directions possibles (à arbitrer avec le maître d'ouvrage)

1. **Mise sur le marché rapide (recommandée)** : finaliser les recettes de production (A10),
   brancher les 3 interfaces restantes (voir §4), audit ciblé des blocs 10-18, puis ouverture
   à un pilote de 5-10 entreprises. Le différenciateur à message : « vos pièces sont
   prouvables » (chaîne d'intégrité), « la marge réelle par chantier », « le portail client ».
2. **Profondeur métier** : pousser la modularité (détection → propositions → bibliothèque
   confirmée par métier) et les contrats d'entretien comme socle de revenus récurrents ;
   faire du portail client un vrai espace (paiement du devis/facture via les liens de paiement
   existants, suivi d'intervention, documents partagés).
3. **Industrialisation** : audit complet des blocs 10-18 selon le prompt 19 §2, connecter une
   Plateforme Agréée en sandbox (bloc 17), décision iOS assumée (PWA vs natif), SQLCipher
   Android, puis scale (multi-instances déjà préparé par l'outbox).

## 3. Améliorations possibles de ce qui existe (profondeur, pas nouveauté)

- **Chantiers** : rattachement simplifié depuis les écrans devis/agenda/SAV (bouton
  « rattacher à un chantier ») ; taux horaire par activité persisté (au lieu du paramètre
  d'appel) ; export PDF du rapport de rentabilité du chantier.
- **Portail** : partage de FACTURES (pas seulement devis) avec statut de paiement ; lien de
  paiement intégré à la vue portail (les `payment_links` existent déjà côté serveur) ;
  e-mail d'invitation automatisé via la messagerie configurée ; page publique d'accès
  (route frontend dédiée `#/portal/:token` au lieu d'un lien API brut).
- **Contrats d'entretien** : écran dédié (liste, occurrences à valider en un clic) ;
  génération du devis d'entretien à l'échéance depuis un modèle ; rappel automatique N jours
  avant chaque occurrence via le scheduler existant.
- **Workflows** : déclencheurs `chantier_en_dérive` et `stock_location_faible` ; actions
  `send_email` (avec la signature e-mail existante) ; journal d'exécution filtrable.
- **Graphiques** : persistance du type préféré par widget et par utilisateur ;
  export PNG des graphiques ; filtre de période sur l'analyse visuelle de l'accueil.
- **Bibliothèque de prestations** : injection d'une ligne en un clic dans le brouillon de
  devis (le `quoteDraft` existe) ; gestion des unités (h, m², ml, forfait).
- **Prix matériaux** : comparaison entre fournisseurs pour un même article ; proposition de
  commande fournisseur pré-remplie pour les articles en hausse (reorderProposals existe).
- **Fiabilité de paiement** : encart dans la fiche client et à la création du devis ; cadence
  de relance adaptée au score (relances déjà idempotentes).
- **Rapport mensuel** : envoi e-mail planifié (1er du mois) ; comparaison avec les mois
  précédents dans le rapport lui-même.

## 4. Ce qui a été négligé ou oublié (à traiter, par ordre de risque)

1. **Brancher les interfaces restantes** (services testés, écrans manquants) : encart
   fiabilité de paiement dans la fiche client ; appel du contrôle de dérive depuis l'écran de
   facturation avant émission ; chaînage automatique `recordDocumentIntegrity` à l'émission
   réelle des devis acceptés / factures envoyées ; page frontend du portail client.
2. **Recettes de production (A10)** : les cases non cochées de `docs/CHECKLIST-PRE-PRODUCTION.md`
   (installation Windows autonome, imports sur copie, première configuration) + **test de
   restauration** tracé des sauvegardes (`docs/RUNBOOK-PRODUCTION.md`) — indispensable avant
   de vendre.
3. **Recette PostgreSQL réelle de la 15.4.50** : rejouer sur base provisionnée les parcours
   multi-tenant (migrations 110-118, concurrence d'acceptation de devis par deux liens,
   idempotence des webhooks) — modèle : `tests/v49-blocks-01-09.integration.test.mjs`.
4. **Mentions obligatoires bloquantes (A4)** : `mentions.ts` existe ; transformer en
   checklist bloquante avant émission (décennale, pénalités + indemnité 40 €, rétractation B2C).
5. **Écran « fin de chantier » mobile (B12)** : temps + pièces + photos + résumé client en un
   flux Android (S3 et sessions de temps existent).
6. **Audit blocs 10-18 (A11)** puis **PDP en sandbox (A12)** : architecture d'adaptateurs
   `pa/` prête, connexion réelle conditionnée à un contrat et une autorisation explicite.
7. **iOS** : décision assumée et documentée (aucun projet natif n'existe) — PWA installable
   d'abord, natif seulement si le marché le justifie ; ne jamais annoncer une app publiée.
8. **Sécurité locale Android** : SQLCipher + Keystore (bloc 6-bis des docs, dépend de l'app).
9. **Conformité** : DPA RGPD avec les sous-traitants listés par `transparency.ts`, mise à
   jour des CGU pour couvrir le portail client et les webhooks, validation fiscale des
   paramètres par un professionnel (les référentiels sont sourcés, la validation humaine reste
   à tracer).

## 5. Liste technique restante avant commercialisation (checklist)

- [ ] Recettes de production exécutées et tracées (checklist pré-production, toutes cases).
- [ ] Test de restauration réel des sauvegardes chiffrées, procédure horodatée.
- [ ] Recette PostgreSQL de la 15.4.50 (migrations 110-118, multi-tenant, concurrence).
- [ ] Branchement des 4 interfaces du §4.1 (fiabilité client, dérive à l'émission, chaîne à
      l'émission, page portail).
- [ ] Audit blocs 10-18 selon le prompt 19 §2 (statuts vérifiée/partielle/défectueuse/absente/bloquée).
- [ ] Mentions obligatoires bloquantes avant émission (A4) testées.
- [ ] Portail : tests E2E publics (jeton expiré, révoqué, balayé, CLIENT_MISMATCH, double acceptation).
- [ ] Webhooks : supervision des lettres mortes + rejeu tracé, documentation du format de
      signature pour les intégrateurs tiers.
- [ ] E-invoicing : contrat PA, sandbox, homologation, aucun credential dans le dépôt.
- [ ] Décision iOS documentée ; build Android signé et testé sur appareil réel.
- [ ] DPA RGPD + CGU mises à jour (portail, webhooks, chaîne d'intégrité) publiées via le
      mécanisme `legal-publication-version` existant.
- [ ] Supervision : alertes erreurs 5xx, taille du pool, outbox et webhooks en lettre morte.
- [ ] Performance : charge sur /agenda, /chantiers (agrégats), /reports/monthly avec 10 ans de données.
- [ ] Pen-test externe sur l'authentification, les routes publiques du portail et le stockage.
- [ ] Tarification et essai : stripe-billing existe — vérifier la cohérence essai/abonnement
      avec les fonctionnalités livrées (aucune fonctionnalité vendue mais indisponible).

## 6. Règles d'exécution (inchangées)

Audit factuel avant tout code (statut « fonctionnelle vérifiée / partielle / défectueuse /
absente / bloquée » — un bouton ne prouve rien). Blocs atomiques, migrations additives
(jamais de modification d'une migration appliquée), tests avant/après montrés, statuts
honnêtes dans l'interface, charte graphique inchangée, aucune IA, aucun push/déploiement/coût
externe/secret sans autorisation explicite. Livrables de chaque itération : audit, fichiers
modifiés, tests exécutés, limites réelles, registre mis à jour, ZIP complet vérifié après
extraction. Critère de réussite inchangé (prompt 19 §17) : un système unique, cohérent et
déterministe, dont aucune fonctionnalité validée n'a régressé.
