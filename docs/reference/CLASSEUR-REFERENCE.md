# Classeur de référence des calculs — lien Excel ⇔ moteur Aurion

Fichier : `assets/reference/AURION-classeur-calculs.xlsx` (généré par `scripts/build-classeur-reference.py`).
Export machine : `assets/reference/classeur-reference.json`.
Contrat de vérification : `backend/tests/calculs-reference.contract.test.mjs` (golden, 5 tests).

## Principe

« Aurion ne se trompe plus ni dans les calculs, ni dans les chiffres affichés » : le moteur de
calcul JS (`assets/js/core/pricing.js`, `computePricing()`) est la seule source de vérité des
documents (devis, factures, marges, cotisations). Le classeur Excel reproduit ses formules une
par une et trois jeux d'essai (golden) vérifient à chaque build de test que le moteur JS produit
**exactement** les mêmes montants que le classeur (tolérance 0,011 € d'arrondi d'affichage).

## Mapping des formules

| Grandeur Aurion | Cellule Excel | Formule |
| --- | --- | --- |
| `computePricing().baseRevenueHt` | `Moteur document!B17` | TTC ÷ (1 + TVA/100), arrondi half-up au centime |
| `computePricing().totalHt` | `Moteur document!B21` | base HT + kilométrage facturé (mode `client_price`) |
| `computePricing().directCostsHt` | `Moteur document!B22` | pièces × qté + livraison + consommables + km interne + MO interne |
| `computePricing().grossMargin` | `Moteur document!B23` | total HT − coûts directs |
| `computePricing().contributionsTotal` | `Moteur document!B24` | Σ (taux × base HT), chaque cotisation sur son assiette |
| `computePricing().netResult` | `Moteur document!B25` | marge brute − cotisations |
| `computePricing().totalTtc` | `Moteur document!B26` | TTC cible + km facturé TTC |
| `computePricing().vat` | `Moteur document!B27` | total TTC − total HT |
| Encaissements HT (comptabilité) | `Encaissements & TVA!C` | Σ paiements TTC ÷ (1+TVA) — paiements détaillés ∪ factures payées |
| Prévisionnel (volume + projections HT) | `Prévisionnel!A:G` | volume = (factures + devis récents) ÷ 6 ; entrées HT = volume × ticket HT × horizon |

## Jeux d'essai (golden)

1. **Réparation standard** (km absorbé par la marge, TVA 20 %) — TTC 400,00 · HT 333,33 · net 89,50.
2. **Kilométrage facturé au client** — TTC 382,40 · HT 318,67 · net 141,00.
3. **Vente à perte détectée** (TVA 5,5 %) — le moteur signale la perte et le résultat net négatif.

Toute évolution du moteur doit mettre à jour le classeur et les jeux d'essai : le contrat golden
échoue si les nombres divergent, ce qui rend toute régression de calcul impossible à publier sans
la voir.
