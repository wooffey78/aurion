# Aurion 15.4.68 — corrections des trois moteurs

Base : `origin/main` 15.4.67 (commit `aa8bec7`). Version **additive** : aucun changement de schéma,
aucune dépendance ajoutée ou retirée, aucun changement d'API.

> **Alignement 15.4.69** — deux points de ce changelog ont été remplacés depuis : le cache de
> recalcul a été **supprimé** (moteur pur, sans état) et le garde-fou `laborTouched` a été
> **retiré** au profit d'un préremplissage limité aux documents pilotés par le prix. Les
> passages concernés sont marqués « remplacé en 15.4.69 » et décrivent l'état final.

Cette version corrige des défauts **constatés par exécution** sur les trois moteurs demandés :
le moteur de calcul commercial, la calculateur de devis/facture et le moteur d'affichage des
encarts (PDF, DOCX, ODT et encarts financiers du tableau de bord).

## 1. Moteur de calcul (`backend/src/services/pricing.ts`, `assets/js/core/pricing.js`)

### Mémoïsation empoisonnable (fiabilité)
`computePricing` mémorise le dernier appel et renvoyait **le même objet** à chaque appel identique.
Un appelant qui ajustait le résultat (champ d'affichage, correction d'un centime) corrompait le
cache : tous les appels suivants — y compris ceux qui produisent les documents — renvoyaient
l'objet modifié. Reproduit : après `result.totalTtc = -1`, le calcul suivant renvoyait `-1`.

En 15.4.68, le cache conservait une **copie privée** et renvoyait une copie défensive (résultat +
lignes de cotisations).

**Remplacé en 15.4.69** : le cache est supprimé. `computePricing` est une fonction pure, sans
état ni mémoïsation ; deux appels identiques renvoient deux objets indépendants. Une valeur
périmée ne peut plus être servie, et il n'y a plus de copie à payer à chaque frappe.

### Cotisation nulle ou mal formée (fiabilité)
Une ligne `contributions: [null]` (brouillon local altéré, appel API) provoquait une exception
technique `TypeError`. Elle est désormais traitée comme une cotisation à 0 %, sans interrompre
le calcul ni le rendu du document.

### Clé de cache non sérialisable (fiabilité)
`stableKey` pouvait lever sur une valeur `BigInt` avant même la validation des entrées.
Elle est maintenant convertie en texte ; une valeur non sérialisable ne fait plus échouer le calcul.

**Remplacé en 15.4.69** : `stableKey` et le cache ayant disparu, la question ne se pose plus.

## 2. Calculateur devis / facture (`assets/js/pages/dash/quote.js`)

### Prestations complémentaires perdues en calcul inverse (exactitude)
En mode « bénéfice minimum » (`driver = net`), le champ « Prix TTC facturé au client » était
réécrit avec la **base seule** : les prestations complémentaires disparaissaient de l'affichage,
`baseTtcMain` pouvait retomber à 0, et le brouillon enregistrait un total inférieur au réel.

Le champ affiche désormais `base + prestations complémentaires`, et la base conservée pour les
recalculs reste la base réelle. Le total enregistré, affiché et facturé sont identiques.

### Prix de vente main-d'œuvre invisible en édition (pertinence)
Le champ était volontairement vide à l'ouverture d'un document existant, alors que la valeur est
enregistrée. Il affiche maintenant la valeur du document.

