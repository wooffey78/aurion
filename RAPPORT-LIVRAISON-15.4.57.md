# RAPPORT DE LIVRAISON — 15.4.57 (chantier moteur Excel + conformité documentaire)

Date : 24 novembre 2026 · Précédente : 15.4.56 (live) · **Poussée GitHub / déploiement Render : NON exécutés** (règle 13 du référentiel de chantier — demande distincte requise).

## 1 · Objet

1. Adapter les documents juridiques Aurion existants au référentiel documentaire fourni (23 fichiers, v1.0 du 24/11/2026).
2. Exécuter le chantier « reconstruction du moteur de calcul Aurion autour d'un classeur Excel central » selon les 10 étapes imposées, sans modifier le fonctionnement métier.

## 2 · Livrables (§14 du référentiel de chantier)

| # | Livrable | Emplacement |
|---|---|---|
| 1 | Classeur `.xlsx` intégralement renseigné | `backend/assets/engine/aurion-moteur-calcul.xlsx` (v1.0.0) |
| 2 | Formules de tous les domaines | classeur (18 feuilles) + `docs/MOTEUR-EXCEL-FEUILLES-FORMULES.md` |
| 3 | Dictionnaire de correspondance | `backend/assets/engine/engine-mapping.json` (89 entrées, 140 sorties, 10 tables) |
| 4 | Moteur d'exécution | `backend/src/services/calc-engine/engine.ts` |
| 5 | Adaptateurs de communication | `calc-engine/xlsx-io.ts`, `pricing-adapter.ts`, `routes/calc-engine.ts` |
| 6 | Tests automatisés | `backend/tests/calc-engine-parity.test.mjs`, `calc-engine-engine.test.mjs` |
| 7 | Scénarios de référence | 16 scénarios dans le test de parité + scénarios dorés existants |
| 8 | Rapport comparatif ancien/nouveau moteur | `docs/MOTEUR-EXCEL-COMPARATIF.md` |
| 9 | Documentation technique du moteur | `docs/MOTEUR-EXCEL-TECHNIQUE.md` |
| 10 | Documentation des feuilles et formules | `docs/MOTEUR-EXCEL-FEUILLES-FORMULES.md` |
| 11 | Liste des fichiers modifiés | ci-dessous §4 |
| 12 | Rapport de non-régression | `docs/MOTEUR-EXCEL-NON-REGRESSION.md` (+ `MOTEUR-CALCUL-AUDIT.md` pour l'inventaire) |
| 13 | Archive complète du projet | `download/AURION-15.4.57-MOTEUR-EXCEL.zip` (Aurion uniquement) |

## 3 · Avancement du chantier — estimation honnête : **75 %**

**Terminé et vérifié (Étapes 1→8)** : audit complet (inventaire de 16 domaines de calcul) ; conception du classeur et du dictionnaire ; classeur généré avec formules réelles et contrôles ; intégration à l'arborescence (backend assets, packaging) ; service d'exécution complet (instances isolées, recalcul réel LibreOffice, contrôles, concurrence, timeout, erreurs typées, statut) ; adaptateurs et communication (contrat unique, jamais dupliqué) ; double calcul et parité **exacte au centime sur 16/16 scénarios** ; tests automatisés verts (22/22 moteur + 93/93 non-régression financière + 33/33 final) ; adaptations juridiques appliquées et testées ; documentations rédigées ; archive fournie.

**Restant à réaliser (Phases E/F + industrialisation)** : période de double calcul `dual` sur l'environnement réel (déploiement non autorisé ici) ; recette manuelle des écrans avant bascule ; validation de la charge LibreOffice sur le plan Render gratuit ; bascule `xlsx` en production (Phase E) puis stabilisation avec l'ancien moteur en repli (Phase F) ; portage complet feuille par feuille des agrégats multi-documents en scénarios de parité SQL (les formules sont écrites et unitairement testées, la comparaison automatisée contre `monthlyAccounting` réel nécessite une base) ; recette Playwright du carrousel et des écrans ; retrait éventuel de l'ancien moteur (Phase F, après validation définitive).

**Limites techniques documentées** : bornes de représentabilité entière d'Excel (2⁵³) encadrées par des contrôles ; sommes mensuelles float64 vs `numeric` PostgreSQL (indiscernable après arrondi d'affichage) ; le moteur classeur n'est pas adapté au recalcul à chaque frappe clavier (≈ 1 s par recalcul) — l'éditeur conserve la copie navigateur générée, garantie paritaire ; détection de profil par NAF et fiabilité de paiement restent applicatives (heuristiques, non portées dans un classeur).

## 4 · Fichiers modifiés ou ajoutés

**Ajoutés** : `backend/assets/engine/aurion-moteur-calcul.xlsx` ; `backend/assets/engine/engine-mapping.json` ; `backend/src/services/calc-engine/{engine,xlsx-io,pricing-adapter}.ts` ; `backend/src/routes/calc-engine.ts` ; `backend/tests/{calc-engine-parity,calc-engine-engine}.test.mjs` ; `docs/MOTEUR-CALCUL-AUDIT.md`, `docs/MOTEUR-EXCEL-{TECHNIQUE,FEUILLES-FORMULES,COMPARATIF,NON-REGRESSION}.md` ; `CHANGELOG-15.4.57.md` ; `scripts/build-engine-workbook.py` (+ `scripts/wb_parts/`).

**Modifiés** : `backend/src/routes/business.ts` (adaptateur + import) ; `backend/src/app.ts` (route diagnostics) ; `backend/src/services/mentions.ts` (escompte, EI, formulation B2B) ; `backend/tests/legal-publication-version.contract.test.mjs` (5.1) ; `backend/src/services/account.ts` (version contractuelle 5.1) ; `docs/CGU-CGV.md`, `docs/LEGAL-NOTICE.md` ; `package.json`, `backend/package.json`, `VERSION.txt`, `sw.js`, `index.html`, `assets/js/main.js` (bump 15.4.57).

## 5 · Déploiement (à la demande)

Aucun push ni déploiement effectués. Pour activer : pousser la branche sur GitHub (autoDeploy Render), puis définir `AURION_LEGAL_PUBLICATION_APPROVAL=5.1` et, après la période de double calcul, `AURION_CALC_ENGINE=dual` puis `xlsx` (variables d'environnement Render ; LibreOffice est déjà installé au build depuis 15.4.56).
