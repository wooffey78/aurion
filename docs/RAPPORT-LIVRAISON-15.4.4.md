# Rapport de livraison — Aurion 15.4.4 (Bloc 5 : e-reporting — données de transaction et de paiement)

Date : 14 novembre 2026. Base : archive **aurion-15.4.3.zip** livrée (blocs 1, 2, 3, 4, 6 et 17 partiel), conformément à la règle de continuité (le dernier ZIP livré est l'unique base du bloc suivant — extraite et vérifiée, version 15.4.3, typecheck et lint verts avant toute modification). Version livrée : **15.4.4**.
Ce rapport recense les travaux du **BLOC 5 — E-reporting, données de transaction et paiement** du prompt maître V2, la vérification doctrinale préalable, les fichiers touchés, la migration, les tests réellement exécutés avec leurs commandes et résultats exacts, les anomalies rencontrées et corrigées, et les limites restantes. Rien n'est déclaré « fonctionnel » sans vérification exécutée.

## 1. Cadre réglementaire appliqué (vérification doctrinale préalable)

- Doctrine officielle **consultée et vérifiée le 14 novembre 2026** : impots.gouv.fr (« E-Reporting Requirements for Foreign Companies Without Permanent Establishment », page « I want to understand electronic invoicing ») et références du prompt (BOFiP ACTU-2026-00145 du 30 septembre 2026, « Obligation de transmission à l'administration des données de transaction et de paiement »).
- **Deux composantes** confirmées : données de **transaction** et données de **paiement**.
- **Périmètre confirmé** : ventes/prestations en relation avec un **non-assujetti** (B2C) dues de TVA française ; opérations B2B avec un **assujetti non établi en France** lorsque la TVA française est due. **Exclusions confirmées** : opérations exonérées de TVA (exportations, livraisons intracommunautaires, art. 261 à 261 E du CGI dispensées de facturation), importations de biens, contrats défense/sécurité ; le **B2B domestique** (assujetti établi en France) relève de l'émission électronique (bloc 4) et non de l'e-reporting de transaction.
- **Échéances confirmées** : 1er septembre 2026 (GE/ETI et assujettis isolés) ; **1er septembre 2027 pour les micro-entreprises et PME** (option d'anticipation possible). Les données de facture ne sont pas déposées quotidiennement : périodicité **mensuelle ou trimestrielle** selon le régime de TVA.
- **Données de paiement confirmées** : date de collecte, montant collecté (par taux), numéro de facture lorsque la TVA devient exigible au paiement (services, acomptes).
- Aurion reste un logiciel de gestion **compatible connecté à une plateforme agréée (PA)** — jamais une PA lui-même, aucune transmission directe à l'administration fiscale, aucune prétention d'immatriculation (règle inchangée depuis le bloc 3).

## 2. Environnement de vérification

| Élément | Valeur |
|---|---|
| Node.js | v24.22.2 (exigence ≥ 22.16.0) |
| PostgreSQL | 18.6 réel (embarqué), base `aurion_test` reconstruite à neuf puis chaîne complète 001→077 appliquée **deux fois** (idempotence vérifiée) ; rôles distincts `aurion_test` (migration, propriétaire), `aurion_runtime` (applicatif), `aurion_admin_app` (administration, membre de `aurion_admin`) |
| RLS | 71 politiques `tenant_isolation` actives (68 en 15.4.3 + 3 nouvelles tables du bloc 5) |
| Serveur PA de recette | HTTP réel sur la boucle locale (contrat sortant `generic` signé HMAC, accusés signés, déduplication par identifiant de transmission, formats contrôlés) — **aucune PA contractuelle connectée** |
| Navigateur | Chromium headless (Playwright 1.56.1), parcours E2E complet de `npm run check` |
| Mode de validation | `node tools/verify-b0-baseline.mjs` avec `AURION_BASELINE_STRICT=1` |

## 3. BLOC 5 — Ce qui a été construit

### 3.1 Matrice de périmètre sans inférence (`services/electronic-ereporting-matrix.ts`, module pur)

| Situation | Traitement | Motif porté dans le flux |
|---|---|---|
| Client non-assujetti (particulier), TVA française due | Dans le périmètre | `b2c_domestic_transaction` / `b2c_domestic_payment` |
| Client assujetti non établi en France, TVA française due | Dans le périmètre | `b2b_international_transaction` / `b2b_international_payment` |
| Client assujetti établi en France | Exclu (émission bloc 4) | `einvoicing_b2b_domestic` |
| Exonération déclarée (motif obligatoire) | Exclu | `exempt_declared` |
| TVA non facturée (franchise en base, taux 0) | Exclue de l'e-reporting de transaction | `vat_not_billed` |

- Le classement s'appuie **exclusivement sur des déclarations utilisateur** : catégorie d'acheteur (`assujetti_fr` | `assujetti_etranger` | `non_assujetti`), code pays ISO 3166-1 alpha-2 et numéro de TVA/identifiant fiscal étranger sur la **fiche client** ; exonération + motif sur la **facture** (instantané du document historique). Non renseigné = **écart signalé**, jamais de classement automatique, jamais de valeur inventée.
- La matrice est un **module pur** (aucun accès base/stockage) : logique réglementaire testée isolément, comme les validateurs UBL/CII du bloc 4.

### 3.2 Déclarations par période (`services/electronic-ereporting.ts`, `routes/pa-ereporting.ts`)

| Fichier | Rôle |
|---|---|
| `POST /pa/ereporting/preview` | Aperçu sans écriture : lignes de transaction et de paiement, totaux, exclusions motivées, **rapport d'écarts** |
| `POST /pa/ereporting/declarations` (owner/admin) | Préparation : **refus 422 `EREPORTING_CLASSIFICATION_INCOMPLETE` tant qu'une facture de la période n'est ni classée ni explicitement exclue** (rapport d'écarts joint) ; flux JSON `aurion.ereporting/1` validé (structure, arithmétique Σ lignes = totaux, période mensuelle/trimestrielle exacte) puis **archivé scellé SHA-256** avant toute transmission ; lignes figées en base ; index unique partiel (une déclaration ouverte par organisation/période/kind) |
| `POST /pa/ereporting/declarations/:id/transmit` | Transmission : même contrat sortant `generic` que l'émission — signature HMAC-SHA256, `X-Aurion-PA-Format: ereporting`, `Content-Type: application/json`, identifiant d'idempotence stable ; **seul un accusé signé** règle l'état ; intégrité du flux revérifiée avant chaque envoi (`EREPORTING_PAYLOAD_TAMPERED`) |
| `POST /pa/ereporting/declarations/:id/corrections` (owner/admin) | Correction : nouvelle déclaration référencée, lignes recalculées à partir des données corrigées, **originale conservée sans altération** |
| `GET /pa/ereporting/declarations`, `/:id`, `/:id/file`, `/:id/ack` | Consultation (membres) : liste filtrable, détail + lignes figées + journal complet, flux scellé et accusé archivés sans altération |

**Données de paiement portées** : date de collecte, montant collecté, numéro de facture — pour les factures du périmètre à TVA exigible à l'encaissement (PS/LBPS) dont l'option « TVA sur les débits » n'est pas exercée (les ventes de biens LB, TVA exigible à la livraison, n'en portent pas — règle documentée).

**Journal complet** (`ereporting_events`) : préparation, correction, envoi, accusé accepté/rejeté, écart d'intégrité, issue non confirmée — chaque entrée horodatée avec détail.

**Exclusions motivées dans le flux** : chaque facture hors périmètre figure dans `payload.excluded` avec son motif (`einvoicing_b2b_domestic`, `exempt_declared`, `vat_not_billed`) — rien n'est omis en silence.

### 3.3 Migration `077_ereporting_declarations.sql` (additive, idempotente)

- `ereporting_declarations` (cycle `prepared → submitted → accepted | rejected | timeout`, période + périodicité, sceaux payload/accusé, identifiant d'idempotence PA, compteurs et totaux), `ereporting_lines` (lignes figées : transactions et paiements, motifs d'inclusion contraints en base), `ereporting_events` (journal).
- Champs déclaratifs : `clients.buyer_category/country_code/vat_number` (contraintes de validité en base, null = non renseigné), `quotes.ereporting_exempt/ereporting_exempt_reason` (motif obligatoire si exonération — contrainte SQL).
- Index unique partiel : une seule déclaration ouverte par organisation/période/kind (anti-doublon au niveau du schéma).
- **RLS** : les trois nouvelles tables portent la politique `tenant_isolation` (échec fermé sans contexte) — 71 politiques au total, vérifiées par test.

### 3.4 Garanties vérifiées par les tests d'intégration réels

1. **Rapport d'écarts bloquant** : préparation refusée (422) tant qu'une facture manque de classification déclarative (client sans catégorie, assujetti étranger sans numéro de TVA) ; aucune donnée inventée en base.
2. **Flux scellé** : SHA-256 scellé à la préparation, archive restituée octet-pour-octet, empreinte revérifiée avant chaque envoi — altération détectée avant tout envoi (`EREPORTING_PAYLOAD_TAMPERED`), rien ne part vers la PA.
3. **Aucun statut « transmis » sans accusé authentifié** : accusé non signé refusé (`invalid_ack` → `timeout`, « issue non confirmée ») ; délai dépassé → `timeout` ; re-tentative avec le **même identifiant PA** — le serveur de recette (déduplication) ré-acquitte le premier verdict, **une seule charge utile reçue** (vérifié dans le registre PA).
4. **Rejet tracé** : accusé de rejet signé archivé, état `rejected`, re-tentative idempotente sans doublon.
5. **Corrections** : déclaration de correction recalculée à partir des données corrigées, originale intacte (sceau inchangé), référence PA de l'originale tracée dans le flux.
6. **Isolation RLS A/B** : aucune fuite de déclarations entre organisations ; échec fermé sans contexte tenant ; contenu vérifié dans le périmètre de l'organisation.
7. **Droits** : écritures (préparation, correction, transmission) réservées owner/admin ; consultation ouverte aux membres.

## 4. Anomalie rencontrée et corrigée (défaut préexistant démontré)

- **Création de plusieurs clients impossible** : la création d'un **deuxième** client échouait en 500 (`duplicate key violates unique constraint "idx_client_time_active_user"`, migration 012 — une session de temps ouverte par utilisateur). La session de temps ouverte à la première création n'était jamais close ; le défaut est présent depuis avant la 15.4.0 (aucun test ne couvrait la création de plusieurs clients).
- **Nécessité démontrée pour le bloc 5** : la classification déclarative e-reporting porte sur la fiche client ; sans création de plusieurs clients, elle est inutilisable en pratique.
- **Correction minimale** : à la création d'un client, la session ouverte précédente de l'utilisateur est close avec la **sémantique exacte de l'arrêt du chronomètre existant** (durée accumulée si en cours, clôture simple si en pause). Aucun autre comportement du chronomètre n'est modifié ; vérifié par la recette (plusieurs clients créés dans chaque organisation de test).
- Les champs de classification des clients suivent une **sémantique de présence** au PATCH (seuls les champs transmis sont modifiés), comme les mentions électroniques des factures — une valeur enregistrée n'est jamais remplacée par un vide.

## 5. Tests réellement exécutés (commandes et résultats exacts)

| Contrôle | Commande | Résultat |
|---|---|---|
| Typecheck | `npm run typecheck` | **OK** (aucune erreur) |
| Build | `npm run build` | **OK** |
| Matrice e-reporting | `node --test backend/tests/ereporting-matrix.test.mjs` | **9/9 réussis** (périmètre B2C/B2B, exclusions motivées, écarts bloquants, construction déterministe, validation arithmétique et périodique) |
| Intégration e-reporting | `node --test backend/tests/ereporting.integration.test.mjs` (PostgreSQL réel, rôle applicatif, RLS, serveur PA de recette réel) | **15/15 sous-tests réussis** (écart bloquant, classification réelle, flux scellé, transmission acceptée/rejetée/timeout, reprises idempotentes sans doublon, accusé non signé refusé, altération détectée, correction sans réécriture, RLS A/B + échec fermé, périodes exactes, droits) |
| Migrations | `npm run migrate` ×2 sur base **neuve** (001→077) | **74 migrations enregistrées** (vérifié en base) ; seconde application sans erreur (idempotence) |
| Recette complète | `scripts` de recette (PG embarqué → rôles → migrations ×2 → tests) | **24/24 réussis** (9 matrice + 15 intégration) |
| Baseline stricte | `node tools/verify-b0-baseline.mjs`, `AURION_BASELINE_STRICT=1` | **VALIDATION BASELINE B0 (mode STRICT)** : `npm run check` complet réussi (build, typecheck, frontend, lint, smoke, **parcours navigateur**), **suite complète 392/392 réussis, 0 échec, 0 ignoré** (368 d'origine + 24 nouveaux), smoke 0 échec (7 résolus depuis B0), régression 0 échec (18 résolus depuis B0) |
| Contrats structurels | `node --test backend/tests/step14-doc-save.test.mjs backend/tests/quote-update-parameters.test.mjs` | **4/4 réussis** (56→58 colonnes/paramètres, 52→56 paramètres — justification en commentaire, sans affaiblissement) |

## 6. Fichiers touchés (récapitulatif)

**Backend (nouveau)** : `src/services/electronic-ereporting-matrix.ts` (matrice pure), `src/services/electronic-ereporting.ts` (cycle de vie), `src/routes/pa-ereporting.ts` (routes), `tests/ereporting-matrix.test.mjs`, `tests/ereporting.integration.test.mjs`, `migrations/077_ereporting_declarations.sql`.

**Backend (modifié, ciblé)** : `src/app.ts` (enregistrement des routes e-reporting), `src/routes/business.ts` (champs déclaratifs clients `buyerCategory/countryCode/vatNumber` en POST/PATCH + normalisation stricte ; champs `ereportingExempt/ereportingExemptReason` en POST/PATCH quotes avec validation anticipée 400 ; correction du défaut de création multi-clients ; sémantique de présence sur les nouveaux champs), `src/services/pa/outgoing/types.ts` (format `ereporting` dans l'union type), `src/services/pa/outgoing/generic.ts` (`Content-Type: application/json` pour le format `ereporting` — comportement UBL/CII inchangé).

**Tests adaptés (contrat structurel suivi, sans affaiblissement)** : `step14-doc-save.test.mjs` (56→58), `quote-update-parameters.test.mjs` (52→56), avec justification en commentaire.

**Documentation** : `docs/PLATEFORME-AGREEE.md` (§ 10 e-reporting : cadre réglementaire vérifié, matrice, cycle de vie, garanties, limites ; § 9 mise à jour), `docs/SECURITY.md` (contrôles e-reporting testés), `docs/ARCHITECTURE-PRODUCTION.md` (composant e-reporting), `README.md`, `CHANGELOG-15.4.0.md` (section 15.4.4), `VERSION.txt` (15.4.4), `docs/RAPPORT-LIVRAISON-15.4.4.md` (ce rapport).

**Intentionnellement non touchés** : socle de réception du bloc 3, émission UBL/CII du bloc 4 (aucun changement de comportement — le format `ereporting` est une extension additive de l'union type et du Content-Type), `render.yaml` (aucune variable serveur nouvelle : le point d'entrée PA est déjà configuré par organisation), workflow CI (aucune variable nouvelle), `services/electronic-invoice.ts` (modèle interne honnête inchangé).

## 7. Limites restantes et blocs non exécutés

- **Aucune PA réelle n'est connectée** : le contrat sortant est testé de bout en bout (contrat + intégration réelle sur serveur HTTP de recette), mais **la transmission e-reporting n'est pas déclarée opérationnelle en production** tant qu'aucune PA contractuelle n'a été validée en sandbox (critère du bloc 5 appliqué sans compromis).
- **Format du flux** : `aurion.ereporting/1` (JSON structuré, schéma documenté et validé) est le contrat du référentiel `generic`. Le **format définitif dépendra de la PA retenue** — aucun format e-reporting consolidé n'est imposé par la doctrine au 14 novembre 2026 ; l'adaptateur dédié de la PA transportera son format sans toucher au reste de l'application.
- **Pas d'interface de déclaration** à ce stade : l'API complète (aperçu, préparation, transmission, corrections, journal) est testée ; les boutons accompagneront la connexion contractuelle d'une PA, comme en réception et à l'émission. Les champs déclaratifs sont déjà saisissables via l'API clients/factures.
- La réception des **statuts retour de la DGFiP** (via la PA) suivra les états convenus avec la PA retenue.
- Blocs 7 à 16, 18 à 20 : non exécutés (recentrage micro-entreprises, cotisations, versement libératoire, devis sans client, bordereaux, accents, Windows, champs libres, popups de confirmation, migrations complètes, cryptographie, Render/GitHub, validation globale finale).
- Vérifications externes toujours non possibles ici : statut réel des branches GitHub/PR, OAuth Google réel, déploiement Render (livraison par archive ZIP conformément au cahier des charges).

## 8. Critère de validation du bloc 5

Le critère « jeux de tests couvrant les cas applicables, accusés de PA, reprises idempotentes, correction et rapport d'écarts » est rempli : **9 tests de matrice** (B2C domestique, B2B international, B2B domestique exclu, exonérations, TVA non facturée, écarts, construction et validation du flux) et **15 sous-tests d'intégration réels** (écart bloquant, classification, scellement, succès/rejet/timeout/re-tentative idempotente sans doublon, accusés signés obligatoires, intégrité scellée, correction sans réécriture, RLS A/B, périodes exactes, droits), baseline stricte **392/392**, et la distinction « génération conforme / transmission non opérationnelle » est mentionnée dans le code, la documentation, les tests et ce rapport. La matrice documentée est établie à partir de la doctrine officielle vérifiée (§ 1), sans inférence à partir du seul type de facture (statut TVA et nature de l'opération pris en compte via des déclarations utilisateur explicites). ZIP complet livré : `aurion-15.4.4.zip`.

## 9. Suite

Bloc suivant : **BLOC 6 — Documentation fidèle au code et retrait des références Ollama/Qwen** (audit CGU-CGV, politique de confidentialité, architecture, sécurité et retrait des références actives éventuelles), sur la base de `aurion-15.4.4.zip`.
