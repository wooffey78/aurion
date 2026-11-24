# AUDIT DU MOTEUR DE CALCUL AURION — INVENTAIRE COMPLET (ÉTAPE 1)

Chantier : reconstruction du moteur de calcul autour du classeur Excel central `aurion-moteur-calcul.xlsx`.
Référentiel de conformité : dossier documentaire v1.0 du 24/11/2026 (documents 02, 05, 06, 07, 08).
Date d'audit : 24 novembre 2026 · État du dépôt : 15.4.56.

## 0 · Conventions transverses à reproduire dans le classeur

| Convention | Détail | Source |
|---|---|---|
| Montants | Centimes entiers (BigInt), taux en points de base (bps, 10 000 = 100 %) | `backend/src/services/pricing.ts:93-143` |
| Arrondi | Demi-vers-le-haut au centime (`roundHalfUp`) — Excel `ROUND(x,0)` équivalent sur valeurs positives | `pricing.ts:124-130` |
| Conversion saisie | `decimalUnits(v, n)` : la valeur saisie (≤ n décimales) devient un entier exact — jamais un produit flottant | `pricing.ts:105-122` |
| Arrondi « métier » hors moteur | `roundMoney(v) = Math.round((v+ε)*100)/100` (paiements, stock, achats, chantiers) | `services/invoice-workflow.ts:3` |
| Instantanés figés | `calculation_snapshot`, `contribution_snapshot`, `purchase_vat_mode/rate`, `vat_rate` (`calculation_version=2`) : les documents historiques ne sont jamais recalculés | `routes/business.ts:1487-1492` |

**Règle de portage** : le classeur calcule en entiers (centimes / micro-unités) exactement comme le moteur ; les cellules intermédiaires utilisent `ROUND(x*100,0)`, `ROUND(km*10^6,0)` etc., jamais de produit flottant brut. Bornes de représentabilité documentées dans le rapport comparatif.

## 1 · Moteur central `computePricing` (source unique, copie navigateur générée)

Fichiers : `backend/src/services/pricing.ts:167` · `assets/js/core/pricing.js:78` (générée par `npm run sync-pricing`).
Entrées : partCost, shippingCost, consumablesCostHt, mileageKm, mileageRate (legacy), mileageInternalRate, mileageClientRate, vatRate, urssafRate OU contributions[] {name, rate, basis `ca_ht|gross_margin|profit`}, coefficientValue/Unit/Basis, partQuantity, laborSellingHt (facultatif), laborInternalCostHt, targetTtc, targetNet, driver (`ttc|net`), mileageMode (`margin|client_price`), discountTtc.

| ID | Bloc | Formule actuelle (centimes) | Portage classeur |
|---|---|---|---|
| PR-01 | Distances | `roundHalfUp(km_micro × taux_micro, 10^10)` | `ROUND(KM_MIC*TAUX_MIC/10^10,0)` — entiers |
| PR-02 | Coefficient (basis purchase) | percent → `multiplyRate(part, coef)` ; euro → `roundHalfUp(coef × qty, 10^6)` ; basis margin → 0 | `ROUND(C_PART*C_COEF/10000,0)` / `ROUND(C_COEF*QTY_MIC/10^6,0)` |
| PR-03 | Prix plancher | `adjustedPart + ship + kmInterne + consommables` | somme d'entiers |
| PR-04 | Remise TTC | `targetTtc ← targetTtc − discount` (refusée si driver net ou remise > TTC) | cellules + contrôles 17 |
| PR-05 | Cotisations séquentielles | base `ca_ht`→baseRevenue, `gross_margin`→marge, `profit`→provisoire ; `multiplyRate(base>0, taux)` ; accumulés | chaîne 5 lignes avec bases liées |
| PR-06 | Driver TTC (cas principal) | `baseRevenue = roundHalfUp(targetTtc×10^4, 10^4+vatBps)` ; MO déduite = base − coûts (plafonnée 0) | `ROUND(TTC*10000/(10000+VAT_BPS),0)` — rationnel exact |
| PR-07 | Driver net (inverse) | dichotomie monotone : base minimale telle que `net(base) ≥ targetNet`, `net()` rejouant l'ordre d'arrondi exact | solveur 21 lignes de doublement + 60 lignes de bisection sur feuille technique |
| PR-08 | Marges | `directCosts = part+ship+kmInt+MOinterne+consommables` ; `totalHt = baseRevenue + kmFacturé` ; `grossMargin = totalHt − directCosts` | entiers |
| PR-09 | Totaux | `netResult = marge − cotisations` ; `totalTtc = baseTtc + kmTtc` ; `vat = TTC − HT` | entiers |
| PR-10 | Ratios | `grossMarginRate`, `netResultRate` (base baseRevenue), `markupRate` (base totalHt) : `ROUND(x×10^4/base,0)/100` | identique |
| PR-11 | Alertes | `belowMinimumPrice = base < plancher` ; `loss = marge < 0` | booléens 1/0 |

