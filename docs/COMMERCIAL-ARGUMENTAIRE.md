# Argumentaire commercial — Aurion (15.4.51)

Document interne d'aide à la vente (PROMPT E5). Le prix affiché ici est la source de vérité docs/TARIFS-ABONNEMENT.md (39 €/mois TTC, essai 60 jours) — toute divergence entre ce document et la configuration Stripe est un bug à corriger avant toute démonstration.

## Pitch (30 secondes)

« Aurion est le logiciel de gestion des TPE du bâtiment, de l'artisanat et de la réparation : devis, factures, clients, SAV, comptabilité micro-social et trésorerie dans un seul outil, avec un coffre d'intégrité qui horodate chaque facture émise et un portail où vos clients acceptent leurs devis en ligne. Zéro IA cachée : des règles explicites, des calculs déterministes, et vos données réversibles à tout moment — hébergées en France (UE). »

## Démonstration guidée (10 minutes, jeu de démo `npm --prefix backend run db:demo`)

1. **Devis** (2 min) : créer un devis avec le catalogue métier — le moteur propose les prix appris de l'activité, tout reste modifiable.
2. **Portail client** (2 min) : ouvrir la fiche client → Portail → créer l'accès → montrer la page publique du côté « client » (téléphone) → accepter le devis avec nom et horodatage → revenir côté artisan : l'acceptation est là, datée.
3. **Facture** (2 min) : bouton « Facturer » — échéance, mentions obligatoires vérifiées, facture émise et chaînée dans le coffre (bouton « Intégrité » : verdict daté).
4. **Relance et paiement** (1 min) : relances automatiques avec majoration calculée, lien de paiement.
5. **Comptabilité micro** (2 min) : catégories BIC/BNC, cotisations détectées par forme juridique, export FEC et livre des recettes.
6. **Chantier et rentabilité** (1 min) : dérive devis→coûts réels, garde-fou devis→facture avec justification horodatée.

## Objections / réponses

| Objection | Réponse |
|---|---|
| « J'ai déjà mes habitudes (papier/Excel) » | L'import de données accepte vos clients/fournisseurs/articles avec prévisualisation avant création ; rien n'est créé sans votre validation. |
| « Et si je m'arrête ? » | Réversibilité garantie : export complet de tous vos documents et données, y compris après la fin de l'abonnement (fenêtre de conservation de 60 jours en lecture seule). C'est testé, pas promis. |
| « Mes données sont où ? » | Hébergement UE (Francfort), isolation par entreprise au niveau base (RLS), chiffrement des fichiers privés, chaîne d'intégrité anti-modification des factures émises. Page publique de transparence : /transparence. |
| « C'est de l'IA ? Je ne veux pas de décisions automatiques » | Aucune IA : règles explicites, barèmes datés, propositions toujours validées par vous (expansion des récurrences, occurrences d'entretien, propositions de profils). |
| « Pourquoi 39 € ? » | Tous modules inclus, sans surcoût par utilisateur ni par facture ; essai 60 jours ; résiliation en libre-service et réversibilité totale. |
| « Mon comptant veut un FEC » | Export FEC, livre des recettes, journaux, accès « expert-comptable » en lecture seule. |
| « Le portail, ça complique le client » | Aucun compte pour lui, un simple lien ; révocable en un clic ; l'acceptation horodatée réduit les « je n'avais pas validé ». |

## Grille et cohérence

- Prix : docs/TARIFS-ABONNEMENT.md (39 €/mois, essai 60 jours, sans engagement).
- Contrat pilote (-50 % première année si souscription sous 30 jours) : docs/CONTRAT-PILOTE.md.
- One-pager : à produire hors dépôt par l'éditeur à partir de ce document (non versionné dans le projet).
