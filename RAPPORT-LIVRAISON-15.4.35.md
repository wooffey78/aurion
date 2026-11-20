# RAPPORT DE LIVRAISON — AURION 15.4.35 (version unique complète)

Date : 20 novembre 2026.
Entrées : `aurion-15.4.34-consolidee.zip` (base) + `Aurion-15.4.25.zip` (apports).
Sortie : **une seule version complète 15.4.35**, prête à être poussée sur GitHub puis
déployée automatiquement sur Render (`autoDeploy: true`).

## 1. Choix de fusion (traçabilité)

| Élément | 15.4.34-consolidée | 15.4.25 | Décision 15.4.35 |
| --- | --- | --- | --- |
| Réplication hors ligne, outbox, sync UI | ✔ (084-086) | ✘ | conservé (base) |
| Capacitor / Android | ✔ | ✘ | conservé (base) |
| CI GitHub + baseline + Dependabot | ✔ | ✘ | conservé (base) |
| Conversion cohorte, ventilation admin/VIP, résiliations | ✔ | ✔ (variante) | conservé (base, plus complet) |
| Fiches client émis/encaissé/reste à payer | ✔ (4 requêtes parallèles) | ✔ (variante) | conservé (base) |
| document-forecast multi-statuts | ✔ | ✔ (variante) | conservé (base) |
| Suppression de compte (migrations, service, console, page publique) | ✘ | ✔ | **porté** (migrations renumérotées 088/089) |
| Confirmation forte par mot de passe | ✘ | ✔ | **porté** |
| assetlinks Android | ✘ | ✔ | **porté** |
| Runner : collision de préfixes | ✘ (simple avertissement) | ✔ | **porté** + grant admin |
| Legal readiness version paramétrée | ✔ | ✔ (variante) | conservé (base) |
| Métiers/suggestions/cotisations/détection | 11 profils | (contribution partielle) | **étendus à 20 profils + NAF + TVA** |
| Dialogue de validation devis/factures | ✘ | ✘ | **ajouté** (consigne) |
| Curseur sombre | ✘ | ✘ | **ajouté** (consigne) |
| autoDeploy Render | false | ✘ | **activé** (consigne) |
| Juridique révisé | 14/11/2026 (15.4.30) | — | **révisé 20/11/2026** (15.4.35) |

## 2. Vérifications exécutées (environnement de recette)

- **PostgreSQL 17 réel** démarré localement (embarqué jetable), rôles créés
  strictement comme dans la CI (`aurion_runtime`, groupe `aurion_admin`, membre
  `aurion_admin_app`), migrations `001 → 089` appliquées via
  `AURION_MIGRATION_DATABASE_URL` : **« Migration terminée »**, droits runtime
  appliqués, dérogations historiques 042/044 signalées.
- **Suite backend complète sur cette base réelle : 517 tests — 513 pass, 0 skipped,
  4 échecs** :
  - 3 sont des échecs de référence du dépôt (baseline B0) : `Google production setup…`,
    `production migration command refuses…`, `tests/stripe-billing.integration.test.mjs` ;
  - 1 (`bloc3`, réexécution des migrations par le rôle administré) est **hérité de la
    15.4.34** : reproduit à l'identique sur la base 15.4.34 pure ; il dépend de la
    propriété des tables (le rôle administré n'est pas propriétaire dans
    l'environnement local). Le grant `CREATE ON SCHEMA public` ajouté au bootstrap du
    runner réduit l'écart (la réexécution passe l'étape schéma) ; la réussite totale
    de ce test exige que le compte d'administration soit propriétaire, comme en
    production.
- Typecheck `tsc --noEmit` : OK · Build : OK · Frontend : 45 fichiers OK ·
  ESLint `assets/js` : OK · Contrats fusion 15.4.35 : 16/16.
- Contrats mis à jour vers le comportement corrigé (jamais affaiblis) : step9,
  instant-refresh, strict-requirements, bloc8, dashboard-summary-parallel,
  home-delete.

## 3. Fichiers ajoutés

`backend/migrations/088_account_deletion_requests.sql`,
`backend/migrations/089_account_deletion_processing.sql`,
`backend/src/services/account-deletion.ts`,
`backend/src/routes/assetlinks.ts`,
`backend/tests/merge-15.4.35.contract.test.mjs`,
`public/account-deletion.html/.css/.js`,
`CHANGELOG-15.4.35.md`, `RAPPORT-LIVRAISON-15.4.35.md` (ce fichier).

## 4. Fichiers modifiés (principaux)

- Backend : `migrate.ts` (collision + grant), `app.ts` (allowedPath /public/,
  assetlinks), `routes/account.ts` (suppression + page publique + confirmation forte),
  `routes/admin.ts` (console suppressions), `routes/business.ts` (compteur rendez-vous,
  detect-profile NAF), `services/fiscal-detection.ts` (PROFILE_MICRO_CATEGORY),
  `services/micro-detection.ts` (+24 codes NAF, indices NAF→métier),
  `services/profiles.ts` (+8 métiers, suggestions élargies).
- Frontend : `core/api.js` (suppression + admin), `pages/dash/account.js` (section
  suppression + confirmation forte), `pages/dash/other.js` (console + compteur + pas
  de faux zéro), `pages/dash/quote.js` (dialogue de validation), `core/registry-fill.js`
  (TVA), `pages/onboarding.js` + `pages/dash/settings.js` (NAF vers suggestion),
  `css/app.css` (curseur), `public/account-deletion.css` (curseur).
- Déploiement/juridique/version : `render.yaml` (autoDeploy), `README.md`,
  `docs/RENDER-GITHUB.md`, `docs/CGU-CGV.md`, `docs/POLITIQUE-CONFIDENTIALITE.md`,
  `docs/COOKIES.md`, `docs/LEGAL-NOTICE.md`, `docs/DECLARATION-ACCESSIBILITE.md`,
  `VERSION.txt`, `package.json`, `backend/package.json`, `package-lock.json`,
  `backend/package-lock.json`, `sw.js`, `index.html`.
- Tests : 6 contrats mis à jour + `merge-15.4.35.contract.test.mjs`.

## 5. Procédure de publication (résumé opérationnel)

1. Créer/réutiliser le dépôt GitHub `wooffey78/aurion`, pousser `main` depuis une
   extraction propre (`tools/Publish-Aurion.ps1` refuse d'écraser un historique
   distant existant — première publication seulement).
2. La CI s'exécute à chaque push/PR (PostgreSQL 17 jetable, migrations réelles,
   rôles séparés, audit npm, navigateur Playwright).
3. Dans Render : « New → Blueprint », lier le dépôt ; le blueprint `render.yaml`
   crée/met à jour le service unique `aurion` (Francfort) avec `autoDeploy: true` —
   les secrets se saisissent dans le tableau de Render (jamais dans le dépôt).
4. Chaque push `main` après CI verte déclenche le déploiement ; `/health` (liveness)
   et `/health/db` (readiness) surveillent le service.

## 6. Limites (non masquées)

- Aucun push GitHub ni déploiement Render n'a été effectué depuis le bac à sable de
  fabrication (aucune clé d'accès) ; l'étape CI/CD se vérifie au premier push réel.
- `test:browser` (Playwright/Chromium) : non exécuté localement (téléchargement de
  navigateur hors périmètre de recette) ; la CI l'exécute, avec la référence B0 pour
  le timeout connu.
- Les 4 échecs détaillés au §2 sont documentés (3 baseline B0 + 1 hérité
  environnemental), reproduits et attribués.
- Aucun secret n'est inclus dans l'archive ; `node_modules`, `dist` et `.env` exclus.
