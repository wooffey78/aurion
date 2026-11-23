# Plateforme agréée — réception et émission des factures électroniques (blocs 3 et 4)

> **État au 14 novembre 2026 (version 15.4.3) : le socle de réception (bloc 3) et la
> génération d'émission structurée avec cycle de transmission (bloc 4) sont en place et
> testés, mais AUCUNE plateforme agréée (PA) réelle n'est encore connectée.** Les tests
> exécutés valident les contrats génériques documentés ci-dessous (entrants et sortants), en
> base PostgreSQL réelle avec le rôle applicatif et, pour l'émission, contre un serveur HTTP
> de recette réel sur la boucle locale. Ni la réception ni la transmission ne sont **déclarées
> opérationnelles en production** tant qu'aucune PA contractuelle n'a été connectée et validée
> en sandbox. Rien dans Aurion ne transmet de données à l'administration fiscale : Aurion
> n'est pas une PA et n'est pas immatriculé comme tel.

## 1. Cadre réglementaire (références officielles, à revérifier avant toute mise en service)

- Depuis le **1er septembre 2026**, les entreprises concernées, y compris les micro-entreprises,
  doivent être en capacité de **recevoir** les factures électroniques via une plateforme agréée ;
  le dispositif concerne aussi les micro-entrepreneurs en franchise en base de TVA.
- Au plus tard le **1er septembre 2027**, les micro-entreprises et PME devront **émettre** leurs
  factures électroniques relevant du dispositif et transmettre les données de e-reporting.
- Le calendrier, les formats et la liste des plateformes agréées évoluent : revérifier la doctrine
  DGFiP au début de chaque bloc de travail et avant toute livraison.

Références :

- DGFiP — calendrier : <https://www.impots.gouv.fr/professionnel/questions/partir-de-quand-suis-je-concerne-par-la-reforme-de-la-facturation>
- DGFiP — recours à une plateforme agréée : <https://www.impots.gouv.fr/professionnel/questions/dans-le-cadre-de-la-reforme-de-la-facturation-electronique-comment-devrais>
- DGFiP — formats compatibles et architecture : <https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/fiches_reforme/fiche-1_f.pdf>
- Économie.gouv.fr — obligations et nouvelles mentions : <https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises>

## 2. Architecture du socle de réception

```
PA choisie par l'entrepreneur
        │  webhook serveur-à-serveur signé (HMAC-SHA256)
        ▼
POST /pa/webhook/:token  ──►  résolution du point d'entrée (pool d'administration journalisé)
        │                     vérification de signature (adaptateur, temps constant)
        ▼                     décodage/validation (zod strict, limite de taille)
Transaction tenant (RLS 074) ─► registre d'idempotence (provider, event_id, organisation)
        │                     détection de doublon de contenu (SHA-256)
        │                     archivage de l'original sans altération (stockage privé)
        │                     rapprochement fournisseur (email, nom normalisé)
        ▼
supplier_electronic_invoices  +  supplier_electronic_invoice_events (journal)
        ▼
Consultation / correction / approbation utilisateur (routes authentifiées, RLS)
```

Composants (backend) :

| Fichier | Rôle |
|---|---|
| `backend/src/services/pa/types.ts` | Interface stable `PaAdapter` : tout fournisseur PA = un adaptateur, sans toucher au reste de l'application |
| `backend/src/services/pa/generic.ts` | Adaptateur de référence « generic » (contrat signé ci-dessous) — **non connecté à une PA réelle** |
| `backend/src/services/pa/index.ts` | Registre des adaptateurs ; aucun endpoint de PA réelle codé en dur |
| `backend/src/services/pa/inbox.ts` | Traitement webhook : idempotence, doublons, archivage, rapprochement, journal, reprise |
| `backend/src/routes/pa.ts` | Routes webhook (public) et boîte de réception (authentifiées) |
| `backend/migrations/075_pa_supplier_invoice_inbox.sql` | Tables + RLS (additive, idempotente) |

Le JSON de préparation interne (`backend/src/services/electronic-invoice.ts`, `standard: null`,
`transmissionStatus: 'not_implemented'`) reste un **modèle métier interne** : il n'est ni un format
réglementaire, ni transmis à une PA comme facture structurée.

