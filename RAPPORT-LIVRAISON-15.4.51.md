# RAPPORT DE LIVRAISON 15.4.51 — prompts appliqués + correctif boutons

> Date : 23 novembre 2026. Livraison consolidée : correctif critique « boutons inertes »
> (15.4.50-r2) + application, en code, des phases A→F du document
> « AURION-15.4.50-PROMPTS-70-vers-100.md ». Méthode du dépôt respectée : audit factuel
> préalable, migrations additives, tests avant/après exécutés, statuts honnêtes.

## 1. Correctif boutons (cause racine prouvée)

- **Symptôme** : tous les boutons inertes dans l'installation locale (accueil, cartes, authentification).
- **Diagnostic** (reproduction navigateur réelle, Playwright/Chromium, fichiers servis tels quels) :
  `SyntaxError: Unexpected identifier 'as'` dans `assets/js/core/charts.js` — casts TypeScript
  `(expr) as number[]` (lignes 77, 78, 107) collés dans un module ESM navigateur. Le parse du
  module échoue → **toute la chaîne d'import de main.js s'effondre** (dashboard → other → charts) →
  l'application ne démarre jamais : la landing statique d'index.html reste affichée sans aucun
  gestionnaire. Aucun test automatisé 15.4.50 ne couvrait le parse navigateur (l'E2E exige PostgreSQL).
- **Correctif** : filtrage JS valide (3 occurrences), commentaire d'origine conservé.
- **Preuves avant/après** (reproduction navigateur) :
  - avant : `pageerror Unexpected identifier 'as'` ×3, formulaire d'auth invisible après « Commencer », coquille dashboard non montée, boutons morts ;
  - après : `installGridHiddenNative:true`, `authVisibleApresCommencer:true`, `installHelpModal:true`, navigation vérifiée par clics réels : « + Nouveau devis »→écran devis, « + Nouveau client »→Clients, carte Tickets→Support Aurion, carte Entrées→Trésorerie prévisionnelle — **zéro erreur console/page**.
- **Hardening connexe** : `config.js` — la déviation API vers `127.0.0.1:4000` ne s'applique plus à toute installation locale servie sur un port ≠ 4000 (elle cassait l'API entière sur ces installations) ; réservée aux ports de développement 5500/5173/3000 (alignés CORS_ORIGIN). Test bloc1 conservé sans modification du contrat.
- **Non-régression structurelle** : nouveau test de contrat « Navigation » refusant tout cast TypeScript dans le CODE front (commentaires exclus).

## 2. Phases appliquées (code livré) et statuts