Sorties (~35) : purchaseHt, coefficientMarkupHt, shippingHt, directCostsHt, consumablesCostHt, internalLaborCostHt, mileageKm/rates/total, billedMileageHt/Ttc, totalHt, vat, totalTtc, listPriceTtc, discountTtc, baseTtc, baseRevenueHt, laborSellingHt, grossMargin, grossMarginRate, markupRate, contributionsTotal, contributions[], urssafEstimate, netMargin/netResult, marginRate/netResultRate, minimumSellingHt, belowMinimumPrice, loss, driver, mileageMode.
Utilisations : `POST /pricing/calculate` ; `prepareQuoteCalculation` (`business.ts:510`) sur POST/PATCH /quotes (instantané stocké) ; éditeur temps réel (`quote.js`).
Tests de référence : `pricing.test.mjs`, `calculation-v2`, `pricing-extensions`, `financial-golden-scenarios` (scénarios dorés TVA 20/10/0, km, remise, échéanciers), `step5`, `step12`, `step13`, `labor-cost-separation`, `quote-contract-v3`.

## 2 · Documents, devis, factures

| ID | Calcul | Fichier | Formule | Tests |
|---|---|---|---|---|
| DOC-01 | Normalisation avant moteur | `business.ts:461` prepareQuoteCalculation | partQuantity = Σ lignes (min 1) ; rawPart = Σ(qty×coût) sinon part_cost ; coefficient selon basis/unit | quote-contract-v3 |
| DOC-02 | Prix catalogue | `business.ts:401` | TTC cible = `interventions.default_price` (arrondi 2) | step6-catalog-pricing |
| DOC-04 | Numérotation | `business.ts:549` | max(suffix)+1 + séquence upsert | business-numbering |
| DOC-05 | Conversion devis→facture | `business.ts:1757` | unpaid / amount_paid=0 / next_reminder_at / sha256 intégrité | invoice-workflow |
| DOC-06 | Affichage client | `document-renderer.ts:86` | TOTAL affiché = TTC + majorations ; bloc km si client_price | step14 |

## 3 · Kilométrage (KM-01→KM-07)

Coût interne `km × taux interne` (mode margin) ; facturé `km × tarif client` uniquement en `client_price` (TTC = HT×(1+TVA)). Réutilisé par trésorerie (`business.ts:2366`), comptabilité (`accounting.ts:18,42`), rapports, prévisions (`forecast.js:71`), documents.

## 4 · Cotisations et référentiel micro (MIC-01→MIC-09)

Taux 2026 intégrés (social/CFP/VL) : vente 12,30/0,10/1,00 · services BIC 21,20/0,30/1,70 · BNC 25,60/0,20/2,20 · CIPAV 23,20/0,20/2,20 — conformes au référentiel documentaire (doc 02 §6). `splitByCategory` : `ROUND(caHt×taux)/100` par catégorie, VL distinct. Portage classeur : feuille 09 avec table de taux datée et ventilation ligne à ligne.

## 5 · TVA et franchise (TVA-01→TVA-05)

Seuils 2026 codés : vente 85 000/93 500 · services 37 500/41 250 (identiques au doc 02 §5) ; seuils micro 203 100 / 83 600 (identiques doc 02 §4). `detectVatRegime` : franchise confirmée → 0 % ; assujetti → 20 % ; CA > seuil majoré → 20 % ; CA inconnu → 20 % « à confirmer ». Mention « TVA non applicable, art. 293 B du CGI » si taux 0 (`mentions.ts:28`).

## 6 · Prévisions (PRE-01→PRE-05)

`documentForecastEntries = Σ TTC devis ouverts + Σ TTC SAV financiers (négatifs)`. Hypothèses auto (`forecast.js:31`) : volume = factures/6 mois ; ticket = moyenne TTC ; réserve = Σ taux ca_ht ; charges fixes = 0 si absentes (jamais inventées). `calculateForecast` : horizons 1/3/6/12 linéaires. Dashboard (HT) : `months3 = mois + moyenne×2 + devis ouverts` etc. Portage : feuille 15 (hypothèses en entrée, formules de projection).

## 7 · Trésorerie (TRE-01→TRE-09)

`committedIn = Σ max(0, TTC + majorations − payé)` (factures non soldées) ; `potentialIn = Σ TTC devis ouverts` ; `forecastOutputs = Σ (coûts directs + TVA d'achat + cotisations estimées sur CA HT dérivé du TTC)` ; `committedNet = committedIn − forecastOut − frais à rembourser` ; SAV compté séparément. Portage : feuille 12, 30 lignes documentaires.

