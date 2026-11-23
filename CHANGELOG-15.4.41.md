# CHANGELOG — Aurion 15.4.41

Version de consolidation de la 15.4.40, alignée sur le prompt maître « audit, correction, finalisation et déploiement ». Rien de ce qui fonctionnait n'a été dégradé : les corrections métier de la 15.4.40 (navigation devis/factures, création d'espace non bloquée par les documents contractuels, console d'administration sans pool dédié, connexion adaptative) sont conservées à l'identique et complétées.

## 1. Réconciliation Git ↔ archive (7 fichiers signalés)

État des lieux vérifié contre `main` (commit `2314c1a5`) :

- Les **4 fichiers « manquants » du dépôt GitHub** (`docs/DEPLOIEMENT-STAGING-15.4.38.md`, `tools/integration-skip-gate.mjs`, `tools/integration-skip-reporter.mjs`, `tools/parity-doctor.mjs`) sont **présents et fonctionnels dans l'archive** : leurs contrats de tests (`parity-doctor.contract.test.mjs`, `integration-skip-gate.contract.test.mjs`) passent dans la porte complète. Le dépôt GitHub les a perdus lors d'un push antérieur ; la livraison rétablira les quatre.
- Les **3 fichiers présents des deux côtés** (`aurion-ci.yml`, `docs/EXPLOITATION-SUPPORT.md`, `tools/Build-Source-Archive.ps1`) : la version de l'archive est la plus récente (exclusions keystore/jks/pem dans le script d'archive, chemin correct de `secrets:rotate`, alignement de ownership admin + porte d'intégration dans le workflow). Conservée.
- Correction du workflow : le job de la porte d'intégration reçoit `AURION_MIGRATION_DATABASE_URL` (nécessaire au rejou idempotent de migration par le rôle propriétaire, test bloc3).

## 2. Sécurité des dépendances — audit production à zéro

- `fast-xml-parser` 5.5.1 → **5.12.1** (vulnérabilité élevée corrigée ; usage vérifié : `electronic-invoice-validate.ts`, même API majeure).
- `@fastify/static` 10.1.7 → **10.1.12** (correctif glob/minimatch, même majeure).
- Override `gaxios` → `^7.1.4` : la version corrige la chaîne `rimraf→glob→minimatch` de `googleapis` (gaxios 7.1.4 retire rimraf). Résolu à **0 vulnérabilité** en production (`npm audit --prefix backend --omit=dev`), build et typecheck inchangés.
- Vulnérabilités restantes à la racine (`tar` critique, `@capacitor/cli` élevé, glob/minimatch/rimraf modérées) : **qualifiées** — toutes transitives de `@capacitor/cli`, outil de build Android **dev-only**, jamais installé sur Render ni inclus dans l'archive livrée. Correction recommandée : mise à niveau majeure de `@capacitor/cli` (P2, voir rapport d'avancement).

## 3. Scénarios de validation §11 renforcés

- **Nouveau test fonctionnel des six sections d'administration** (`backend/tests/admin-sections.functional.test.mjs`) : les 6 endpoints répondent 200 avec une forme d'état explicite (liste/tableau attendu, jamais d'erreur serveur), et reflètent des données réelles insérées (ticket avec jointures organisation/utilisateur, invité VIP, virement en attente, rétractation, suppression de compte) ; les indicateurs `/admin/stats` sont numériques et alimentés. Exécuté par la porte d'intégration.
- **Scénario e2e navigateur ajouté** : depuis l'écran « Devis & factures », les boutons « + Nouveau devis » et « + Nouvelle facture » changent réellement d'écran (reproduction du bug constaté sur Render, corrigé par le garde `pendingView`).
- Porte d'intégration CI exécutée localement de bout en bout : **127 tests, 0 ignoré, 0 échec**.

## 4. CI/CD

Le workflow `aurion-ci.yml` de l'archive couvre les étapes obligatoires (installation propre, build, typecheck, audit production, rôles PostgreSQL, migrations par le rôle propriétaire, alignement du rôle d'administration, porte d'intégration avec rapport artefact, navigation des vues, porte B0 complète, packaging + artefact archive). La porte d'intégration et l'audit ont été rejoués localement avec les mêmes commandes que le workflow. Aucune étape obligatoire n'est sautée ; les skips sont interdits par contrat (`ci-gate-policy.contract.test.mjs`, `integration-skip-gate.contract.test.mjs`).

## 5. Version

`VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, lockfiles, `index.html` et `sw.js` harmonisés en **15.4.41** (contrat générique de versions, plus aucune version codée en dur).
