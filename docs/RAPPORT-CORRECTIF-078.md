# Rapport du correctif « Échec de migration 078 » — Aurion 15.4.20

> Application du prompt correctif issu du diagnostic du 14 novembre 2026 (base `aurion-15_4_20__1_.zip`), phases A à H, avec preuves exécutées. **Aucune migration existante (001 à 083) n'a été modifiée ; aucun test n'a été supprimé ; aucun point n'est déclaré corrigé sans preuve exécutée.** Le paquet compilé remplace la livraison précédente ; l'empreinte SHA-256 figure en fin de rapport.

## Cause racine et correctif (Phase A)

La migration 078 exécute `create policy … to aurion_runtime` et `grant … to aurion_runtime` : sur une installation neuve, le rôle n'existe ni dans les migrations, ni dans l'installateur (seuls la CI et une procédure manuelle le créaient). Le journal du diagnostic (072-077 OK, 078 en échec, transaction annulée) a été **reproduit à l'identique** sur un cluster PostgreSQL vierge avant correction, dans le contexte exact de l'installation locale (initdb `aurion_admin`, provision du rôle applicatif, migrations via le rôle applicatif).

Correctifs appliqués :

- `backend/src/migrate.ts` : bootstrap **idempotent** des rôles référencés en dur par les migrations (`aurion_admin`, `aurion_runtime`, et `AURION_RUNTIME_DB_ROLE` si défini), créés **NOLOGIN** avant l'application du moindre fichier de migration. Si le compte de migration n'a pas le droit de créer les rôles, échec explicite `BOOTSTRAP_ROLE_IMPOSSIBLE` avec instruction (exécuter les migrations via `AURION_MIGRATION_DATABASE_URL`).
- `scripts/Install-Aurion.ps1` : `DATABASE_URL` génère l'utilisateur `aurion_runtime` (application), `AURION_MIGRATION_DATABASE_URL` le superutilisateur `aurion_admin` (migrations uniquement), et `AURION_RUNTIME_DB_ROLE` est toujours le rôle réellement utilisé par `DATABASE_URL` (y compris lors d'une mise à jour d'une installation existante). La compilation locale est sautée lorsque le paquet précompilé est à jour (`Test-BuildFresh`).

Preuves exécutées (cluster vierge, PostgreSQL embarqué réel) :

| Scénario | Résultat |
|---|---|
| Reproduction avant correctif (état « installation ») | `[AURION MIGRATE] ECHEC 078 — role "aurion_runtime" does not exist` |
| Bootstrap sur base neuve, migrations via `aurion_admin` | 80/80 migrations OK, `aurion_runtime` créé `rolcanlogin=false`, rejeu idempotent (80 « déjà appliquée ») |
| Séparation des rôles (`aurion_admin` migrations / `aurion_runtime` application) | droits runtime appliqués ; propriétaire des tables `aurion_admin` ; RLS active ; lecture sans contexte tenant = 0 ligne (échec fermé) ; `schema_migrations` inaccessible au rôle applicatif |
| Migrations via le rôle applicatif sans compte administrateur | échec explicite `BOOTSTRAP_ROLE_IMPOSSIBLE` **avant** tout fichier (0 migration appliquée) |

## Phases B à G — correctifs et preuves

**Phase B (textes juridiques et résidus).** Les huit fichiers DRAFT juridiques (`docs/`, `legal/`) sont supprimés : plus aucune référence dans le code, et le risque de publier une version périmée disparaît. Les résidus de la technologie retirée sont nettoyés dans les documents actifs (`ARCHITECTURE-PRODUCTION.md` : section renommée « Génération automatique de contenu » avec garde-fou conservé ; `DESIGN.md` ; `AVANCEMENT-15.4.0.md`) et dans les commentaires de `backend/tests/bloc12-bordereaux.test.mjs` (la logique de garde reste intacte). Le CHANGELOG et les rapports de livraison datés restent des historiques et ne sont pas réécrits. `package.json` racine et backend portés à 15.4.20 (`VERSION.txt` était déjà à jour). Le dossier juridique `docs/Aurion-15.4.20-Textes-juridiques-4.0.docx` est intégré à l'archive.

**Phase C (documents ; arbitrage D-b « refus avec message »).** Le logo WebP — accepté au téléversement mais jamais affiché par les moteurs PDF/DOCX/ODT — est désormais **refusé avec message explicite** aux trois points d'entrée (route `POST /organization/logo`, parcours d'accueil, Paramètres → Logo) ; PNG et JPEG restent acceptés. Preuve exécutée : WebP → 400 avec message nommant le WebP et les formats PDF, DOCX et ODT ; PNG → accepté, servi puis supprimable. L'identité émettrice (D-a : **aucun retrait**, avis juridique requis avant toute modification) est vérifiée présente dans les trois formats générés — SIRET retrouvé dans le PDF (flux décompressés, texte hexadécimal TJ reconstitué), dans `word/document.xml` du DOCX et dans `content.xml` de l'ODT — et les hauteurs d'encart calculées au texte sont éprouvées par une génération à textes longs (40 pièces aux désignations étendues, garantie et CGV multipliées : pagination automatique en ≥ 2 pages).

