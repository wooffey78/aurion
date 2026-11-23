# BLOC 0 — Audit complet d'Aurion 15.4.23 (14 novembre 2026)

> Audit réalisé conformément au prompt maître « Évolution Aurion 15.4.23 — multiplateforme, hors connexion, rejeu automatique ». **Aucune modification de comportement** : le code livré dans ce ZIP est strictement celui de `aurion-15.4.23.zip` (SHA-256 `1c699198964df518a94dc9e8b57c7cde21148dff43e66d56f37078a033d6195f`, vérifié), augmenté du seul présent rapport. Le document complémentaire « Texte collé(9).txt » = PROMPT-CHAMPI V2 (13 novembre 2026), dont les chantiers historiques (RLS, e-invoicing, micro-entreprises, CI stricte) sont vérifiés ci-dessous comme déjà réalisés dans la 15.4.23.

## 1. Méthode et preuves d'intégrité

- SHA-256 de l'archive reçue recalculé : `1c699198…d6195f` — identique à la valeur attendue.
- ZIP extrait et comparé (`diff -rq`) à l'arbre de travail : **sources strictement identiques** (seul écart : `backend/dist`, artefact de build regénérable).
- Suite rejouée sur ce code exact en 15.4.23 (log de validation du 14/11/2026) : migrations ×2 idempotentes, `npm run check` exit 0 (fumée 79/79, parcours Playwright), `npm test` 448/448, 0 ignoré. Les artefacts `dist-artifacts/validation-bloc25.txt` (439/439) et `validation-b0.txt` (15.3.20) sont **historiques** et ne sont pas utilisés comme preuve de la 15.4.23.

## 2. Matrice « existe / partiel / absent » — vérification point par point des affirmations du prompt maître

