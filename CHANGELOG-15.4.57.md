# CHANGELOG — 15.4.57

## Chantier « moteur de calcul Aurion autour d'un classeur Excel central » + mise en conformité documentaire

### 1 · Classeur central `aurion-moteur-calcul.xlsx` (référentiel officiel des formules)
- 18 feuilles (00 ACCUEIL → 17 CONTROLES) générées par `scripts/build-engine-workbook.py` : toutes les entrées disposent d'une plage nommée `IN_*` (89), tous les résultats d'une plage `OUT_*` (140), 10 tables de lignes documentaires ; feuilles protégées, cellules d'entrée déverrouillées ; aucun montant codé en dur dans les écrans n'a été modifié.
- Formules réelles reproduisant l'arithmétique exacte du moteur v2 : centimes entiers, micro-unités kilométriques, points de base, arrondi demi-vers-le-haut (`ROUND`), chaîne des cotisations à assiettes séquentielles, prix plancher, remise traçable, ratios et alertes ; **solveur inverse du driver net** (doublement + bisection au centime sur 80 lignes rejouant l'ordre d'arrondi du moteur).
- Contrôles de cohérence in-classeur (17 vérifications + statut global) : HT+TVA=TTC, remise bornée, cumul des taux < 100 %, bornes entières, échéancier exact, aucun ajustement caché (règle « aucun +1 € »)…

### 2 · Moteur d'exécution (nouveau service `backend/src/services/calc-engine/`)
- `engine.ts` : instance isolée par requête (copie du modèle immuable), écriture des entrées en VALEURS (aucune injection de formule possible), recalcul RÉEL par LibreOffice headless (profil par requête, `OOXMLRecalcMode=0`), lecture des sorties, vérification des contrôles, traçabilité JSON, sémaphore de concurrence, délai d'expiration avec SIGKILL, erreurs typées (classeur absent/corrompu/incompatible, entrée invalide, recalcul échoué, contrôles KO, timeout) — **jamais de valeur par défaut ni de repli silencieux**.
- `xlsx-io.ts` : manipulation XML directe du classeur (adm-zip) — formules et plages nommées du modèle intactes.
- `pricing-adapter.ts` : correspondance exhaustive entrées/sorties ↔ plages nommées (normalisation identique au moteur : virgules, quantité minimale, repli URSSAF), reconstruction du résultat complet, comparaison champ par champ.
- Diagnostics : `GET /calc-engine/status`, `POST /calc-engine/preview` (double calcul).

### 3 · Bascule progressive sans régression (Phases C/E)
- `AURION_CALC_ENGINE=legacy` (défaut, comportement strictement inchangé) | `dual` (double calcul comparé, divergences journalisées, résultat servi inchangé) | `xlsx` (le classeur sert les résultats, erreurs remontées). Retour arrière = changer la variable.
- Intégration aux points de calcul applicatifs : `prepareQuoteCalculation` (POST/PATCH /quotes) et `POST /pricing/calculate`.

### 4 · Parité prouvée (Phase C exécutée)
- **16/16 scénarios de référence à parité EXACTE au centime** (35 champs, cotisations ligne à ligne) : TTC 20/10/5,5/0 %, km interne/client, remise, multi-assiettes, driver net (3 variantes), main-d'œuvre explicite, coefficients %/€, montants élevés, arrondis à 3 décimales. Invariants vérifiés à chaque recalcul ; isolation concurrente ; injection refusée.
- Suites de non-régression : **93/93** (pricing, scénarios dorés, paiements, workflow, prévisions) + **33/33** (moteur + légal) + typecheck sans erreur.

### 5 · Mise en conformité documentaire (référentiel v1.0 du 24/11/2026)
- Mentions de facture : **conditions d'escompte** systématiques (« néant ») ; indemnité de recouvrement 40 € explicitement limitée aux **retards entre professionnels**.
- Identité : mention **« Entrepreneur individuel (EI) »** pour les EI/micro/auto-entrepreneurs (« micro-entreprise » = régime, jamais une forme juridique) ; `docs/LEGAL-NOTICE.md` aligné.
- `docs/CGU-CGV.md` : escompte B2B + distinction **avoir ≠ remboursement** (l'avoir réduit le solde sans effacer la facture ; le remboursement est un flux séparé et prouvé).
- Documents contractuels : version **5.0 → 5.1** (re-acceptation des CGV/confidentialité/DPA déclenchée) ; test de publication mis à jour.
- Vérifiés déjà conformes : seuils micro 2026-2028, seuils franchise TVA, taux micro-sociaux 2026, durées de conservation (10 ans / 3 ans), droits RGPD, rétractation en ligne, crypto désactivé.

### 6 · Documentation du chantier
- `docs/MOTEUR-CALCUL-AUDIT.md` (inventaire exhaustif des calculs), `MOTEUR-EXCEL-TECHNIQUE.md` (architecture et cycle), `MOTEUR-EXCEL-FEUILLES-FORMULES.md` (feuilles et formules), `MOTEUR-EXCEL-COMPARATIF.md` (rapport comparatif et divergences bornées), `MOTEUR-EXCEL-NON-REGRESSION.md` (rapport de tests).

### Version
- `VERSION.txt`, `package.json`, `backend/package.json`, `sw.js`, `index.html` : 15.4.57. Aucune migration SQL ; le classeur et son contrat vivent dans `backend/assets/engine/` (versionnés avec le code).