**Remplacé en 15.4.69** : le garde-fou `laborTouched` (transmettre la valeur seulement si
l'utilisateur la modifie) cassait le contrat historique du formulaire et a été retiré. Le
préremplissage est limité aux documents **pilotés par le prix** (`driver !== 'net'`), jamais au
calcul inverse ; la valeur transmise est celle du champ, comme avant 15.4.68. Un document existant
se recalcule donc à l'identique, et le mode « bénéfice minimum » conserve son champ vide.

## 3. Moteur d'affichage des encarts (`backend/src/services/document-layout.ts`, `account-sync.js`)

### « NaN,undefined € » dans les encarts et les totaux (fiabilité)
`formatEuro` / `formatQty` ne protégeaient pas les valeurs non numériques : une colonne vide,
un import ou un instantané ancien affichait `NaN,undefined €` (et `NaN` pour une quantité).
Toute valeur non finie vaut désormais `0,00 €` / `0`.

### Encart « Frais kilométriques » affiché à 0,00 € (pertinence)
La garde comparait le montant formaté à `'0,00 €'` avec une **espace ordinaire**, alors que
`formatEuro` produit une **espace insécable** : la comparaison était toujours fausse sur PDF et
DOCX (et fragile sur ODT). L'encart apparaissait donc sur les documents sans frais kilométriques.
Le test est désormais numérique (`showsMileage`) : un montant nul masque l'encart, un montant réel
l'affiche, et les champs de modèle `{{MILEAGE_TOTAL}}` restent visibles dans l'aperçu des modèles.

### Tableau des pièces sans en-tête en page 2 (PDF)
Une liste de pièces qui dépassait une page continuait sans les libellés de colonnes.
L'en-tête est maintenant redessiné après chaque saut de page, dans les trois variantes
(Minimal, Classique, Signature).

### Total Minimal écrasé dans une colonne de 0,5 cm (ODT)
La variante Minimal déclarait trois colonnes (`7,4 cm · 0,5 cm · 8,7 cm`) mais ne fournissait que
deux cellules : le total atterrissait dans la colonne médiane de 0,5 cm. Une cellule d'espacement
rétablit le total dans sa colonne de 8,7 cm.

### Encarts Signature figés sur le bronze (ODT)
Les couleurs de la variante Signature étaient codées en dur (`#a16207`, `#2b1f14`) : les ambiances
Orchidée, Horizon et les accents personnalisés n'étaient pas appliqués à l'ODT, contrairement au
PDF et au DOCX. L'accent et le fond foncé du thème choisi s'appliquent désormais aux trois formats.

### Encarts financiers du tableau de bord (`assets/js/account-sync.js`)
Le formateur `euro()` pouvait afficher `NaN €` sur une valeur absente ou non numérique.
Il retombe désormais sur `0,00 €`.

## Ce qui n'a pas été touché

- Aucune formule, aucun barème, aucun taux : les 48 tests de calcul (dont le contrat golden du
  classeur de référence et les scénarios de marge, remise, kilométrage et cotisations) passent
  sans modification.
- Aucun schéma de base, aucune migration, aucune route, aucun contrat d'API.
- Aucune dépendance ajoutée, retirée ou mise à jour.
- Les choix de conception existants (taux de marge assis sur le CA de base, remise refusée en
  calcul inverse, cotisations obligatoires/facultatives) sont conservés.

## Vérifications exécutées

- `npm --prefix backend run typecheck` : OK.
- `npm --prefix backend run build` : OK.
- `node --test` sur 8 fichiers de calcul, document et tableau de bord : **48/48**.
- Nouveau test de régression `backend/tests/moteurs-calcul-encarts-15.4.68.test.mjs` : 4/4.
- État final après 15.4.69 : 71 tests, 64 réussis, 7 sautés (PostgreSQL/LibreOffice), 0 échec.
- `node --experimental-vm-modules tools/check-frontend.mjs` : 50 fichiers, 49 modules, OK.

## Limites

- Les documents PDF/DOCX/ODT n'ont pas été ouverts visuellement : les correctifs de mise en page
  sont vérifiés par le code et par le contenu XML de l'ODT produit, pas par rendu visuel.
- Le mode classeur (`AURION_CALC_ENGINE=xlsx`) n'a pas été exécuté (LibreOffice non installé sur
  ce poste) : la copie défensive du cache s'applique aux deux moteurs, sans incidence sur les
  sorties du classeur.
