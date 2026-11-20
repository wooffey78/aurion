# RAPPORT-BLOC-03 — Consultation locale dans les vues métier restantes (15.4.32)

## Objectif (prompt §5-BLOC 3)
Raccorder les vues restantes aux lectures locales, afficher la fraîcheur, pas de faux zéro ni de vue prétendue à jour sur un ancien état.

## Constat (Bloc 0)
Repli local existant pour 12 entités (dashboard.js:81-90) ; notes de frais absentes ; détail paiements/relances d'une facture en échec hors connexion ; comptabilité/trésorerie affichées sur le dernier état en ligne sans étiquette de fraîcheur.

## Changements
1. **`assets/js/pages/dashboard.js`** : `LOCAL_ENTITY` étendu à `expenseReports:'expense_reports'` ; mise en forme locale des notes de frais (lignes brutes snake_case → `{expenses,totals}` attendu par la vue, totaux recalculés localement : count, amountTtc, vatAmount, amountHt, toReimburse).
2. **`assets/js/pages/dash/docs.js`** : détail « Facture et relances envoyées » hors connexion — sur échec réseau (statut 0), lecture des répliques locales `invoice_payments` et `invoice_reminders` filtrées par facture, reste dû recalculé localement (total TTC + majorations − paiements), présenté comme **état local** (`_offline:true`) — jamais comme un état serveur ; aucune écriture possible hors connexion (le formulaire de paiement reste bloqué par l'API, conformément au §2.4).
3. **`assets/js/core/sync-ui.js`** : export `lastPullTime()` (horodatage de la dernière réplication complète) pour l'affichage de fraîcheur par vue.
4. **`assets/js/pages/dash/other.js`** : comptabilité — bandeau honnête hors connexion (« Données locales affichées — calculs fondés sur la dernière réplication… aucun zéro fictif ») ; trésorerie — pastille « hors connexion — état local » sur les flux identifiés.

## Matrice page × données × source locale × comportement hors ligne (état après Bloc 3)

| Vue | Données | Source hors connexion | Comportement |
|---|---|---|---|
| Clients | clients (+adresses d'intervention) | répliques (bloc 15.4.29) | liste + fiches consultables |
| Devis & factures | quotes+items, clients | répliques + enrichissement | liste consultable ; détail paiements/relances en lecture locale (nouveau) |
| Agenda | appointments | répliques | consultable |
| Catalogue/fournisseurs | parts, supplies, warranties, policies, suppliers | répliques | consultables |
| SAV | sav_cases + clients | répliques + enrichissement | consultable |
| Notes de frais | expense_reports | **répliques (nouveau)** | liste + totaux recalculés |
| Comptabilité / trésorerie | agrégats serveurs | dernier état en ligne connu | **bandeau de fraîcheur (nouveau)** — jamais de zéro fictif |
| Paramètres | templates + réglages locaux | répliques partielles | consultation limitée assumée |
| Prévision | hypothèses d'activité | répliques (Bloc 2 : activity_forecast_assumptions) | consultables |

Hors périmètre de ce bloc (déclaré) : écriture hors connexion au-delà de l'outbox existante (Bloc 4), agrégats recalculés localement (Bloc 7).

## Tests
- Non-régression : phase-H complète rejouée sur l'arbre final du bloc (migrations ×2, `check` incl. parcours Playwright hors connexion, `npm test` 468) — voir MISSION-ETAT pour les résultats exacts de session.
- Le scénario e2e hors connexion existant (création client → pending → rejeu sans clic, sans doublon) reste vert.

## Limites
- L'affichage local du détail facture suppose que les paiements/relances ont été répliqués avant la coupure (ils le sont dès la première réplication complète).
- La fraîcheur comptabilité/trésorerie reste « dernier état en ligne » : le recalcul local complet est l'objet du Bloc 7.

## Actions éditeur
Aucune. — **Confirmation** : aucun push, aucun déploiement, aucune dépense.

## État du bloc : **validé** (matrice page×données×source établie ; chaque vue annonce honnêtement sa source).
