# RAPPORT COMPARATIF — ANCIEN MOTEUR ↔ CLASSEUR EXCEL (15.4.57)

## 1 · Méthodologie (Phases A→D)

1. **Phase A — référence** : l'ancien moteur (`computePricing`, arithmétique BigInt exacte en centimes) reste la vérité. 16 scénarios de référence couvrant : TTC (TVA 20/10/5,5/0 %), kilométrage interne et refacturé, remise traçable, cotisations mono et multi-assiettes (ca_ht / gross_margin / profit séquentielles), driver net (taux agrégé, mixte, cible 0), main-d'œuvre explicite (avec et sans prix cible), coefficients % et € × quantité, montants élevés, arrondis sensibles à trois décimales (2,675 €, 12,345 km, taux 0,123456).
2. **Phase B — moteur isolé** : le service `calc-engine` écrit les entrées, recalcule via LibreOffice (`OOXMLRecalcMode=0`), relit les sorties et vérifie les contrôles — indépendamment de l'interface.
3. **Phase C — double calcul** : `AURION_CALC_ENGINE=dual` exécute les deux moteurs et journalise chaque divergence (`[calc-engine] dual-compare`) sans modifier les résultats affichés.
4. **Phase D — correction** : les divergences constatées pendant le développement (références circulaires de cellules, main-d'œuvre nette du driver inverse) ont été corrigées puis la suite complète rejouée.

## 2 · Résultat de la comparaison

**16/16 scénarios à parité EXACTE au centime** sur les 35 champs du résultat (montants, taux de marge/marque, cotisations ligne à ligne avec noms et assiettes, alertes) + invariants (HT+TVA=TTC, encaissé+restant=total) vérifiés à chaque recalcul. Isolation des calculs simultanés vérifiée (aucune collision entre instances). Tests : `backend/tests/calc-engine-parity.test.mjs` — 22/22 pass.

## 3 · Différences théoriques restantes — expliquées, encadrées et testées

Conformément au référentiel (« aucune différence acceptable sans explication »), les seuls écarts POSSIBLES sont bornés, documentés et détectés :

| # | Écart potentiel | Cause | Encadrement |
|---|---|---|---|
| 1 | ±1 cent sur un kilométrage/coefficient dont le produit EXACT tombe à moins de 10⁻⁶ d'une frontière de demi-centime avec 12 décimales exactes | Excel calcule en float64 ; le moteur applicatif parse les chaînes en BigInt | Double arrondi `ROUND(ROUND(x,6),0)` sur toute conversion d'entrée ; bornes réalistes (km×tarif ≤ 9 000 €, coût×coefficient sous 2⁵³) vérifiées par CHK_MILEAGE_BOUND/CHK_COEFFICIENT_BOUND ; aucun cas réel connu (données métier ≤ 3 décimales) — couvert par le scénario « arrondis sensibles » à parité exacte |
| 2 | Sommes mensuelles de comptabilité de trésorerie : PostgreSQL `numeric` (décimal exact) vs float64 | Sommes de ≤ 60 termes à décimales finies | Erreur relative ≤ 10⁻¹⁰ € avant l'arrondi d'affichage — indiscernable après `ROUND(...,2)` ; les totaux « engagé » restent en centimes entiers exacts |
| 3 | Compteur de factures distinctes (feuille 12) via SUMPRODUCT/COUNTIFS | Équivalent fonctionnel du `count(distinct)` SQL | Dénominateur protégé (jamais #DIV/0!) ; testé sur lignes vides |
| 4 | Fraction dont le numérateur×10⁴ dépasse 2⁵³ (TTC > 9×10¹¹ centimes) | Représentation entière d'Excel | Impossible en données réelles (plafond applicatif 10⁹ €) ; la borne est un contrôle du classeur |

## 4 · Hors périmètre du classeur v1 (reste dans le moteur applicatif, justifié)

- **Détection de profil** (NAF/mots-clés, MIC-08/09) et **fiabilité de paiement** (AUT-06) : heuristiques de classement, non mathématiques — un classeur ne les reproduirait pas de façon plus fiable.
- **Calendrier des jours fériés** (AUT-01) : logique de dates, non de formules monétaires.
- **Moteur navigateur de l'éditeur** (`assets/js/core/pricing.js`) : conservé pour le recalcul à chaque frappe (~0,1 ms) — un aller-retour LibreOffice par frappe serait unusable ; la parité des DEUX copies serveur/navigateur est garantie par génération (`sync-pricing`) et par `pricing.test.mjs`. La vérité applicative reste l'instantané `calculation_snapshot` du document.
- Les scénarios testés en base (factures réelles, échéanciers) sont portés feuille par feuille (06/07/12) ; les tests d'intégration PostgreSQL existants restent la référence de bout en bout.

## 5 · Décision

Le classeur est la **source officielle des formules** (audit, documentation, évolution) et peut servir les résultats en production via `AURION_CALC_ENGINE=xlsx` après la période de double calcul en `dual`. Coût mesuré : ≈ 1,0-1,1 s par recalcul (LibreOffice headless, instance isolée) — à réserver aux calculs documentaires et aux réconciliations, pas à la frappe clavier.