**Phase D (calculateur et encart de pièces).** La barre de défilement du calculateur existante est vérifiée dans le CSS (`.calculation` : `max-height: calc(100vh - 130px)` + `overflow-y: auto`). L'encart de pièces du devis, sans règle dédiée jusqu'ici, reçoit un conteneur de défilement horizontal (`.lines-scroll`) qui préserve les quatre colonnes (désignation, quantité, achat interne, vente client) sur écran étroit au lieu de les comprimer. Contrôle frontal : 38 fichiers vérifiés par `node --check` + résolution imports/exports.

**Phase E (logo à l'accueil).** Le défaut signalé — variable `chosen` locale à `stepLogo` — est corrigé : le fichier choisi vit dans l'état du parcours (`state.logoFile`), un aller-retour « Précédent » ne le perd plus, l'étape re-rendue affiche « Logo sélectionné à l'étape précédente », et le message d'erreur avec réessai reste en place. Le test existant `onboarding-step3.test.mjs` est mis à jour vers le contrat corrigé (intention conservée : l'étape écrit dans les entités lues par Paramètres et « Mon compte »). La reproduction est intégrée au parcours navigateur Playwright (refus WebP affiché, sélection persistante après « Précédent », enregistrement réussi).

**Phase F (détection fournisseur par nom) + correction réelle découverte.** La détection est prouvée de bout en bout sur un **registre simulé** : `POST /data-import/preview` sur un fichier `fournisseurs.json` — variante d'accents et de casse d'un fournisseur existant (détectée par nom normalisé), deuxième fournisseur détecté par e-mail, fournisseur inconnu proposé à la création, doublon interne aux fichiers importés signalé ; puis `POST /data-import/commit` — mise à jour d'une fiche et création d'une seule nouvelle fiche vérifiées en base. **Ce test a révélé un défaut RLS réel** : `commitAbsorption` ouvrait sa transaction sans le tenant courant (`db.connect()` + `begin` nu) — toute écriture d'import échouait fermé et les mises à jour « ne trouvaient » jamais la fiche ciblée. Corrigé avec `beginTenant(conn)` dans `backend/src/routes/data-import.ts`.

**Phase G (observabilité).** Aucun service de suivi d'erreurs connecté tant que la décision **D6** n'est pas tranchée ; la page publique « Sécurité et contrôles » publie l'état exact (« absente », décision D6 nommée).

## Arbitrages appliqués (décisions de l'éditeur restées ouvertes)

| Décision | Choix appliqué |
|---|---|
| D-a Identité émettrice | Conservée (aucun retrait) ; présence vérifiée dans les documents ; avis juridique requis avant toute évolution |
| D-b Logo WebP | Refus avec message (option recommandée du diagnostic) |
| D-c Numérotation juridique | Version de publication interne inchangée (2.3) ; le dossier « 4.0 » est un document de travail livré dans `docs/` |
| D-d Fichiers DRAFT | Suppression (alternative « aligner » écartée : duplication sans valeur) |
| D-e Compilation | Paquet précompilé (`backend/dist` inclus + `dist/.version`) ; compilation locale sautée si à jour |
| D-f Défilement des pièces | Défilement horizontal adapté au texte implémenté (grille 4 colonnes préservée) |
| D6 Sentry | Non connecté ; état exact publié sur `/transparency` |

## Validation (Phase H)

Exécutée sur base PostgreSQL neuve (embarquée, port dédié) : migrations ×2 idempotentes via la séparation de rôles corrigée, puis `npm run check` — **exit 0** : build TypeScript, typecheck, contrôle frontal (38 fichiers), lint, fumée **79/79**, parcours navigateur Playwright (inscription → parcours d'accueil 8 étapes avec reproduction WebP/persistance du logo → navigation des vues → reconnexion) — et `npm test` — **exit 0 : suite intégrale 448/448, 0 échec, 0 ignoré** (9 nouvelles preuves comprises). Fichier de preuves dédié : `backend/tests/fix078-correctif.test.mjs` (9/9).

## Fichiers modifiés

- `backend/src/migrate.ts` — bootstrap idempotent des rôles + échec explicite.
- `backend/src/routes/data-import.ts` — `beginTenant(conn)` sur la transaction du commit (correctif RLS).
- `backend/src/services/transparency.ts` — preuve D6 explicite sur l'observabilité.
- `backend/src/services/document-layout.ts` — commentaire du rasterLogo aligné sur le refus WebP.
- `scripts/Install-Aurion.ps1` — séparation des rôles, saut de compilation si `dist` à jour.
- `assets/js/pages/onboarding.js` — `state.logoFile`, refus WebP, commentaires neutralisés.
- `assets/js/pages/dash/storage.js` — refus WebP (Paramètres → Logo).
- `assets/js/pages/dash/quote.js` + `assets/css/app.css` — conteneur de défilement horizontal de l'encart de pièces.
- `package.json`, `backend/package.json` — version 15.4.20.
- Tests : `backend/tests/fix078-correctif.test.mjs` (nouveau), `backend/tests/onboarding-step3.test.mjs` (contrat logo mis à jour), `backend/tests/frontend-browser.e2e.mjs` (étape logo : reproduction WebP + persistance), `backend/tests/bloc12-bordereaux.test.mjs` (commentaires).
- Documents : `CHANGELOG-15.4.0.md`, suppression des 8 DRAFT, nettoyage de 3 documents actifs, ajout du dossier juridique docx.
- Aucune migration 001-083 modifiée ; aucun test supprimé.
