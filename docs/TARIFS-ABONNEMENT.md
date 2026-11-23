# Tarifs d'abonnement — grille et règles (15.4.51)

Ce document est la **source de vérité commerciale** ; la configuration Stripe doit le refléter exactement (cohérence vérifiée : une seule source de vérité du prix, voir docs/CONFIGURATION-STRIPE.md).

## Offre unique (par entreprise, tous modules inclus)

| Élément | Valeur | Réalité du code |
|---|---|---|
| Prix mensuel | **39 € TTC / mois / entreprise** | À créer dans Stripe (prix récurrent mensuel) — aucun prix codé en dur dans l'application ; l'identifiant de prix est une variable d'environnement |
| Essai gratuit | **60 jours** | `createInitialSubscription` (services/account.ts) : essai 60 jours + fenêtre de conservation 120 jours, uniquement quand la facturation Stripe est configurée ; sans Stripe (installation locale/auto-hébergée), accès complet sans formule ni échéance (statut `no_billing`) |
| Engagement | Aucun — résiliation en libre-service | `POST /billing/subscription/cancel` (résiliation à la fin de la période) |
| Après expiration | Lecture seule puis conservation 60 jours, export toujours possible | plugins/auth.ts : `READ_ONLY_MODE` puis `DATA_RETENTION_EXPIRED` (60 jours) |
| TVA | Selon configuration (`BILLING_VAT_RATE_BPS`, actuellement 0 — facturation d'abonnement sans TVA à préciser par l'éditeur) | config.ts + render.yaml |
| Inclus | Tous les modules livrés à la version courante : portail client, chantiers et rentabilité, contrats d'entretien, workflows, stock, SAV, comptabilité (FEC), trésorerie, rapports, webhooks, application Windows + PWA | VERSION.txt |

## Décisions éditoriales restantes (rappel honnête)

- Création du produit/prix dans Stripe (console) et renseignement de la variable de configuration — runbook : docs/CONFIGURATION-STRIPE.md.
- Confirmation finale du prix 39 € après le pilote 10 clients (docs/PILOTE-SUIVI.md, critère F5-2 : ≥ 5 clients prêts à souscrire).
- TVA applicable à l'abonnement (bénéfice BIC/BNC de l'éditeur, franchise en base…) — à valider avec l'expert-comptable de l'éditeur.
- Offre annuelle : non vendue tant que non configurée dans Stripe (le code prévoit `planCode: 'monthly' | 'yearly'` ; l'année n'est activée qu'avec un prix annuel réel).
