# Aurion — Plan de réalisation et registre des demandes

Version de référence : **15.4.0** (`VERSION.txt`, `package.json`, `backend/package.json`)
Dépôt : `https://github.com/wooffey78/aurion` — branche de référence **main**
SHA de référence vérifié au démarrage du cycle : **`65af132bf8fa61ee591ede7aeea5d980809a131a`** (« Merge Neon S3 path-style support »)
Branche de travail : `freebuff/9b43ddacea217b34c9ba7862`
Date du cycle : 18 novembre 2026

Ce document est le registre unique de la mission. Il ne remplace pas `docs/AVANCEMENT-15.4.0.md` (historique de la livraison 15.4.0) : il reprend chaque demande, son état réel, ses preuves, ses anomalies et ses prérequis. Aucune demande n'est retirée sans justification explicite.

---

## 1. Mode de preuve

Une demande n'est déclarée « validée » que par l'un des niveaux suivants, explicitement indiqué :

| Niveau | Signification |
|---|---|
| **T1 — test automatisé** | un test du dépôt couvre la demande et a été exécuté avec succès dans ce cycle. |
| **T2 — PostgreSQL réel** | la demande a été exercée sur un serveur PostgreSQL réel (migrations, privilèges, intégration). |
| **T3 — lecture de code** | le comportement est vérifié par lecture précise du code, sans exécution de bout en bout. |
| **T4 — non vérifié** | aucun contrôle suffisant n'a pu être exécuté dans cet environnement. |
| **BLOQUÉ** | un prérequis externe (identifiant, compte, console tierce) empêche la validation. |

Un mock, une capture d'écran ou l'existence d'un fichier ne valident jamais une demande. Les tests « simulés » sont signalés comme tels.

### Contrôles réellement exécutés dans ce cycle

| Contrôle | Commande | Résultat |
|---|---|---|
| Installation reproductible | `npm ci --prefix backend --include=dev` | OK (lockfile respecté) |
| Compilation TypeScript | `npm run build` | OK |
| Typecheck strict | `npm run typecheck` | OK |
| Vérification front-end (syntaxe + imports/exports) | `npm run test:frontend` | OK — 38 fichiers, 37 modules |
| Lint front-end | `npm run lint:frontend` (ESLint 8.57.1) | OK |
| Tests smoke | `npm run test:smoke` | OK — **91/91** |
| Suite backend complète (sans base) | `npm test` | OK — 331 tests déclarés, 317 réussis, 0 échec, 14 ignorés (intégration) |
| **Migrations sur PostgreSQL réel, deux exécutions** | `node dist/migrate.js` ×2 sur PostgreSQL 18 (binaires userland) | OK — 70 migrations, 2ᵉ exécution sans erreur (idempotence) |
| **Privilèges runtime** | requêtes de contrôle après migration | OK — runtime sans accès à `schema_migrations`, DDL refusé |
| **Suite complète avec PostgreSQL réel** | `AURION_INTEGRATION_TESTS=1 npm test` | OK — **340 tests, 340 réussis, 0 échec, 0 ignoré** |
| Tests navigateur Playwright | `npm run test:browser` | **non exécuté** : binaire Chromium non téléchargé dans cet environnement (réseau limité en durée). La CI l'exécute. |

Le détail des journaux de ce cycle est conservé dans `dist-artifacts/` lors des exécutions CI ; localement, les sorties ont été vérifiées pas à pas (codes de sortie inclus).

---

## 2. État d'avancement des blocs

| Bloc | Intitulé | État ce cycle | Commentaire |
|---|---|---|---|
| B0 | Audit intégral et baseline | **Fait** | Audit du dépôt, baseline reconstituée, présent registre. |
| B1 | CI stricte et protection qualité | **Fait (dépôt)** | PR #37 intégrée (2 commits) ; CI à tolérance zéro ; protection de branche hors périmètre agent. |
| B2 | Parcours d'accueil et propagation SIRET/SIREN | **Vérifié, aucune régression introduite** | Détection au clic, validation locale, propositions champ par champ ; tests dédiés verts. |
| B3 | Données, paramètres, cohérence métier | **Partiel** | Contrats existants verts ; audit de cohérence à poursuivre écran par écran. |
| B4 | Facturation, relances, paiements, comptabilité | **Corrigé + vérifié** | Faux message « facture envoyée » supprimé ; relances/paiements vérifiés (voir R-B4). |
| B5 | Messagerie, agenda, retours d'intégration | **Corrigé + partiel** | Retour d'envoi e-mail honnête ; fournisseurs réels non testables sans identifiants (BLOQUÉ). |
| B6 | Journal de bord et notifications | **Vérifié (T1/T3)** | Journal unique, actions routées, tests de priorité/persistance verts. |
| B7 | Responsive, accessibilité, ergonomie | **Partiel** | Dialogues natifs supprimés ; contrastes/notifications testés ; recette multi-appareils non exécutée (pas de navigateur ici). |
| B8 | Migrations, sécurité, PostgreSQL, Neon, Render | **Partiel vérifié** | Migrations et rôles validés sur PostgreSQL réel ; ressources Neon/Render non vérifiables sans accès console (BLOQUÉ). |
| B9 | Réplication multi-appareils et hors ligne | **Non réalisé** | Voir R-B9 : la cible demandée n'existe pas encore dans le dépôt. |
| B10 | Application Android Capacitor | **Non réalisé / BLOQUÉ** | Aucune dépendance ni projet Capacitor ; toolchain Android absente. |
| B11 | Application iOS Capacitor | **Non réalisé / BLOQUÉ** | Idem ; compilation iOS impossible hors macOS/Xcode. |
| B12 | Publication Android automatisée | **Non réalisé / BLOQUÉ** | Compte Play, clés de signature et secrets absents (voir §7). |
| B13 | Harmonisation juridique et commerciale | **Partiel** | Documents encore préparatoires : identifiés comme non définitifs (voir R-B13). |
| B14 | Automatisation PowerShell et exploitation | **Existant, à étendre** | Scripts présents et testés partiellement ; diagnostics Neon/Render non automatisaables sans accès. |
| B15 | Recette finale, archive, livraison | **Partiel** | Archive sources produite par script ; livraison production non autorisée. |

