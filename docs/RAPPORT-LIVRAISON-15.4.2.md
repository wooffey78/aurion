# Rapport de livraison — Aurion 15.4.2 (Bloc 3 : réception de facturation électronique)

Date : 13 novembre 2026. Base : archive **15.4.1** livrée (blocs 1, 2, 6 et 17 partiel), conformément à la règle de continuité (le dernier ZIP livré est l'unique base du bloc suivant). Version livrée : **15.4.2**.
Ce rapport recense les travaux du **BLOC 3 — Facturation électronique, réception** du prompt maître V2, les fichiers touchés, la migration, les tests réellement exécutés avec leurs commandes et résultats exacts, les anomalies rencontrées et corrigées, et les limites restantes. Rien n'est déclaré « fonctionnel » sans vérification exécutée.

## 1. Cadre réglementaire appliqué

- Aurion est conçu comme un **logiciel de gestion/facturation compatible connecté à une plateforme agréée (PA)** choisie par l'entrepreneur — jamais comme une PA lui-même. Aucune prétention d'immatriculation, aucune transmission directe à l'administration fiscale.
- Calendrier de référence (vérifié le 13 novembre 2026, cité dans `docs/PLATEFORME-AGREEE.md` avec les liens DGFiP/Économie.gouv.fr) : réception obligatoire au 1er septembre 2026 (y compris micro-entreprises en franchise en base) ; émission et e-reporting au plus tard le 1er septembre 2027 (blocs 4 et 5).
- Le JSON interne existant (`services/electronic-invoice.ts`, `standard: null`, `transmissionStatus: 'not_implemented'`) **n'a pas été modifié** et n'est présenté nulle part comme un format réglementaire.

## 2. Environnement de vérification

| Élément | Valeur |
|---|---|
| Node.js | v24.22.2 (exigence ≥ 22.16.0) |
| PostgreSQL | 18.6 réel (embarqué), base `aurion_test` reconstruite à neuf puis chaîne complète 001→075 rejouée ; rôles distincts `aurion_test` (migration, propriétaire), `aurion_runtime` (applicatif), `aurion_admin_app` (administration) |
| RLS | 65 politiques `tenant_isolation` actives (61 en 15.4.1 + 4 nouvelles tables du bloc 3) |
| Adaptateur PA | `generic` (contrat générique signé documenté) — **aucune PA réelle connectée** |
| Mode de validation | `node tools/verify-b0-baseline.mjs` avec `AURION_BASELINE_STRICT=1` |

## 3. BLOC 3 — Ce qui a été construit

### 3.1 Socle d'intégration PA (adaptateur isolé derrière une interface stable)

| Fichier | Rôle |
|---|---|
| `backend/src/services/pa/types.ts` | Interface `PaAdapter` (vérification de signature + décodage d'événement) — un fournisseur PA réel = un fichier d'adaptateur + une entrée au registre, sans toucher au reste de l'application |
| `backend/src/services/pa/generic.ts` | Contrat générique de référence : en-tête `X-Aurion-PA-Signature: t=<unix>,v1=<hex(HMAC-SHA256(secret,"<t>.<corps>"))>`, comparaison à temps constant, tolérance ±300 s (anti-rejeu), enveloppe JSON validée par zod strict (dates réelles, SIREN/SIRET, formats de montants, base64 canonique, taille de fichier) |
| `backend/src/services/pa/index.ts` | Registre : `resolvePaAdapter()`, `paReceptionConfigured()` ; **aucun endpoint, URL ou identifiant de PA réelle codé en dur** (garde-fou statique en test) |
| `backend/src/services/pa/inbox.ts` | Traitement complet du webhook : résolution du point d'entrée, signature, validation, idempotence, doublons, archivage, rapprochement, journal, erreurs, reprise |
| `backend/src/routes/pa.ts` | Routes publiques (webhook signé, corps brut préservé, limiteur de débit 60/min, `bodyLimit` dérivé de `AURION_PA_MAX_FILE_BYTES`) et authentifiées (boîte de réception, correction, approbation, reprise, provisionnement du point d'entrée) |

### 3.2 Migration `075_pa_supplier_invoice_inbox.sql` (additive, idempotente)

- `pa_webhook_endpoints` : point d'entrée par (organisation, plateforme) ; jeton UUID secret ; rotation (unicité partielle côté actif).
- `pa_webhook_events` : registre d'idempotence (unicité `provider, event_id, organisation`) ; charge utile conservée en type **`json`** (texte exact reçu — le `jsonb` réordonne les clés et rendrait le contrôle d'intégrité de la reprise instable) ; statut `received/processed/error`.
- `supplier_electronic_invoices` : boîte de réception (original : clé de stockage, nom, MIME, taille, SHA-256 ; données structurées : numéro, dates, devise, totaux, fournisseur/SIREN/SIRET ; cycle `received/reviewed/approved/rejected/duplicate` ; contraintes CHECK).
- `supplier_electronic_invoice_events` : journal d'événements complet (réception, signature invalide, doublon, stockage, erreur, correction, approbation, reprise…).
- Les **4 tables portent la politique `tenant_isolation`** (65 politiques au total) — vérifié par test.

### 3.3 Garanties du flux de réception

1. **Authentification** : signature HMAC horodatée ; échec → 400, charge utile **ni décodée ni conservée**, tentative journalisée (`webhook.signature_invalid`) côté organisation ; jeton résolu via le pool d'administration **journalisé** (`platform_admin_access_log`, opération `pa.webhook.resolve`).
2. **Idempotence** : rejeu du même `event_id` → 200 `{received:true, duplicate:true}`, aucune écriture ; événement en erreur re-livré avec la même charge utile → **reprise automatique** (re-traitement) ; charge utile différente sous un même `event_id` → 409 `PA_EVENT_PAYLOAD_CHANGED`.
3. **Doublons de contenu** : même SHA-256 sous un autre `event_id` → copie marquée `duplicate` référençant l'original, fichier non re-archivé, copie non modifiable (409).
4. **Archivage sans altération** : fichier écrit dans le stockage privé de l'organisation (`private/<org>/pa-inbox/<année>/<event>/<fichier>`), SHA-256 scellé en base, restitution octet-pour-octet ; nettoyage best-effort si l'écriture en base échoue (pas d'orphelin).
5. **Rapprochement fournisseur** : email exact prioritaire, sinon nom normalisé (minuscules, accents, espaces — interne au rapprochement) ; `unmatched`/`matched`/`ambiguous` ; **aucune création ni fusion automatique**.
6. **Contrôle utilisateur** : `PATCH /pa/inbox/:id` (catégorie comptable, rattachement fournisseur, statut de revue) en une transaction tenant ; **l'approbation ne génère aucune écriture comptable automatique** (mention explicite dans le journal) ; les copies de doublon ne se modifient pas.
7. **Erreurs et reprise** : charge utile non conforme → 422 + événement conservé (`status='error'`) avec sa charge utile et l'empreinte canonique ; reprise manuelle `POST /pa/events/:id/reprocess` ; toute altération détectée → 409.
8. **Configuration explicite** : sans `AURION_PA_PROVIDER`/`AURION_PA_WEBHOOK_SECRET` (≥ 32 caractères dès que le provider est défini, y compris hors production), la réception refuse (503 `PA_NOT_CONFIGURED`) — jamais de réception silencieuse.

## 4. Anomalies découvertes et corrigées pendant le bloc (tests pilotés)

1. **Contexte tenant absent sur le webhook** : `beginTenant()` lit le contexte AsyncLocalStorage, absent pour un appel sans session utilisateur → les écritures échouaient fermé (42501) sous RLS. Correction : pose explicite du tenant dans les trois transactions du service (`begin` + `applyTenant(client, organizationId)`), même patron que l'inscription (074). Corrigé par le test d'intégration réel.
2. **Digest de reprise instable** : l'empreinte calculée sur les octets bruts ne correspondait jamais après sérialisation JSON (reprise). Correction : **digest canonique** de la charge utile stockée (sérialisation déterministe), avec empreinte SHA-256 du document intégrée à la charge utile ; la colonne passe en type `json` exact (le `jsonb` réordonne les clés) et le cast SQL aligné (`::json`).
3. **Limite d'inscription HTTP en recette** : `/auth/register` est limité à 5/IP/15 min (production, inchangé) ; la recette exigeant de nombreuses organisations, les comptes de test sont créés par fixture directe (mêmes écritures que l'inscription) avec un JWT signé par le plugin — aucun contournement de garde de production, aucune modification des routes publiques.

## 5. Tests exécutés — commandes et résultats exacts

| Commande | Résultat |
|---|---|
| `npm run build` | **réussi** (tsc) |
| `npm run typecheck` | **réussi** (0 erreur) |
| `npm run migrate` (rôles migration/runtime séparés) | **72 migrations appliquées** sur base **neuve** (001→075) ; ré-exécution idempotente vérifiée ; chaîne complète rejouée après reconstruction de la base |
| `node --test backend/tests/pa-adapter.contract.test.mjs` | **6/6 réussis** (signature valide/altérée/rejeu, charge utile non conforme, type inconnu, registre + absence d'endpoint réel, documentation) |
| `node --test backend/tests/pa-inbox.integration.test.mjs` | **9/9 réussis** sur PostgreSQL réel, rôle applicatif, RLS active (RLS 075, provisionnement, réception + rapprochement + archivage intact, rejeu + doublon de contenu, sécurité webhook + rotation, erreur + reprise manuelle, type ignoré, ambiguïté + correction + approbation, isolation A/B + échec fermé) |
| `bash scripts/run-baseline.sh` (= `node tools/verify-b0-baseline.mjs`, `AURION_BASELINE_STRICT=1`) | **VALIDATION BASELINE B0 (mode STRICT)** : `npm run check` complet réussi (build, typecheck, frontend, lint, smoke, **parcours navigateur**), **suite complète 348/348 réussis, 0 échec, 0 ignoré** (333 d'origine + 15 nouveaux), smoke 0 échec (7 résolus depuis B0), régression 0 échec (18 résolus depuis B0) |

## 6. Fichiers touchés (récapitulatif)

**Backend (nouveau)** : `src/services/pa/types.ts`, `src/services/pa/generic.ts`, `src/services/pa/index.ts`, `src/services/pa/inbox.ts`, `src/routes/pa.ts`, `tests/pa-adapter.contract.test.mjs`, `tests/pa-inbox.integration.test.mjs`, `migrations/075_pa_supplier_invoice_inbox.sql`.

**Backend (modifié, ciblé)** : `src/app.ts` (enregistrement des routes PA), `src/config.ts` (3 variables + gardes production et hors production), `.env.example` (variables documentées).

**Configuration** : `.github/workflows/aurion-ci.yml` (variables de test PA dédiées), `render.yaml` (`AURION_PA_PROVIDER`, `AURION_PA_WEBHOOK_SECRET` sur les deux services).

**Documentation** : `docs/PLATEFORME-AGREEE.md` (nouveau : cadre réglementaire, architecture, contrat, cycle de vie, configuration, limites), `docs/SECURITE-RLS.md` (65 tables, chemin webhook PA), `docs/SECURITY.md` (webhook PA testé ; connexion PA réelle non vérifiée), `docs/ARCHITECTURE-PRODUCTION.md` (composant réception), `README.md`, `CHANGELOG-15.4.0.md` (section 15.4.2), `VERSION.txt` (15.4.2), `docs/RAPPORT-LIVRAISON-15.4.2.md` (ce rapport).

**Intentionnellement non touchés** : `services/electronic-invoice.ts` (modèle interne honnête conservé), frontend (aucun changement — voir limites), package.json backend (aucune nouvelle dépendance : crypto standard, zod et pg déjà présents).

## 7. Limites restantes et blocs non exécutés

- **Aucune PA réelle n'est connectée** : le contrat `generic` est testé de bout en bout (contrat + intégration réelle), mais la réception n'est **pas déclarée opérationnelle en production** tant qu'aucune PA contractuelle n'a été validée en sandbox (critère du bloc 3 appliqué sans compromis).
- **Pas d'interface graphique** de la boîte de réception à ce stade : l'API complète (liste, détail + journal, téléchargement de l'original, correction, approbation, reprise, provisionnement) est testée ; l'UI accompagnera la connexion contractuelle d'une PA (blocs 4/5) pour éviter de livrer une interface sans usage réel ni test navigateur dédié.
- **Formats et émission** : Factur-X/UBL/CII, quatre mentions obligatoires (SIREN client, catégorie d'opération, option TVA sur les débits, adresse de livraison), cycle de transmission avec accusés et e-reporting : **blocs 4 et 5**, non exécutés ici.
- Les tests d'intégration PA utilisent le stockage local en test ; le comportement S3 est celui du stockage privé existant (déjà couvert par les tests cloud 15.4.0), non re-testé spécifiquement pour la boîte PA.
- Vérifications externes toujours non possibles ici : statut réel des branches GitHub/PR, OAuth Google réel, déploiement Render (livraison par archive ZIP conformément au cahier des charges).

## 8. Critère de validation du bloc 3

Le critère « recette sandbox réelle **ou** adaptateur et tests de contrat complets clairement identifiés comme non encore connectés » est rempli par la seconde branche : adaptateur isolé, contrat documenté (`docs/PLATEFORME-AGREEE.md`), 6 tests de contrat + 9 tests d'intégration réels, et mention explicite partout (code, docs, tests, rapport) que **la réception n'est pas opérationnelle en production**. ZIP complet livré : `aurion-15.4.2.zip`.
