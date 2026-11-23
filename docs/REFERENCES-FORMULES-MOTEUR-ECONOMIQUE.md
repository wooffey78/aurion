# Référentiel des formules du moteur économique (prompt 03)

Le moteur unique est `backend/src/services/pricing.ts` ; le fichier `assets/js/core/pricing.js`
en est le miroir GÉNÉRÉ (`npm run sync-pricing` à la racine — ne jamais éditer à la main).
Arithmétique entière en centimes (BigInt), arrondi demi-vers-le-haut déterministe, entrées/sorties
typées. Route de test : `POST /pricing/calculate`. Tout montant est HT sauf mention contraire ;
TVA en points de base ; les cotisations sont des ESTIMATIONS (jamais un montant dû).

## Champs du résultat (`PricingResult`)

| Champ | Unité | Formule / source |
|---|---|---|
| `purchaseHt` | € | coût d'achat des pièces, tel quel (le coefficient ne touche jamais le prix fournisseur) |
| `coefficientMarkupHt` | € | coefficient × achat (base « purchase », % ou € × quantité) ; 0 en base « margin » |
| `shippingHt` | € | livraison saisie |
| `consumablesCostHt` | € | consommables saisis (15.4.49) — 0 par défaut |
| `internalLaborCostHt` | € | coût interne main-d'œuvre saisi (temps passé × coût horaire au choix de l'utilisateur) |
| `mileageTotal` | € | km × coût interne (mode « margin ») ou km × tarif client (mode « client_price ») |
| `billedMileageHt` / `mileageBilledTtc` | € | trajet facturé au client, uniquement en mode « client_price » |
| `directCostsHt` | € | achat ajusté + livraison + trajet interne + main-d'œuvre interne + consommables |
| `minimumSellingHt` | € | achat ajusté + livraison + trajet interne + consommables (prix plancher) |
| `belowMinimumPrice` | bool | CA HT base < prix plancher → garde `MARGIN_GUARD` côté documents |
| `totalHt` / `vat` / `totalTtc` | € | CA HT = base HT + trajet facturé ; TTC = HT + TVA (arrondi au centime) |
| `listPriceTtc` / `discountTtc` | € | TTC cible AVANT remise / remise déduite AVANT calcul (15.4.49) — traçable, `listPriceTtc − discountTtc = TTC effectif` |
| `baseRevenueHt` | € | inverse du TTC cible : `TTC × 10000 / (10000 + TVA bps)` |
| `laborSellingHt` | € | base HT − achat ajusté − livraison − trajet − consommables (si non saisi) |
| `grossMargin` | € | CA HT − coûts directs (marge brute) |
| `grossMarginRate` | % | marge brute / base HT — **taux de marge** (assis sur le CA) |
| `markupRate` | % | marge brute / CA HT total — **taux de marque** (15.4.49) |
| `contributions[]` | € | par cotisation : taux × assiette (`ca_ht`, `gross_margin` ou `profit`), en bps |
| `contributionsTotal` / `urssafEstimate` | € | somme des cotisations estimées / première cotisation |
| `netMargin` / `netResult` | € | marge brute − cotisations (résultat estimé, jamais un dû) |
| `netResultRate` / `marginRate` | % | résultat net / base HT |
| `loss` | bool | marge brute < 0 → alerte « vente à perte », jamais masquée |

## Règles transversales

- Le TTC saisi est la référence métier, conservé au centime près ; le calcul inverse (driver `net`)
  refuse les paramètres non monotones et interdit la remise (pas de sens défini).
- Un document émis conserve son instantané (`calculation_snapshot`, `contribution_snapshot`,
  `category_snapshot`) : une mise à jour réglementaire ne réécrit jamais les anciens documents.
- Prévisionnel ≠ réel : coût prévisionnel sur le document, encaissements réels dans `invoice_payments`,
  cotisation provisionnée (estimée) ≠ cotisation réellement payée (écriture comptable).