## 3. Contrat d'authentification du webhook (adaptateur « generic »)

- En-tête : `X-Aurion-PA-Signature: t=<unix>,v1=<hex>` avec
  `v1 = HMAC-SHA256(AURION_PA_WEBHOOK_SECRET, "<t>.<corps brut>")`.
- Comparaison à temps constant ; horodatage rejeté au-delà de ±300 secondes (anti-rejeu).
- La charge utile d'un appel à signature invalide n'est ni décodée ni conservée ; la tentative est
  journalisée (`webhook.signature_invalid`) côté organisation.
- Jeton d'URL : UUID par organisation et plateforme (`pa_webhook_endpoints.token`), résolu via le
  pool d'administration journalisé (`platform_admin_access_log`). Rotation possible
  (`POST /pa/endpoints {rotate:true}`) ; l'ancien jeton devient inactif (404).

## 4. Enveloppe JSON de l'événement (contrat générique de référence)

```json
{
  "eventId": "evt-<identifiant unique fourni par la PA>",
  "type": "invoice.received",
  "occurredAt": "2026-11-13T10:00:00Z",
  "invoice": {
    "invoiceId": "identifiant PA de la facture",
    "number": "FA-2026-0142",
    "issueDate": "2026-11-13",
    "dueDate": "2026-12-13",
    "currency": "EUR",
    "supplier": { "name": "…", "siren": "123456789|null", "siret": "…|null", "email": "…|null", "vatNumber": "…|null" },
    "totals": { "net": 100, "tax": 20, "gross": 120 },
    "items": [{ "label": "…", "quantity": 1, "unitPrice": 100, "total": 100 }],
    "document": { "filename": "facture.pdf", "contentType": "application/pdf", "contentBase64": "…" }
  }
}
```

Règles de traitement :

- Types MIME d'origine acceptés : `application/pdf`, `application/xml`, `text/xml`,
  `application/octet-stream` (limite : `AURION_PA_MAX_FILE_BYTES`, 10 Mo par défaut).
- Type d'événement inconnu : acquitté (`200 {received:true, ignored:true}`) sans traitement, avec
  journal — aucune boucle de re-tentatives déclenchée.
- Charge utile non conforme : `422` + événement conservé en statut `error` avec sa charge utile ;
  reprise possible (la PA re-tentative déclenche le re-traitement automatique, ou
  `POST /pa/events/:id/reprocess` manuellement). Une charge utile différente sous un même
  `event_id` est refusée (`409 PA_EVENT_PAYLOAD_CHANGED`).
- Rejeu du même `event_id` : acquitté (`200 {received:true, duplicate:true}`), aucune écriture
  supplémentaire (registre d'idempotence `pa_webhook_events`, unicité
  `(provider, event_id, organisation)`).
- Même contenu sous un autre `event_id` (SHA-256 identique) : copie marquée `duplicate` avec
  référence à l'original ; le fichier n'est pas re-archivé ; les copies de doublon ne sont pas
  modifiables (409).

## 5. Cycle de vie d'une facture reçue

`received` → `reviewed` → `approved` | `rejected` (copie : `duplicate`)

- Rapprochement fournisseur automatique **sans fusion ni création** : email exact (insensible à la
  casse) prioritaire, sinon nom normalisé (minuscules, accents et espaces ignorés — la recherche
  utilisateur tolérante aux accents reste le bloc 12) ; aucune correspondance → `unmatched`,
  plusieurs → `ambiguous`. L'utilisateur rattache ensuite le fournisseur de son choix.
- Correction utilisateur (PATCH `/pa/inbox/:id`) : catégorie comptable interne, rattachement
  fournisseur, statut de revue. **L'approbation ne génère aucune écriture comptable automatique** ;
  chaque changement est horodaté et journalisé.
- Original archivé dans le stockage privé (`private/<org>/pa-inbox/<année>/<event>/<fichier>`),
  clé référencée en base, SHA-256 scellé, restitué à l'identique via `/pa/inbox/:id/file`.

## 6. Configuration et mise en service

