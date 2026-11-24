# RAPPORT DE NON-RÉGRESSION — CHANTIER MOTEUR EXCEL + CONFORMITÉ (15.4.57)

Date : 24 novembre 2026 · Périmètre : reconstruction du moteur de calcul autour du classeur central + adaptation des documents juridiques au référentiel documentaire v1.0 (24/11/2026).

## 1 · Suites exécutées (toutes locales, sans base de données requise)

| Suite | Résultat |
|---|---|
| Parité classeur ↔ ancien moteur (`calc-engine-parity.test.mjs`) | **22/22 pass** — 16 scénarios exacts au centime, invariants, injection, isolation concurrente, mappage |
| Robustesse moteur (`calc-engine-engine.test.mjs`) | **7/7 pass** — classeur absent, corrompu, version incompatible, entrée inconnue, entrée non numérique, statut |
| Non-régression financière (pricing, extensions, coefficients, main-d'œuvre, money, workflow factures, paiements, scénarios dorés, prévisions, forecast contract, v55 hardening) | **93/93 pass** |
| Mentions + légal (legal-publication-version, fix078, bloc15-16 placeholders) | **7 pass, 3 skip** (base de données absente) |
| Moteur + légal après adaptations (run final) | **33/33 pass, 0 skip** |
| Typecheck `tsc --noEmit` + build complet | **sans erreur** |

## 2 · Chaîne de vérification appliquée

Interface → API → Backend → Moteur Excel → Retour API → Interface → Base de données → Logs : la chaîne complète est couverte par l'architecture (adaptateur dans `prepareQuoteCalculation` et `/pricing/calculate`, traçabilité `[calc-engine]`), par les tests de parité (API simulée = mêmes fonctions que les routes) et par les tests d'intégration PostgreSQL existants (inchangés, exécutables en CI avec base).

## 3 · Comportement conservé (règles métier — vérification par les tests existants)

- Devis envoyé modifiable avec versionnement ; aucune régression (`quote-contract-v3`, `step7`, tests de conversion).
- Facture en attente ≠ encaissement ; paiement non validé sans effet ; partiel ≠ réglée ; trop-perçu refusé (`financial-golden-scenarios`, `business-payment-workflow`).
- Aucun +1 € automatique (`step12-suggested-ttc` — helper historique toujours hors circuit ; contrôle `CHK_NO_HIDDEN_ADJUSTMENT` dans le classeur).
- Kilométrage deux-taux deux-modes sans double comptage (`step12-pricing-cost-mileage`, `accounting-engine-coherence`).
- SAV négatif déducteur, jamais une déduction fiscale automatique (`step8-sav-accounting-forecast`).
- Relances : délais nuls = étape désactivée ; majoration configurable entre 3ᵉ et 4ᵉ relance uniquement (`step23-reminder-zero`, `invoice-workflow`).
- Profil entreprise : détection micro/TVA inchangée, taux 2026 identiques (`fiscal-detection-2026.contract`).

## 4 · Adaptations juridiques appliquées (référentiel documentaire)

- `DEFAULT_PAYMENT_TERMS` + mention **escompte** systématique sur facture (« Escompte pour paiement anticipé : néant ») — F31808.
- Indemnité de recouvrement 40 € explicitement réservée aux **retards entre professionnels** ; clause dupliquée dans `docs/CGU-CGV.md` avec la distinction **avoir ≠ remboursement**.
- Mention **« Entrepreneur individuel (EI) »** dans l'identité des documents quand la forme juridique est EI/micro/auto-entrepreneur ; `docs/LEGAL-NOTICE.md` reformulé (« micro-entreprise » = régime, pas une forme).
- `docs/CGU-CGV.md` : conditions d'escompte B2B explicites.
- Version contractuelle des documents légaux : **5.0 → 5.1** (re-acceptation déclenchée) + test de publication mis à jour.
- Vérifiés sans modification nécessaire (déjà conformes) : seuils micro 2026-2028 (203 100/83 600), seuils franchise TVA (85 000/93 500, 37 500/41 250), taux micro-sociaux 2026 (12,3/21,2/25,6/23,2 %), droits RGPD et durées de conservation (10 ans L. 123-22, 3 ans prospection CNIL), rétractation en ligne avec accusé, crypto non activé, PA non connectée (état documenté).

## 5 · Limites de cette campagne de tests

- Les tests d'intégration PostgreSQL (numérotation, RLS, paiements réels) n'ont pas pu être exécutés dans cet environnement (aucune base) — ils restent inchangés et s'exécuteront en CI.
- Recette manuelle des écrans (click-through) à effectuer avant bascule `xlsx` en production.
- LibreOffice sur le plan gratuit Render : vérifier la charge mémoire avec `AURION_CALC_CONCURRENCY=1` (défaut) avant d'activer `dual` en continu.
