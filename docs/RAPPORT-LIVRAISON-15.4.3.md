# Rapport de livraison — Aurion 15.4.3 (Bloc 4 : facturation électronique — émission, formats et mentions)

Date : 14 novembre 2026. Base : archive **aurion-15.4.2.zip** livrée (blocs 1, 2, 3, 6 et 17 partiel), conformément à la règle de continuité (le dernier ZIP livré est l'unique base du bloc suivant — extraite et vérifiée, version 15.4.2). Version livrée : **15.4.3**.
Ce rapport recense les travaux du **BLOC 4 — Facturation électronique, émission, formats et mentions** du prompt maître V2, les fichiers touchés, la migration, les tests réellement exécutés avec leurs commandes et résultats exacts, les anomalies rencontrées et corrigées, et les limites restantes. Rien n'est déclaré « fonctionnel » sans vérification exécutée.

## 1. Cadre réglementaire appliqué

- Aurion reste un logiciel de gestion/facturation **compatible connecté à une plateforme agréée (PA)** choisie par l'entrepreneur — jamais une PA lui-même, aucune transmission directe à l'administration fiscale, aucune prétention d'immatriculation.
- Les **quatre mentions obligatoires depuis le 1er septembre 2026** ont été vérifiées le 13 novembre 2026 sur economie.gouv.fr (« Tout savoir sur la facturation électronique pour les entreprises ») : numéro SIREN du client ; catégorie de l'opération (vente de biens, prestation de services, ou mixte) ; option pour le paiement de la TVA sur les débits le cas échéant ; adresse complète de livraison si différente de la facturation.
- Les correspondances de formats sont alignées sur les références publiques vérifiées : catégorie de l'opération = **BT-23** avec codes **LB / PS / LBPS** (spécifications externes DGFiP, flux de données impots.gouv.fr) ; SIREN = BT-30 vendeur / **BT-47 client** avec schéma ISO 6523 `0002` ; adresse de livraison = **BT-79/BT-80** ; TVA sur les débits portée en note BT-21/BT-22 (mécanisme standard EN 16931 pour les mentions non modélisées dans le noyau — variante propre à la PA à confirmer en sandbox).
- Le calendrier d'émission (micro-entreprises et PME au plus tard le 1er septembre 2027) et la doctrine sont rappelés dans `docs/PLATEFORME-AGREEE.md`.

## 2. Environnement de vérification

| Élément | Valeur |
|---|---|
| Node.js | v24.22.2 (exigence ≥ 22.16.0) |
| PostgreSQL | 18.6 réel (embarqué), base `aurion_test` reconstruite à neuf puis chaîne complète 001→076 appliquée deux fois (idempotence vérifiée) ; rôles distincts `aurion_test` (migration, propriétaire), `aurion_runtime` (applicatif), `aurion_admin_app` (administration) |
| RLS | 68 politiques `tenant_isolation` actives (65 en 15.4.2 + 3 nouvelles tables du bloc 4) |
| Serveur PA de recette | HTTP réel sur la boucle locale (contrat sortant `generic` signé HMAC, accusés signés, déduplication par identifiant de transmission) — **aucune PA contractuelle connectée** |
| Navigateur | Chromium headless (Playwright), parcours E2E complet de `npm run check` |
| Mode de validation | `node tools/verify-b0-baseline.mjs` avec `AURION_BASELINE_STRICT=1` |

## 3. BLOC 4 — Ce qui a été construit

### 3.1 Génération des documents structurés (conformes, validées avant archivage)

| Fichier | Rôle |
|---|---|
| `backend/src/services/electronic-invoice-ubl.ts` | Génération **UBL 2.1 Invoice** (CIUS EN 16931) : BT-24 `urn:cen.eu:en16931:2017`, BT-23 catégorie via `cbc:ProfileID`, BT-47 SIREN client (`PartyLegalEntity/cbc:CompanyID @schemeID="0002"`), BT-30/BT-29 vendeur (SIREN 0002 / SIRET 0009), BT-79/80 livraison (`cac:Delivery`), note TVA sur les débits, ventilation TVA (catégorie **S** standard ou **E** exonéré avec motif « TVA non applicable, art. 293 B du CGI ») |
| `backend/src/services/electronic-invoice-cii.ts` | Génération **CII D16B** (profil **Factur-X BASIC**, XML autonome) : BT-23 via `BusinessProcessSpecifiedDocumentContextParameter`, BT-47 via `BuyerTradeParty/SpecifiedLegalOrganization/ram:ID @schemeIdentifier="0002"`, BT-79/80 via `ApplicableHeaderTradeDelivery/ShipToTradeParty`, guideline `urn:factur-x.eu:1p0:facturx-basic` |
| `backend/src/services/electronic-invoice-validate.ts` | Validation interne systématique avant archivage : XML bien formé (`XMLValidator`), champs obligatoires EN 16931, mentions françaises présentes/exactes, règles arithmétiques **BR-CO-10/11/13/14/15/16/17** (Σ lignes = base HT, TVA cohérente, TTC = HT + TVA, à payer = TTC), catégorie E avec taux nul et motif art. 293 B, détection de falsification |
| Lignes de facture | Reproduisent la composition facturée réelle (pièces, livraison, kilométrage facturé en mode client, main-d'œuvre = solde garantissant Σ lignes = total HT, règle BR-CO-10) — jamais le détail interne du catalogue |

### 3.2 Les quatre mentions du 1er septembre 2026 (saisie + transport)

- **Saisie** : section « Facturation électronique » de l'éditeur de facture (`assets/js/pages/dash/quote.js`), champs `einvoiceOperationCategory` (LB/PS/LBPS), `einvoiceBuyerSiren` (9 chiffres), `einvoiceVatOnPayment` (case à cocher), `einvoiceDeliveryAddress` (textarea, facultative) ; acceptés par `POST /quotes` et `PATCH /quotes/:id` (validation zod + normalisation, refus explicite `INVALID_INPUT` sur valeur invalide — jamais de valeur inventée), instantanés sur le document historique (même logique que `billing_address_snapshot`).
- **Exigence à la préparation** : catégorie d'opération et SIREN client sont **obligatoires** pour préparer un document électronique (`422 EINVOICE_MENTION_MISSING` avec message explicite) ; l'option TVA sur les débits et l'adresse de livraison sont transportées uniquement si renseignées.
- **Transport** : voir tableau de correspondance dans `docs/PLATEFORME-AGREEE.md` § 8.2.

### 3.3 Cycle de vie de transmission et accusés (états traçables)

| Fichier | Rôle |
|---|---|
| `backend/src/services/pa/outgoing/types.ts` | Interface `PaOutgoingAdapter` — un fournisseur PA réel = un adaptateur isolé + une entrée au registre, sans toucher au reste de l'application |
| `backend/src/services/pa/outgoing/generic.ts` | Contrat sortant générique de référence : POST signé `X-Aurion-PA-Signature: t=<unix>,v1=<hex(HMAC-SHA256(secret,"<t>.<corps>"))>`, identifiant d'idempotence `X-Aurion-PA-Transmission-Id` **stable entre re-tentatives**, accusé JSON **signé par la PA** vérifié à temps constant (tolérance ±300 s), refus de conclure sur accusé douteux (`invalid_ack`) |
| `backend/src/services/pa/index.ts` | Registre étendu aux adaptateurs d'émission (`resolvePaOutgoingAdapter`) |
| `backend/src/services/electronic-outgoing.ts` | Cycle de vie complet : préparation idempotente (document identique → même transmission ; document différent → régénération journalisée, archives antérieures conservées), transmission signée, règle des états, reprises, consultation |
| `backend/src/routes/pa-outgoing.ts` | Routes authentifiées : `GET/POST /pa/outgoing-endpoints`, `POST /pa/outgoing/prepare/:invoiceId`, `POST /pa/outgoing/:id/transmit`, `GET /pa/outgoing` (+ filtres), `GET /pa/outgoing/:id` (+ journal), `GET /pa/outgoing/:id/file`, `GET /pa/outgoing/:id/ack` |

**Garanties vérifiées par les tests d'intégration réels :**

1. **Aucun statut « transmis » sans accusé authentifié** : seul un accusé signé fait passer l'état à `accepted`/`rejected` ; transport indisponible, délai dépassé ou accusé non signé → `timeout` (« issue non confirmée ») et `quotes.electronic_status` inchangé (jamais `sent`).
2. **Idempotence anti-doublon** : la reprise après timeout re-transmet le **même** `X-Aurion-PA-Transmission-Id` ; le serveur de recette (déduplication par identifiant) ré-acquitte le premier verdict — la PA n'a reçu qu'une seule charge utile (vérifié).
3. **Anti-doublon schéma** : index unique partiel — une seule transmission ouverte (`prepared`/`submitted`) par facture ; re-transmission après acceptation refusée (`409 EINVOICE_ALREADY_ACCEPTED`).
4. **Intégrité scellée** : document XML archivé dans le stockage privé avant envoi, SHA-256 scellé en base, empreinte revérifiée avant chaque envoi (`EINVOICE_PAYLOAD_TAMPERED` si altération) ; accusé archivé sans altération (clé + SHA-256 scellés), restitution octet-pour-octet.
5. **Journal complet** : `outgoing.prepared`, `outgoing.regenerated`, `outgoing.transmission_started`, `outgoing.ack_accepted`, `outgoing.ack_rejected`, `outgoing.issue_unconfirmed`, `outgoing.transport_error` — chaque entrée horodatée avec détail.
6. **Configuration explicite** : point d'entrée d'émission par organisation (URL HTTPS publique imposée en production, boucle locale tolérée hors production), secret ≥ 32 caractères **chiffré AES-256-GCM au repos** (`services/secrets.ts`), jamais renvoyé ni journalisé ; sans configuration, la transmission refuse (`503 PA_OUT_NOT_CONFIGURED`).

### 3.4 Migration `076_outgoing_electronic_invoices.sql` (additive, idempotente)

- Quatre mentions électroniques sur `quotes` (contraintes CHECK : catégorie dans LB/PS/LBPS, SIREN 9 chiffres).
- `pa_outgoing_endpoints` : point d'entrée d'émission par organisation, secret chiffré, rotation.
- `outgoing_electronic_invoices` : transmissions (cycle `prepared/submitted/accepted/rejected/timeout`, formats `ubl`/`cii`, sceaux SHA-256 document + accusé, références PA, tentatives, erreurs).
- `outgoing_transmission_events` : journal des transmissions.
- Les **3 tables portent la politique `tenant_isolation`** (68 politiques au total) — vérifié par test.

## 4. Anomalies découvertes et corrigées pendant le bloc (tests pilotés)

1. **Chemins de validation XML** : la première rédaction du validateur cherchait des éléments UBL sans préfixe (`CustomizationID`) alors que les documents générés sont préfixés (`cbc:CustomizationID`) ; et l'option `isArray` forcée écrasait les lignes répétées. Corrigé (préfixes exacts + comportement par défaut du parseur) ; détecté par les tests de format.
2. **Double mise à l'échelle des centimes** : trois règles arithmétiques (BR-CO-11/16/17) comparaient des montants déjà exprimés en centimes avec des valeurs re-multipliées par 100 ; TVA recalculée fondée sur une base en centimes sans conversion. Corrigé ; détecté par les tests de format.
3. **Éléments XML avec attributs** : `udt:DateTimeString format="102"`, `ram:ID schemeIdentifier="0002"` et les montants `currencyID` se parsent en objets `{'@attr':…,'#text':…}` — les accesseurs texte ont été généralisés (`text()`, `CENT()`), et la détection de malformation passe par `XMLValidator.validate` (fast-xml-parser n'échoue pas seul sur un XML tronqué).
4. **Requête de préparation** : la première rédaction lisait des colonnes inexistantes (`organizations.company_address`/`email`) ; corrigé vers les colonnes réelles (`address`, `postal_code`, `city`).
5. **Sémantique HTTP de la préparation** : la route distinguait « 201 créé » sur `regenerated===false`, ce qui renvoyait 201 pour la préparation **idempotente** ; le service distingue désormais `created` (201) de l'idempotence/régénération (200) — vérifié par test.
6. **Réservation de transmission** : la première rédaction résolvait la transmission par `quote_id` alors que la route transmet l'identifiant de transmission ; corrigé (réservation par `id` de transmission, `quote_id` déduit) — détecté par le test d'intégration (`EINVOICE_NOT_PREPARED`).
7. **Secret d'accusé** : le serveur de recette signait avec le secret du webhook entrant au lieu du secret du point d'entrée d'émission ; le test a été aligné sur le contrat (secret partagé unique) — la faute de conception côté adaptateur a été écartée après vérification (l'adaptateur vérifie bien avec le secret configuré).
8. **Tests structurels historiques** : `step14-doc-save.test.mjs` (52 colonnes/paramètres) et `quote-update-parameters.test.mjs` (44 paramètres) figeaient les compteurs SQL ; mis à jour respectivement à **56** et **52** avec commentaire (les quatre mentions ajoutent 4 colonnes et 4×2 paramètres) — l'intention des tests (alignement colonnes/paramètres) est préservée.

## 5. Tests exécutés — commandes et résultats exacts

| Commande | Résultat |
|---|---|
| `npm run build` | **réussi** (tsc) |
| `npm run typecheck` | **réussi** (0 erreur) |
| `npm run migrate` (rôles migration/runtime séparés, base **neuve** 001→076) | **73 migrations enregistrées** ; ré-exécution intégrale rejouée une seconde fois sans erreur (idempotence) |
| `node --test backend/tests/einvoice-formats.test.mjs` | **10/10 réussis** (mentions UBL+CII, arithmétique BR-CO, franchise art. 293 B, quantités décimales, falsifications détectées, XML mal formé refusé, codes LB/PS/LBPS) |
| `node --test backend/tests/einvoice-outgoing.integration.test.mjs` | **10/10 réussis** sur PostgreSQL réel + serveur HTTP de recette réel (configuration endpoint et secrets, préparation exigeante + archivage scellé + idempotence + régénération, acceptation avec accusé archivé et pas de double transmission, rejet + re-tentative idempotente sans doublon, timeout sans statut transmis + reprise réussie au même identifiant, accusé non signé refusé, altération d'archive détectée, isolation RLS A/B + échec fermé, liste/journal) |
| `bash scripts/run-baseline-bloc4.sh` (= `node tools/verify-b0-baseline.mjs`, `AURION_BASELINE_STRICT=1`) | **VALIDATION BASELINE B0 (mode STRICT)** : `npm run check` complet réussi (build, typecheck, frontend, lint, smoke, **parcours navigateur**), **suite complète 368/368 réussis, 0 échec, 0 ignoré** (348 d'origine + 20 nouveaux), smoke 0 échec (7 résolus depuis B0), régression 0 échec (18 résolus depuis B0) |
| `npm run lint:frontend` + `npm run test:frontend` | **réussis** (0 erreur ESLint ; 38 fichiers vérifiés) |

## 6. Fichiers touchés (récapitulatif)

**Backend (nouveau)** : `src/services/pa/outgoing/types.ts`, `src/services/pa/outgoing/generic.ts`, `src/services/electronic-invoice-ubl.ts`, `src/services/electronic-invoice-cii.ts`, `src/services/electronic-invoice-validate.ts`, `src/services/electronic-outgoing.ts`, `src/routes/pa-outgoing.ts`, `tests/einvoice-formats.test.mjs`, `tests/einvoice-outgoing.integration.test.mjs`, `migrations/076_outgoing_electronic_invoices.sql`.

**Backend (modifié, ciblé)** : `src/app.ts` (enregistrement des routes d'émission), `src/config.ts` (`AURION_PA_OUT_TIMEOUT_MS`), `src/services/pa/index.ts` (registre d'émission), `src/routes/business.ts` (quatre mentions en POST/PATCH + normalisation), `backend/package.json` + `package-lock.json` (`fast-xml-parser@5.5.1`, exact), `backend/.env.example` (variable documentée).

**Frontend (ciblé)** : `assets/js/pages/dash/quote.js` (section « Facturation électronique » de l'éditeur de facture : les quatre mentions, préremplies en édition, transmises à l'enregistrement — aucun autre changement d'interface).

**Configuration** : `.github/workflows/aurion-ci.yml` (`AURION_PA_OUT_TIMEOUT_MS=1000` à l'étape de validation).

**Tests adaptés (contrat structurel suivi, sans affaiblissement)** : `step14-doc-save.test.mjs` (52→56), `quote-update-parameters.test.mjs` (44→52), avec justification en commentaire.

**Documentation** : `docs/PLATEFORME-AGREEE.md` (§ 8 émission : formats, mentions et correspondances, cycle de vie, contrat sortant ; § 9 limites bloc 4), `docs/SECURITY.md` (contrôles de transmission testés), `docs/SECURITE-RLS.md` (68 tables), `docs/ARCHITECTURE-PRODUCTION.md` (composant émission), `README.md`, `CHANGELOG-15.4.0.md` (section 15.4.3), `VERSION.txt` (15.4.3), `docs/RAPPORT-LIVRAISON-15.4.3.md` (ce rapport).

**Intentionnellement non touchés** : `services/electronic-invoice.ts` (le JSON de préparation interne reste un modèle interne honnête, `standard: null`), le socle de réception du bloc 3 (aucun changement de comportement), `render.yaml` (aucune variable d'émission requise côté serveur : le point d'entrée est configuré par organisation en base).

## 7. Limites restantes et blocs non exécutés

- **Aucune PA réelle n'est connectée** : le contrat sortant `generic` est testé de bout en bout (contrat + intégration réelle sur serveur HTTP de recette), mais **la transmission n'est pas déclarée opérationnelle en production** tant qu'aucune PA contractuelle n'a été validée en sandbox (critère du bloc 4 appliqué sans compromis : génération conforme ≠ transmission opérationnelle, distinction explicite partout).
- **Assemblage Factur-X PDF/A-3 non livré** : UBL 2.1 et CII D16B (profil Factur-X BASIC) constituent le périmètre effectivement choisi ; l'assemblage du PDF/A-3 exigerait une chaîne de validation PDF/A pour être prétendu conforme, ce que le prompt interdit sans preuve.
- **Validation XSD/Schematron officielle** non embarquée : la validation interne couvre XML bien formé, mentions et arithmétique EN 16931 ; la validation de schéma complète reste du ressort de la PA à la réception. La chaîne de personnalisation BT-24 est le CIUS noyau `urn:cen.eu:en16931:2017`, à aligner sur la PA retenue.
- **Pas d'interface de transmission** à ce stade : l'API complète (préparation, transmission, accusés, journal) est testée ; le bouton « transmettre à la PA » accompagnera la connexion contractuelle d'une PA (comme en réception). Les quatre mentions sont déjà saisissables dans l'éditeur de facture.
- **E-reporting (bloc 5)** non exécuté : aucune donnée de transaction n'est transmise.
- Blocs 7 à 16, 18 à 20 : non exécutés (micro-entreprises, cotisations, bordereaux, accents, Windows, champs, popups, migrations complètes, cryptographie, Render/GitHub, validation globale finale).
- Vérifications externes toujours non possibles ici : statut réel des branches GitHub/PR, OAuth Google réel, déploiement Render (livraison par archive ZIP conformément au cahier des charges).

## 8. Critère de validation du bloc 4

Le critère « validations de format, cas de succès/rejet/timeout/retry, conformité des champs, pas de doublon, états traçables ; si une PA n'est pas encore connectée, distinguer explicitement génération conforme et transmission non opérationnelle » est rempli : **10 tests de format** (deux formats, mentions, arithmétique, falsifications) et **10 tests d'intégration réels** (succès/rejet/timeout/re-tentative, idempotence sans doublon côté PA, accusés signés obligatoires, intégrité scellée, RLS), baseline stricte **368/368**, et la distinction « génération conforme / transmission non opérationnelle » est mentionnée dans le code, la documentation, les tests et ce rapport. ZIP complet livré : `aurion-15.4.3.zip`.