| Variable | Rôle |
|---|---|
| `AURION_PA_PROVIDER` | Identifiant de l'adaptateur (`generic` pour le contrat de référence). Vide = réception refusée explicitement (503). |
| `AURION_PA_WEBHOOK_SECRET` | Secret de signature HMAC (≥ 32 caractères ; obligatoire dès que le provider est défini, y compris hors production ; jamais journalisé). |
| `AURION_PA_MAX_FILE_BYTES` | Taille maximale du fichier original (1024 o – 20 Mo ; 10 Mo par défaut). |
| `AURION_PA_OUT_TIMEOUT_MS` | Bloc 4 — délai d'attente d'un accusé d'émission (1 000 – 120 000 ms ; 15 s par défaut). |

Étapes de connexion d'une PA (à exécuter lors d'un bloc ultérieur, avec validation sandbox) :

1. Écrire un adaptateur dédié derrière `PaAdapter` (signature et enveloppe propres à la PA) et
   l'enregistrer dans `services/pa/index.ts` — sans endpoint codé en dur dans le contrat commun.
2. Configurer `AURION_PA_PROVIDER` et `AURION_PA_WEBHOOK_SECRET` sur l'environnement cible.
3. Provisionner le point d'entrée (`POST /pa/endpoints`) et configurer l'URL renvoyée dans la PA.
4. Recette sandbox complète : réception, re-tentatives, doublons, erreurs, reprise, accusés.

## 7. Limites documentées (bloc 3)

- Aucune PA réelle n'est connectée : les tests de contrat et d'intégration valident le contrat
  générique, pas une intégration contractuelle.
- La réception est synchrone dans l'appel webhook (fichiers ≤ 10 Mo) ; le registre d'événements
  et la reprise manuelle tiennent lieu de file d'attente sûre. Un worker de reprise dédié pourra
  être ajouté lors de la connexion d'une PA réelle si ses re-tentatives s'avèrent insuffisantes.
- Le e-reporting n'est pas implémenté : aucune donnée de transaction n'est transmise.

## 8. Émission des factures électroniques (bloc 4)

### 8.1 Ce qui est livré (15.4.3)

| Composant | Rôle |
|---|---|
| `services/electronic-invoice-ubl.ts` | Génération **UBL 2.1 Invoice** (CIUS EN 16931), déterministe |
| `services/electronic-invoice-cii.ts` | Génération **CII D16B** (profil Factur-X « BASIC »), XML autonome |
| `services/electronic-invoice-validate.ts` | Validation interne avant archivage : XML bien formé (XMLValidator), règles arithmétiques EN 16931 (BR-CO-10/11/13/14/15/16/17), catégorie E + motif art. 293 B, présence des mentions |
| `services/electronic-outgoing.ts` | Cycle de vie : préparation idempotente, transmission signée, accusés, reprises, journal |
| `services/pa/outgoing/*` | Adaptateur d'émission (`PaOutgoingAdapter`) + contrat générique sortant |
| `routes/pa-outgoing.ts` | Routes authentifiées : configuration du point d'entrée, préparation, transmission, consultation, téléchargement des documents et accusés |
| `migrations/076_outgoing_electronic_invoices.sql` | Mentions + 3 nouvelles tables (RLS : 68 politiques tenant_isolation) |

### 8.2 Les quatre mentions obligatoires du 1er septembre 2026

Vérifiées le 13 novembre 2026 sur economie.gouv.fr (« Tout savoir sur la facturation
électronique pour les entreprises ») et les spécifications externes DGFiP :

