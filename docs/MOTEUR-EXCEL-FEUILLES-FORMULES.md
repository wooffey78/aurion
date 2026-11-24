# CLASSEUR MOTEUR AURION — FEUILLES ET FORMULES (15.4.57)

Le classeur `backend/assets/engine/aurion-moteur-calcul.xlsx` (version 1.0.0) contient toutes les formules du logiciel. Conventions : montants internes en centimes entiers ; distances et tarifs kilométriques en micro-unités (10⁻⁶) ; taux en points de base (10⁴ = 100 %) ; arrondi `ROUND` (demi-vers-le-haut) identique au moteur applicatif. Chaque feuille est protégée ; seules les cellules d'entrée (jaunes) sont modifiables par le moteur.

| Feuille | Contenu | Plages principales |
|---|---|---|
| 00 ACCUEIL | Version du classeur et du moteur requis, méthode, unités, règle d'or (aucun +1 €), liste des feuilles | `OUT_WORKBOOK_VERSION`, `OUT_ENGINE_REQUIRES` |
| 01 ENTREES | Toutes les données d'un document transmises par Aurion : TVA, TTC/net visé, remise, pièces, livraison, consommables, main-d'œuvre, coefficient, kilométrique (2 taux + mode), cotisations (5 créneaux + repli URSSAF) | `IN_DOC_*`, `IN_CONTRIBUTION_{1..5}_*` |
| 02 PROFIL ENTREPRISE | Forme juridique, régimes micro/TVA/VL/URSSAF, CA N-1 et N | `IN_PROFILE_*` |
| 03 PARAMETRES | Référentiel réglementaire daté : seuils micro 2026 (203 100 € / 83 600 €), franchise TVA (85 000/93 500, 37 500/41 250), indemnité 40 € B2B, tolérance paiement, borne entière, table des taux micro-sociaux 2026 (12,3/21,2/25,6/23,2 % + CFP + VL, version 2026-01-01, sources) | `P_*` |
| 04 CATALOGUE | Composition visible d'un tarif (fixe ou calculé) ; ajustement caché verrouillé à 0 | `IN_CATALOG_*`, `OUT_CATALOG_COMPOSED_TTC`, `OUT_CATALOG_HIDDEN_ADJUSTMENT` |
| 05 DEVIS | Reproduction intégrale du moteur v2 : conversions, kilométrage deux-taux, coefficient, prix plancher, remise, branches (ttc / labor / net), chaîne des cotisations séquentielles (ca_ht / gross_margin / profit), totaux, ratios, alertes — 39 sorties | `OUT_QUOTE_*` (35 champs du moteur) |
| 05 DEVIS (zone 200-283) | Solveur inverse du driver « net » : vérification net(0), 20 lignes de doublement, 60 lignes de bisection au centime rejouant exactement l'ordre d'arrondi des cotisations (chaîne D→M) | → `B44` (CA HT de base net) |
| 06 FACTURES | 30 lignes documentaires : total exigible, reste dû engagé (arrondi au centime par ligne), statut (paid / partially_paid / unpaid, tolérance demi-centime), contrôle ligne | `OUT_INVOICES_UNPAID_TOTAL`, `OUT_INVOICES_OPEN_COUNT`, `OUT_INVOICES_PAID_TOTAL`, `OUT_INVOICES_ROWS_CONSISTENT` |
| 07 PAIEMENTS | Validation d'un règlement (refus ≤ 0, déjà soldée, dépassement) + échéancier exact : `floor(cents/N)` par ligne, dernière échéance = reste | `OUT_PAYMENT_*`, `OUT_INSTALLMENTS_SUM`, `OUT_INSTALLMENTS_MATCH` |
| 08 ACHATS ET CHARGES | Notes de frais (HT/TVA/à rembourser), commande fournisseur (round2 par ligne puis total), stock (disponible, alerte seuil) | `OUT_EXPENSES_*`, `OUT_PURCHASE_ORDER_TOTAL`, `OUT_STOCK_AVAILABLE`, `OUT_STOCK_LOW` |
| 09 COTISATIONS | Ventilation par catégorie (ligne, sinon document, sinon « non affecté » signalé) avec taux du référentiel daté ; social/CFP = `round(CA×taux)/100` ; VL (impôt) distinct | `OUT_MICRO_CA_HT`, `OUT_MICRO_SOCIAL_TOTAL`, `OUT_MICRO_CFP_TOTAL`, `OUT_MICRO_CONTRIBUTIONS_TOTAL`, `OUT_MICRO_TAX_TOTAL`, `OUT_MICRO_UNASSIGNED_HT` |
| 10 FISCALITE | Détection du régime de TVA (option déclarée > seuil majoré > seuil base), taux, franchise, « à confirmer » si CA inconnu ; provision VL ; franchissement du seuil micro ; CFE saisie | `OUT_VAT_REGIME`, `OUT_VAT_RATE`, `OUT_VAT_FRANCHISE`, `OUT_VAT_TO_CONFIRM`, `OUT_TAX_PROVISION`, `OUT_MICRO_THRESHOLD_CROSSED`, `OUT_CFE_AMOUNT` |
| 11 RENTABILITE | Marges du document + rentabilité de chantier (temps valorisé TTC, dérive vs devis, alertes 80 %/100 %, reste à facturer, encaissement) | `OUT_MARGIN_*`, `OUT_MARKUP_RATE`, `OUT_COST_PRICE`, `OUT_CHANTIER_*` |
| 12 TRESORERIE | 30 lignes documentaires : km interne, coûts directs, TVA d'achat, CA HT dérivé du TTC, cotisations estimées → sorties prévisionnelles ; engagé (factures) vs potentiel (devis) séparés ; SAV déducteur ; + comptabilité de trésorerie : 60 lignes de paiements avec fenêtre cumulée (principal puis majorations), revenu HT/TVA/achats/TVA d'achat/cotisations/km au prorata, écritures mensuelles, 12 mois agrégés, factures distinctes (dénombrement protégé) | `OUT_TREASURY_*`, `OUT_ACCOUNTING_*` |
| 13 RELANCES | Majorations cumulées : fixed → valeur ; percent → (TTC+cumul)×v/100 ; none → 0 ; total dû ≥ 0 | `OUT_REMINDER_PENALTY`, `OUT_REMINDER_TOTAL`, `OUT_REMINDERS_LAST_TOTAL` |
| 14 SAV | Montants financiers négatifs (`−round2(qté×prix)`), interventions gratuites séparées | `OUT_SAV_TOTAL_TTC`, `OUT_SAV_FINANCIAL_TOTAL`, `OUT_SAV_FREE_COUNT` |
| 15 PREVISIONS | Hypothèses (volume, tickets TTC/HT, coût direct, taux de provision, charges fixes) → entrées/provision/sorties mensuelles ; horizons 1/3/6/12 ; entrées documentaires = devis ouverts + SAV | `OUT_FORECAST_*` |
| 16 RESULTATS | Table consolidée : chaque plage `OUT_*` avec unité et description (audit humain) | — |
| 17 CONTROLES | 17 contrôles de cohérence + statut global | `CHK_*`, `OUT_CONTROLS_FAILED`, `OUT_CONTROLS_STATUS` |

