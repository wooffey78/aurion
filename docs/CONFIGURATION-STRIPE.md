# Configuration Stripe — runbook éditeur (15.5.0)

Procédure d'activation de la facturation d'abonnement. **Opérations console = éditeur** ; les garde-fous applicatifs sont livrés et testés. Aucun identifiant de prix n'est codé en dur dans le code : la cohérence « code ↔ Stripe » passe par les variables d'environnement ci-dessous.

## 1. Créer produit et prix (console Stripe, mode test d'abord)

1. Créer le produit « Aurion — abonnement entreprise » avec le prix récurrent mensuel **39 €** (docs/TARIFS-ABONNEMENT.md = source de vérité du prix).
2. Noter l'identifiant du prix (`price_…`).
3. Créer le prix annuel SEULEMENT si l'offre annuelle doit être vendue (sinon laisser désactivé — l'application propose `planCode: 'yearly'` mais n'active l'année qu'avec un prix configuré).

## 2. Variables d'environnement (backend/.env, jamais dans Git)

- `STRIPE_SECRET_KEY` (clé test d'abord, puis production) — déjà consommée par `services/stripe-billing.ts` (`billingConfigured()`).
- `STRIPE_WEBHOOK_SECRET` — secret du point de terminaison webhook créé à l'étape 3.
- Identifiant de prix : brancher la variable retenue lors de l'audit d'activation (`AURION_STRIPE_PRICE_ID` si le flux de checkout en exige une) dans backend/.env.example, config.ts et le groupe `aurion-commun` de render.yaml. Sans elle et avec le billing activé, le diagnostic de configuration doit refuser de démarrer avec un message explicite (gabarit render-backend-config-diagnostics).

## 3. Point de terminaison webhook

- URL : `https://<domaine-canonical>/stripe/webhook` (ou l'endpoint réellement exposé par `routes/account.ts` — vérifier l'URL exacte lors de l'activation : `grep -n "stripe" backend/src/routes/account.ts`).
- Événements souscrits : ceux consommés par `verifyStripeWebhookSignature` + `activateStripeCheckout` (checkout.session.completed et cycle de vie de l'abonnement) — aligner la liste console avec le code.
- Test : envoyer un événement test depuis la console et vérifier la signature (le test d'intégration `stripe-billing.integration.test.mjs` rejoue ce chemin avec une fixture PostgreSQL).

## 4. Parcours à recetter en mode test (checklist E1)

1. Créer un compte → statut `trialing`, `trial_ends_at` à +60 jours (essai réel du code, docs/TARIFS-ABONNEMENT.md).
2. Déclencher le checkout depuis Compte → payer avec la carte de test Stripe → retour `#/dashboard?billing=success` → toast « Paiement confirmé » → statut `active` + `current_period_end`.
3. Facture d'abonnement générée (services/subscription-invoice.ts) : numérotation et TVA cohérentes (`BILLING_VAT_RATE_BPS`).
4. Résiliation → `expired` à la fin de période → lecture seule (`READ_ONLY_MODE`) → conservation 60 jours (`DATA_RETENTION_EXPIRED`) → export complet toujours possible.
5. Simuler la fin d'essai sans paiement → même trajectoire lecture seule/conservation (scénarios déjà testés — rejouer).

## 5. Passage en production

Clés réelles + webhook production + prix réel ; vérifier `/health` après déploiement ; la recette de restauration (RUNBOOK §3) doit être FAITE avant tout encaissement réel (règle GO-LIVE).

## Journaux

Chaque étape réalisée est tracée ici (date, résultat, capture/lien) — statuts honnêtes, aucune case cochée sans preuve.