| Mention | Transport UBL 2.1 | Transport CII D16B | Saisie |
|---|---|---|---|
| **Numéro SIREN du client** | `cac:PartyLegalEntity/cbc:CompanyID @schemeID="0002"` (BT-47) | `BuyerTradeParty/SpecifiedLegalOrganization/ram:ID @schemeIdentifier="0002"` | `einvoice_buyer_siren` (9 chiffres, exigé) |
| **Catégorie de l'opération** (livraison de biens **LB**, prestation de services **PS**, mixte **LBPS**) | `cbc:ProfileID` (BT-23) | `ExchangedDocumentContext/BusinessProcess…/ram:ID` | `einvoice_operation_category` (exigée) |
| **Option pour le paiement de la TVA sur les débits** (« le cas échéant ») | `cbc:Note` (BT-21/BT-22, texte exact) | `IncludedNote/ram:Content` | `einvoice_vat_on_payment` (booléen) |
| **Adresse complète de livraison** si différente de la facturation | `cac:Delivery` (BT-79/BT-80) | `ApplicableHeaderTradeDelivery/ShipToTradeParty` | `einvoice_delivery_address` (facultative) |

La catégorie de l'opération et le SIREN du client sont **exigés** à la préparation du document
électronique (refus explicite `422 EINVOICE_MENTION_MISSING`, jamais de valeur inventée) ;
l'option TVA sur les débits est portée uniquement lorsqu'elle est cochée ; l'adresse de
livraison uniquement lorsqu'elle est fournie. La mention TVA sur les débits est portée en note
de facture (mécanisme standard EN 16931 pour les mentions légales non modélisées dans le noyau) :
la variante propre à la PA retenue sera confirmée lors de la validation sandbox.

### 8.3 Cycle de vie de transmission (états traçables)

```
prepared ──transmission signée──► submitted ──accusé signé « accepted »──► accepted
   │                                │ └─accusé signé « rejected »──► rejected
   │ (régénération possible)        └───transport indisponible / délai / accusé douteux──► timeout
```

- **Aucune facture n'est jamais marquée transmise sans accusé signé de la PA** : seul un accusé
  authentifié (HMAC vérifié, anti-rejeu) fait passer l'état à `accepted`/`rejected` ; tout autre
  résultat reste `timeout` (« issue non confirmée ») et la facture réglementaire reste non
  transmise (`quotes.electronic_status` inchangé hors accusé réel).
- **Idempotence** : l'identifiant de transmission (`X-Aurion-PA-Transmission-Id`) est stable
  entre les re-tentatives — une reprise après délai dépassé ré-acquitte le premier verdict et ne
  peut créer aucun doublon côté PA (vérifié par test avec un serveur de recette réel).
- **Anti-doublon schéma** : index unique partiel — une seule transmission ouverte par facture.
- **Intégrité** : le document XML est archivé dans le stockage privé avant transmission, scellé
  SHA-256 ; l'empreinte est revérifiée avant chaque envoi ; l'accusé est archivé sans altération
  (clé + SHA-256 scellés en base) et consultable (`GET /pa/outgoing/:id/ack`).
- **Journal complet** : préparation, régénération, démarrage, accusé accepté/rejeté, issue non
  confirmée, reprise (`outgoing_transmission_events`).

### 8.4 Contrat sortant générique (adaptateur « generic », non connecté)

```
POST {point d'entrée d'émission de la PA}          — HTTPS public en production, boucle locale hors production
X-Aurion-PA-Transmission-Id : <uuid stable>         — idempotence côté PA
X-Aurion-PA-Format : ubl | cii
X-Aurion-PA-Signature : t=<unix>,v1=<hex(HMAC-SHA256(secret, "<t>.<corps>"))>
Content-Type : application/xml
 Corps : document structuré (XML UBL/CII UTF-8)
```

Accusé attendu (2xx, JSON signé par la PA avec le même schéma) :

```json
{ "status": "accepted", "paReference": "…" }
{ "status": "rejected", "code": "…", "message": "…" }
```

Un accusé non signé, mal formé ou de statut inconnu est refusé (`invalid_ack` → « issue non
confirmée ») ; toute réponse non 2xx ou indisponible est un échec de transport re-prenable.
Configuration : `GET/POST /pa/outgoing-endpoints` (URL + secret ≥ 32 caractères, chiffré
AES-256-GCM au repos, jamais journalisé) et `AURION_PA_OUT_TIMEOUT_MS` (délai d'attente d'un
accusé, 15 s par défaut).

## 9. Limites documentées (bloc 4)