## Formules emblématiques (feuille 05 DEVIS, colonne B)

- `B13` km interne : `=ROUND(B9*B11/10000000000,0)` — produit d'entiers (micro-unités) divisé par 10¹⁰.
- `B23` coefficient : `=IF(B22=1,0,IF(B21=1,ROUND(B16*B17/1000000,0),ROUND(B6*B16/10000,0)))` — euros×quantité ou base×bps, jamais le prix fournisseur.
- `B46` CA HT (driver ttc) : `=ROUND(B28*10000/(10000+B15),0)` — division rationnelle exacte au centime.
- `B52..B56` cotisations : `=ROUND(MAX(0,IF(assiette="gm",marge,IF(assiette="pr",provisoire,base)))*taux_bps/10000,0)` — assiettes séquentielles avec cumul en colonne C.
- Solveur net : chaque ligne teste `net(base) = brut − Σ cotisations` où brut `=D+km−coûts directs` ; décisions identiques au moteur (`"ok"`/`"grow"`/`"go"`).
- `B60/B61` : total TTC `=B47+B59` et TVA `=B60−B49` (invariant HT+TVA=TTC vérifié en feuille 17).

Le dictionnaire de correspondance complet (89 entrées, 140 sorties, 10 tables, types, unités, descriptions) est `backend/assets/engine/engine-mapping.json` — source unique consultée par le moteur, jamais dupliquée dans le code.