---

## 3. Proposition de livraison par cycle

Chaque cycle produit des commits isolés et vérifiés. Le présent cycle livre :

1. **B0** — audit, baseline, registre.
2. **B1** — CI stricte (PR #37) : plus aucune tolérance de baseline, Node issu de `.node-version`, PostgreSQL 17 jetable, rôles séparés.
3. **B4/B5** — deux fausses confirmations corrigées : conversion devis → facture et envoi d'e-mail.
4. **B7** — suppression de tous les dialogues natifs du navigateur, remplacés par les composants Aurion, avec garde-fou automatisé.

---

## 4. Registre détaillé des demandes

Colonnes : **ID** · **Demande** · **Prio** · **État** · **Fichiers impliqués** · **Dépendances** · **Tests** · **Observations / anomalies**.

### 4.1 Périmètre produit (§4 du cahier des charges)

| ID | Demande | Prio | État | Fichiers | Dépendances | Tests | Observations |
|---|---|---|---|---|---|---|---|
| R4.1 | Aucune création d'entreprise, aucun parcours de formalités | P0 | Validé (T1) | `assets/js/pages/onboarding.js`, `index.html`, `assets/js/main.js` | — | `company-existing-onboarding.contract.test.mjs`, `strict-requirements-1-15` | Aucune route de création administrative ; le parcours ne collecte que des données d'entreprise existante. |
| R4.2 | Aucun studio d'identité visuelle / générateur de marque | P0 | Validé (T1) | absence de module ; `onboarding.js` étape logo limitée au téléversement | — | `strict-requirements-1-15` | Logo = simple upload PNG/JPEG/WebP (type réel vérifié, SVG refusé). |
| R4.3 | Aucune recherche d'entreprise par nom | P0 | Validé (T1) | `assets/js/core/company-detect.js`, `backend/src/routes/business.ts` (`/suppliers/lookup`) | registre public | `step18-detection-buttons`, `registry-fill-reliability` | La détection n'accepte qu'un SIRET/SIREN ; aucune recherche textuelle. |
| R4.4 | Anciennes routes et interfaces supprimées non réintroduites | P0 | Validé (T1) | `backend/src/routes/*` | — | `routes.contract.test.mjs`, `routes.duplicates.test.mjs`, `deprecations.test.mjs` | Contrats de routes verts. |
| R4.5 | Données historiques conservées (pas de migration destructive) | P0 | Validé (T2) | `backend/migrations/*` | PostgreSQL | suite complète avec base réelle (340/340) | Migrations additives ; aucune suppression de table/colonne historique dans la dernière migration. |
| R4.6 | Parcours guidé conservé : première configuration + paramètres d'une entreprise existante | P0 | Validé (T1/T3) | `onboarding.js`, `assets/js/pages/dash/other.js` (panneau configuration), `index.html` | — | `onboarding-step3`, `company-existing-onboarding` | Le panneau renvoie vers `#/onboarding` ; le parcours est réutilisable (`?edit=1`). |
| R4.7 | Anciens modules IA non réintroduits | P0 | Validé (T1) | absence de `/ai/*`, de service Ollama | — | `deprecations.test.mjs` | Suppression confirmée par le CHANGELOG et les tests de dépréciation. |

### 4.2 Parcours d'accueil et configuration (§5)

| ID | Demande | Prio | État | Fichiers | Dépendances | Tests | Observations |
|---|---|---|---|---|---|---|---|
| R5.1 | Ordre des 8 étapes | P1 | Validé (T1) | `assets/js/pages/onboarding.js` (`STEPS`) | — | `onboarding-step3`, `strict-requirements-1-15` | Vous → Entreprise → Activité → Logo → Messagerie → Signature → Documents → Récapitulatif. |
| R5.2 | Prénom/nom collectés à l'étape « Vous », jamais obligatoires à la connexion | P0 | Validé (T3 + test de contrat front) | `onboarding.js`, `assets/js/pages/auth.js` | `PATCH /account` | `native-dialogs` (contrat front), tests de routes | En mode connexion, `#full-name-field` est masqué et `required=false` ; seule l'adresse e-mail et la méthode d'authentification sont demandées. **Recette navigateur à refaire** (non exécutée ici). |
| R5.3 | Identité propagée vers Mon compte, Paramètres, signature | P1 | Vérifié (T1/T3) | `onboarding.js`, `backend/src/routes/account.ts`, `backend/src/routes/settings.ts`, `docs/PARCOURS-15.4.0.md` | — | `step32-profile-avatar`, `step27-settings-labels`, suite backend | Correspondance documentée champ → table → écran. |
| R5.4 | Préremplissage des données déjà enregistrées | P1 | Validé (T3) | `onboarding.js` (lecture `organization()`, `account()`, `getEmailSignature()`) | API | `onboarding-step3` | Les formulaires sont initialisés depuis l'état serveur, pas depuis un état local. |
| R5.5 | Détection SIRET/SIREN **au clic uniquement** | P0 | Validé (T1/T3) | `company-detect.js` (aucun écouteur `input`/`blur`), `onboarding.js`, `settings` | registre public | `step18-detection-buttons`, `registry-fill-reliability` | Aucune requête pendant la saisie : seul le bouton « Détecter mon entreprise » appelle `detectCompany`. |
| R5.6 | Mécanisme de détection unique partagé accueil/paramètres | P1 | Validé (T1) | `assets/js/core/company-detect.js` | — | `registry-fill-reliability` | Un seul module, importé des deux écrans. |
| R5.7 | Validation locale (Luhn, exception La Poste), délai d'attente | P1 | Validé (T1) | `company-detect.js` (`validateCompanyIdentifier`, `DETECTION_TIMEOUT_MS=10000`) | — | `public-registry.test.mjs`, `validation.test.mjs` | Cas SIRET d'établissement secondaire, unité cessée, établissement fermé couverts. |
| R5.8 | Propositions champ par champ « Appliquer » / « Ignorer » | P0 | Validé (T1/T3) | `company-detect.js` (`buildProposals`, `renderProposals`) | — | `registry-fill-reliability` | Un champ déjà saisi n'est jamais remplacé sans action explicite ; « Tout appliquer aux champs vides » ne remplit que les champs vides. |
| R5.9 | Formulaire entreprise complet (dénomination, SIRET, SIREN, forme, adresse, CP, ville, activité, NAF, TVA, site) | P1 | Validé (T3) | `onboarding.js` (`stepCompany`), `backend/src/routes/organizations.ts` | — | `company-directory.contract`, `onboarding-step3` | Les champs NAF et TVA sont écrits dans `configuration_data` ; le reste dans `organizations`. |
| R5.10 | Valeurs personnalisées jamais remplacées par des valeurs par défaut | P0 | Validé (T1/T3) | `onboarding.js` (`orgBody` fusionne `configuration_data`), `company-detect.js` | — | `registry-fill-reliability`, `step16-configuration-propagation` | `PATCH /activities/:id` ne vide plus les champs absents (correction 15.4.0 conservée). |
| R5.11 | Récapitulatif affichant les données réellement sauvegardées | P2 | Validé (T3) | `onboarding.js` (`stepRecap`) | API | — | Lit `state.company`, `state.account`, `state.signature`, `state.cloud`, `state.mail`. |
| R5.12 | Métiers, profils, modules, coefficients, taux cohérents | P1 | Partiel | `assets/js/core/pricing.js`, `backend/src/services/pricing.ts`, `assets/js/pages/dash/settings.js` | profils métier | `pricing.test.mjs`, `step5-coefficients`, `step13-coefficient-units` | Contrats verts ; revue écran par écran des profils métier reste à poursuivre (B3). |

### 4.3 Fonctions métier (§6)

| ID | Demande | Prio | État | Fichiers | Dépendances | Tests | Observations |
|---|---|---|---|---|---|---|---|
| R6.1 | Clients : CRUD, fiche complète, historique, adresses postales et d'intervention, documents, isolation par activité | P0 | Validé (T1/T2) | `assets/js/pages/dash/other.js`, `clientsheet.js`, `backend/src/routes/client-addresses.ts`, `business.ts` | — | `journal-client-addresses.contract`, `deletion-workflows`, suite DB réelle | Adresses d'intervention : édition via dialogue Aurion (plus de `prompt` natif), archivage confirmé. |
| R6.2 | Fournisseurs et catalogue : prix d'achat/vente distincts, référence fournisseur, disponibilité, catalogue replié, cohérence devis | P0 | Validé (T1) | `assets/js/pages/dash/suppliers.js`, `catalog.js`, `backend/src/routes/business.ts` | — | `step4-suppliers-management`, `step6-catalog-pricing`, `step20-suppliers-sidebar`, `catalogue-collapse` | Contrats verts. |
| R6.3 | Devis/factures : HT, TVA, TTC, marge, coefficient % ou €, frais kilométriques, main-d'œuvre distincte du coût interne | P0 | Validé (T1) | `assets/js/pages/dash/quote.js`, `backend/src/services/pricing.ts`, `money.ts` | — | `regression-devis-facture-calculs`, `calculation-v2`, `labor-cost-separation`, `step12-*` | Arrondis au centime ; total recalculé côté serveur. |
| R6.4 | Numéro de document unique par organisation | P0 | Validé (T2) | `backend/migrations/067_business_document_number_sequences.sql`, `business.ts` (`nextNumber`) | PostgreSQL | `business-numbering.contract`, suite DB réelle | Séquence par organisation et type, sous transaction. |
| R6.5 | Documents historiques conservés, sauvegarde confirmée avant fermeture | P1 | Validé (T1/T3) | `quote.js` (sauvegarde puis rafraîchissement), `docs.js` | — | `step14-doc-save`, `quote-save-confirmation` | Le message de succès n'apparaît qu'après retour serveur. |
| R6.6 | IMEI / numéro de série facultatifs | P2 | Validé (T1) | `backend/migrations/064_quote_device_identifiers.sql`, `quote.js` | — | `quote-device-identifiers.contract` | Colonnes nullables ; contrôle de contrat vert. |
| R6.7 | Cycle facture : statut envoyé, historique de relances, 1ʳᵉ à 4ᵉ relance, majoration après la 4ᵉ | P0 | Validé (T1/T3) | `backend/src/routes/business.ts` (`/invoices/:id/reminders`), `invoice-workflow.ts`, `assets/js/pages/dash/docs.js` | SMTP | `step7-invoice-reminder-history`, `step23-reminder-zero`, `deep-cahier-audit` | L'e-mail est envoyé **avant** l'écriture de la relance : un échec SMTP renvoie 502 et n'incrémente rien. Le message de succès ne s'affiche donc qu'après confirmation du fournisseur. |
| R6.8 | Paiement jamais validé automatiquement | P0 | Validé (T1/T2) | `business.ts` (`POST /invoices/:id/payments`), `docs.js` (`modalForm` de saisie) | PostgreSQL | `invoice-payment-concurrency.contract`, `business-payment-workflow` | `payment_status='paid'` uniquement après saisie utilisateur, calcul serveur, transaction et écriture comptable. |
| R6.9 | Pas de bouton de paiement obsolète ni carte « factures en attente » superflue sur le tableau de bord | P2 | Validé (T1) | `assets/js/pages/dash/other.js` (accueil), `docs.js` | — | `step28-remove-quick-access`, `dashboard-*` | Contrats verts. |
| R6.10 | Comptabilité/trésorerie : cohérence factures/écritures, achats, TVA déductible, cotisations, charges, encaissements/décaissements, prévisions, exports PDF, notes de frais | P1 | Partiel | `backend/src/services/accounting.ts`, `accounting-report.ts`, `assets/js/pages/dash/expenses.js` | PostgreSQL | `accounting-engine-coherence`, `expense-reports.integration`, `step24-treasury-forecast` | Verts sur PostgreSQL réel. Reste : revue des cas limites (notes de frais multi-activités) en B3/B4. |
| R6.11 | Prévisionnel calculé automatiquement, sans double comptage | P1 | Validé (T1) | `assets/js/core/forecast.js`, `backend/src/routes/business.ts` | — | `forecast-model`, `forecast-assumptions`, `step9-growth-forecast`, `live-financial-sync-regression` | Hypothèses dérivées des données réelles ; les devis non acceptés ne sont pas comptés comme encaissements. |
| R6.12 | SAV, garanties, interventions, rendez-vous, documents liés | P1 | Validé (T1) | `backend/src/services/warranty.ts`, `business.ts`, `assets/js/pages/dash/other.js` | — | `step8-sav-accounting-forecast`, `step10-sav-sent-invoice`, `step9-appointments-quote` | Contrats verts ; SAV possible uniquement sur facture envoyée. |

### 4.4 Journal de bord unique (§7)

| ID | Demande | Prio | État | Fichiers | Dépendances | Tests | Observations |
|---|---|---|---|---|---|---|---|
| R7.1 | Journal unique sur le tableau de bord | P1 | Validé (T1) | `assets/js/pages/dash/other.js` (accueil), `backend/src/routes/dashboard-journal.ts` | — | `journal-persistence-step2`, `step31-journal-priority` | Aucun second journal concurrent. |
| R7.2 | Éléments utiles : informations manquantes, paramètres incomplets, erreurs de synchronisation, alertes stockage, notifications métier | P1 | Validé (T1/T3) | `dashboard-journal.ts`, `journal` du résumé tableau de bord | — | `requirements-14/15/16`, `cloud-storage.contract` | Les alertes cloud 80/90/95/100 % sont fusionnées en une notification unique mise à jour. |
| R7.3 | Événements identifiés, datés, rattachés à l'organisation ; lus/non lus/résolus | P0 | Validé (T1/T2) | `dashboard-journal.ts`, `assets/js/pages/dash/other.js` | PostgreSQL | `journal-persistence-step2`, suite DB réelle | `PATCH /journal/events/:id` restreint à l'organisation. |
| R7.4 | Actions ouvrant le bon module/écran | P2 | Validé (T3) | `other.js` (`data-go`, `internalPath`) | routeur | `step31-journal-priority` | Les entrées persistées portent un chemin interne. |
| R7.5 | Aucun suivi de formalités administratives | P0 | Validé (T1) | — | — | `deprecations` | Absent. |

### 4.5 Messagerie et agenda (§8)

| ID | Demande | Prio | État | Fichiers | Dépendances | Tests | Observations |
|---|---|---|---|---|---|---|---|
| R8.1 | Connexion/déconnexion Google, OAuth, renouvellement des jetons, chiffrement | P1 | **BLOQUÉ (prérequis)** — code présent (T1/T3) | `backend/src/services/google.ts`, `secrets.ts`, `routes/integrations.ts` | Identifiants OAuth Google + `AURION_ENCRYPTION_KEY` | `google-token-encryption`, `config-production` | Jetons chiffrés au repos ; testé sans fournisseur réel → **non validé fonctionnellement**. |
| R8.2 | Envoi de devis/factures en PDF, signature, pièces jointes, erreurs SMTP | P1 | Partiel (T1/T3) | `backend/src/services/mail.ts`, `platform-mailer.ts`, `routes/integrations.ts`, `docs.js` | Serveur SMTP réel | `mail.test.mjs` (SMTP local), `calendar-mail-feedback` | Erreurs SMTP remontées (502) ; un succès n'est affiché qu'après acceptation SMTP. **Correction de ce cycle** : la conversion en facture affiche désormais le statut réel (`sent`, `mail_not_configured`, `failed:…`) au lieu d'annoncer systématiquement « envoyée ». |
| R8.3 | Google Agenda : création, modification, annulation | P1 | **BLOQUÉ (prérequis)** — code présent | `backend/src/services/calendar.ts` | OAuth Google réel | `calendar-mail-feedback` (contrat) | La synchronisation n'est déclarée réussie qu'avec un `google_event_id` retourné. |
| R8.4 | Invitations iCalendar et notifications client | P2 | Partiel (T1/T3) | `backend/src/services/ics.ts`, `calendar.ts` | SMTP | `ics`/`calendar` contrats | Distinction explicite agenda / e-mail client dans `calendarToast`. |
| R8.5 | Jamais de succès sans confirmation du fournisseur | P0 | **Corrigé ce cycle** | `assets/js/pages/dash/docs.js`, `core.js` | — | `calendar-mail-feedback.contract.test.mjs` (nouveaux cas) | Deux fausses confirmations supprimées (conversion, envoi d'e-mail). |
| R8.6 | Secrets/jetons jamais dans les logs ou le navigateur | P0 | Validé (T1/T3) | `secrets.ts`, `backend/src/config.ts` | — | `secret-rotation`, `production-readiness`, `service-worker-privacy` | Aucun jeton renvoyé au client ; `google.ts` ne renvoie que des métadonnées. |

### 4.6 Interface, responsive, accessibilité (§9)

| ID | Demande | Prio | État | Fichiers | Dependencies | Tests | Observations |
|---|---|---|---|---|---|---|---|
| R9.1 | Charte : fond clair bleuté, texte bleu foncé, contraste des champs | P1 | Validé (T1) | `assets/css/app.css` (`:root`) | — | `dashboard-accessibility-contrast` | Contrat de contraste vert. |
| R9.2 | Pas de fond bleu foncé dans les fiches clients | P2 | Validé (T1) | `assets/css/app.css` | — | `dashboard-accessibility-contrast` | Vérifié par le même contrat. |
| R9.3 | **Aucune alerte JavaScript native** ; retours via les composants Aurion | P0 | **Corrigé ce cycle** | `assets/js/pages/dash/core.js` (`askConfirm`, `askFields`), `other.js`, `dashboard.js` | — | `native-dialogs.contract.test.mjs` (nouveau) | 6 appels natifs supprimés (`window.confirm` ×5, `prompt` ×2 → factorisés). Test bloquant ajouté à `test:smoke`. |
| R9.4 | Modales et fenêtres adaptées au mobile | P1 | Partiel (T1/T3) | `assets/css/app.css`, `modalForm`, `askConfirm` | — | `mobile-keyboard`, `toast-accessibility` | Recette visuelle multi-écrans **non exécutée** (pas de navigateur dans cet environnement). |
| R9.5 | Clavier, focus, lecteurs d'écran, zoom, réduction des animations | P1 | Partiel | `assets/css/app.css` (`prefers-reduced-motion`), rôles ARIA, `ui.js` | — | `toast-accessibility`, `dashboard-accessibility-contrast` | Audit WCAG 2.2 AA complet non réalisé ; à planifier avec navigateur et lecteur d'écran. |
| R9.6 | Interfaces Android/iPhone portrait et paysage | P1 | **Non vérifié (T4)** | `assets/css/mobile-keyboard.css` | appareils réels | — | Aucun appareil ni émulateur disponible ici. |

### 4.7 Architecture mobile native et hors ligne (§10)

| ID | Demande | Prio | État | Fichiers | Dépendances | Tests | Observations |
|---|---|---|---|---|---|---|---|
| R10.1 | Application métier unique + backend/base communs + PWA | P0 | Validé (T3) | `index.html`, `manifest.webmanifest`, `sw.js`, `backend/` | — | `service-worker-privacy`, `production-readiness` | PWA installable ; le service worker ne met pas en cache les réponses authentifiées. |
| R10.2 | Applications Android et iOS Capacitor | P0 | **Non réalisé / BLOQUÉ** | aucun `capacitor.config.*`, aucun dossier `android/` ou `ios/` | Node + Android SDK / Xcode + macOS | — | Aucune trace de Capacitor dans le dépôt. Prérequis : toolchains natives et comptes. |
| R10.3 | Copie locale consultable hors ligne des données structurées | P0 | **Non réalisé** | `assets/js/account-sync.js` (révisions + indicateurs), `assets/js/core/cloud-sync.js` (documents uniquement) | IndexedDB | `account-wide-sync`, `cloud-storage.contract` | Ces deux modules **ne constituent pas** un moteur de réplication métier. À concevoir (B9). |
| R10.4 | Brouillons et modifications hors ligne, file persistante, envoi automatique | P0 | **Non réalisé** | file existante limitée aux documents cloud (`cloud-sync.js`) | IndexedDB + API idempotente | `cloud-storage.contract` (partiel) | Idempotence et reprise existent **pour les documents**, pas pour les entités métier. |
| R10.5 | Idempotence, ordre, doublons, conflits, résolution explicite, état de synchronisation | P0 | **Non réalisé** | — | — | — | À implémenter en B9 avec identifiants d'opération et versionnage par entité. |
| R10.6 | Isolation stricte par organisation, révocation d'appareil, purge locale | P0 | Partiel (T1/T3) | `backend/src/routes/auth.ts` (sessions), `native-sessions.ts`, `sw.js` | — | `runtime-privileges`, `service-worker-privacy` | Révocation de session existante ; révocation d'appareil et purge locale à concevoir avec B9. |
| R10.7 | Documents : 90 derniers jours + actifs + épinglés, période configurable, fichiers à la demande | P1 | **Non réalisé** | `cloud-drive.ts`, `cloud-sync.js` | Google Drive | `cloud-storage.contract` | Politique de rétention non implémentée ; seul l'archivage à la demande existe. |
| R10.8 | Métadonnées et fichiers synchronisés séparément | P1 | **Non réalisé** | — | — | — | À concevoir en B9 (métadonnées d'abord, fichiers ensuite). |
| R10.9 | Protection au repos des fichiers sensibles | P1 | **Non vérifié** | — | Keystore/Keychain | — | Dépend des applications natives (B10/B11). |
| R10.10 | Recette mobile réelle (hors ligne, redémarrage, conflit, révocation) | P0 | **Non réalisée (T4)** | — | appareils réels | — | Aucun test simulé ne sera accepté comme validation. |

### 4.8 Stockage, PostgreSQL, Neon, Render, sécurité (§11)

| ID | Demande | Prio | État | Fichiers | Dépendances | Tests | Observations |
|---|---|---|---|---|---|---|---|
| R11.1 | PostgreSQL pour les données métier | P0 | Validé (T2) | `backend/src/db.ts`, `migrations/` | PostgreSQL | 340/340 avec base réelle | PostgreSQL 18 local ; la CI utilise PostgreSQL 17. |
| R11.2 | Rôles migrateur/runtime séparés | P0 | **Validé (T2)** | `backend/src/migrate.ts`, `.github/workflows/aurion-ci.yml` | PostgreSQL | Vérifié : runtime sans `schema_migrations`, DDL refusé | `NODE_ENV=production` refuse de migrer sans `AURION_MIGRATION_DATABASE_URL` ni `AURION_RUNTIME_DB_ROLE`. |
| R11.3 | Stockage objet privé, endpoints S3 OVH et Neon (path-style) | P1 | Validé (T1) | `backend/src/services/storage.ts`, `tools/render-backend-config.mjs` | Bucket réel | `cloud-storage.contract`, `storage-s3-addressing` | Adressage virtuel par défaut, path-style pour Neon. **Bucket réel non vérifié** (pas d'accès). |
| R11.4 | Chiffrement des secrets et cloisonnement multi-tenant | P0 | Validé (T1/T3) | `secrets.ts`, `plugins/` (auth), requêtes `organization_id` | — | `runtime-privileges`, `google-token-encryption` | Revue par échantillonnage des routes : toutes les requêtes métier filtrent `organization_id`. **Audit exhaustif route par route à poursuivre.** |
| R11.5 | Migrations : jamais réécrites, additives, idempotentes, testées et réexécutées | P0 | Validé (T2) | `backend/migrations/*` | PostgreSQL | 2 exécutions consécutives OK | `schema_migrations(name, checksum)` : l'identité est le **nom de fichier**, le checksum détecte une réécriture (bloquant en production). |
| R11.6 | Collisions de numérotation historiques identifiées | P1 | **Constat d'audit** | `042_profile_pricing_7_70.sql`, `042_quote_coefficient_units.sql`, `044_profile_avatar.sql`, `044_quote_mileage_mode.sql` | — | Journal de migration | Aucune collision d'exécution (identité = nom), ordre déterministe (tri numérique puis lexicographique). **Ne jamais renommer une migration appliquée** : la prochaine porte le préfixe **074**. |
| R11.7 | Démarrage refusé si configuration de production incomplète | P0 | Validé (T1) | `backend/src/config.ts`, `tools/start-render-compat.mjs` | — | `config-production`, `render-legacy-service-fallback` | Service canonique sans configuration : 503 explicite ; service secondaire : redirection, jamais de secret inventé. |
| R11.8 | Ressources Neon/Render réellement existantes vérifiées | P1 | **BLOQUÉ** | `render.yaml`, `docs/DEPLOIEMENT-RENDER.md` | Accès console/API Render + Neon | — | Aucun jeton disponible : l'existence des ressources n'est **pas** affirmée. |
| R11.9 | Sessions, cookies, WebAuthn, CSRF, rate limiting, fichiers privés | P0 | Validé (T1) | `routes/auth.ts`, `webauthn.ts`, `native-sessions.ts`, `app.ts` | — | `strict-requirements-1-15`, `runtime-privileges`, `service-worker-privacy` | Cookie `httpOnly`/`secure`/`sameSite`, CSRF par origine, limitations de débit. |
| R11.10 | Aucune clé privée ou secret dans le dépôt | P0 | Validé (T1) | `.gitignore`, `render.yaml` (`sync:false`) | — | `production-readiness` | Aucun secret versionné ; `.env` ignoré. |

### 4.9 Modules juridiques et commerciaux (§12)

| ID | Demande | Prio | État | Fichiers | Dépendances | Tests | Observations |
|---|---|---|---|---|---|---|---|
| R12.1 | Mentions légales, CGU, CGV, confidentialité, cookies, rétractation à jour | P1 | **Partiel** | `legal/*.md`, `docs/LEGAL-NOTICE.md`, `docs/CGU-CGV.md`, `docs/POLITIQUE-CONFIDENTIALITE.md`, `docs/COOKIES.md` | Validation juridique + éditeur | `strict-requirements-1-15` | Les fichiers `*-DRAFT.md` se déclarent explicitement **historiques et non définitifs**. Ne pas les présenter comme validés. |
| R12.2 | Documents non validés clairement identifiés | P0 | Validé (T3) | `docs/CGU-CGV.md`, `legal/*-DRAFT.md` | — | — | Mention « non définitif ni publiable avant validation » présente. |
| R12.3 | Pas d'ouverture commerciale si les documents obligatoires ne sont pas prêts | P0 | Validé (T1/T3) | `routes/auth.ts` (`/auth/registration-status`) | — | `strict-requirements-1-15` | L'inscription est bloquée hors mode évaluation local tant que les documents ne sont pas publiés. |
| R12.4 | Abonnements, facturation, Stripe, remboursements, historique | P1 | Partiel (T1) | `services/stripe-billing.ts`, `subscription-invoice.ts`, `routes/account.ts` | Clés Stripe réelles | `stripe-billing.integration` (avec clés factices + base réelle) | Le parcours fonctionne avec des clés de test ; **aucun paiement réel** n'a été effectué. |
| R12.5 | Facturation électronique : ne jamais surclasser un JSON préparatoire | P0 | Validé (T1/T3) | `services/electronic-invoice.ts`, `migrations/071_electronic_invoice_not_transmitted_status.sql` | Plateforme agréée | `deep-cahier-audit` | Statut explicite « non transmise » ; aucune conformité Factur-X/UBL ni dépôt PDP revendiqué. |

### 4.10 Publication Android (§13)

| ID | Demande | Prio | État | Fichiers | Dépendances | Tests | Observations |
|---|---|---|---|---|---|---|---|
| R13.1 | Chaîne GitHub Actions → Capacitor/Android → Gradle → Fastlane → Play Developer API → `.aab` | P1 | **Non réalisé / BLOQUÉ** | `docs/PREPARATION-PLAY-STORE.md` | Projet Android + compte Play + secrets | — | Le dépôt ne contient **aucune** application Android signée ni `.aab`. Le document décrit une voie TWA et liste les prérequis. |
| R13.2 | Signature protégée, versionnement, piste de test, promotion contrôlée | P0 | **Non réalisé / BLOQUÉ** | — | Play App Signing, clés, `service-account.json` | — | Aucun secret ne doit entrer dans le dépôt ; GitHub Environments à créer par le propriétaire. |
| R13.3 | Mode dry-run sans prétendre avoir publié | P1 | **Non réalisé** | — | — | — | À construire avec B12. |

### 4.11 Automatisation de l'environnement (§14)

| ID | Demande | Prio | État | Fichiers | Dépendances | Tests | Observations |
|---|---|---|---|---|---|---|---|
| R14.1 | Scripts PowerShell locaux (diagnostic, installation, sauvegarde, archive) | P2 | Existant, partiellement vérifié | `scripts/*.ps1`, `tools/*.ps1` | PowerShell (Windows) | `Test-Setup-Package.ps1` (non exécutable sous Linux) | Non exécutés dans cet environnement Linux ; à valider sur poste Windows. |
| R14.2 | Diagnostics PostgreSQL / Neon / GitHub / Render | P2 | Partiel | `scripts/Diagnose-Aurion.ps1`, `tools/Deploy-Aurion-Render.ps1` | jetons externes | — | Nécessitent des identifiants ; aucun secret ne doit être journalisé. |
| R14.3 | Archivage propre des sources | P1 | Validé (T3) | `tools/Build-Source-Archive.ps1` | PowerShell | `Test-Setup-Package.ps1` | Exclut `node_modules`, `.env`, stockage local, artefacts. Exécution Windows non réalisée ici. |
| R14.4 | Opérations destructrices protégées par approbation | P0 | Validé (T3) | scripts de publication | — | — | Les scripts refusent d'écraser une branche ou de modifier des ressources distantes sans action explicite. |

---

## 5. Anomalies traitées dans ce cycle

| # | Anomalie | Gravité | Correction | Preuve |
|---|---|---|---|---|
| A1 | La conversion d'un devis en facture affichait « Facture X créée et envoyée » même sans messagerie configurée ou en cas d'échec SMTP. | **Haute** (fausse confirmation, §8) | `emailToast(r.emailStatus, …)` : message selon le statut réel (`sent`, `mail_not_configured`, `client_email_missing`, `failed:…`). | `calendar-mail-feedback.contract.test.mjs` (nouveau cas) |
| A2 | L'envoi d'un document par e-mail affichait « Enregistré » (message générique de `modalForm`). | Moyenne | `modalForm` accepte un libellé de confirmation ; l'envoi affiche « E-mail envoyé avec la pièce jointe. » après succès serveur. | Idem |
| A3 | 6 dialogues natifs du navigateur (`confirm`, `prompt`) subsistaient dans les écrans clients et administration. | **Haute** (§9 : aucune alerte native) | Ajout de `askFields` (saisie) et usage de `askConfirm` (confirmation) ; suppression de tous les appels natifs. | `native-dialogs.contract.test.mjs` (nouveau, bloquant en CI) |
| A4 | La CI tolérait les échecs de la baseline B0 (7 smoke / 18 complets / 1 navigateur). | **Haute** (§16-B1) | Intégration de la PR #37 : `tools/ci-gate-policy.mjs`, porte stricte, `node-version-file`, contrat de non-tolérance. | `npm run test:smoke` → 89/89, puis 91/91 après A3 |

## 6. Anomalies ouvertes (non traitées ce cycle)

| # | Anomalie | Gravité | Bloc | Prérequis |
|---|---|---|---|---|
| O1 | Aucune réplication métier hors ligne ni gestion de conflits multi-appareils. | **Critique** (§10) | B9 | Conception + implémentation + appareils de recette |
| O2 | Aucun projet Capacitor Android/iOS. | **Critique** (§10) | B10/B11 | Android SDK, macOS/Xcode pour iOS |
| O3 | Aucune chaîne de publication Play (`.aab`, signature, Fastlane). | Haute (§13) | B12 | Compte Play, clés, secrets |
| O4 | Politique de rétention documentaire (90 jours / actifs / épinglés) absente. | Moyenne (§10) | B9 | B9 |
| O5 | Google OAuth/Agenda et SMTP réels non testés de bout en bout. | Haute (§8) | B5 | Identifiants OAuth + serveur SMTP |
| O6 | Ressources Neon/Render non vérifiées dans leurs consoles. | Haute (§11) | B8 | Accès API/console |
| O7 | Audit WCAG 2.2 AA et recette multi-appareils non réalisés. | Moyenne (§9) | B7 | Navigateur, lecteur d'écran, appareils |
| O8 | Tests navigateur Playwright non exécutés localement. | Moyenne | B0 | Téléchargement Chromium (CI OK) |
| O9 | Collisions historiques de préfixes 042/044. | Faible | B8 | Aucune action destructive ; prochaine migration = 074 |
| O10 | Scripts PowerShell non exécutés sous Linux. | Faible | B14 | Poste Windows |

## 7. Prérequis externes à fournir par le propriétaire

1. **GitHub** : activer la protection de branche `main` (required check `quality`, revue obligatoire, pas de force-push). Un agent ne doit pas modifier ces réglages d'administration.
2. **Google Cloud / OAuth** : identifiants OAuth (client ID/secret), URL de retour HTTPS exacte, `AURION_ENCRYPTION_KEY` persistante — pour valider la connexion Google et l'agenda.
3. **SMTP** : un compte d'envoi réel pour valider les envois de devis, factures, relances et invitations.
4. **Stripe** : clés de test puis de production si la commercialisation est activée ; webhook signé.
5. **Neon / Render / OVH S3** : accès console ou API pour confirmer l'existence, les rôles, les sauvegardes et le bucket.
6. **Android** : Android SDK, identifiant de package définitif, keystore de signature, compte Google Play et compte de service Play Developer API.
7. **iOS** : Mac avec Xcode, compte Apple Developer, certificats et profils de provisionnement.
8. **Juridique** : validation des CGU/CGV, confidentialité, cookies, rétractation et mentions légales avant toute ouverture commerciale.

## 8. Décisions d'audit sur les branches et PR ouvertes

| Élément | Décision | Justification |
|---|---|---|
| PR #37 `champi/v2-ci-strict-20261113` | **Intégrée** (2 commits cherry-pick, auteurs conservés) | Porte stricte, contrats de non-tolérance, aucune régression : suite complète verte. |
| `feat/aurion-optional-guided-tour-20261028` (visite guidée facultative) | **Non intégrée** | Branche très en retard sur `main` ; la fusion supprimerait des outils de CI (`tools/verify-b0-baseline.mjs`, `Build-Source-Archive.ps1`, `Test-Setup-Package.ps1`) et réécrirait `render.yaml`. La visite guidée n'est pas exigée par le périmètre 15.4.0 et le parcours d'accueil actuel couvre le besoin. À rouvrir sous forme de patch ciblé si le propriétaire la souhaite. |
| `aurion/ux-hardening-stage` (ancienne intégration) | **Non intégrée** | Divergence massive (suppressions d'outils, réécritures juridiques et Render) ; risque de régression supérieur au bénéfice. Les correctifs encore pertinents doivent être re-proposés individuellement. |

## 9. Journal des cycles

### Cycle 1 — 18 novembre 2026

- SHA de départ : `65af132` (= `main` distant au moment de l'audit).
- Audit complet : 392 fichiers suivis, 70 migrations, 17 fichiers de routes, 38 modules front-end, 1 workflow CI.
- Baseline reconstituée : build, typecheck, front-end, lint, 91 tests smoke, 331 tests backend hors base (317 réussis, 14 ignorés), **340/340 avec PostgreSQL réel**.
- Livré : registre, CI stricte (PR #37), corrections A1–A4, garde-fous automatisés.
- Non livré : B9 à B15 (voir §6 et §7).

## 10. Règles de non-régression appliquées

1. Aucun module métier réécrit : corrections ciblées uniquement.
2. Aucune migration appliquée modifiée ou renommée ; la prochaine porte le préfixe `074`.
3. Aucune donnée historique supprimée.
4. Aucun contrat d'API modifié : les corrections front-end consomment des champs déjà renvoyés par le serveur (`emailStatus`).
5. Aucun test désactivé, aucune assertion affaiblie, aucun échec masqué.
6. Aucune intégration déclarée fonctionnelle sur la base d'un mock : Google, SMTP réel, Stripe réel, Neon et Render restent marqués **BLOQUÉS**.
7. Aucune opération de production, aucun déploiement, aucune modification des réglages GitHub.