- **Aucune PA réelle n'est connectée** : le contrat sortant `generic` est testé de bout en bout
  contre un serveur HTTP de recette réel (boucle locale) ; **la transmission n'est pas déclarée
  opérationnelle en production** tant qu'aucune PA contractuelle n'a été validée en sandbox.
- **Périmètre de formats** : UBL 2.1 et CII D16B (profil Factur-X BASIC) sont générés et
  testés. L'**assemblage Factur-X complet (PDF/A-3 avec CII embarqué)** n'est pas livré :
  aucune chaîne de validation PDF/A n'est disponible pour garantir la conformité du conteneur,
  et aucune prétention de conformité non prouvée n'est introduite.
- **Validation de format** : la validation interne couvre XML bien formé, champs obligatoires,
  mentions et règles arithmétiques EN 16931 ; elle **ne remplace pas** la validation
  XSD/Schematron officielle réalisée par la PA à la réception (aucun jeu de schémas officiel
  embarqué). La chaîne de personnalisation (BT-24) utilisée est le CIUS noyau
  `urn:cen.eu:en16931:2017` ; la chaîne propre à la PA retenue sera alignée en sandbox.
- Les lignes du document électronique reproduisent la composition facturée réelle (pièces,
  livraison, kilométrage facturé, main-d'œuvre — solde garantissant Σ lignes = total HT, règle
  BR-CO-10) et non le détail du catalogue interne.
- Le **e-reporting** est livré au bloc 5 (voir § 10) : les déclarations de données de transaction et de paiement sont générées, scellées et transmissibles via la même PA ; aucune PA contractuelle n'est connectée (même distinction génération conforme / transmission non opérationnelle).
- L'interface de transmission (bouton « transmettre à la PA ») accompagnera la connexion
  contractuelle d'une PA, comme pour la réception, pour éviter de livrer une interface sans
  usage réel ni test navigateur dédié ; les quatre mentions sont déjà saisissables dans
  l'éditeur de facture.

## 10. E-reporting : données de transaction et de paiement (bloc 5)

### 10.1 Cadre réglementaire appliqué

Doctrine officielle **vérifiée le 14 novembre 2026** sur impots.gouv.fr et economie.gouv.fr
(BOFiP ACTU-2026-00145 du 30 septembre 2026, « Obligation de transmission à l'administration
des données de transaction et de paiement ») :

- L'e-reporting comprend **deux composantes** : les **données de transaction** et les
  **données de paiement**.
- **Échéances** : 1er septembre 2026 (grandes entreprises et ETI) ; **1er septembre 2027 pour
  les micro-entreprises et PME** (option d'anticipation possible dès 2026). Aurion cible les
  micro-entreprises : la préparation des flux est disponible dès maintenant, sans prétendre à
  une obligation anticipée.
- Les données de facture ne sont pas déposées quotidiennement facture par facture : la
  périodicité suit le **régime de TVA de l'entreprise** (mensuelle ou trimestrielle).

### 10.2 Matrice de périmètre (aucune inférence automatique)

| Situation | Traitement | Motif porté dans le flux |
|---|---|---|
| Client **non-assujetti** (particulier), TVA française due | **Dans le périmètre** — transaction + paiements | `b2c_domestic_transaction` / `b2c_domestic_payment` |
| Client **assujetti non établi en France**, TVA française due | **Dans le périmètre** — transaction + paiements | `b2b_international_transaction` / `b2b_international_payment` |
| Client **assujetti établi en France** | **Exclu** : relève de l'ÉMISSION électronique (§ 8, bloc 4) | `einvoicing_b2b_domestic` |
| Exonération **déclarée** par l'utilisateur (export, livraison intracommunautaire, art. 261 à 261 E du CGI…) — motif obligatoire | **Exclu** | `exempt_declared` |
| **TVA non facturée** (franchise en base, taux 0) | **Exclu** de l'e-reporting de transaction | `vat_not_billed` |
| Opérations exonérées « dispositives » (exportations, livr. intracommunautaires), importations de biens, contrats défense/sécurité | **Exclues** conformément à la doctrine | — |

Le classement s'appuie exclusivement sur des **déclarations utilisateur** (jamais déduites du
nom, du SIRET ou du seul type de document) :

