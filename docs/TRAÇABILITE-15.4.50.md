# TRAÇABILITÉ 15.4.50 — exigences → fichiers → tests

Complément de `CHANGELOG-15.4.50.md`. Chaque exigence validée par le maître d'ouvrage est
tracée vers les fichiers livrés et les tests qui la vérifient. Statuts honnêtes :
**livré et testé** / **fondation livrée, recette base réelle à rejouer** / **à brancher**.

| # | Exigence | Livraison | Tests |
|---|---|---|---|
| 1 | Rentabilité par chantier (coût réel vs devis, alerte avant facturation) | migration 110, `services/chantiers.ts`, `routes/chantiers.ts`, écran `dash/chantiers.js` | v50-chantiers (unitaires + contrats) |
| 2 | Dérive devis→facture avec justification exigée | `services/deviation-guard.ts`, `POST /deviation-check` | v50-integrity-deviation-price |
| 3 | Contrats d'entretien récurrents (occurrences déterministes, validation humaine) | migration 112, `services/maintenance-contracts.ts`, `routes/maintenance.ts` | v50-recurrence-maintenance |
| 4 | Portail client : accès invités nominatifs, révocables, isolés par client | migrations 114/118, `services/portal-guest.ts`, `routes/portal-guest.ts` | v50-portal-webhooks-modularity |
| 5 | Acceptation de devis horodatée depuis le portail (transactionnelle + outbox) | `services/portal-guest.ts` (acceptQuoteFromPortal) | v50-portal-webhooks-modularity |
| 6 | Workflows : déclencheurs devis accepté / intervention terminée / garantie / partage | `services/workflows.ts` (additif), `routes/automation.ts` | v50-workflows-frontend |
| 7 | Simulation à blanc (« aurait déclenché N fois sur X jours ») sans écriture | `simulateRuleWindow`, `POST /automation/rules/:id/dry-run` | v50-workflows-frontend |
| 8 | Emplacements de stock (atelier/camion/dépôt) sans quantité parallèle | migration 111, `services/stock.ts`, `routes/stock.ts` | v50-chantiers (migration), suite stock existante |
| 9 | Récurrences d'agenda développées, lecture seule | `services/recurrence.ts`, `GET /agenda/occurrences` | v50-recurrence-maintenance, v50-workflows-frontend |
| 10 | Chaîne d'intégrité append-only, vérification localisée | migration 113, `services/integrity-chain.ts`, `GET /integrity/chain` | v50-integrity-deviation-price |
| 11 | Fiabilité de paiement par client (barème documenté, « inconnu » honnête) | `services/payment-reliability.ts` | v50-payment-reliability |
| 12 | Bibliothèque de prestations par profil (confirmations gagnent) | migration 117, `services/service-library.ts`, `routes/profile-services.ts` | v50-portal-webhooks-modularity (module), seed idempotent |
| 13 | Alertes de hausse de prix matériaux (achats réels, sans scraping) | migration 116, `services/price-history.ts`, `routes/maintenance.ts` | v50-integrity-deviation-price |
| 14 | Rapport mensuel du dirigeant (facturé ≠ encaissé, sections chartables) | `services/monthly-report.ts`, `GET /reports/monthly` | v50-portal-webhooks-modularity |
| 15 | Webhooks sortants signés HMAC (secret chiffré, backoff, lettre morte) | migration 115, `services/outgoing-webhooks.ts`, `routes/webhooks-out.ts` | v50-portal-webhooks-modularity (HMAC + contrats) |
| 16 | Graphiques au choix (barres/courbe/bougies/camembert) selon la nature des données | `assets/js/core/charts.js`, accueil + chantiers | v50-workflows-frontend |
| 17 | Modularité : fonctionnalités proposées selon le métier, masquage transparent | `services/profile-features.ts`, `GET /profile-features`, `core/profile-features.js`, navigation | v50-portal-webhooks-modularity (plumbing/beauty/inconnu), navigation.test (contrat mis à jour) |
| 18 | Écran « fin de chantier » mobile, coffre chaîné à l'émission, encart fiabilité client | **à brancher** (services prêts) — voir CHANGELOG §Limites et prompt global | — |

## Recette recommandée sur base PostgreSQL réelle (méthode 15.4.49)

1. Migrations 110 → 118 sur copie de base (`db:test:up` + `migrate`).
2. Parcours chantier complet : création → liens devis/rdv/temps → profitability → dérive.
3. Portail : invitation → vue publique par jeton → acceptation transactionnelle →
   rejeu refusé (déjà clos) → révocation → 404.
4. Contrat d'entretien : occurrences → validation d'un rendez-vous (collision 108) → sweep.
5. Webhooks : endpoint → événement → livraison vers un récepteur local → signature vérifiée.
6. Chaîne : émission → entrées → vérification → altération simulée → localisation.
