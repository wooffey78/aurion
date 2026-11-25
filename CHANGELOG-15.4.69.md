# Aurion 15.4.69 — robustesse, sécurité, classeur et main-d'œuvre

Base : `origin/main` 15.4.67 + correctifs 15.4.68. Version additive : aucun changement de schéma,
aucune dépendance ajoutée ou retirée, aucun contrat d'API cassé.

## Sécurité et robustesse

- **`/calc-engine/preview`** (diagnostic coûteux : recalcul LibreOffice en mode classeur) :
  débit limité à **12 requêtes/minute**, corps strictement vérifié (objet JSON, jamais un tableau
  ni `null`). Le limiteur global reste à 1 500 req/min.
- **Bornes anti-abus du moteur** : au plus **32 cotisations** (le classeur en accepte 5) et
  **64 caractères** par saisie texte, refusés avant toute analyse numérique. Une requête
  pathologique ne peut plus coûter un parsing ni une boucle démesurés.
- **Diagnostic sans fuite** : `/calc-engine/status` renvoie le **nom** du classeur, plus le chemin
  absolu de l'hôte.
- **Vérification du contrat classeur** : chaque sortie mappée doit exister dans sa feuille. Une
  cellule manquante est refusée **immédiatement** (`WORKBOOK_INCOMPATIBLE`, liste des cellules)
  au lieu d'échouer après un recalcul complet de 20 s.

## Classeur

- Les **17 contrôles explicites** (`CHK_QUOTE_HT_TVA_TTC`, `CHK_QUOTE_DISCOUNT_LIMIT`,
  `CHK_CONTRIB_RATE_SUM`, `CHK_SOLVER_GUARD`, `CHK_MILEAGE_BOUND`, `CHK_COEFFICIENT_BOUND`,
  `CHK_INPUTS_NON_NEGATIVE`, `CHK_VERSION`…) sont désormais exposés dans `engine-mapping.json`
  avec leurs cellules réelles (`17 CONTROLES!C5` à `C21`).
  Conséquence : un contrôle en échec n'est plus un simple « CONTROLS_FAILED » anonyme — le nom
  exact du contrôle est renvoyé, donc actionnable.
- `outputs` : 140 → **157** entrées. Le classeur livré couvre **tout** le contrat (0 cellule
  manquante), vérifié par test.

## Calculateur devis / facture

- **Main-d'œuvre simplifiée** : un seul champ visible (« Main-d'œuvre facturée HT », facultatif),
  le coût interne passe dans un bloc repliable « Coûts internes (facultatif) ». Le champ n'est
  prérempli que pour les documents pilotés par le prix (jamais en calcul inverse), afin de ne
  jamais changer un total enregistré.
- **Aucun cache de recalcul** : le cache du dernier appel (`memoKey`/`stableKey`) et la
déduplication `lastCalcKey` de l'éditeur sont **supprimés**. `computePricing` est une fonction
  pure, sans état : deux appels identiques recalculent, renvoient deux objets indépendants et ne
  peuvent jamais servir une valeur périmée. Coût mesuré négligeable (arithmétique BigInt), au
  profit d'une garantie simple à auditer.
- **Échantillons de documents** : `tools/render-document-samples.mjs` génère PDF, DOCX et ODT
  réels (4 ambiances, liste longue, document sans kilométrage) et vérifie pages, encart
  kilométrique absent à 0,00 €, accents de thème ODT et contenu DOCX.

## Documents et estimation sociale

### Pagination PDF resserrée (pertinence)
Un devis de trois lignes tenait sur **deux pages** : en-tête, carte client, écarts fixes et bloc
signature consommaient trop de hauteur, et `need()` réservait **110 px** pour un bloc total qui
n'en fait que 88. Les écarts sont réduits (en-tête, client, prestation, appareil, tableau, total,
signature, mentions), la réserve du total utilise sa hauteur réelle (`rowH`), et l'adresse
d'intervention identique à la facturation n'est plus répétée — dans les trois formats.

Résultat mesuré sur les échantillons : les **quatre ambiances tiennent sur 1 page** (3 lignes,
appareil, kilométrage, garantie, mentions) et une liste de **45 pièces passe de 5 à 3 pages**.

### Cotisations : la somme, plus la première ligne
The `urssafEstimate` reprenait `contributions[0].amount` : un régime à plusieurs lignes (maladie,
retraite, CFP) affichait une estimation très inférieure au coût social réel. Il renvoie désormais
la **somme des lignes**, identique à `contributionsTotal` et à la déduction appliquée à `netMargin`.

### Bandeau Signature vérifié
Le bandeau compacté (56 pt) était vulnérable à un libellé long : le titre pouvait s'empiler sur le
numéro. Titre, numéro et date sont désormais forcés sur une ligne (ellipsis), et la hauteur est
contrôlée à chaque génération d'échantillons avec les métriques réelles des polices : bas de ligne
à **22,0 / 36,3 / 47,6 pt**, soit 6,4 pt de marge sous la date.

## Fiabilité des tests

- `pretest` construit le backend avant `npm --prefix backend test` : la suite ne dépend plus d'un
  build préalable implicite (c'était la cause d'échecs « dist/ absent »).
- `Semaphore` n'utilise plus de « parameter property » TypeScript : le moteur reste importable
  par le vérificateur de types natif de Node.
- Nouveau test `calc-engine-contract-15.4.69.test.mjs` : contrat classeur (157 sorties,
  17 contrôles, 0 cellule manquante), borne des cotisations, borne des saisies.

## Documentation

- Le commentaire de cache devenu faux (15.4.55) est supprimé ; `computePricing` documente ses
  invariants, ses unités (centimes/BigInt), ses arrondis et ses exceptions.
- Contrats publics documentés : les trois moteurs de rendu et leur géométrie, l'exécution du
  classeur et la validation des entrées, les routes de diagnostic, l'éditeur de devis (flux complet
  et absence de cache).

## Vérifications

- `typecheck` : OK — `build` : OK — `check-frontend` : 50 fichiers / 49 modules, OK.
- 11 fichiers de tests calcul / devis / documents : **71 tests, 64 réussis, 7 sautés**
  (PostgreSQL/LibreOffice indisponibles), **0 échec** (dont le nouveau test de somme des cotisations).
- `tools/render-document-samples.mjs` : 12 fichiers générés, 14 contrôles automatiques OK
  (encart kilométrique absent à 0,00 €, accents ODT corrects, 1 page pour les quatre ambiances).

## Limites

- Le mode classeur (`xlsx`) n'a pas été exécuté : LibreOffice n'est pas installé sur ce poste.
  Le contrat et les contrôles sont vérifiés statiquement ; la parité numérique réelle reste à
  prouver en recette avec LibreOffice.
- Aucun rendu visuel PDF/DOCX/ODT n'a été inspecté.
