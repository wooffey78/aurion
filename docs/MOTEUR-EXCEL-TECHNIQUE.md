# MOTEUR DE CALCUL AURION — CLASSEUR EXCEL CENTRAL · DOCUMENTATION TECHNIQUE (15.4.57)

Chantier : « reconstruction du moteur de calcul Aurion autour d'un classeur Excel central ». Audit préalable : `docs/MOTEUR-CALCUL-AUDIT.md`. Comparatif moteurs : `docs/MOTEUR-EXCEL-COMPARATIF.md`. Non-régression : `docs/MOTEUR-EXCEL-NON-REGRESSION.md`.

## 1 · Architecture

| Élément | Emplacement | Rôle |
|---|---|---|
| Classeur de référence | `backend/assets/engine/aurion-moteur-calcul.xlsx` | Référentiel officiel des formules — 18 feuilles, plages nommées IN_*/OUT_*, contrôles feuille 17, feuilles protégées (cellules d'entrée déverrouillées) |
| Contrat de correspondance | `backend/assets/engine/engine-mapping.json` | Dictionnaire exhaustif : 89 entrées, 140 sorties, 10 tables de lignes — identifiants stables, feuille, cellule, type, unité, description |
| Générateur | `scripts/build-engine-workbook.py` (racine du dépôt) | Régénère classeur + mapping (openpyxl). Toute évolution de formule passe par lui : formules, plages nommées et mapping ne peuvent plus diverger |
| Moteur d'exécution | `backend/src/services/calc-engine/engine.ts` | `calculate(inputs)` : instance isolée → écriture → recalcul réel → contrôles → sorties ; `getCalculationStatus()` |
| E/S classeur | `backend/src/services/calc-engine/xlsx-io.ts` | Manipulation XML (adm-zip) : écrit les entrées en VALEURS (jamais en formules), lit les résultats recalculés |
| Adaptateur pricing | `backend/src/services/calc-engine/pricing-adapter.ts` | Correspondance exhaustive PricingInput ↔ IN_* et OUT_* ↔ PricingResult ; comparaison ancien/nouveau |
| Diagnostics | `backend/src/routes/calc-engine.ts` | `GET /calc-engine/status`, `POST /calc-engine/preview` (double calcul de validation) |
| Tests | `backend/tests/calc-engine-parity.test.mjs`, `calc-engine-engine.test.mjs` | 16 scénarios de référence à parité exacte + robustesse |

## 2 · Cycle de calcul (`calculate`, prompt §7 étapes 1→13)

1. Acquiert un créneau (sémaphore, `AURION_CALC_CONCURRENCY`, défaut 1 — LibreOffice ≈ 150-300 Mo par instance).
2. Charge le modèle (cache par chemin) et vérifie la compatibilité `engineRequires` ↔ `ENGINE_VERSION`.
3. Valide chaque entrée contre le contrat (type, plages identiques au moteur applicatif) — entrée inconnue/invalide ⇒ erreur typée, jamais de valeur par défaut.
4. Copie le classeur en mémoire et écrit UNIQUEMENT les cellules d'entrée (nombres et textes inline — une saisie utilisateur ne peut pas injecter de formule).
5. Écrit `WORKBOOK_VERSION_EXPECTED` (détection d'incompatibilité in-classeur, contrôle CHK_VERSION).
6. Recalcule RÉELLEMENT via LibreOffice headless : profil isolé par requête avec `OOXMLRecalcMode=0` (recalcul forcé au chargement), `--convert-to xlsx`, délai d'expiration `AURION_CALC_TIMEOUT_MS` (défaut 20 s, processus SIGKILL).
7. Lit toutes les sorties nommées ; une sortie absente ou non numérique ⇒ `INVALID_RESULT` (un échec est toujours signalé).
8. Vérifie les contrôles (17 CONTROLES) : `OUT_CONTROLS_STATUS ≠ OK` ⇒ `CONTROLS_FAILED` avec la liste des vérifications en échec.
9. Journalise la traçabilité (traceId, versions, durées, statut — jamais de données métier) et supprime le répertoire temporaire.

## 3 · Bascule contrôlée (Phases C/E) et retour arrière

`AURION_CALC_ENGINE` : `legacy` (défaut — aucun changement de comportement) | `dual` (double calcul comparé, divergence par divergence dans les logs `[calc-engine]`, résultat servi inchangé) | `xlsx` (le classeur sert les résultats ; toute erreur remonte — règle 12). Le retour à l'ancien moteur = repasser la variable à `legacy` sans redéploiement de code. Les écrans continue de se mettre à jour aux mêmes instants qu'avant.

## 4 · Fiabilité numérique

- Calcul en entiers (centimes, micro-unités 10⁻⁶, points de base) ; arrondi demi-vers-le-haut = `ROUND` Excel, identique à `roundHalfUp` BigInt du moteur applicatif (sur toutes les valeurs, y compris négatives : demi loin de zéro).
- Produits d'entiers bornés sous 2⁵³ ; les bornes réalistes sont vérifiées par des contrôles du classeur (CHK_MILEAGE_BOUND, CHK_COEFFICIENT_BOUND, CHK_SOLVER_GUARD). Bornes théoriques documentées dans le comparatif.
- Invariants vérifiés par le classeur ET par le moteur applicatif : HT+TVA=TTC ; encaissé+restant=total exigible ; Σ échéancier = total strict ; remise ≤ prix listé ; cumul des taux < 100 %.

## 5 · Déploiement et packaging

- Le classeur et le contrat vivent dans le dépôt : inclus dans le build, les archives et l'installation serveur ; le modèle ne contient aucune donnée personnelle.
- LibreOffice : installé au build npm (`tools/ensure-backend-deps.mjs`, 15.4.56) et dans `render.yaml` (best effort) ; présent dans la CI (tests de parité PDF). Sans LibreOffice, le moteur refuse clairement (`LIBREOFFICE_MISSING`) — l'ancien moteur reste la référence.
- Application installée : aucune dépendance à Excel sur le poste — tout le calcul classeur est serveur.
- Sauvegardes : le classeur est un fichier du dépôt (versionné avec le code) ; les données métier restent dans PostgreSQL (aucune migration SQL nécessaire — la traçabilité passe par les logs).

## 6 · Régénérer le classeur

```bash
python3 scripts/build-engine-workbook.py     # écrit classeur + mapping
cd backend && npm run build && node --test tests/calc-engine-parity.test.mjs
```
Toute évolution : mettre à jour `WORKBOOK_VERSION` dans le générateur ET `ENGINE_VERSION`/`engineRequires` dans `engine.ts` + mapping — le contrôle CHK_VERSION et le test de compatibilité refusent toute divergence.