- **Fiche client** : `buyerCategory` (`assujetti_fr` | `assujetti_etranger` | `non_assujetti`),
  `countryCode` (ISO 3166-1 alpha-2), `vatNumber` (n° de TVA intracommunautaire ou identifiant
  fiscal étranger). Non renseigné = écart signalé, jamais de classement automatique.
- **Facture** : `ereportingExempt` + `ereportingExemptReason` (motif obligatoire si
  exonération déclarée), catégories d'opération et option TVA sur les débits déjà saisies
  depuis le bloc 4. Champs instantanés du document historique.

**Données de paiement portées** : date de collecte, montant collecté, numéro de facture — pour
les factures du périmètre à **TVA exigible à l'encaissement** (catégorie PS/LBPS) dont
l'option « TVA sur les débits » n'est pas exercée ; les ventes de biens (LB, TVA exigible à la
livraison) ne portent pas de données de paiement séparées.

### 10.3 Cycle de vie et garanties (miroir du bloc 4)

- **Aperçu** (`POST /pa/ereporting/preview`) : lignes de transaction et de paiement, totaux,
  exclusions motivées et **rapport d'écarts** — sans aucune écriture.
- **Préparation** (`POST /pa/ereporting/declarations`) : la préparation **REFUSE** (422
  `EREPORTING_CLASSIFICATION_INCOMPLETE`) tant qu'une facture de la période n'est ni classée ni
  explicitement exclue — le rapport d'écarts joint liste chaque correction attendue. Le flux
  JSON (`aurion.ereporting/1`) est **validé** (structure, arithmétique Σ lignes = totaux,
  période) puis **archivé scellé** (SHA-256) avant toute transmission ; les lignes sont figées
  en base.
- **Transmission** (`POST /pa/ereporting/declarations/:id/transmit`) : même contrat sortant
  `generic` que l'émission (signature HMAC-SHA256, `X-Aurion-PA-Format: ereporting`,
  `Content-Type: application/json`, identifiant d'idempotence stable). **Seul un accusé signé**
  fait passer l'état à `accepted`/`rejected` ; timeout, transport indisponible ou accusé douteux
  => `timeout` (« issue non confirmée »), la déclaration reste réglementairement non transmise.
  L'intégrité du flux scellé est revérifiée avant chaque envoi
  (`EREPORTING_PAYLOAD_TAMPERED`).
- **Correction** (`POST /pa/ereporting/declarations/:id/corrections`) : une déclaration de
  correction référence la déclaration corrigée, fige ses propres lignes recalculées à partir
  des données corrigées ; l'originale reste archivée **sans altération** (aucune réécriture de
  l'historique).
- **Journal complet** (`ereporting_events`) : préparation, correction, envoi, accusés, écarts
  d'intégrité — chaque entrée horodatée avec détail.
- **Isolation** : les trois nouvelles tables (`ereporting_declarations`, `ereporting_lines`,
  `ereporting_events`) portent la politique RLS `tenant_isolation` (échec fermé sans contexte),
  testées A/B sur PostgreSQL réel.

### 10.4 Limites documentées (bloc 5)

- **Aucune PA réelle n'est connectée** : le contrat sortant est testé de bout en bout contre un
  serveur HTTP de recette réel ; **la transmission e-reporting n'est pas déclarée opérationnelle
  en production** tant qu'aucune PA contractuelle n'a été validée en sandbox.
- **Format du flux** : `aurion.ereporting/1` (JSON structuré, schéma documenté et validé) est le
  contrat du référentiel `generic`. Le **format définitif dépend de la PA retenue** (aucun
  format e-reporting consolidé n'est imposé par la doctrine au 14 novembre 2026) ; l'adaptateur
  dédié de la PA transportera son format sans toucher au reste de l'application.
- L'interface utilisateur de déclaration (boutons de préparation/transmission) accompagnera la
  connexion contractuelle d'une PA, comme en réception et à l'émission ; l'API complète est
  testée et les déclarations sont consultables via `/pa/ereporting/declarations`.
- La réception e-reporting côté administration (statuts retour de la DGFiP via la PA) suivra
  les états convenus avec la PA retenue.