| Phase | Livré (FAIT) | Reste (NON FAIT / BLOQUÉ-éditeur) |
|---|---|---|
| A — recettes prod | A4 supervision lettres mortes (listing admin, alerte quotidienne e-mail, /health enrichi), A5 script backup-nightly + procédure cron, A2 test de recette PG gated, A7 GO-LIVE-15.4.51.md | Exécution console : provisionnement OVH/Render, restauration tracée, première sauvegarde réelle, supervision externe |
| B — 4 branchements | B1 route+encart fiabilité ; B2 garde-fou dérive serveur + justification horodatée (migr. 119) + fenêtre UI ; B3 maillon d'intégrité à l'émission + bouton « Intégrité » ; B4 page publique portail + panneau de gestion | Recette navigateur du parcours portail **avec PostgreSQL réel** (E2E) ; la dérive n'est aujourd'hui déclenchée que si des rubriques divergent (plumbing reservé aux flux futurs) |
| C — mentions | Porte bloquante identity/insurance/mediator (`422 MENTIONS_INCOMPLETES`), snapshot (migr. 120), pré-vérification UI, référentiel MENTIONS-OBLIGATOIRES.md, check:legal étendu | Validation juridique externe du référentiel |
| D — légal 5.0 | CGU + politique 5.0 (8 nouvelles sections), DPA-RGPD.md, registre, sous-traitants, `legalDocumentsReadyForContracts` 5 catégories, acceptance-status/accept + bannière re-acceptation | Publication (variables d'identité + approbation 5.0) et validation juridique externe |
| E — commercial | Jeu de démo gardé-fou (db:demo), guide démarrage, SLA support, tarifs + argumentaire, runbook Stripe | Configuration console Stripe (produits/prix/webhook), mode test |
| F — pilote | Contrat pilote, tableau de suivi, 7 critères go/no-go | Recrutement, 12 semaines de conduite, décision |

## 3. Vérification (résultats réels, environnement sans PostgreSQL)

| Commande | Résultat |
|---|---|
| `npm run build` | ✔ exit 0 |
| `npm run typecheck` | ✔ exit 0 |
| `npm --prefix backend test` (suite complète) | **723 tests : 638 pass, 16 fail, 69 skipped** |
| Analyse des 16 échecs | **Ensemble strictement identique à la baseline 15.4.50** (bloc7/8/10/14/24, v2×6, 15.4.45, cloud-storage.integration, fiscal-detection-2026, local-parity, profiles-catalogue — échecs environnementaux PostgreSQL/jdk préexistants) → **zéro régression** |
| `npm run test:smoke` | ✔ exit 0 |
| `npm run test:frontend` | ✔ exit 0 |
| `npm run lint:frontend` (eslint) | ✔ exit 0 |
| `npm --prefix backend run check:legal` | ✔ porte 5.0 active, mentions bloquantes **cohérentes** (3 clés documentées), 0/6 documents publiables (attendu : variables d'identité = éditeur) |
| Reproduction navigateur (boutons) | ✔ tous les parcours cliqués réellement, 0 erreur |
| Page portail en navigateur | ✔ titre client, carte devis + montant, modal d'acceptation, confirmation horodatée, 0 erreur |

Évolution du nombre de tests : 721 (15.4.50) → **723** (+ tests A/B/C/D livrés ; la recette PG s'ajoute à l'exécution avec PostgreSQL). Tests modifiés (contrats alignés sur l'évolution documentée) : legal-publication-version (5.0+DPA), merge-15.4.35 (versions 5.0 tracées), document-delivery-feedback (champ `integrityRecorded`), fixture CI stripe (5 catégories).

## 4. Fichiers ajoutés / modifiés (principaux)

- **Backend** : services/mention-gate.ts (nouveau), services/integrity-chain.ts (canonique + recordDocumentIntegrity), routes/business.ts (3 routes + émission gardée), routes/health.ts, routes/admin.ts, routes/account.ts, routes/maintenance.ts (réexport), services/scheduler.ts (alerte), services/account.ts (5.0+DPA+statut), config.ts (2 variables), migrations 119/120, scripts/backup-nightly.mjs + demo-dataset.mjs (nouveaux), scripts/check-legal-readiness.mjs (5.0+cohérence), tests ×4 nouveaux + 3 mis à jour.
- **Frontend** : pages/portal.js (nouveau), pages/dash/clientsheet.js (fiabilité + portail), pages/dash/docs.js (intégrité + émission gardée), pages/dashboard.js (bannière légale), core/api.js (11 méthodes), core/config.js (hardening port), main.js (route portail), index.html/sw.js (cache 15.4.51-r1), css portail.
- **Docs** : DPA-RGPD.md, REGISTRE-TRAITEMENTS.md, MENTIONS-OBLIGATOIRES.md, GO-LIVE-15.4.51.md, GUIDE-DEMARRAGE-CLIENT.md, TARIFS-ABONNEMENT.md, COMMERCIAL-ARGUMENTAIRE.md, CONFIGURATION-STRIPE.md, CONTRAT-PILOTE.md, PILOTE-SUIVI.md (nouveaux) ; CGU-CGV/POLITIQUE-CONFIDENTIALITE/SOUS-TRAITANTS/RUNBOOK-PRODUCTION/EXPLOITATION-SUPPORT (mises à jour) ; CHANGELOG-15.4.51.md.

## 5. Limites assumées et dépendances éditeur

1. **Recettes de production** (A1/A3, restauration, sauvegarde réelle) : exigent les accès consoles — scripts et runbooks livrés, cases GO-LIVE prêtes à cocher avec preuves.
2. **Recette PG réelle** (A2) : test livré et gated ; exécution à faire sur base jetable (aucun PostgreSQL dans l'environnement de livraison).
3. **E2E navigateur complet** (inscription → onboarding → conversion) : exige PostgreSQL migré — les nouveaux contrôles (mentions bloquantes) interagiront avec ce parcours : **à rejouer impérativement** avant ouverture commerciale (la pré-vérification UI et le parcours guidé sont censés fournir un SIRET ; tout ajustement du fixture serait documenté à ce moment).
4. **Publication légale** : 0/6 documents publiables tant que les variables d'identité et l'approbation 5.0 ne sont pas renseignées — comportement fermé voulu ; `check:legal` liste exactement les blocages.
5. **Blocage dur des écritures** sans acceptation des documents 5.0 : mécanisme d'acceptation livré (statut + endpoint + bannière), le verrou serveur type `LEGAL_ACCEPTANCE_REQUIRED` reste une décision d'éditeur distincte (point d'insertion : plugins/auth.ts).
6. **Stripe / pilote** : exécution console et conduite humaine — artefacts livrés, critères chiffrés écrits à l'avance.