## 8 · Comptabilité (ACC-01→ACC-05)

Comptabilité de trésorerie : par paiement, `base = min(paiement, principal restant)` (fenêtre cumulée), `penalty = paiement − base` ; `revenue_ht = base/(1+TVA) + penalties` ; `vat = base − base_ht` ; `purchases = coûts × min(1, base/TTC)` ; TVA d'achat au prorata (0 si exempt) ; `social = (base_ht+penalties) × Σ taux ca_ht (instantané) /100` ; km facturé seulement client_price ; écritures + notes de frais (HT→achats, TVA→déductible) ; SAV ajouté au revenu HT mensuel. Portage : feuille dédiée au sein de 12/16 avec fenêtres cumulées par ligne de paiement.

## 9 · Paiements (PAI-01→PAI-08)

`dueTotal = round2(TTC+penalties)` ; `remaining = max(0, due − payé)` ; refus ≤0 / trop-perçu (> remaining + 0,005) ; statut paid si `payé + 0,005 ≥ dû` ; échéancier : `floor(cents/N)` par ligne, dernière = reste ; affectation plus ancien d'abord. Portage : feuilles 06/07 (lignes factures + échéancier 12 lignes).

## 10 · Relances (REL-01→REL-07)

Majoration `fixed` → valeur ; `percent` → `(TTC + cumul précédent) × v/100` ; `none` → 0 ; `reminderTotal ≥ 0`. Configuration de la majoration possible uniquement entre la 3ᵉ et la 4ᵉ relance. Mention pénalités : « trois fois le taux d'intérêt légal » + indemnité 40 € **clients professionnels** (`mentions.ts:14`) — adaptation visée par la mise en conformité (gating B2B).

## 11 · SAV (SAV-01→SAV-03)

Montant financier = `−round2(Σ qty×prix)` ; effet : entrées prévisionnelles déduites, revenu HT mensuel majoré des SAV, coûts chantiers. Portage : feuille 14.

## 12 · Dépenses / achats / stock (EXP, PUR, STK)

Notes de frais `HT = TTC − TVA` ; commandes `round2(Σ round2(qty×PU))` ; réappro `max(0, seuil − dispo − commandé non reçu)` ; stock : signes par type, négatif refusé, `dispo = physique − réservations`.

## 13 · Marges / rentabilité (MAR-01→MAR-05)

Chantiers : `MO TTC = minutes/60 × taux × (1+TVA)` ; `margeTtc = facturé − (dépenses+SAV+MO)` ; dérive > 80 % (vigilance) / > 100 % (dérive) ; tendance prix `(dernier−premier)/premier×100` alerte ≥ seuil. Le helper historique `suggested-ttc` (+1 €) n'est plus référencé (test de non-régression le verrouille) — conforme à la règle impérative « aucun +1 € » (doc 06 §7).

## 14 · Tableau de bord (DAS-01→DAS-09)

unpaid, forecastEntries, forecast HT, 4ᵉ relance, RDV à venir, stock bas, tâches, essai, journal trié. Source unique : `documentForecastEntries`.

## 15 · Couverture classeur ↔ inventaire

| Feuille du classeur | Calculs portés |
|---|---|
| 05 DEVIS / 11 RENTABILITE / 09 COTISATIONS | PR-01→PR-11 complet (les 35 sorties), solveur net |
| 06 FACTURES / 07 PAIEMENTS | PAI-01, PAI-02, PAI-03 (échéancier), DOC-05 (statuts) |
| 08 ACHATS_ET_CHARGES | EXP-01, PUR-01, STK-01 (dispo/alerte) |
| 09 COTISATIONS | MIC-01/03 (table taux datée + ventilation) |
| 10 FISCALITE | TVA-01/02/05 (seuils, franchise, VL, alertes) |
| 12 TRESORERIE | TRE-01→TRE-09 + ACC-01 (fenêtres de paiement) |
| 13 RELANCES | REL-01→REL-03 |
| 14 SAV | SAV-01/03 |
| 15 PREVISIONS | PRE-02 (entrées), PRE-03 (horizons) |
| 16 RESULTATS / 17 CONTROLES | dictionnaire consolidé + invariants (HT+TVA=TTC, payé+restant=TTC, Σéchéancier=TTC…) |

Hors périmètre classeur v1 (restent dans le moteur applicatif, justifié dans le rapport comparatif) : détection de profil par NAF/score (MIC-08/09 — heuristique de mots-clés, non mathématique), calendrier des jours fériés (AUT-01 — date logic), fiabilité de paiement (AUT-06 — statistique), parsing bordereaux.