| # | Affirmation du prompt | Verdict | Preuve (chemin:ligne) |
|---|---|---|---|
| 1.1 | Frontend JS natif servi par Fastify ; manifest + sw présents | **EXISTE** | `assets/js/` (aucun React/Vite : aucune dépendance react dans les package.json) ; `manifest.webmanifest` ; `sw.js` |
| 1.1 | sw.js : shell public seulement, pas d'API privée | **EXISTE** | `sw.js:29-31` « Only public application shell assets are cached. API responses may contain private business data » — caché seulement si `assets/`/`branding/`/`index.html` |
| 1.2 | File de fichiers IndexedDB `aurion-cloud-queue`, clientRef, SHA-256, backoff, verrou inter-onglets | **EXISTE** | `assets/js/core/cloud-sync.js:9` (`aurion-cloud-queue`), `:40` clientRef, `:35-39` sha256, `:76` backoff avec jitter, `:111` `navigator.locks.request('aurion-cloud-sync')`, reprises `:127-132` (chargement, `online`, visibilité, 60 s) |
| 1.2 | File liée au compte, fichiers conservés jusqu'à confirmation serveur | **EXISTE** | `cloud-sync.js:33` (`setCloudOwner`), `:107` (filtre `owner`), `:86` (effacement du blob seulement après confirmation) |
| 1.3 | `/sync/version` avec ETag, intervalle adaptatif | **EXISTE** | `backend/src/routes/settings.ts:31` (rate limit 120/min) ; `assets/js/account-sync.js:7` (1 s → 16 s), `:12-14` (If-None-Match/304) |
| 1.3 | Migrations 056-059 : `account_sync_versions` + triggers de révision | **EXISTE** | `backend/migrations/056_account_wide_sync.sql:2,11-14` ; correctifs 057/058/059 (whitelist, recréation) |
| 1.4 | `user_drafts` + `/settings/draft` GET/PUT/DELETE | **EXISTE** | `migrations/054_synced_quote_drafts.sql:3-9` ; `settings.ts:42,49,65` ; front `api.getDraft/saveDraft/deleteDraft` |
| 1.6 | `storage.ts` : backends local + S3 ; OVH préconfiguré ; S3 obligatoire en production | **EXISTE** | `backend/src/services/storage.ts:13,47-55` ; `backend/src/config.ts:40` (`s3.de.io.cloud.ovh.net`, région `de`), `:73` (erreur si S3 incomplet en production) |
| 1.6 | `assets/js/config.js` contient l'URL Render codée en dur | **EXISTE (à corriger au Bloc 1)** | `assets/js/config.js:7` `const PROD_API='https://aurion-2hye.onrender.com'` — utilisée uniquement hors origine HTTP (fichier local/enveloppe native) |
| 1.6 | `render.yaml` fait encore référence à un plan payant | **EXISTE (à corriger au Bloc 1)** | `render.yaml:43` `plan: starter` |
| 1.7 | Numérotation serveur : séquences 067, attribution côté serveur | **EXISTE** | `migrations/067_business_document_number_sequences.sql:2` (`document_number_sequences`) ; attribution dans `services/invoice-workflow.ts` lors des créations/émissions |
| 1.8 | Google OIDC complet (state, PKCE, callback) distinct des scopes Gmail/Drive/Calendar | **EXISTE** | `routes/auth.ts:53` (`/auth/google/status`), `:60` (`/auth/google/start`, cookie state `sameSite:'lax'` borné au callback), `:46` callback ; intégrations séparées dans `routes/integrations.ts` + `services/google.ts` |
| 1.8 | `native_sessions`, WebAuthn/passkeys | **EXISTE** | `migrations/011_native_sessions.sql:1,14` ; `services/webauthn.ts` ; routes `/auth/webauthn/*` dans `api.js` |
| 1.9 | Console admin, VIP, exemption d'abonnement | **EXISTE** | `migrations/013`, `024_admin_vip_guest_accounts.sql` ; `services/account.ts:121-124` : `subscriptionState()` renvoie `admin` ou `vip` **sans essai ni abonnement** (avant tout calcul d'essai) |
| 1.9 | **Écart** : l'invitation refuse les e-mails déjà inscrits | **CONFIRMÉ — ABSENT, à compléter au Bloc 10** | `routes/admin.ts:100` : `select 1 from users where lower(email)=lower($1)` → `409 ACCOUNT_EXISTS` |
| 1.10 | E-invoicing : réception (075), émission UBL/CII (076), e-reporting (077) | **EXISTE (mécanismes)** | `migrations/075_pa_supplier_invoice_inbox.sql`, `076_outgoing_electronic_invoices.sql`, `077_ereporting_declarations.sql` ; `services/electronic-invoice-ubl.ts`, `-cii.ts`, `-validate.ts`, `electronic-outgoing.ts`, `electronic-ereporting.ts`, `electronic-ereporting-matrix.ts` ; routes `pa.ts`, `pa-outgoing.ts`, `pa-ereporting.ts`. **Aucune PA réelle connectée** : la transmission n'est pas opérationnelle en production (état honnête maintenu) |
| 1.11 | Observabilité : journaux structurés, X-Request-Id, redaction | **EXISTE** | `services/observability.ts` ; en-tête `X-Request-Id` posé par le serveur ; D6 (suivi d'erreurs tiers) toujours non tranchée |
| 1.12 | README encore en 15.4.4 | **CONFIRMÉ — à corriger** | `README.md:1` « Aurion 15.4.4 » |
| 1.12 | Checklist/runbook en 15.4.22 | **CONFIRMÉ (références de contexte, à harmoniser)** | `docs/CHECKLIST-PRE-PRODUCTION.md`, `docs/RUNBOOK-PRODUCTION.md` mentionnent 15.4.22 |
| 1.12 | PREPARATION-PLAY-STORE : TWA/Bubblewrap historique, aucun projet natif | **CONFIRMÉ — ABSENT** | `docs/PREPARATION-PLAY-STORE.md:7` (TWA) ; aucun dossier `android/`, `ios/`, aucun Capacitor dans les dépendances |
| 1.12 | `docs/RECETTE-BETA-PRIVEE.md` cases vierges | **CONFIRMÉ** | zones « Résultat obtenu : ____ » volontairement vides (à exécuter en Bloc 16) |

**Conclusion de la matrice** : le socle décrit en §1 du prompt maître est **réel et vérifié ligne par ligne**. Les trois absences majeures : réplication locale générale des données métier (Blocs 2-3), outbox métier + rejeu automatique (Blocs 4-5), projets natifs Android/iOS (Bloc 8).

## 3. Opérations nécessitant une connexion — inventaire structurant pour le Bloc 4

**Point d'accroche unique vérifié** : toutes les écritures du frontend passent par `request()`/`authFetch()` dans `assets/js/core/api.js` (13 usages `method:'POST'|'PUT'|'DELETE'` concentrés dans ce module ; les pages appellent uniquement les helpers `api.*`). Aucune écriture directe `fetch` métier en dehors de `account-sync.js` (lecture seule) et `cloud-sync.js` (file de fichiers, préservée).

Écritures métier éligibles à l'outbox (opérateurs `api.*` → route serveur) : clients, fournisseurs, activités, appareils, SAV, pièces/prix, interventions, adresses d'intervention, rendez-vous, devis (création/mise à jour/suppression/conversion), factures (paiements, échéances, relances, pénalités), notes de frais, modules, marges fiscales, hypothèses de prévision, journal, signature e-mail, brouillon de devis, template choices, support. Hors périmètre outbox (exigent une décision immédiate ou un secret) : authentification, avatar/logo/templates (upload binaire → file de fichiers existante), billing (paiement réel), administrateur de plateforme, intégrations Google/mail.

## 4. Tables pour la réplication locale (Bloc 3)

104 tables au total (`CREATE TABLE` des migrations 001-083). Périmètre de réplication candidat : organisations, membres, activités (+profils, contributions, hypothèses), clients (+adresses d'intervention), fournisseurs, consommables, pièces (+prix), interventions, appareils, garanties/SAV/polices, rendez-vous, devis et lignes, factures et lignes, paiements/échéances/relances, notes de frais, écritures comptables, transactions bancaires, journal, documents (métadonnées), modules et paramètres, `user_drafts`, `document_number_sequences` (lecture : compteur courant seulement, jamais d'attribution locale). **Exclues** : secrets (`mail_accounts.password_enc`, clés S3/Stripe/Google), jetons (`google_oauth_states`, `cloud_oauth_states`, `email_verification_tokens`), tables de sécurité serveur (`legal_documents` servis par API publique), tables internes d'administration plateforme, `native_sessions`.

## 5. Estimation de préparation : 60 % confirmée

Le recalibrage à 60 % (contre 67 % sur l'ancien périmètre) est **justifié** : le dénominateur s'élargit à Android+iOS natifs, réplication locale complète et outbox métier — trois chantiers qui n'existent pas (0 %, cf. matrice). La progression ne sera comptée qu'avec des fonctions réalisées et testées, comme exigé.

## 6. Risques et fonctions à préserver (garde-fous pour tous les blocs)

1. **File de fichiers** (`aurion-cloud-queue`) : ne jamais fusionner le schéma de la nouvelle outbox métier avec le store `items` existant (VERSION 1 immuable) ; nouvelle base ou nouveau store séparé.
2. **Signal de révision** (`account_sync_versions` + triggers 056-059) : réutiliser comme curseur/notify, ne pas recréer.
3. **Numérotation** (067) : aucun numéro officiel côté client ; le serveur attribue dans une transaction au rejeu.
4. **RLS 074** + `withTenant` : chaque nouvel endpoint (snapshot/delta/ops) doit passer par le contexte tenant existant ; échec fermé sans contexte.
5. **Migrations immuables** : prochaine migration = **084**, additive, idempotente.
6. **Secrets** : jamais dans la réplication locale (exclusions §4) ; `AURION_ENCRYPTION_KEY` et clés fournisseurs restent serveur.
7. **Interface API front** : l'interception hors connexion se greffe sur `request()` sans changer un seul helper `api.*` (aucune page modifiée pour le moteur).
8. **GitHub** : aucune poussée, conformément au document complémentaire (« tu ne touchera jamais au depot github »).

## 7. Plan des blocs (état à l'issue du Bloc 0)

| Bloc | Contenu | État |
|---|---|---|
| 0 | Audit complet (ce rapport) | **Livré** |
| 1 | OVH cible / Render gratuit : config d'environnement, `render.yaml`, procédure de migration, coûts OVH | Enchaîné |
| 2 | Interface de stockage local versionnée + adaptateurs IndexedDB/SQLite | Enchaîné |
| 3 | APIs snapshot/delta + migration 084 + tests A/B tenant | Enchaîné |
| 4 | Outbox métier + rejeu automatique (idempotence, ordre, dépendances) | Enchaîné |
| 5 | Numérotation/émission/envoi automatiques à la reconnexion | Enchaîné |
| 10 | VIP : cas utilisateur déjà inscrit | Enchaîné |
| 6-9, 11-16 | Documents récents, UI de synchronisation, Capacitor, tarif/PA/Brevo, juridique, tests, bêta | À venir, dans l'ordre |

Chaque bloc livré produit un ZIP complet dont l'empreinte SHA-256 est publiée ; le ZIP du bloc précédent devient l'unique base du suivant.
