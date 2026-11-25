# Tarifs d'abonnement — grille et règles (15.5.0)

Ce document est la **source de vérité commerciale** ; la configuration Stripe doit le refléter exactement (cohérence vérifiée : une seule source de vérité du prix, voir docs/CONFIGURATION-STRIPE.md).

## Offre unique (par entreprise, tous modules inclus)

| Élément | Valeur | Réalité du code |
|---|---|---|
| Prix mensuel | **14,00 € TTC / mois / entreprise** | `plans.price_ht_cents = 1400` (migrations 053 puis 072), TVA à 0 % (franchise en base) : le montant TTC facturé est celui affiché avant paiement |
| Prix annuel | **151,20 € TTC / an / entreprise** (-10 % sur 12 mois) | `plans.price_ht_cents = 15120`, même régime de TVA ; utilisable dès que le plan annuel est actif |
| Essai gratuit | **60 jours** | `createInitialSubscription` (services/account.ts) : essai 60 jours + fenêtre de conservation 120 jours, uniquement quand la facturation Stripe est configurée ; sans Stripe (installation locale/auto-hébergée), accès complet sans formule ni échéance (statut `no_billing`) |
| Engagement | Aucun — périodes prépayées, **sans reconduction automatique** | Checkout Stripe en `mode=payment` : chaque mois/année est commandé ponctuellement. `POST /billing/subscription/cancel` reste disponible pour ne plus commander de période suivante ; aucun prélèvement récurrent n'est créé |
| Après expiration | Lecture seule puis conservation 60 jours, export toujours possible | plugins/auth.ts : `READ_ONLY_MODE` puis `DATA_RETENTION_EXPIRED` (60 jours) |
| TVA | Selon configuration (`BILLING_VAT_RATE_BPS`, actuellement 0 — facturation d'abonnement sans TVA à préciser par l'éditeur) | config.ts + render.yaml |
| Inclus | Tous les modules livrés à la version courante : portail client, chantiers et rentabilité, contrats d'entretien, workflows, stock, SAV, comptabilité (FEC), trésorerie, rapports, webhooks, application Windows + PWA | VERSION.txt |

## Décisions éditoriales restantes (rappel honnête)

- Configuration des clés Stripe (console) — runbook : docs/CONFIGURATION-STRIPE.md. Aucun identifiant de prix Stripe n'est utilisé : le montant est envoyé depuis la grille `plans`, ce qui évite une double source de vérité.
- Confirmation finale du prix 14 € après le pilote 10 clients (docs/PILOTE-SUIVI.md, critère F5-2 : ≥ 5 clients prêts à souscrire).
- TVA applicable à l'abonnement (bénéfice BIC/BNC de l'éditeur, franchise en base…) — à valider avec l'expert-comptable de l'éditeur.
- Offre annuelle : déjà prévue par les migrations et les CGU (151,20 € TTC) ; elle reste subordonnée à l'activation du plan `yearly` en base et à la validation éditoriale finale.
