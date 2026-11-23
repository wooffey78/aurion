# Aurion 15.4.33 — Blocs 6-bis/7/19-partiel : fraîcheur des documents, référentiels datés, exploitation (14 novembre 2026)

Continuation du prompt maître « finalisation vers 100 % » après la 15.4.32 (blocs 2-5 hors connexion).

## Bloc 6-bis — Documents récents
- ETag faible serveur sur le téléchargement des justificatifs (`sha256(storage_key+created_at)`) ; `If-None-Match` → **304** (fraîcheur sans retéléchargement).
- Fraîcheur client par version répliquée : un document périmé est retéléchargé ; 304 = copie locale déjà à jour.
- Saturation de quota intelligente : libération des plus anciens hors fenêtre (jamais les épinglés) pour un document plus utile ; échec explicite sinon.
- Intégrité par échantillon (re-hash SHA-256, entrée corrompue supprimée) ; compteur d'échecs borné à 5 par document.
- **Découverte fiabilité** : la table `documents` n'a PAS de `updated_at` (immuable par nature) — la première implémentation ETag l'utilisait et provoquait un 500 sur le téléchargement ; corrigée (`created_at`) + test dédié.

## Bloc 7 — Référentiels datés
- `GET /micro/referential` versionné avec ETag/304 ; `api.microReferential()` cache-through cloisonné par compte, repli hors connexion daté (`_cachedAt`, `_stale`) ; vues catalog/devis inchangées.

## Bloc 19-partiel — Exploitation
- `db:backup` vérifié en échec sûr (message opérateur précis sans `pg_dump`, aucun fichier partiel) ; drill de restauration prêt (bases de drill créées/alimentées/nettoyées) mais **non exécutable dans le bac à sable** (outils clients absents, pas de root) — exécution conjointe requise.

## Rapports
`docs/RAPPORT-BLOC-06-07-19.md`, `docs/RECHERCHES-15-17-18.md` (PA gratuites : aucune confirmée tout-à-fait gratuite API incluse ; tarification concurrentielle Abby/Tiime/Indy/Henrri relevée ; médiateur : gratuit pour le consommateur, adhésion pro à budgéter).

# Aurion 15.4.32 — Blocs 2-5 hors connexion : réplication complète, consultation locale, intentions outbox, conflits (14 novembre 2026)

Prompt maître « finalisation vers 100 % » — continuation après Blocs 0-1 (audit contradictoire `docs/AUDIT-FINAL-15.4.30.md`, score pondéré recalculé ≈54 % sur preuves ; baseline documentaire 15.4.31).

## Bloc 2 — Réplication métier complète
- Migration **086** (additive, idempotente ×2) : journalisation de 7 tables directes (`bank_import_configs`, `cloud_documents`, `notification_jobs`, `outgoing_electronic_invoices`, `outgoing_transmission_events`, `payment_links`, `supplier_electronic_invoices`) + **clés naturelles** (`document_themes`/`email_signatures`/`electronic_invoice_profiles` : PK = organization_id ; `activity_forecast_assumptions`/`activity_profile_overrides` : PK = activity_id) + **enfants via parent** (`template_versions`, `support_status_events`).
- Registre `SYNC_ENTITIES` : **44 entités** ; option `keyColumn` ; exclusions documentées en tête de fichier (secrets, sessions, billing, `document_number_sequences` jamais répliqué, tables sans organization_id, fonctions retirées).
- Test `bloc2-completeness` : delta des nouvelles entités, clé naturelle résolue, snapshot enfant avec isolation A/B, tombstone. **2/2 verts.**
- **Enseignement consigné** : `schema_migrations` vérifie un checksum — une migration appliquée ne se modifie jamais (base de test recréée pour appliquer la version finale ; en production, toute correction = migration nouvelle).
- **Régression découverte et corrigée** : la première version du trigger `activity_profile_overrides` lisait une colonne inexistante (500 sur tout PATCH d'activité/onboarding, révélé par le parcours Playwright). Corrigée (tenant résolu via activities) — e2e complet vert sans 5xx ni erreur console.

## Bloc 3 — Consultation locale dans les vues restantes
- Notes de frais hors connexion (répliques → `{expenses,totals}` recalculés localement) ; détail « Facture et relances envoyées » hors connexion en **lecture seule** depuis les répliques (`invoice_payments`, `invoice_reminders`, reste dû recalculé, jamais présenté comme état serveur) ; bandeaux de fraîcheur comptabilité/trésorerie ; `sync-ui.lastPullTime()` exposé.
- Matrice page × données × source × comportement hors ligne : `docs/RAPPORT-BLOC-03.md`.

## Bloc 4 — Outbox : chaîne complète et intentions
- Liste blanche étendue : `/communications/email/document` (envoi e-mail décidé hors connexion — validations réelles à l'exécution, idempotence opId, jamais de faux « envoyé ») et `/documents/render/(quote|invoice)/:id` (rendu de documents décidé hors connexion).
- Test `bloc4-email` : client→devis→**conversion facture numérotée par le serveur au rejeu**→PDF stocké→intention e-mail sans messagerie = échec précis, réessayable, `sent_at` NULL ; rejeu = même numéro (aucun doublon). **3/3 verts.**

## Bloc 5 — Conflits multi-appareils
- **Concurrence optimiste additive** : `PATCH /clients/:id` et `/suppliers/:id` acceptent `baseUpdatedAt` → 409 `CONFLICT_VERSION` avec les DEUX valeurs si une version plus récente existe (aucune écriture silencieuse) ; sans base → comportement historique conservé ; suppression vs modification → 404 précis.
- **UI de comparaison champ par champ** dans le panneau de synchronisation (votre valeur + date de décision vs valeur serveur + date) ; factures/paiements/écritures jamais réécrits silencieusement.
- Test `bloc5-conflicts` **1/1 vert** (deux sessions concurrentes, fusion explicite, 404, déterminisme d'ordre).

## Bloc 17 (anticipation) — VIP sur compte existant
- `/auth/vip-invite/accept` rattache désormais le droit VIP à un compte existant sans erreur `ACCOUNT_EXISTS` ni doublon (journalisé) ; création pour compte inexistant conservée.

## Validation
- Migrations 001→086 ×2 idempotentes sur PostgreSQL 16 réel ; parcours Playwright complet **vert sans 5xx** (inscription, 8 étapes, 9 vues, déconnexion/reconnexion, scénario hors connexion, aucune erreur console) ; suite backend intégrale — résultat exact en tête de MISSION-ETAT.

## Rapports
`docs/RAPPORT-BLOC-02.md`, `docs/RAPPORT-BLOC-03.md`, `docs/RAPPORT-BLOC-04.md`, `docs/RAPPORT-BLOC-05.md`, `docs/BLOCS-6-20-STATUT-ET-BLOCAGES.md` (recherche PA gratuites incluse, blocages exacts, procédures).

# Aurion 15.4.31 — Baseline stable et cohérence documentaire (14 novembre 2026)

Bloc 1 du prompt maître « finalisation vers 100 % » (après Bloc 0 : audit contradictoire sans modification, `docs/AUDIT-FINAL-15.4.30.md` — score pondéré recalculé ≈54 % sur preuves, baseline rejouée : migrations 001→085 ×2, `npm run check` exit 0, `npm test` 466/466).

- `docs/CHECKLIST-PRE-PRODUCTION.md` : version 15.4.30 (85 migrations, 466 tests, résultats de session), périmètre courant, **décision éditeur affichée : Render gratuit/temporaire — jamais de plan payant**, production cible OVHcloud.
- `docs/RUNBOOK-PRODUCTION.md` : version 15.4.30, cible OVH (services « non provisionnés » tant que non créés), Render **plan gratuit** strict (jamais Starter), distinction explicite développement/démonstration, bêta privée, préproduction, production, 85 migrations.
- `docs/LEGAL-NOTICE.md` : hébergement décrit honnêtement (Render gratuit temporaire ; OVH cible non provisionnée, migration non exécutée) — plus aucune mention de plan payant.
- Scripts Windows vérifiés (7 scripts, Launcher `--start-maximized`, aucun plein écran système, aucun registre modifié — tests bloc21-22).
- Suite stricte documentée : `npm run check` = build + typecheck + frontend + ESLint + fumée + parcours navigateur ; `npm test` = backend complet (466) sur PostgreSQL réel ; aucun test masqué (les sauts conditionnels sur variables d'environnement manquantes restent explicites et documentés).

# Aurion 15.4.30 — Fiabilisation métier, calculs, échéances, ergonomie et juridique (14 novembre 2026)

Application du prompt maître « fiabilisation » sur la base 15.4.29 (Blocs 0-16). Audit sans modification d'abord (13 constats confirmés), puis corrections ciblées par bloc, sans reconstruire ce qui fonctionnait.

## Facture réglée (Bloc 1)

- `next_reminder_at=NULL` dans la transaction du paiement complet ; refus 409 `ALREADY_PAID` de tout échéancier sur facture réglée ; re-vérification du statut payé juste avant chaque relance planifiée ; boutons Échéancier/Relance/Majoration masqués par la vérité serveur ; rafraîchissement coordonné après confirmation. Historique (paiements, relances, écritures) intégralement conservé. Paiement partiel : toutes les fonctions restent disponibles.

## Échéances et données en direct (Bloc 2)

- Calendrier fiscal chargé en retard : re-rendu par le cycle existant avec les protections anti-course du tableau de bord (vue inchangée, aucune saisie active, aucune modale). Aucune seconde source de vérité.

## Versement libératoire (Bloc 3)

- Carte « Impôt estimé (VL) » rendue UNIQUEMENT si l'option est déclarée exercée (jamais un tiret ni zéro) ; distinction déclaré/vérifié ; VL jamais en charge effective hors option (moteur contrôlé).

## Trésorerie prévisionnelle (Bloc 4)

- Catégories séparées : `potentialIn` (devis ouverts) ≠ `committedIn` (**reste dû** : TTC + majorations − paiements reçus) ≠ `committedOut` (notes de frais à rembourser) ; SAV compté séparément ; `committedNet` (hors potentiel) ; exclusions explicites ; flux inexistants déclarés (jamais inventés) ; frontend renommé et ventilé.

## Historique mensuel (Bloc 5)

- Chaque mois dépliable avec toutes les composantes du moteur (CA HT, TVA collectée, achats, TVA déductible, cotisations, kilométrique, notes de frais, nb factures, solde net) ; mois sans mouvement explicités.

## Client existant (Bloc 6)

- Résumé client alimenté à la sélection (nom, e-mail, téléphone, SIRET — rien d'inventé) ; adresses rechargées ; adresse de facturation auto-remplie sans jamais écraser une correction manuelle (`data-autofilled`) ; instantané serveur à l'émission inchangé.

## Prévision de croissance (Bloc 7)

- Sélections 1-10 ans et `années×12` supprimées ; quatre horizons : **3 mois, 6 mois, Année en cours, 365 jours** ; conversion centralisée et documentée (`forecastHorizonMonths`).

## Cohérence transversale (Bloc 8)

- Garde `S.pendingView` dans `refresh()` : une course entre deux navigations ne ramène jamais l'utilisateur en arrière (défaut révélé par le parcours automatisé, règle 10 du prompt).

## Design, accueil, connexion, avatar, Windows, horloge (Blocs 9-11)

- Image de la page publique SUPPRIMÉE (index.html **et** rendu SPA) ; composition une colonne ; titres accueil et connexion réduits ~50 % ; landing **sans défilement vertical à 1280×720 (mesuré 0 px)** ; avatar 46/40 px cadré `cover` ; en mode application Windows (`?native=1`), le Fullscreen API n'est jamais déclenché (barre des tâches préservée ; lanceur intouché) ; horloge `<time datetime>` avec HH:MM tabulaire dominant et secondes discrètes ; harmonisation ciblée des encarts touchés (tokens existants, sobre).

## Nettoyage (Bloc 12)

- Mentions internes « Bloc 8/9/10/11 » supprimées des écrans ; états honnêtes conservés.

## Juridique (Bloc 13)

- CGU-CGV, Confidentialité, Cookies, Mentions légales, Accessibilité, Sous-traitants, Sécurité : révision 15.4.30 (révision 4.0 maintenue, coordonnées inchangées) ; Android généré mais NON publié (aucune application publiée) ; IndexedDB décrit (répliques, file des décisions, documents récents, cloisonnement, effacement) ; hébergement décrit honnêtement (Render temporaire, OVH objet actuel, migration non effectuée) ; aucune promesse non démontrée.

## Tests

- `backend/tests/bloc1-paid-invoice-actions.test.mjs` (facture réglée, partiel, multiple, sur-paiement, scheduler) et `backend/tests/bloc4-treasury.test.mjs` (catégories, reste dû, notes de frais, annulations, isolation) : **nouveaux, verts**. 6 tests de contrat mis à jour au nouveau comportement (bloc22 horloge, requirements-15 landing, step24 trésorerie, step8 SAV, step20/mobile-sync navigation, dashboard-performance pendingView) — jamais affaiblis : ils encadrent les nouvelles règles. Suite rejouable : e-mails de bloc14 uniques.
- **Phase-H finale : migrations 001→085 ×2, `npm run check` exit 0 (45 fichiers, ESLint 0, parcours Playwright complet incl. hors connexion, aucune erreur console), `npm test` exit 0 : 466/466.**

# Aurion 15.4.29
# Aurion 15.4.29 — Blocs 0 à 7 du prompt continuation (14 novembre 2026)

Livraison « hors connexion réellement opérationnel » : audit Bloc 0 sans modification (11 défauts confirmés, docs/RAPPORT-BLOC-0.md), puis corrections ciblées des défauts confirmés, sans reconstruire ce qui fonctionnait.

## Bloc 1 — bootstrap identité, outbox, espaces de noms

- `core/session-identity.js` (nouveau) : identité /auth/me résolue UNE fois (promesse partagée) et deviceId unique ; `core/offline-bootstrap.js` : ouverture coordonnée et attendue de la file, de la réplication et des documents dans le MÊME espace de noms — plus jamais `setOutboxOwner()` sans identité (défaut évaluateur n°1). `core/api.js` n'accepte une écriture hors connexion que file prête (`outboxReady`) — aucune perte silencieuse. Déconnexion : reset identité + effacement contrôlé.

## Bloc 2 — instantané cohérent et registre complet

- `core/sync-manager.js` : CURSEUR DE DÉPART capturé AVANT les snapshots puis deltas depuis ce curseur (défaut n°3 : rien n'est perdu pendant un snapshot, réapplication idempotente).
- Migration **085** (additive, idempotente) : journal de réplication étendu à `quote_items` (lignes de documents, tenant résolu par le document parent via fonction dédiée), `dashboard_journal_events`, `ereporting_declarations/events/lines` ; registre 28→33 entités, `SYNC_SCHEMA_VERSION` 2 ; snapshot/delta filtrent par jointure pour les tables sans `organization_id` propre.

## Bloc 3 — lectures locales raccordées aux écrans (défaut n°4)

- `dashboard.js` : repli hors connexion par dataset sur les RÉPLIQUES (clients, devis+lignes réassemblées, rendez-vous, fournisseurs, catalogue, interventions, fournitures, garanties, politiques, appareils, SAV, modèles) + noms/e-mails clients joints ; événement `aurion:offline-view` pour l'interface. Agrégats lourds : dernier état connu (PARTIEL documenté).

## Bloc 4 — outbox robuste : bail, dépendances, récupération (défaut n°2)

- Bail `leaseUntil` (120 s) : les opérations `sending` interrompues par un crash repassent `pending` automatiquement — l'idempotence serveur (opId) interdit tout doublon malgré une réponse perdue.
- Dépendances déterministes : références locales détectées dans payloads ET chemins → `@ref:` + `dependsOn` persisté (graphe créateur→dépendants, tri topologique puis decidedAt). Serveur : `@ref:` dans les chemins résolu aussi via `sync_applied_ops` (dépôts séparés).
- Retour réseau : backoff annulé et relance rapide (5 s) — la perte réseau entre le test et le fetch ne pénalise plus 30 s. **Bug latent corrigé** : le POST du moteur via `authFetch` n'avait pas de `Content-Type` JSON (Fastify ignorait le corps → 400 en boucle) ; **bug latent corrigé** : l'adaptateur IndexedDB emballe les enregistrements sans la clé primaire `opId` du magasin `outbox` (DataError à la première écriture réelle) — adaptateur rendu keyPath-aware (put/get/delete).

## Bloc 5 — intentions et rejeu (contrôle)

- Chaîne vérifiée contre les routes réelles : brouillon ≠ émission ; numérotation serveur (067) à l'émission ; `MAIL_NOT_CONFIGURED` etc. → `blocked` avec raison exploitable et relance sans seconde confirmation. Statuts affichés jamais trompeurs ("en attente" jusqu'à l'accusé serveur).

## Bloc 6 — politique des documents récents (défaut n°5)

- `core/recent-documents.js` : plafond fixe 20 remplacé par une politique configurable (fenêtre 90 jours par défaut, quota 200 Mo, épinglés jamais élagués, priorité aux dossiers actifs), hash SHA-256 à l'enregistrement, anciens fichiers listés par métadonnées et récupérables à la demande, pause sur réseau cellulaire détecté, espaces de noms identiques au reste (deviceId corrigé).

## Bloc 7 — interface de synchronisation (défaut n°6)

- `core/sync-ui.js` (nouveau) + CSS : indicateur global (en ligne/hors connexion/réplication/rejeu/à jour, dernier succès, progression du premier chargement, vues affichées hors connexion) et panneau détaillé (compteurs exacts par statut, opérations avec date de décision et raison de blocage, « Synchroniser maintenant » et « Relancer les opérations en erreur »). Accessible (aria), sans alert(). Apparaît APRÈS le bootstrap — il garantit visuellement la readiness.

## Bloc 12 (partie anticipée) — VIP sur compte existant (défaut n°7)

- `/admin/guests/invite` : plus de 409 pour un e-mail déjà connu — l'entitlement VIP permanent est posé sur le compte EXISTANT (on conflict do nothing), sans doublon de compte ni de ligne, sans rôle platform_admin ni droit inter-tenant, tracé via les structures existantes ; flux d'invitation classique préservé. Test d'intégration `bloc12-vip-existing-account.test.mjs`.

## Tests navigateur (nouveau, preuve de bout en bout)

- `frontend-browser.e2e.mjs` étape « hors connexion » : création client en mode avion → décision durablement en file (compteur vérifié dans la page) → statut « Enregistré localement — en attente de synchronisation » → retour réseau → rejeu AUTOMATIQUE (aucun clic, aucune seconde confirmation) → client vérifié en PostgreSQL (contexte tenant posé — preuve au passage que la RLS reste fail-closed) → visible dans la vue clients → aucun doublon.

## Validation

- Phase-H : base neuve, migrations 001→085 ×2 (idempotence), `npm run check` exit 0 (syntaxe/imports/exports front, ESLint, fumée 79/79, parcours Playwright COMPLET incl. hors connexion, aucune erreur console), `npm test` exit 0 : **464/464**.

# Aurion 15.4.28
# Aurion 15.4.28

## Blocs 4-6 (suite) + Bloc 8 — hors connexion pleinement fonctionnel côté appareil (14 novembre 2026)

Suite directe de la 15.4.27 (évaluation : blocs 1-6 à faire fonctionner intégralement). Corrige les deux défauts relevés par l'évaluateur et achève la chaîne appareil.

- **Bloc 2 corrigé** : `IndexedDbAdapter.put` écrit désormais la propriété `nsKey` (clé primaire keyPath) — IndexedDB rejettait l'écriture (DataError). Test de structure d'enregistrement ajouté (6/6 verts).

- **Bloc 4 serveur corrigé et complété** : DELETE sans corps ne reçoit plus `Content-Type: application/json` (Fastify refusait le corps vide → 500) ; les références locales dans les CHEMINS sont réécrites vers les identifiants serveur (dépôts séparés : modifier hors connexion une fiche créée hors connexion). Suite bloc4 : 2/2 verts (création + devis dépendant avec substitution, idempotence sans doublon, dépendance bloquée, chemins interdits, isolation A/B, tombstone, référence de chemin).

- **Bloc 4 appareil — `core/outbox.js`** : file persistante des décisions (magasin `outbox`, jamais localStorage), ordre par dépendances + décision, rejeu automatique à `online`/visibilité/chargement/60 s avec verrou inter-onglets, backoff borné, statuts honnêtes (pending/applied/conflict/blocked/error), trace décision+exécution conservée 30 jours, réessai manuel possible. **Interception `core/api.js`** : hors connexion, les écritures métier de la même liste blanche que le serveur sont enregistrées DURABLEMENT AVANT toute autre action et une réponse synthétique (id local) laisse l'interface continuer — aucune seconde confirmation jamais demandée. Valeurs de payload égales à une référence locale converties en `@ref:` pour la substitution serveur.

- **Bloc 5 — `core/sync-manager.js`** : identité via /auth/me ; premier arrivage = instantané paginé du registre puis curseur ; ensuite deltas incrémentaux (`/sync/delta`), tombstones appliqués ; `syncNow()` = push (rejeu) puis pull ; déclenché à l'ouverture du tableau de bord, à la reconnexion, au retour de visibilité, toutes les 5 min et après chaque rejeu réussi ; événements `aurion:sync-status`. Lectures locales exposées (`getLocalList`/`getLocalEntity`). Effacement contrôlé à la déconnexion (logout).

- **Bloc 6 — `core/recent-documents.js`** : les N derniers documents (justificatifs + PDF récents des devis/factures) sont pré-téléchargés en ligne et conservés durablesment (Blobs IndexedDB ; base64 via adaptateur SQLite natif), ouvrables hors connexion (`openRecentDocument` → Blob URL), liste bornée à 20 avec élagage.

- **Bloc 8 — échafaudage natif** : `capacitor.config.template.json` + `docs/APPLICATIONS-NATIVES.md` (points de raccordement déjà implémentés : `window.AURION_API_URL`, `window.AURION_SQLITE_DRIVER` chiffré Keystore/Keychain ; procédure d'initialisation ; vérifications appareil). **Aucun build Android/iOS exécuté** — déclaré tel quel, à faire sur la machine éditeur.

- Version portée à 15.4.28. Basé sur la chaîne validée `aurion-15.4.26-bloc3.zip` + correctifs 15.4.27.

# Aurion 15.4.27
# Aurion 15.4.27

## Bloc 4 (partie serveur) — dépôt et rejeu des opérations hors connexion (14 novembre 2026)

Conformément au prompt maître (Bloc 4, exigence centrale) : chaque création/modification/suppression décidée hors connexion est rejouée automatiquement à la reconnexion, sans perte, sans doublon et sans seconde confirmation.

- **Moteur de rejeu `backend/src/services/sync-ops.ts`** : chaque opération rejoue la ROUTE RÉELLE via `app.inject` (mêmes validations, mêmes services, mêmes droits — zéro divergence de logique métier). **Idempotence** : `sync_applied_ops` (migration 084, clé organisation+opClientId) — un retry, un timeout ou un accusé perdu ne crée jamais de doublon ; une opération déjà appliquée renvoie son résultat enregistré (statut `duplicate`). **Références stables** : l'appareil pré-génère des références locales et écrit `@ref:<localRef>` dans les champs pointant vers un objet créé hors connexion ; le serveur substitue l'identifiant réel au rejeu. **Chemins autorisés uniquement** : liste blanche stricte des écritures métier (administration, billing, auth, intégrations et stockage cloud exclus). **Erreurs honnêtes** : permanente → `blocked` avec raison (l'opération reste sur l'appareil) ; serveur → `retry` (jamais comptée comme appliquée) ; conflit 409 → `conflict`. **Dépendances** : une opération dont la source n'est pas appliquée est `blocked` (jamais appliquée partiellement).

- **Nouvelle route `POST /sync/ops`** (auth + rate limit 60/min) : dépôt ordonné de 1 à 200 opérations, résultats individuels (`applied`/`duplicate`/`conflict`/`blocked`/`retry`).

- **Tests** : `backend/tests/bloc4-sync-ops.test.mjs` (PostgreSQL réel) — création + opération dépendante avec substitution de référence, idempotence sans doublon après accusé perdu, dépendance manquante bloquée, chemins interdits bloqués, isolation A/B, suppression rejouée + tombstone, entrée invalide → 400.

- **Partie appareil (file locale `core/outbox.js` + interception `api.js`) en cours** : elle sera livrée avec le Bloc 5 (numérotation et émission automatiques) au prochain message — le moteur serveur ci-dessus est déjà consommable.

- Version portée à 15.4.27.

# Aurion 15.4.26
# Aurion 15.4.26

## Bloc 3 — APIs de snapshot, curseur et synchronisation incrémentale (14 novembre 2026)

Conformément au prompt maître (Bloc 3) : permettre la copie complète des données métier accessibles, réutiliser le signal existant comme complément (jamais en remplacement).

- **Migration 084 (additive, idempotente, RLS motif 074)** : `sync_entity_changes` (journal de changements par entité = flux du curseur) et `sync_applied_ops` (idempotence des opérations hors connexion, clé unique organisation+opId) ; triggers de journalisation sur 28 tables à organization_id (colonne id, ou clé naturelle user_id / user_id:draft_key pour members et drafts) ; fonctions SECURITY DEFINER (rôle migrateur) : le journal capture TOUTES les écritures y compris hors contexte tenant (inscription, travaux d'administration), l'organisation journalisée provient toujours de la ligne, jamais du contexte ; les LECTURES du journal restent RLS-closes. Tables à secrets (mail_accounts) et sans organization_id (activity_contributions, supplier_parts, support_messages) jamais répliquées. Le signal global 056-059 reste inchangé (non-régression testée).

- **Nouveau registre `backend/src/services/sync-replication.ts`** : 28 entités répliquées (clients, fournisseurs, consommables, pièces, interventions, appareils, SAV/garanties, rendez-vous, devis+factures, paiements/échéances/relances, notes de frais, écritures comptables, opérations bancaires, documents, membres, sessions de temps, brouillons…) — projection `to_jsonb` en lecture seule, RLS + contexte tenant sur chaque chemin, élagage borné du journal.

- **Nouvelles routes `backend/src/routes/sync.ts`** (auth obligatoire, rate limit) : `GET /sync/registry` (entités + version de schéma), `GET /sync/cursor` (curseur courant), `GET /sync/snapshot/:entity` (paginé, reprise par page, identifiants stables), `GET /sync/delta` (journal depuis le curseur, données courantes jointes aux upserts, tombstones pour les suppressions). Aucune écriture directe : les opérations hors connexion passent par POST /sync/ops (Bloc 4).

- **Tests** : `backend/tests/bloc3-sync-replication.test.mjs` — isolation A/B stricte (snapshot et delta de A ne contiennent aucune ligne de B), pagination + reprise, tombstone de suppression, entité hors registre refusée (mail_accounts inaccessible), validations d'entrée, refus sans authentification, réexécution idempotente de la migration 084, non-régression du signal 056-059 (lecture via pool admin).

- Version portée à 15.4.26.

# Aurion 15.4.25
# Aurion 15.4.25

## Bloc 2 — Interface de persistance locale structurée (14 novembre 2026)

Conformément au prompt maître (Bloc 2) : préparer les bases locales sans dupliquer le métier et sans toucher à la file de fichiers existante.

- **Nouveau module `assets/js/core/local-store.js`** : interface commune versionnée (`LOCAL_STORE_SCHEMA_VERSION`, schéma déclaré, registre de migrations additives), magasins `replicas`/`outbox`/`meta`/`downloads`, clés stables (`nsKey`, `opId`), index des dépendances pour l'ordre de rejeu. **Adaptateurs** : IndexedDB (nouvelle base `aurion-local-store`, migrations locales en `onupgradeneeded`, jamais `aurion-cloud-queue`), SQLite natif chiffré (driver `window.AURION_SQLITE_DRIVER` injecté — CapacitorSQLite compatible, clé protégée Keystore/Keychain côté natif, Bloc 8), mémoire (tests, mode privé strict). Séparation stricte par espace de noms compte/organisation/appareil ; `wipeLocalStore` pour l'effacement contrôlé (révocation/déconnexion) ; `storageWarning` (persistance durable + quota, même honnêteté que la file existante).

- **Aucune donnée métier n'est encore répliquée** (Blocs 3-5) ; aucun module existant n'est modifié ; la file de fichiers reste inchangée (assertions de test).

- **Tests** : `backend/tests/bloc2-stockage-local.test.mjs` (5 tests : CRUD mémoire trié, séparation A/B stricte inter-comptes/organisations/appareils, adaptateur SQLite à driver factice — DDL versionné, CRUD, espace de noms dans chaque requête, effacement contrôlé sélectif —, sélection d'adaptateur et isolation de la file existante, schéma requis pour les Blocs 3-6). Limites honnêtes : IndexedDB réel et SQLite natif sur appareil sont exercés aux Blocs 8/15 (pas de navigateur ni d'appareil dans cet environnement).

- Version portée à 15.4.25.

# Aurion 15.4.24
# Aurion 15.4.24

## Bloc 1 — Environnement cible OVH et séparation Render gratuit (14 novembre 2026)

Conformément au prompt maître (Bloc 1) : rendre le code compatible avec OVH comme production et Render comme environnement temporaire gratuit, sans basculer quoi que ce soit.

- **Fin de l'URL Render codée en dur** : `assets/js/config.js` résout l'URL d'API dans cet ordre — `window.AURION_API_URL` (enveloppe native) → `<meta name="aurion-api-base">` injectée par le serveur depuis `APP_BASE_URL` (nouveau service des pages `/` et `/index.html` dans `backend/src/app.ts`) → même origine (navigation http(s), mode local Windows inchangé) → repli documenté pour les contextes sans origine HTTP. `render.yaml` : plan `starter` (payant) → **`free`**, en-tête mis à jour (Render = démonstration temporaire ; OVH Francfort = production cible), `AURION_PUBLIC_ORIGIN` annoté comme URL de démonstration provisoire.
- **Étude de coûts OVH** (`docs/INFRA-OVH-COUTS.md`) : PostgreSQL managé Gen 3 (Discovery 64,24 $, Production 81,76 $/nœud SLA 99,95 %), VPS 2027 (VPS-1 4,54 $ → VPS-4 23,37 $), Object Storage Standard ≈ 0,0157 $/Go/mois — relevés du 14 novembre 2026 sur les pages OVH (grille USD du site World ; euros à revérifier au provisionnement). Trois options présentées, **aucun achat ni provisionnement**, choix à l'éditeur.
- **Procédure de migration Render → OVH** (`docs/MIGRATION-RENDER-OVH.md`) : prérequis bloquants (domaine non acheté, provisionnement non confirmé), configuration applicative (clé de chiffrement identique, APP_BASE_URL/CORS/cookies), callbacks OAuth, gel des écritures, migration base et fichiers avec vérification, bascule DNS, reprise, rollback — procédure prête et **non exécutée**.
- **Tests** : nouveau `backend/tests/bloc1-config-canonique.test.mjs` (6 tests : ordre de résolution dans 6 contextes simulés, priorité de l'enveloppe native, injection réelle de la méta via `app.inject` sur `/` et `/index.html`, absence d'`onrender.com` dans le HTML servi, shell statique intact, `render.yaml` sans plan payant). Deux assertions de `production-readiness.test.mjs` mises à jour avec justification : `plan: starter` (payant) → `plan: free` + refus de tout plan payant, et `AURION_PUBLIC_ORIGIN` annoté comme provisoire — évolution du contrat pilotée par la décision éditeur du prompt maître §2 (« aucune formule Render payante ne sera souscrite »), couverture équivalente conservée.
- Version portée à 15.4.24 (VERSION.txt, package.json racine et backend) ; README actualisé (headline obsolète « 15.4.4 » corrigée, historique conservé).

# Aurion 15.4.23

## Finalisation et validation — outils exécutables de sauvegarde/restauration, pré-vol intégrations et juridique, cahier de recette (14 novembre 2026)

Conformément à la recommandation de l'évaluation 15.4.22 (« consacrer la prochaine phase exclusivement à la finalisation et à la validation des éléments existants, sans ajouter de nouveaux modules métier »), cette version ne modifie AUCUN comportement existant : aucune fonction, route, migration ni test supprimé ou modifié. Elle rend **exécutables** les procédures restées documentaires et encadre la bêta privée. Aucune décision éditeur n'est prise à sa place : les pré-vol no-op sans configuration et n'activent rien.

- **Sauvegarde et restauration exécutables** (méthodes du RUNBOOK §2-§3 rendues jouables) : `backend/scripts/backup-db.mjs` (`npm run db:backup -- --out <rép> [--prune-days N]` — pg_dump format custom daté, vérification `pg_restore --list`, rétention expresse limitée au motif exact du script) et `backend/scripts/restore-db.mjs` (`npm run db:restore:drill -- --from <dump> --confirm` — restauration sur base JETABLE uniquement, **refus automatique si la cible est DATABASE_URL/AURION_MIGRATION_DATABASE_URL**, --exit-on-error, vérifications post-restauration : schema_migrations, tables, isolation). Garde-fous testés : usage sans --confirm, refus de cible de production, échec pg_dump absent avec guidance, échec pg_restore présenté comme résultat de test valide.
- **Pré-vol intégrations** : `backend/scripts/check-integrations.mjs` (`npm run check:integrations [--strict]`) — SMTP (connexion + STARTTLS + AUTH LOGIN, aucun e-mail envoyé), Stripe (GET /v1/balance lecture seule, livemode affiché), Google OAuth (points de terminaison + format client_id), PA et paiement client : état déclaratif uniquement (aucun appel réseau, aucune décision — D3 et contrat PA restent à l'éditeur). Chaque contrôle est NO-OP tant que sa configuration est absente ; `--strict` sort 1 si un contrôle configuré échoue. Chemins d'échec éprouvés (connexion refusée, clé 401).
- **Pré-vol juridique** : `backend/scripts/check-legal-readiness.mjs` (`npm run check:legal [--strict]`) — miroir exécutable de la porte de publication : la liste des documents et variables obligatoires est extraite DIRECTEMENT de `services/account.ts` (aucune divergence possible), les placeholders non résolus sont listés avec numéro de ligne exact. Testé : les deux réserves `[À compléter]` restantes (CM2C ligne 51 des CGU, DPA ligne 44 de la politique) et les variables d'identité manquantes sont identifiées — l'outil liste les blocages, il ne les lève pas (coordonnées = décisions/souscriptions éditeur).
- **Cahier de recette de la bêta privée** : `docs/RECETTE-BETA-PRIVEE.md` — 32 cas numérotés (installation Windows A1-A6, non-régression B1-B8, navigateurs C1-C4, mobile D1-D3, accessibilité E1-E4, pré-vol intégrations F1-F4, sauvegarde/restauration G1-G3, sécurité pré-audit H1-H4) avec étapes, résultats attendus, zones de résultat à remplir et tableau de suivi global ; critère de clôture explicite (tous cas remplis et conformes, sans ouverture commerciale ni publication juridique ni décision réservée).
- **Exploitation et support** : `docs/EXPLOITATION-SUPPORT.md` — supervision (/health, /health/db, X-Request-Id, redaction), routine quotidienne/avant déploiement/hebdo/mensuelle, procédure d'incident (jamais de restauration directe en production), support client (tickets, rétractation, export complet), rappel honnête des décisions ouvertes.
- **Fils** : `backend/package.json` — quatre cibles npm additives (`db:backup`, `db:restore:drill`, `check:integrations`, `check:legal`) ; `docs/CHECKLIST-PRE-PRODUCTION.md` et `README.md` renvoient aux exécutables et au cahier de recette ; version portée à 15.4.23 (VERSION.txt, package.json racine et backend).
- **Validation** : `npm run check` et `npm test` rejoués sur cluster PostgreSQL vierge après les modifications — résultats inchangés et verts (fumée 79/79, parcours navigateur Playwright OK, suite intégrale 448/448, 0 échec, 0 ignoré).

# Aurion 15.4.22

## Mise à niveau de publication — infrastructure cible, textes juridiques 4.0 et états exacts (14 novembre 2026)

Traite les cinq priorités restantes de l'évaluation de commercialisation du 14 novembre 2026 (infrastructure, facturation électronique, juridique, paiement/messagerie, recette), côté livrable. Aucune migration modifiée ; aucun test supprimé ; validation complète rejouée (voir fin de section).

- **Infrastructure — région unique Francfort** : le blueprint `render.yaml` ne déclare plus que le service `aurion` en région Frankfurt, aligné sur le stockage OVH région `de` (résidence UE des données). L'instance historique `aurion-web` (Oregon) est volontairement **hors blueprint** comme voie de retour arrière (un service retiré du blueprint n'est jamais détruit par une synchronisation) et à supprimer dans Render après bascule DNS et fenêtre de retour. Nouveau `docs/RUNBOOK-PRODUCTION.md` : provisionnement (base UE, rôles migrateur/runtime selon `docs/POSTGRES-ROLES.md`, bucket OVH privé, secrets), sauvegardes indépendantes chiffrées (base quotidienne + avant chaque déploiement, fichiers synchronisés, clés séparées des données), et **test de restauration complète** encadré avant toute donnée réelle. Page `/transparency` et docs (README, RENDER-GITHUB, SOUS-TRAITANTS, DEPLOIEMENT-RENDER, CHECKLIST) alignés.
- **Textes juridiques — version de publication 4.0** : les cinq textes de `docs/` (CGU-CGV, POLITIQUE-CONFIDENTIALITE, COOKIES, LEGAL-NOTICE, DECLARATION-ACCESSIBILITE) perdent tout marqueur « DOSSIER DE PRÉPARATION / NE PAS PUBLIER » et passent en forme de publication : identité d'éditeur définitive (Coulibaly Damien, EI micro-entreprise Easyweb-dev, SIRET 88848569500033, Challans), mention **TVA non applicable — article 293 B du CGI**, médiateur désigné CM2C (coordonnées en réserve jusqu'à adhésion), entrée en vigueur à la publication, déclaration d'accessibilité en forme légale (état non conforme, dispense article 16 loi 2023-171 documentée, plan d'amélioration). Réserves explicites restantes notées `[À compléter]` dans les textes : coordonnées contractuelles de l'hébergeur et du médiateur (après souscription/adhésion). La porte applicative accepte désormais `AURION_LEGAL_PUBLICATION_APPROVAL=4.0` (`services/account.ts`, version des documents portée à 4.0) ; le statut brouillon s'applique tant que les variables d'identité (`backend/.env.example`, pré-remplies avec les déclarations de l'éditeur) sont incomplètes ou qu'un placeholder subsiste — échec fermé. Dossier docx « Aurion-15.4.22-Textes-juridiques-4.0.docx » régénéré et intégré à `docs/`.
- **Facturation électronique — aucun sur-claim** : état vérifié cohérent partout (`electronic-outgoing.ts` « aucune PA contractuelle connectée », `/transparency` entrée `einvoice-live` « non vérifiée », `docs/PLATEFORME-AGREEE.md`, UI limitée à la saisie des mentions). La connexion d'une plateforme agréée réelle reste un acte contractuel externe, publié comme tel.
- **Paiement et messagerie** : états exacts confirmés (`payments-live` « non vérifiée », décision D3 nommée ; SMTP/OAuth décrits comme configurations opérateur) ; `backend/.env.example` complété du bloc juridique complet (identité éditeur, hébergeur, accessibilité, sous-traitants).
- **Recette** : `docs/CHECKLIST-PRE-PRODUCTION.md` portée à 15.4.22 : ajout de la recette d'installation Windows réelle (installation neuve, relance, mise à jour, logo, documents générés), références au runbook pour sauvegardes/restauration, état technique actualisé.
- **Validation** : `npm run check` (build, typecheck, contrôle frontal, lint, fumée 79/79, parcours navigateur Playwright) et `npm test` (suite intégrale) rejoués sur base PostgreSQL neuve après les modifications — voir `RAPPORT-CORRECTIF-078.md` livré pour le détail des preuves de la session.

# Aurion 15.4.20

## Correctif « Échec de migration 078 » et prompt correctif (14 novembre 2026)

Application du prompt correctif issu du diagnostic `[AURION MIGRATE] ECHEC 078`, phases A à H, avec preuves exécutées (`backend/tests/fix078-correctif.test.mjs` : 9/9 ; parcours navigateur rejoué). Aucune migration existante (001-083) modifiée ; aucun test supprimé.

- **Phase A — cause racine 078** : `backend/src/migrate.ts` crée désormais avant toute migration, de façon idempotente, les rôles SQL référencés en dur par les migrations (`aurion_admin`, `aurion_runtime`, plus `AURION_RUNTIME_DB_ROLE`) en NOLOGIN ; l'installation les passe LOGIN (`dbtool provision`). Échec explicite `BOOTSTRAP_ROLE_IMPOSSIBLE` (avant tout fichier) si le compte de migration ne peut pas créer les rôles. Reproduction de l'échec 078 sur cluster vierge avant correctif, puis migrations 080/80 complètes ×2 validées.
- **Phase A — séparation des rôles** : `scripts/Install-Aurion.ps1` génère `DATABASE_URL` avec l'utilisateur `aurion_runtime` (application) et `AURION_MIGRATION_DATABASE_URL` avec `aurion_admin` (migrations uniquement) ; `AURION_RUNTIME_DB_ROLE` est toujours le rôle réellement utilisé par `DATABASE_URL`. La RLS s'applique réellement : l'application ne se connecte plus avec le propriétaire des tables (vérifié : propriétaire `aurion_admin`, RLS active, échec fermé sans contexte).
- **Phase B** : huit fichiers DRAFT juridiques supprimés (plus référencés par le code) ; résidus de la technologie retirée nettoyés dans `ARCHITECTURE-PRODUCTION.md`, `DESIGN.md`, `AVANCEMENT-15.4.0.md` et les commentaires de `bloc12-bordereaux.test.mjs` (le garde-fou d'absence est conservé ; le CHANGELOG et les rapports de livraison datés restent des historiques) ; `package.json` (racine et backend) porté à 15.4.20 ; dossier `docs/Aurion-15.4.20-Textes-juridiques-4.0.docx` intégré à l'archive.
- **Phase C (D-b : refus avec message)** : le logo WebP est refusé avec message explicite (backend `POST /organization/logo`, onboarding, Paramètres) car non affichable par les moteurs PDF/DOCX/ODT ; PNG/JPEG acceptés. Identité émettrice vérifiée présente dans les documents générés (SIRET retrouvé dans le PDF après décompression des flux, dans le DOCX et l'ODT) et hauteurs d'encart calculées au texte éprouvées avec textes longs (40 pièces, garantie et CGV étendues : pagination automatique).
- **Phase D** : la barre de défilement du calculateur existante vérifiée (`.calculation` : max-height + overflow-y) ; l'encart de pièces du devis reçoit un conteneur de défilement horizontal dédié (`.lines-scroll` + grille 4 colonnes conservée sur écran étroit).
- **Phase E** : la sélection du logo vit désormais dans l'état du parcours (`state.logoFile`) — un aller-retour « Précédent » ne perd plus le fichier choisi, l'étape re-rendue l'affiche, le message d'erreur avec réessai est conservé ; testé dans le parcours navigateur (refus WebP puis sélection persistante).
- **Phase F + correction réelle découverte** : la détection fournisseur par nom normalisé / SIREN / SIRET / e-mail est prouvée de bout en bout sur un registre simulé (preview : variantes d'accents, e-mail, inconnu, doublon interne ; commit : update + create). **Le test a révélé un défaut RLS réel** : `commitAbsorption` ouvrait sa transaction sans le tenant courant (`db.connect()` + `begin` nu) — toute écriture d'import échouait fermé. Corrigé avec `beginTenant(conn)` (`routes/data-import.ts`).
- **Phase G** : la page « Sécurité et contrôles » publie l'état exact du suivi d'erreurs (« absente », décision D6 non tranchée nommément) — aucun service connecté tant que D6 n'est pas décidée.
- **Arbitrages appliqués** : D-b refus avec message (recommandé) ; D-d suppression des DRAFT ; D-e paquet précompilé (`backend/dist` inclus, compilation locale sautée si `dist/.version` correspond à `VERSION.txt`) ; D-c version de publication juridique inchangée (2.3) ; D-a identité émettrice conservée (aucun retrait, avis juridique requis avant toute modification).

## Révision des textes juridiques (14 novembre 2026)

- **Cinq textes remplacés dans `docs/`** (CGU-CGV, POLITIQUE-CONFIDENTIALITE, COOKIES, LEGAL-NOTICE, DECLARATION-ACCESSIBILITE) pour correspondre au projet 15.4.20 : rapprochement bancaire par import CSV/OFX, facturation électronique via PA configurée (non opérationnelle sans PA connectée ni sandbox), liens de paiement préparatoires (D3), export complet, lecture seule à +60 jours, page `/transparency`, fournisseurs réels (PostgreSQL géré Render, plans starter, aucune version 15.4 vérifiée en ligne).
- **Retrait de toute référence aux technologies de génération automatique de contenu retirées en 15.4.0** dans les cinq textes **et** dans `docs/SECURITY.md` (entrée reformulée « génération automatique de contenu : absente ») : les détections et analyses sont décrites comme déterministes, sans historique de technologie.
- **Aucune version de publication changée** : version interne 2.3 conservée (`services/account.ts`, `AURION_LEGAL_PUBLICATION_APPROVAL`), statuts CM2C / Brevo / rétentions toujours à confirmer ; dossier docx « Textes juridiques 4.0 » généré à l'identique des fichiers livrés.

## Bloc 25 — Rapprochement bancaire (optionnel ; décision D5 : défaut = IMPORT DE FICHIERS)

- **Import de relevés CSV ou OFX** (`POST /bank/import`, 10/min) : parseur OFX déterministe (blocs STMTTRN) et parseur CSV avec détection automatique des colonnes françaises (Date ; Libellé ; Montant ; Référence, accents et apostrophes normalisés), **mapping sauvegardé par nom de configuration** (`bank_import_configs`) et réutilisable.
- **Dédoublonnage par empreinte SHA-256** (date|montant|libellé|référence) : un réimport identique n'écrit RIEN de plus (recette : 2 insérés puis 0/2 doublons).
- **Suggestions jamais appliquées automatiquement** : score par montant exact (±0,01), proximité de date (≤ 2 j / ≤ 7 j) et numéro de facture présent dans le libellé ; l'utilisateur VALIDE chaque rapprochement (`POST /bank/transactions/:id/match`) — double rapprochement refusé (409), règlement déjà rapproché refusé.
- **Rapprochement ANNULABLE** (`unmatch`) sans effet irréversible ; opérations ignorables (`ignore`) ; **écarts LISTÉS** (`GET /bank/gaps` : règlements sans relevé importé, opérations bancaires sans règlement) et **jamais résolus silencieusement**.
- **Aucun agrégateur bancaire, AUCUN ordre de paiement sortant** (vérifié par test sur le code) ; aucune écriture comptable automatique modifiée par le rapprochement ; migrations `083` tenant-isolées.

## Corrections (paquet 15.4.20 reconstruit)
- **Horloge locale (`core/ui.js`)** : à chaque redémarrage d'une horloge sur un même élément, l'ancien écouteur `visibilitychange` n'était jamais retiré (le `removeEventListener` lisait l'empreinte APRÈS écrasement du `WeakMap`) — chaque retour de veille redessinait l'heure N fois. Les écouteurs et l'intervalle sont désormais stockés ensemble (`{timer, onVisible}`) et retirés proprement avant remplacement.
- **Requête 401 au démarrage (`pages/dash/quote.js`, `pages/dash/catalog.js`)** : le référentiel micro (catégories de cotisations) était chargé au chargement du module — donc AVANT login, le navigateur journalisait un 401 inutile à chaque démarrage. La requête part désormais au PREMIER RENDU de la vue concernée (garde `microRefFetchStarted`), comme le reste du chargement de données.
- **Violation CSP sur les options fiscales (`pages/dash/settings.js` + classe CSS `fieldset-box`)** : le fieldset « Options fiscales déclarées · Bloc 9 » portait un attribut `style="…"` en ligne, REFUSÉ par la CSP stricte (`style-src 'self'`) — le navigateur journalisait l'erreur et le cadre perdait bordure et padding (présent depuis le bloc 9 / 15.4.8 ; détecté par le parcours navigateur rejoué en validation finale). Le style est désormais une classe `fieldset-box` de `assets/css/app.css`, rendu identique, aucune directive CSP assouplie.

## Tests réellement exécutés (15.4.20, PostgreSQL réel en local)
- Porte B0 stricte complète (`tools/verify-b0-baseline.mjs`, base NEUVE, migrations 001→083 ×2 idempotentes) : **suite backend 439/439**, smoke **79/79** (0 échec de référence, 7 résolus depuis B0), régression complète **0 échec** (18 résolus depuis B0), build + typecheck OK, lint **0 erreur**, check-frontend **38 fichiers OK**, **parcours navigateur** Playwright : inscription immédiate → parcours d'accueil 8 étapes → navigation 9 vues → déconnexion/reconnexion, **aucune erreur console**.
- Nouveaux tests `bloc25-bank-reconciliation.test.mjs` (2 tests) : unitaire (OFX, CSV accents, empreinte stable, suggestions scoring, absence d'agrégateur/paiement sortant dans le code) ; recette réelle (import + réimport sans duplication, suggestions non appliquées, match/unmatch/re-match, écarts, mapping sauvegardé, isolation A/B).
- Corrections du paquet reconstruit validées par ce même parcours : horloge `ui.js` (accumulation d'écouteurs), 401 référentiel micro au démarrage (`quote.js`/`catalog.js`), violation CSP du fieldset options fiscales (style inline → classe `fieldset-box`).

## Limites assumées (honnêteté)
- Mode agrégateur (connexion bancaire en lecture seule avec consentement) : NON LIVRÉ — dépend de la décision D5 ; le défaut est l'import de fichiers.
- Les remboursements et paiements sortants restent hors périmètre ; les écarts se corrigent à la main.
# Aurion 15.4.19

## Blocs 23 et 24 — Architecture Render/GitHub ; observabilité

### Bloc 23 — Architecture et continuité Render / GitHub
- **`docs/RENDER-GITHUB.md`** : état vérifié des sources — deux services (`aurion` à Francfort, cible commerciale UE ; `aurion-web` à Oregon, rôle à confirmer dans Render), groupe de sécurité `aurion-commun`, déploiement automatique désactivé (à confirmer dans Render), `/health` (liveness) et `/health/db` (readiness) compatibles Render, circulation des données, latence front↔API, reprise après panne (processus sans état). **Aucun service supprimé, déplacé, recréé ni désactivé** ; aucune région/base/domaine/secret modifié. Test vérifiant que le blueprint déclare bien les deux services et que les routes health existent.

### Bloc 24 — Observabilité, erreurs, alertes et disponibilité
- **Journalisation structurée** : pino JSON avec `service`/`version`/`environment`, niveau par `LOG_LEVEL` ; **chaque requête reçoit un identifiant unique renvoyé dans `X-Request-Id`** (reliability ticket ↔ journaux) ; les corps de requêtes ne sont pas journalisés.
- **Redaction testée** : liste explicite de champs sensibles (password, tokens, authorization, cookie, secrets, IBAN, carte…) + motifs de clés réelles (`Bearer …`, `sk_live_`, `AKIA…`, `ghp_…`) masqués avant toute écriture.
- **Erreurs fatales** : `unhandledRejection` et `uncaughtException` journalisés (fatal) puis **arrêt propre** du processus (Render redémarre) — jamais de poursuite en état incertain ; réponses client génériques.
- **Métriques internes** `GET /internal/metrics` (réservées à l'administration, vérifié 403 pour un compte normal) : requêtes totales, taux 5xx/4xx, pool PostgreSQL (total/idle/waiting), version, uptime — **aucun identifiant utilisateur ni client**.
- **Suivi d'erreurs externe (D6) et surveillance externe** : NON CONNECTÉS — couche prête, déclarée non opérationnelle ; runbook d'alertes (seuils, déduplication) dans `docs/OBSERVABILITE.md` ; rétention à faire valider juridiquement.

## Tests réellement exécutés (15.4.19, PostgreSQL 17 réel en local)
- Suite backend complète : **437/437**.
- Nouveaux tests `bloc23-24-observability.test.mjs` (3 tests) : contrat Render (2 services/régions/health dans le blueprint + doc) ; unitaire observabilité (redaction champ par champ et motifs de clés, profondeur bornée, options pino, handlers fatales avec exit propre, runbook) ; recette réelle (X-Request-Id unique sur requêtes publiques et authentifiées, /health sans détail technique, /health/db sans chaîne de connexion, métriques 403 pour un compte normal puis 200 pour un administrateur sans donnée personnelle).
- smoke 79/79 · lint 0 erreur · check-frontend 38 fichiers OK.

## Limites assumées (honnêteté)
- L'observabilité EXTERNE (suivi d'erreurs, surveillance 2 régions/1 min, alertes) reste NON OPÉRATIONNELLE tant que la décision D6 n'est pas tranchée et qu'aucun outil contractuel n'est intégré — déclaré tel quel dans le runbook et la matrice du bloc 20.
- Les régions Render sont celles du blueprint ; la confirmation finale se fait dans le tableau de bord Render (aucun accès d'agent aux services).
# Aurion 15.4.18

## Blocs 21 et 22 — Installation Windows ; fenêtre, barre des tâches et horloge

### Bloc 21 — Installation Windows et LibreOffice
- **Choix du répertoire d'installation** : défaut = emplacement utilisateur SANS élévation (aucun droit administrateur requis, comportement historique conservé) ; paramètre `-InstallDir` pour un répertoire personnalisé (ex. `C:\Program Files\Aurion`) — l'installeur VÉRIFIE la possibilité d'écrire avant d'accepter, et retombe proprement sur l'emplacement utilisateur avec avertissement sinon.
- **Séparation programmes / données** : nouvelle fonction `Get-AurionDataDir` — si le répertoire applicatif n'est pas inscriptible (ex. Program Files), la base locale, les journaux et les données vivent dans `%LOCALAPPDATA%\Aurion\data` (emplacement Windows adapté) ; jamais d'écriture forcée dans Program Files.
- **LibreOffice** : détection d'une installation EXISTANTE du système (chemins Program Files + registre `HKLM\SOFTWARE\LibreOffice\UNO\InstallPath`, version vérifiée) et RÉUTILISATION en priorité — jamais une installation imposée ; le moteur reste facultatif (la génération PDF d'Aurion fonctionne sans lui) ; réutilisation de l'extraction locale déjà présente conservée.
- **Désinstallation/arrêt** : `Stop-Aurion.ps1` ne supprime AUCUNE donnée (vérifié par test) ; aucune modification permanente du registre système par les scripts.

### Bloc 22 — Fenêtre, barre des tâches et horloge
- **Fenêtre appli maximisée** (`--start-maximized --window-size=1400,900`) au lieu de `--start-fullscreen` : la fenêtre n'est JAMAIS recouverte par la barre des tâches, le retour au bureau, Alt-Tab et les raccourcis système restent accessibles ; aucun changement global/permanent des paramètres Windows.
- **Horloge locale** : composant partagé `startLocalClock` (format français 24 h `toLocaleTimeString('fr-FR')`, fuseau du système), mise à jour chaque seconde, **resynchronisation au retour de veille** (`visibilitychange`) et correction en cas de dérive ; affichée sur le tableau de bord sans impact de performance (un seul interval, nettoyé au remplacement du contenu).

## Tests réellement exécutés (15.4.18, PostgreSQL 17 réel en local)
- Suite backend complète : **434/434**.
- Nouveaux tests `bloc21-22-windows-clock.test.mjs` (2 tests) : installation (InstallDir vérifié, séparation programmes/données, détection registre+Program Files de LibreOffice, facultatif, aucune élévation, arrêt sans suppression de données, aucun registre écrit) ; fenêtre/horloge (maximisé sans fullscreen système, horloge fr-FR 1 s + visibilitychange, aucun registre).
- smoke 79/79 · lint 0 erreur · check-frontend 38 fichiers OK.

## Limites assumées (honnêteté)
- Les scripts PowerShell ne sont PAS exécutables dans cet environnement (Linux) : les garanties sont vérifiées STATIQUEMENT (motifs sources) ; la recette sur machine Windows réelle (installation neuve, upgrade, désinstallation, veille) reste à exécuter par le propriétaire — liste des scénarios à couvrir dans les tests du bloc 21 du prompt.
- Le contenu des journaux après veille dépend du navigateur (Chrome/Edge gèrent la reprise) ; l'horloge se resynchronise à la visibilité et à chaque tick.
# Aurion 15.4.17

## Bloc 20 — Transparence, sécurité documentée et réversibilité

- **Page publique « Transparence & réversibilité »** (`/transparence`, sans compte, liée depuis la navigation légale) alimentée par `GET /transparency` :
  - **Sous-traitants réels** calculés depuis la CONFIGURATION EFFECTIVE (Render + PostgreSQL permanents ; Google Drive actif seulement si OAuth configuré ; messagerie SMTP de l'utilisateur ; prestataire de paiement / plateforme agréée actifs seulement si leurs variables existent — sinon « inactif » ; Stripe pour l'abonnement de la plateforme elle-même). Régions documentées, « à confirmer dans Render » assumé.
  - **Matrice « Sécurité et contrôles »** avec les QUATRE états du bloc 6 (implémentée et testée / partielle / absente / non vérifiée), chaque contrôle avec sa PREUVE (test nommé) et son EMPLACEMENT dans le code — la cohérence est **automatiquement vérifiée par test** : chaque fichier cité doit exister dans l'arbre livré.
  - **Réversibilité** : procédures d'export complet sans frais, rétractation, suppression de compte et durées (60 j → lecture seule, `data_read_only_until`), aucune donnée secrète dans la page ni l'export.
- **Modèle de clauses de sous-traitance** (`docs/SOUS-TRAITANTS.md`) avec avertissement explicite : **PAS présenté comme conforme RGPD** — revue juridique requise avant publication.
- **Export complet** (réversibilité) : recette prouvant que le ZIP contient les données de l'organisation (manifest `secretsIncluded:false`, `oauthTokensIncluded:false`, `crossOrganizationDataIncluded:false`), l'index des justificatifs SHA-256 (bloc 14), et **aucune donnée d'une autre organisation** (isolation A/B sur les entrées du ZIP).
- **Aucun secret réel** dans la réponse publique (motifs de clés vérifiés par test).

## Tests réellement exécutés (15.4.17, PostgreSQL 17 réel en local)
- Suite backend complète : **432/432**.
- Nouveaux tests `bloc20-transparency.test.mjs` (2 tests) : cohérence matrice ↔ code (chaque emplacement cité existe, états honnêtes des capacités non opérationnelles, page routée, avertissement RGPD) ; recette réelle (`/transparency` publique sans session, sous-traitants = configuration réelle, aucun motif de clé réelle, export ZIP avec manifest de sécurité et index justificatifs, isolation A/B sur les entrées du ZIP).
- smoke 79/79 · lint 0 erreur · check-frontend 38 fichiers OK.

## Limites assumées (honnêteté)
- La matrice cite « 430+ tests » : le compteur évolue à chaque livraison (vérifié ≥ 430 à cette date).
- La suppression définitive et les durées exactes de conservation restent à faire confirmer juridiquement (documenté tel quel sur la page publique).
# Aurion 15.4.16

## Bloc 19 — Cryptographie et gestion des secrets (audit consolidé)

- **Primitives maintenues uniquement, aucune primitive réinventée** : mots de passe en **argon2id** (64 Mo, t=3), secrets au repos en **AES-256-GCM avec versions de clé** (v2 avec identifiant de clé, v1 historique lisible pendant la rotation sans retomber sur JWT_SECRET), JWT HS256 avec **secret ≥ 32 caractères validé par zod au démarrage**.
- **Rotation couverte** : `AURION_ENCRYPTION_KEY_PREVIOUS` (+ version) pour une période de déchiffrement compatible, script `scripts/rotate-secrets.mjs` (dry-run/apply), tests `secret-rotation.test.mjs` existants ; le test d'audit verrouille la présence de la garde `SECRET_ENCRYPTION_KEY_VERSION_UNAVAILABLE`.
- **Aucun algorithme obsolète à des fins de sécurité** : balayage de `backend/src` — le seul md5 est le contrôle d'intégrité Google Drive (checksum renvoyé par l'API, usage non cryptographique, documenté).
- **Secrets jamais exposés** : les erreurs de `secrets.ts` n'exposent que des codes (`SECRET_*`), jamais une valeur ni une clé ; la clé d'API de paiement et le secret de webhook ne sont jamais journalisés ; le script de rotation n'affiche que des compteurs.

## Tests réellement exécutés (15.4.16, PostgreSQL 17 réel en local)
- Suite backend complète : **430/430** (aucune régression ; les tests de rotation existants continuent de passer).
- Nouveaux tests `bloc19-crypto-audit.test.mjs` (3 tests) : primitives modernes + gardes de configuration + rotation couverte ; aucun algorithme obsolète hors checksum Drive ; secrets jamais journalisés (codes d'erreur seulement, script de rotation muet sur les valeurs).
- smoke 79/79 · lint 0 erreur · check-frontend 38 fichiers OK.

## Limites assumées (honnêteté)
- Les ciphertexts `google.ts` (OAuth Drive) ne portent pas encore d'identifiant de version (même schéma que le v1 des secrets) : la lecture reste compatible avec la rotation via `AURION_ENCRYPTION_KEY_PREVIOUS` ; l'alignement sur le format v2 des secrets est un chantier restant, sans urgence de sécurité (AES-256-GCM identique).
# Aurion 15.4.15

## Blocs 17 et 18 — Popups de confirmation ; migrations, e-mail et dépendances (audit final)

### Bloc 17 — Popups création / modification / suppression
- **Audit exhaustif de l'interface** : aucun dialog natif `confirm()`/`prompt()`/`alert()` ne subsiste dans le code exécutable (test balayant tout `assets/js` après retrait des commentaires ; les seuls « prompt » restants sont l'API d'installation PWA du navigateur, légitime). Toutes les confirmations passent par les fenêtres partagées au design Aurion (`askConfirm`, `confirmDelete`, `modalForm`).
- **Suppression du logo confirmée** (Paramètres → Logo) : c'était la dernière suppression sans confirmation — désormais popup explicite « les documents déjà émis ne sont pas modifiés ».
- Les modifications passent par des fenêtres affichant les valeurs existantes (récapitulatif avant enregistrement) ; les données détectées automatiquement restent modifiables (blocs 7/8/12) ; une annulation ne crée, ni ne modifie, ni ne supprime rien ; le mode édition désactive les boutons pendant l'envoi (double clic protégé côté interface) et les écritures critiques sont transactionnelles côté serveur (blocs 2, 11, 13).

### Bloc 18 — Migrations, vérification e-mail et dépendances
- **Migrations 042/044** : avertissement de préfixes dupliqués conservé, aucune renumérotation (décision déjà prise en 15.4.1 et maintenue — l'historique appliqué n'est jamais réécrit).
- **Dependabot** (npm + GitHub Actions) et **audit npm dans la CI** distincts de l'installation `--no-audit` : en place depuis 15.4.1, vérifiés par le test d'audit (fichier + workflow).
- **Vérification e-mail** : volontairement DÉSACTIVÉE à la demande du propriétaire (15.2.50, `docs/EMAIL-VERIFICATION.md`) — le test verrouille ce choix : aucune réactivation sans demande explicite, migration 062 conservée.

## Tests réellement exécutés (15.4.15, PostgreSQL 17 réel en local)
- Suite backend complète : **427/427** (migrations ×2, RLS).
- Nouveaux tests `bloc17-18-audit.test.mjs` (3 tests) : aucun dialog natif (balayage du code exécutable) ; confirmations présentes pour toutes les suppressions métier listées (clients, devis/factures, SAV, catalogue, fournisseurs, logo, clés d'accès, dépenses, paramètres) ; migrations/Dependabot/audit/e-mail vérifiés.
- smoke 79/79 · lint 0 erreur · check-frontend 38 fichiers OK.

# Aurion 15.4.14

## Blocs 15 et 16 — Accents ; champs libres et placeholders

### Bloc 15 — Reconnaissance et recherche des accents
- **Fonction SQL `aurion_unaccent`** (migration `082`, IMMUTABLE, déterministe) : normalisation Unicode NFC native de PostgreSQL, translation 1:1 (59 caractères : accents, cédilles, ligatures Œ/Æ, Ý/ÿ), apostrophe typographique ' → ' ; plus casse. **Les valeurs d'origine ne sont jamais réécrites** : seule la comparaison de recherche est insensible aux accents (« reparation » retrouve « Réparation », « electricite » retrouve « Électricité »).
- Appliquée aux principaux chemins de recherche : `/search/all` (clients, fournisseurs, documents, SAV), `/clients/matches` (doublons du bloc 11) ; le rapprochement fournisseur du bloc 3 et les suggestions/catalogue de l'interface normalisaient déjà en NFD. Unicode décomposé (e + accent combinant) reconnu grâce à la normalisation NFC.
- **Correction d'un bug préexistant démontré en recette** : la recherche globale historique référençait `quotes.client_name` — colonne inexistante — et renvoyait systématiquement 500 ; le nom du client vient désormais du JOIN clients.

### Bloc 16 — Champs libres et placeholders
- Champs libres du calculateur (kilométrage, livraison, coefficient, main-d'œuvre vendue, TTC voulu, bénéfice minimum) : initialisation **à vide** avec placeholder explicite — jamais préremplis à zéro ; vide = non renseigné, zéro = zéro volontaire (moteur : `laborSellingHt==='' → undefined`).
- **Correction d'un bug préexistant démontré en recette** : lors d'une édition partielle (sans `items`), les lignes rechargées perdaient leurs alias camelCase (PostgreSQL met les alias non quotés en minuscules) et les prix de vente enregistrés étaient silencieusement écrasés par un recalcul à partir du coût d'achat. Les alias sont désormais quotés (`unit_price as "unitPrice"`) : les valeurs enregistrées restent intactes (contrat `quote-contract-v3` mis à jour sans affaiblissement).
- Document créé avec kilométrage vide → aucun frais kilométrique ; kilométrage 0 volontaire → conservé tel quel ; édition partielle sans champ → prix et catégories préservés.

## Tests réellement exécutés (15.4.14, PostgreSQL 17 réel en local)
- Suite backend complète : **424/424** (migrations 001→082 ×2, idempotence).
- Nouveaux tests `bloc15-16-accents-freefields.test.mjs` (4 tests) : contrat (fonction 1:1 immutable, endpoints patchés, NFD côté interface, placeholders à vide sans zéro forcé, distinction vide/absent dans le moteur) ; recettes réelles (recherche sans accents sur clients/fournisseurs accentués, décomposé Unicode, données d'origine intactes, doublons insensibles aux accents, isolation A/B ; document vide vs zéro volontaire distingués en base ; prix enregistré intact après édition partielle).
- smoke 79/79 · lint 0 erreur · check-frontend 38 fichiers OK.

## Limites assumées (honnêteté)
- La translation couvre les caractères accentués latins français courants (+ ligatures) ; les caractères exotiques (ex. ł, đ) ne sont pas translittérés.
- Les recherches restent des LIKE (non indexées en trigramme) : performances suffisantes aux volumes micro-entreprises (limites 50-100 lignes par requête).

# Aurion 15.4.13

## Bloc 14 — Export pour l'expert-comptable et accès comptable

- **FEC au format officiel** (`GET /accounting/fec?year=`) : 18 champs tabulés (SirenIdentite → ValidDateLint), fondé sur la comptabilité de TRÉSORERIE du régime micro (encaissements réels) : chaque règlement produit deux lignes ÉQUILIBRÉES (512 débit / 411 ou 706 crédit), chaque achat/SAV/note de frais deux lignes (606 débit / 512 crédit) ; un déséquilibre débit/crédit refuse l'export (`FEC_UNBALANCED`) — jamais un FEC faux. Reproductibilité vérifiée : deux appels → contenu identique ; SIREN et dates au format FEC.
- **Exports CSV** (`GET /accounting/exports/:kind.csv`) : livre des recettes (micro), journal des ventes, journal des achats, grand livre simplifié (par compte, tri déterministe), tableau des cotisations et TVA par catégorie (référentiel daté du bloc 8, impôt ≠ cotisations).
- **Index des justificatifs** : l'export complet existant (`/documents/export-all.zip`) inclut désormais `comptabilite/justificatifs-index.csv` — nom de fichier stable, **empreinte SHA-256 calculée sur les octets exportés**, taille, date d'export.
- **Rôle « expert-comptable »** (migration `081_accountant_role.sql`) : invitation par le chef d'entreprise uniquement (`POST /organization/accountant-invite`, 403 OWNER_ONLY pour les autres), jeton à 7 jours, acceptation par l'utilisateur connecté dont l'e-mail correspond (`POST /auth/accountant-accept`, consultation inter-tenant via le pool d'administration journalisé) ; **LECTURE SEULE stricte** dans `requireAuth` (écriture → 403 `ROLE_READ_ONLY`), **révocation immédiate vérifiée EN BASE à chaque requête** (`ACCESS_REVOKED`), chaque consultation journalisée (`accountant_access_log`, tenant-isolé). Aucun accès aux secrets, aux paramètres de paiement ou à l'administration (hors périmètre du rôle).
- **Honnêteté** : les obligations réelles du micro-entrepreneur (comptabilité de trésorerie, livre des recettes) sont documentées dans le code ; le FEC est fourni « pour les dossiers qui le requièrent », jamais présenté comme obligatoire sans preuve.

## Tests réellement exécutés (15.4.13, PostgreSQL 17 réel en local)
- Suite backend complète : **420/420** (migrations 001→081 ×2, RLS sur accountant_invitations/accountant_access_log).
- Nouveaux tests `bloc14-accounting-export.test.mjs` (2 tests) : contrat (18 champs, garde lecture seule dans requireAuth, tables d'invitation/journal) ; recette réelle (facture payée → FEC équilibré débit=crédit avec 18 champs par ligne et dates FEC, reproductibilité exacte, 5 exports CSV dont livre des recettes avec client et référentiel daté, invitation refusée au non-propriétaire, acceptation avec e-mail correspondant + refus e-mail différent, lecture 200 / écriture 403 ROLE_READ_ONLY, journal des consultations rempli, révocation immédiate → ACCESS_REVOKED, isolation A/B du journal).
- smoke 79/79 · lint 0 erreur · check-frontend 38 fichiers OK.

## Limites assumées (honnêteté)
- Le FEC micro s'appuie sur les ENCAISSEMENTS (comptabilité de trésorerie) : c'est le mode de tenue du régime micro ; les dossiers au réel exigeraient un FEC d'engagement non couvert ici.
- L'invitation est acceptée depuis le compte Aurion de l'expert-comptable (pas de portail externe) ; après acceptation, une reconnexion active le rôle.
- Le plan comptable du FEC est volontairement minimal (512/411/706/606) : adapté au micro, non paramétrable.

# Aurion 15.4.12

## Bloc 13 — Paiement en ligne des factures clients et relances (décision D3 non tranchée)

- **Adaptateur isolé, aucun prestataire codé en dur** (`backend/src/services/payments/`) : interface `PayAdapter` + contrat générique signé de référence (miroir du contrat PA du bloc 3). Configuration zod : `AURION_PAY_PROVIDER` (vide = fonction désactivée explicitement 503), `AURION_PAY_API_BASE`, `AURION_PAY_API_KEY` (jamais journalisée), `AURION_PAY_WEBHOOK_SECRET` (≥ 32 caractères obligatoires dès que le provider est défini).
- **Webhook public signé** `POST /payments/webhook/:token` : HMAC-SHA256 `t=<unix>,v1=<hex(secret,"<t>.<corps>")`, comparaison à temps constant, tolérance ±300 s (anti-rejeu), corps brut préservé, idempotence stricte `payment_webhook_events` (unique provider+event_id+organisation) ; le jeton de route doit correspondre au linkToken du corps (anti-pivot entre organisations) ; le tenant est résolu par le lien (jeton UUID par organisation).
- **Lien de paiement pour facture ÉMISE uniquement** (`POST /invoices/:id/payment-link`, jamais un brouillon) : montant figé au reste dû à la création (`invoice_total_at_creation`) ; **toute modification du montant de la facture invalide le lien** (webhook refusé `LINK_INVALIDATED`) ; facture annulée/lien inactif → paiement refusé ; paiements PARTIELS gérés (statut `partially_paid`, aucune double saisie).
- **Statut mis à jour UNIQUEMENT sur confirmation vérifiée** : effet identique au règlement manuel (invoice_payments, amount_paid, payment_status, écriture comptable `accounting_entries`) dans une transaction tenant — une redirection du navigateur ne suffit jamais. Aucun numéro de carte n'est stocké (aucune colonne carte/pan/cvc).
- **Relances** : `POST /invoices/:id/reminders` accepte `includePaymentLink:true` → le lien actif est joint au message (aucune relance automatique sans validation utilisateur ; cadence inchangée ; arrêt dès paiement inchangé) ; sans configuration → 503 honnête. Interface : bouton « Lien de paiement » sur les factures non réglées, popup de confirmation puis affichage de l'URL au design Aurion.
- **Honnêteté** : la fonctionnalité n'est PAS déclarée opérationnelle en production tant qu'aucun prestataire contractuel n'est connecté et validé en sandbox (décision D3 en attente).

## Tests réellement exécutés (15.4.12, PostgreSQL 17 réel en local)
- Suite backend complète : **418/418** (migrations 001→080 ×2, RLS sur `payment_links`/`payment_webhook_events`).
- Nouveaux tests `bloc13-payments.test.mjs` (2 tests) : contrat statique (adaptateur isolé, aucun endpoint/clé de prestataire en dur, secret jamais journalisé, aucune donnée de carte) ; recette réelle (serveur HTTP de recette pour le contrat générique : succès + erreur 500 du prestataire ; webhook signé de bout en bout : signature valide acceptée, corps altéré refusé, rejeu horodaté refusé, paiement intégral → facture payée + écriture comptable, idempotence sans écriture supplémentaire, montant modifié → lien invalidé, webhook public refuse les jetons inconnus, isolation, 503 honnête sans configuration).
- smoke 79/79 · lint 0 erreur · check-frontend 38 fichiers OK.

## Limites assumées (honnêteté)
- Aucun prestataire réel connecté (décision D3 en attente) : ni Stripe carte, ni virement SEPA, ni frais/mandats/conditions — l'adaptateur et le contrat sont prêts, la mise en service exige une sandbox contractuelle et une revue juridique.
- Les remboursements ne sont pas implémentés (hors périmètre initial si le prestataire ne les expose pas) — documentés comme tels.

# Aurion 15.4.11

## Bloc 12 — Lecture des bordereaux professionnels et préparation de facture

- **Chaîne 100 % déterministe** (aucune IA distante, conformément au retrait de 15.4.0, vérifié par la porte D3 existante) : extraction de texte — **PDF texte réel** via pdftotext avec repli LibreOffice (`soffice --convert-to txt`), TXT/CSV en lecture directe ; analyse de tableaux (3 formats de lignes : « étiquette 2 x 89,90 », « | séparé | », colonnes espacées) ; **formats numériques français** (1 234,56 / 1.234,56 / espaces insécables) ; correspondance catalogue déterministe (accents, casse, ponctuation normalisés → exact / approchant / aucun).
- **Traçabilité de chaque valeur** : champ par champ avec SOURCE (étiquette explicite « labeled » / déduit « inferred » / « missing »), ligne d'origine du document ; champs détectés : client (étiquette ou déduit), SIRET/SIREN, e-mail, téléphone, date, référence, bon de commande, adresse ; totaux HT/TVA/TTC ; **cohérence arithmétique signalée** (somme des lignes ≠ total HT → avertissement, jamais corrigé silencieusement).
- **Aucune écriture par le module** : `POST /documents/parse-bordereau` (limité 10/min) retourne l'analyse uniquement — recette prouvant qu'aucun document ni client n'est créé. Le flux utilisateur crée un **brouillon de facture NON ÉMIS** (statut « devis » modifiable, conversion « Facturer » inchangée) après popup de confirmation Aurion, avec réutilisation/création de la fiche client (bloc 11) et lignes toutes modifiables dans l'écran de relecture.
- **Scans image refusés honnêtement** (422 avec raison : OCR local non inclus dans cette livraison — pas de fausse promesse) ; interface au design Aurion avec badges de confiance.
- Dépendance ajoutée : aucune (pdftotext/LibreOffice déjà présents dans l'installation Windows et Render).

## Tests réellement exécutés (15.4.11, PostgreSQL 17 réel en local)
- Suite backend complète : **416/416** (migrations ×2, RLS, porte D3 sans référence IA intacte).
- Nouveaux tests `bloc12-bordereaux.test.mjs` (2 tests) : unitaire pur (nombres français, analyse complète avec accents/étiquettes/confiance, écart de cohérence signalé, correspondance catalogue exacte après normalisation, bordereau incomplet → champs manquants jamais inventés, déterminisme) ; recette réelle (PDF texte généré par pdfkit analysé via pdftotext réel, zéro écriture par le module, scan PNG refusé 422, brouillon créé par le flux utilisateur avec client et lignes, isolation A/B).
- smoke 79/79 · lint 0 erreur · check-frontend 38 fichiers OK.

## Limites assumées (honnêteté)
- L'OCR local pour les scans n'est pas inclus (tesseract non intégré) : les scans sont refusés avec un message clair, la chaîne couvre les PDF texte/TXT/CSV.
- Les tableaux multi-pages très exotiques peuvent ne pas être reconnus : les champs restent modifiables dans l'écran de relecture.

# Aurion 15.4.10

## Bloc 11 — Devis et factures sans client préexistant

- **Création directe** : dans l'éditeur de devis/facture, l'option « Nouveau client (saisie directe) » ouvre une saisie nominative ou professionnelle (nom/raison sociale, e-mail, téléphone, SIRET, adresse, code postal, ville) — seules les coordonnées disponibles sont enregistrées, **aucune donnée n'est inventée**.
- **Fiche client créée avec le document DANS LA MÊME TRANSACTION** (`newClient` sur `POST /quotes` → `createClientForDocument` dans le `withTransaction` du document) : une annulation ou une erreur = **aucune création partielle** (vérifié par recette : une demande invalide ne crée ni client ni document).
- **Recherche de doublons AVANT validation** (`GET /clients/matches?q=`, correspondance nom exact/préfixe/SIREN-SIRET/e-mail) : si un client similaire existe, une popup Aurion propose de **réutiliser** la fiche ou de créer une nouvelle — **aucune fusion automatique incertaine** (aucune route de fusion).
- **Adresse de facturation** composée des seules coordonnées saisies (adresse + code postal + ville) ; adresse d'intervention reprise si saisie ; numérotation (FAC-2026-…), mentions légales et conversion devis→facture inchangées ; brouillon (devis) distinct d'une facture émise (statuts existants conservés).
- Interface au design Aurion : champs inline dans l'éditeur, état caché/affiché selon le choix client, aucun dialog natif.

## Tests réellement exécutés (15.4.10, PostgreSQL 17 réel en local)
- Suite backend complète : **414/414** (migrations ×2, RLS).
- Nouveaux tests `bloc11-direct-documents.test.mjs` (2 tests) : schéma + transaction + absence de fusion automatique (contrat statique) ; recette réelle (client pro existant, doublons par nom exact/SIRET, aucun faux positif, facture créée avec newClient nominatif → fiche liée + adresse facturation composée + coordonnées non saisies laissées vides, numérotation conservée, demande invalide → rien créé, isolation A/B).
- smoke 79/79 · lint 0 erreur · check-frontend 38 fichiers OK.

## Limites assumées (honnêteté)
- `PATCH /quotes/:id` n'accepte pas `newClient` : la création directe concerne la création de document (le périmètre du bloc) ; la modification d'un document existant passe par la fiche client classique.
- La recherche de doublons est volontairement basique (nom/SIRET/e-mail) : toute fusion serait une décision métier non automatisable sans risque.

# Aurion 15.4.9

## Bloc 10 — Calendrier fiscal et alertes de seuils

- **Échéances URSSAF de déclaration ET de paiement** selon la périodicité déclarée au bloc 9 (mensuelle → 12 échéances, trimestrielle → 4), calculées « fin du mois suivant la période » (convention URSSAF), avec **report automatique au prochain jour ouvré** (week-ends + jours fériés métropolitains calculés algorithmiquement, Pâques inclus). Périodicité non déclarée → aucune date inventée, note d'orientation.
- **Seuils officiels 2026** (vérifiés le 14 novembre 2026 : economie.gouv.fr, entreprendre.service-public.gouv.fr, impots.gouv.fr) : vente 203 100 € · services 83 600 € · franchise TVA 85 000 €/37 500 € (majorés 93 500 €/41 250 €) — calculés par nature d'activité à partir du CA catégorisé du bloc 8.
- **Alertes à marges configurables** (défaut 80 / 90 / 100 %, modifiables via `PUT /fiscal-calendar/margins`, fenêtre modale Aurion) : affichées sur le tableau de bord Comptabilité ET inscrites au journal de bord **une seule fois par seuil** (déduplication `dedupe_key` existante). Une alerte ne bloque JAMAIS la facturation, ne modifie aucune facture et n'envoie AUCUN e-mail sans consentement explicite (aucun envoi dans ce bloc).
- **Messages factuels** : renvois vers l'URSSAF, le portail autoentrepreneur ou l'expert-comptable ; mention « aucune modification automatique n'a été appliquée » ; avertissement « aucune bascule automatique de TVA dans vos documents » ; disclaimer sans conseil fiscal.
- Franchissement en cours d'année, année partielle et changement de périodicité gérés : les statuts sont recalculés au CA réel de l'année sélectionnée et l'historique du journal est préservé (alertes déjà enregistrées jamais réécrites).

## Tests réellement exécutés (15.4.9, PostgreSQL 17 réel en local)
- Suite backend complète : **412/412** (migrations 001→079 ×2, idempotence).
- Nouveaux tests `bloc10-fiscal-calendar.test.mjs` (2 tests) : unitaire (seuils 2026 exacts, Pâques 2026 = 5 avril, report férié 1er mai → 4 mai, report week-end 28 février → 2 mars, 4/12/0 échéances selon périodicité, ratios et alertes exactes, marges personnalisées) ; intégration réelle (échéances vides + note sans périodicité, 4 échéances après déclaration trimestrielle, alertes 80/90 % sur facture à 90 % du seuil vente, déduplication journal vérifiée par double appel, marges reconfigurées → [50 %], refus marge invalide 400, facture intacte, isolation A/B).
- `npm run test:smoke` : **79/79** ; lint : **0 erreur** ; check-frontend : **38 fichiers OK**.

## Limites assumées (honnêteté)
- Les échéances suivent la convention URSSAF « fin du mois suivant la période » ; la référence reste l'espace mon auto-entrepreneur (les dates exactes peuvent varier selon la date de création du compte).
- Les échéances de cotisations complémentaires (ex. CFE, taxes calendaires) ne sont pas couvertes dans cette livraison : seule la déclaration/paiement du CA par périodicité est traitée.

# Aurion 15.4.8

## Bloc 9 — Situation fiscale : versement libératoire et périodicité URSSAF

- **Options déclarées par l'entrepreneur, JAMAIS déduites du SIRET** (migration `079_fiscal_options.sql`, additive et idempotente) : `organizations.vl_option` (« oui » / « non » / « inconnu » — « inconnu » par défaut, jamais une affirmation automatique), `vl_verified` (option confirmée auprès d'une source officielle ou information non vérifiée), `vl_effective_from` (date d'effet), `urssaf_periodicity` (mensuelle / trimestrielle), `urssaf_periodicity_effective_from` et `urssaf_periodicity_changed_at` (date de changement).
- **Historique horodaté conservé** : table `fiscal_options_history` (champ, valeur, date d'effet, source « déclaration utilisateur », horodatage) couverte par la politique `tenant_isolation` (bloc 2). Chaque changement effectif est journalisé — enregistrement identique répété = aucune ligne ; changement en cours d'année (trimestrielle → mensuelle) = nouvelle ligne datée. Aucun écrasement : la reconstitution historique reste possible.
- **Validation explicite, aucune valeur inventée** : une date d'effet de versement libératoire sans option « oui » est refusée (400) ; une périodicité sans date d'effet est refusée (400) ; valeurs hors énumération refusées par le schéma zod.
- **Distinction explicite des trois états** (exigée par le cahier des charges) : éligibilité théorique (règle impots.gouv : pour bénéficier du versement libératoire en 2026, le revenu fiscal de référence 2024 ne devait pas excéder 29 315 € par part), option effectivement exercée (déclarée « oui », éventuellement confirmée), information non vérifiée (aucune source extérieure — la note est affichée tel quel).
- **Intégration au moteur sans double comptage** : `/accounting/summary` et `/accounting/by-category` exposent désormais `fiscalOptions` ; le versement libératoire (impôt sur le revenu) reste un total SÉPARÉ des cotisations (`taxTotal` ≠ `contributionsTotal`, référentiel daté du bloc 8) — compté dans l'impôt dû uniquement lorsque l'option déclarée est « oui », jamais compté comme cotisation sociale, jamais doublé dans l'estimation du revenu.
- **Interface** : Paramètres → Entreprise, encadré « Options fiscales déclarées » (select versement libératoire + date d'effet, case de confirmation officielle, périodicité + date d'effet, rappel de la règle d'éligibilité) ; vue Comptabilité, panneau « Situation fiscale déclarée » (état de l'option, note d'éligibilité, impôt estimé quand l'option est exercée, périodicité et date d'effet, état de confirmation).

## Tests réellement exécutés (15.4.8, PostgreSQL 17 réel en local)
- `npm run build` (tsc) et `tsc --noEmit` : succès.
- Suite backend complète : **410/410 réussis** (`AURION_INTEGRATION_TESTS=1`, PostgreSQL 17.11 réel, rôles migration/runtime séparés, RLS active, migrations 001→079 appliquées deux fois — idempotence vérifiée).
- Nouveaux tests `backend/tests/bloc9-fiscal-options.test.mjs` (5 tests) : migration (colonnes, énumérations, historique, RLS tenant) ; gardes serveur (refus date d'effet sans « oui », refus périodicité sans date, aucun écriture automatique de vl_option/urssaf_periodicity par le circuit registre) ; comptabilités avec distinction exercée/théorique/non vérifiée ; recette d'intégration réelle : état initial « inconnu / non vérifié », déclaration complète persistée (option + date d'effet + confirmation + périodicité), historique horodaté (2 lignes sur les deux champs), répétition identique sans nouvelle ligne, changement en cours d'année horodaté (mensuelle, effet 2026-07-01), comptabilités exposant fiscalOptions avec impôt/cotisations distincts, isolation A/B (organisation B « inconnu », historique de A invisible dans le tenant de B).
- `npm run test:smoke` : **79/79** ; `npm run lint:frontend` : **0 erreur** ; `tools/check-frontend.mjs` : **38 fichiers OK**.

## Limites assumées (honnêteté)
- L'éligibilité au versement libératoire est une RÈGLE affichée (source impots.gouv, vérifiée le 14 novembre 2026), pas un calcul : Aurion n'interroge aucune donnée fiscale personnelle et ne déduit jamais l'option du SIRET.
- La périodicité URSSAF déclarée servira au calendrier fiscal du bloc 10 (échéances mensuelles/trimestrielles) ; elle ne modifie pas les calculs de cotisations du bloc 8.
- Les changements d'options antérieurs à la mise à jour ne sont pas reconstitués : l'historique démarre à l'installation de 15.4.8.

# Aurion 15.4.7

## Bloc 8 — Détection SIRET, activité réelle et calcul des cotisations

- **Référentiel VERSIONNÉ, daté et sourcé des taux micro par catégorie d'activité** (migration `078_micro_activity_categories.sql`, additive et idempotente) : `micro_referential_versions` (version, date d'effet, date de fin, source, date de vérification) + `micro_rates` (catégorie, cotisations sociales, contribution formation, versement libératoire, assiette). Version 2026 enregistrée avec sources vérifiées le 14 novembre 2026 (entreprendre.service-public.gouv.fr F36232 et impots.gouv.fr) : vente BIC 12,30 % · CFP 0,10 % · VL 1,00 % ; prestations BIC 21,20 % · CFP 0,30 % · VL 1,70 % ; BNC 25,60 % · CFP 0,20 % · VL 2,20 % ; professions libérales réglementées CIPAV 23,20 % · CFP 0,20 % · VL 2,20 % ; catégorie « règles spécifiques » à confirmer. Le référentiel est un référentiel GLOBAL en **lecture seule pour le rôle applicatif** (RLS : aucune policy d'écriture) ; les versions anciennes sont conservées pour reproduire les calculs historiques, et les documents portent un instantané (`category_snapshot`) de la version utilisée.
- **Catégorie d'activité par ligne et par document (activité mixte)** : colonnes `activity_category` sur `quotes`, `quote_items`, `parts` (catalogue) et `interventions` (prestations). Le document porte une catégorie par défaut ; chaque ligne peut la redéfinir. Valeur inconnue refusée explicitement (400 `INVALID_INPUT` avec la liste des catégories acceptées) ; vide = non renseigné, jamais une catégorie inventée.
- **Ventilation sans double comptage** (`micro-referential.ts`, fonction pure testée + recette d'intégration) : chaque ligne est comptée UNE FOIS (catégorie de la ligne, sinon catégorie du document — fallback explicite par facture), le CA non affecté est SIGNALÉ (`unassignedHt`, encart d'alerte sur le tableau de bord) et jamais affecté silencieusement. Cotisations (micro-social + CFP) et versement libératoire (impôt) calculés séparément — jamais confondus, jamais doublés.
- **Proposition APE/NAF indicatrice** (`micro-detection.ts`, `GET /micro/category-proposal`) : correspondance code NAF → catégorie (niveau code pour ~30 codes courants, sinon niveau section A-U), avec confiance déclarée, note « à confirmer », source et rappel que « le code APE n'est jamais une preuve des prestations réellement réalisées ». Proposition PUREMENT indicative : aucune écriture automatique, l'utilisateur applique ou ignore (boutons « Appliquer / Ignorer » du parcours existants).
- **Comptabilité et tableau de bord** : nouvelle route `GET /accounting/by-category` (CA HT, cotisations, versement libératoire par catégorie, avec la version du référentiel en vigueur À LA DATE de chaque facture) + ventilation intégrée à `/accounting/summary` et affichée dans la vue Comptabilité (panneau « Ventilation par catégorie d'activité », alerte d'éventuel CA non affecté).
- **Calculateur de devis/factures** : section « Ventilation par catégorie (URSSAF · référentiel daté) » dans le résultat du calculateur, avec CA par catégorie, taux appliqués, cotisations estimées et versement libératoire estimé (impôt) ; sélecteur « Catégorie d'activité de la ligne » sur chaque ligne et « Catégorie d'activité par défaut du document » dans les paramètres fiscaux avancés.
- **Catalogue métier** : champ « Catégorie d'activité (cotisations micro) » sur les pièces (articles) et les prestations, répercuté sur les nouvelles lignes de devis/facture choisies dans le catalogue.

## Tests réellement exécutés (15.4.7, PostgreSQL 17 réel en local)
- `npm run build` (tsc) et `tsc --noEmit` : succès.
- Suite backend complète : **405/405 réussis** (`AURION_INTEGRATION_TESTS=1`, PostgreSQL 17.11 réel, rôles migration/runtime séparés, RLS active, migrations 001→078 appliquées deux fois — idempotence vérifiée).
- Nouveaux tests `backend/tests/bloc8-micro-categories.test.mjs` (5 tests) : migration (taux officiels 2026, colonnes, RLS lecture seule) ; unitaire dist (taux exacts, dates d'effet avant/après 2026, validation explicite, ventilation sans double comptage, VL ≠ cotisations, CA non affecté sans cotisation calculée) ; proposition APE déterministe et sans effet de bord ; recette d'intégration réelle : référentiel lisible/non inscriptible par le rôle applicatif (RLS), catégorie par ligne et document persistée et relue, catégorie inconnue refusée 400 avec liste, ventilation comptable exacte (1000 vente + 750 services BIC par fallback document, unassigned 0), VL estimé séparément, isolation A/B (organisation B ne voit rien), proposition et référentiel servis par l'API.
- Tests de contrat mis à jour vers le nouveau contrat **sans affaiblissement** : `quote-update-parameters` (56 → 60 paramètres, sémantique de présence inchangée), `step14-doc-save` (58 → 60 colonnes/paramètres alignés), `quote-contract-v3` (les lignes rechargées portent leur catégorie d'activité).
- `npm run test:smoke` : **79/79 réussis** ; `npm run lint:frontend` (eslint 8.57.1) : **0 erreur** ; `tools/check-frontend.mjs` : **38 fichiers OK**.

## Limites assumées (honnêteté)
- Les documents HISTORIQUES (créés avant 15.4.7) n'ont pas de catégorie : leur CA apparaît en « non renseigné » dans la ventilation (signalé, jamais affecté silencieusement) et l'estimation par catégorie n'est calculée que pour les factures postérieures au référentiel.
- Le taux de la catégorie « règles spécifiques » (hébergement, restauration, location meublée…) est indicatif (21,20 %) : la note recommande de confirmer auprès de l'URSSAF ; aucune décision fiscale n'est automatisée.
- La détection APE n'interroge pas de source externe supplémentaire : elle s'appuie sur le code `activite_principale` déjà renvoyé par recherche-entreprises.api.gouv.fr (bloc 7 pour la détection d'entreprise).

# Aurion 15.4.6

## Bloc 7 — Recentrage exclusif sur les micro-entreprises

- **Le compte de l'entrepreneur est exclusivement une entreprise individuelle (EI)** : la liste serveur des formes juridiques (`GET /legal-forms`) ne propose plus que « Entreprise individuelle — micro-entreprise » et « Entreprise individuelle — régime réel ». La liste complète des formes juridiques reste dans le code uniquement pour étiqueter les valeurs HISTORIQUES et calculer leurs régimes (aucune réécriture de données existantes).
- **Refus explicite, aucune conversion automatique** :
  - `PATCH /organization` et `POST/PATCH /activities` refusent (422 `LEGAL_FORM_OUT_OF_SCOPE`) toute forme sociale (SAS, SASU, SARL, EURL, SA, SNC, SCI, SEL…, association, forme agricole) pour le profil du propriétaire, avec un message clair : « Aurion est conçu exclusivement pour les entreprises individuelles… Les sociétés restent acceptées comme clients ou fournisseurs. »
  - `detectLegalFormFromProfile` ne reconnaît plus les formes sociales dans un nom/description : détection « SARL de réparation » → refus explicite (aucun préremplissage) ; « auto-entrepreneur », « entreprise individuelle » → micro / réel.
- **Détection registre du propriétaire sécurisée côté serveur** : nouvelle route limitée en débit `GET /organization/registry-lookup` (20/min) — une entreprise détectée dont la catégorie juridique INSEE n'est pas une EI (1000/1990) renvoie `status: out_of_scope` avec le libellé de la forme, sans aucune donnée préremplie ; la recherche par nom marque chaque résultat `outOfScope`. La détection des **fournisseurs** (`GET /suppliers/lookup`) reste ouverte à toutes les formes juridiques : les sociétés restent des tiers professionnels.
- **Interface** : le parcours d'accueil et Paramètres → Entreprise passent par cette route dédiée (`options.owner`, `api.ownerRegistryLookup`) ; le choix d'une entreprise hors périmètre dans les résultats par nom affiche le refus et ne préremplit rien (aucune écriture). Le module partagé `company-detect.js` conserve une implémentation unique partagée parcours/Paramètres/Fournisseurs.
- **EI + régime micro, sans fusion** : la forme juridique (EI) et les options fiscales/sociales (micro-social ou réel) restent des champs distincts ; la détection des taux par profil métier est inchangée (barème 2026 conservé).

## Tests réellement exécutés (15.4.6, PostgreSQL 17 réel en local)
- `npm run build` (tsc) et `tsc --noEmit` : succès.
- Suite backend complète : **400/400 réussis** (`AURION_INTEGRATION_TESTS=1`, PostgreSQL 17.11 réel, rôles migration/runtime séparés, RLS active, migrations appliquées deux fois — idempotence vérifiée).
- `npm run test:smoke` : **79/79 réussis**.
- `npm run lint:frontend` (eslint 8.57.1) : **0 erreur, 0 avertissement**.
- `tools/check-frontend.mjs` (38 fichiers, imports/exports) : **succès** (Node 24 requiert `--experimental-vm-modules`).
- Nouveaux tests `backend/tests/bloc7-micro-scope.test.mjs` (8 tests) : liste EI uniquement, refus 422 sociétés sur /organization et /activities, route registry-lookup refusante (out_of_scope), détection par nom sans forme sociale, garde d'interface parcours/Paramètres, API ownerRegistryLookup, et unitaire sur le build : refus SARL/SASU/EURL/association, EI 1000/1990 acceptés, régimes historiques (SARL → travailleur indépendant) toujours calculables.
- Tests de contrat mis à jour vers le nouveau contrat **sans affaiblissement** : `step25-legal-form-options` (2 options EI servies, la liste complète jamais exposée au propriétaire), `step1-settings-address-separation` (import partagé + garde owner), `company-directory.contract` (routage owner/fournisseurs du module unique).

## Limites assumées (honnêteté)
- Les organisations déjà enregistrées avec une forme sociale conservent leur libellé (aucune migration destructive) ; une mise à jour via l'interface est désormais refusée jusqu'à correction vers une EI.
- La route `/suppliers/lookup` reste volontairement sans restriction de forme juridique (les fournisseurs sont des tiers professionnels) : c'est uniquement la détection du COMPTE propriétaire qui refuse les sociétés, côté serveur ET côté interface.

# Aurion 15.4.5

## Corrections (demandes utilisateur — devis/factures, parcours, détection, design)

- **Logo sur les devis et factures ; identité émettrice remplacée par logo + nom commercial** : le modèle de document porte désormais le logo de l'entreprise (`organizations.logo_key`, type réel vérifié par signature binaire) et les trois moteurs de rendu l'affichent en en-tête — PDF (pdfkit, ajusté 150×46), DOCX (`ImageRun`) et ODT (image embarquée `Pictures/` + manifest + `draw:frame`, colonne pleine largeur `F1`). L'identité légale de l'émetteur (forme juridique, SIREN/SIRET, carte « Émetteur », SIRET du pied de page, mention « identity » des mentions légales) ne figure plus sur les documents : seuls le logo et le nom commercial choisi par l'utilisateur au parcours apparaissent. Les variables `{{SIRET}}`, `{{SIREN}}`, `{{COMPANY_ACTIVITY}}` restent disponibles pour les modèles personnalisés. Limites assumées : le WebP téléversé n'est pas rendu dans les documents (PDF/DOCX/ODF) ; l'exigence légale française d'identité sur facture est volontairement écartée sur demande explicite (réversible par le filtre `identity` de `document-renderer.ts`).
- **Encarts du PDF adaptatifs, plus aucun chevauchement** : la colonne gauche de l'en-tête est bornée (plus de collision avec le bloc titre) ; carte client pleine largeur à hauteur calculée ; encarts kilométriques, majoration et garantie dimensionnés au texte réel (`heightOfString`) ; le montant total réduit sa police par pas de 2 pt pour toujours tenir dans l'encart.
- **Enregistrement du logo pendant le parcours** : la réponse de `PATCH /organization` renvoie désormais `has_logo` et le parcours fusionne la réponse serveur dans son état local (l'état du logo n'est plus effacé à chaque étape) ; messages explicites (« Aperçu prêt. Cliquez sur Enregistrer et continuer… », « Logo enregistré : il apparaîtra sur vos devis et factures. » + toast) ; en cas d'échec, message non bloquant avec rattrapage sur place ou dans Paramètres → Logo.
- **Détection fournisseur par NOM en plus du SIRET/SIREN** : `searchFrenchCompaniesByName()` (recherche-entreprises.api.gouv.fr, 5 propositions, siège social, garde-fous identiques) ; la route débit-limitée `GET /suppliers/lookup` route chiffres → identifiant, texte ≥ 2 caractères → nom (`{results}`) ; le module partagé `company-detect.js` route automatiquement la saisie et affiche les résultats multiples dans une liste de choix au design Aurion (« Utiliser cette entreprise ») avant les propositions champ par champ ; branché sur les trois écrans : parcours (champ « SIRET, SIREN ou nom »), Paramètres → Entreprise (bouton « (SIRET, SIREN ou nom) », repli sur la raison sociale), Fournisseurs (bouton « par SIRET / SIREN ou nom », repli sur le champ Nom).
- **Barre de défilement du calculateur de devis et factures** : le panneau « Résultat » a une hauteur maximale avec sa propre barre de défilement au design Aurion (piste sombre, curseur dégradé vert, `scrollbar-gutter: stable`) ; sous 1280 px, hauteur bornée `min(72dvh, 860px)` quand le calculateur passe sous le formulaire.
- **Sélection de pièces : encart de défilement adapté au texte, horizontal** : `.suggest-list` en `width: max-content` borné à `min(560px, 94vw)` (au moins la largeur du champ) ; propositions en une seule ligne (`white-space: nowrap`) avec défilement horizontal si borne atteinte ; barres de défilement Aurion ; bloc mobile ≤ 600 px réécrit dans le même esprit (plus d'empilement vertical).
- **Tous les encarts et alertes au design Aurion** : suppression des derniers dialogs natifs — édition des adresses d'intervention (`prompt()` ×2 → fenêtre modale Aurion), archivage d'adresse, confirmation de virement admin, suppression de ticket admin, remplacement du brouillon synchronisé (`window.confirm` → `askConfirm`) ; aucun appel natif `confirm`/`prompt`/`alert` ne subsiste dans `assets/js`.

## Tests et vérifications réellement exécutés (15.4.5, PostgreSQL 17.11 réel en local)
- `npm ci`, `npm run build` (tsc) et `tsc --noEmit` : succès sur la base 15.4.4 après intégration des corrections.
- `tools/check-frontend.mjs` (syntaxe + imports/exports) et `npm run lint:frontend` (eslint 8.57.1) : succès.
- **77 migrations appliquées sur PostgreSQL 17.11 réel** (base neuve, rôle de migration séparé, droits runtime posés, RLS active).
- **Suite backend complète : 360 tests, 0 échec** (13 ignorés hors contexte) avec `AURION_INTEGRATION_TESTS=1`.
  - 4 tests de contrat du 15.4.0 encodaient « recherche par nom retirée » et le libellé « SIRET ou SIREN » : mis à jour vers le contrat 15.4.5 **sans affaiblissement** (`company-directory.contract.test.mjs`, `step1-settings-address-separation.test.mjs`, `step18-detection-buttons.test.mjs`, `strict-requirements-1-15.test.mjs`) avec de nouvelles assertions positives sur la recherche par nom.
- `npm run test:smoke` : **79/79 réussis**.
- `npm run test:browser` (Playwright/Chromium) : **succès** — inscription immédiate, parcours d'accueil 8 étapes (avec les corrections logo et détection par nom) jusqu'au tableau de bord, navigation entre 9 vues, déconnexion et connexion, aucune erreur console.
- Génération réelle PDF/DOCX/ODT d'une facture de test (montant long, majoration sur 4 lignes, garantie longue, deux adresses client, appareil, kilométrage, logo PNG 200×80) inspectée visuellement : logo + nom commercial seuls, carte client pleine largeur, encarts adaptatifs sans chevauchement, mentions sans identité émettrice, pied de page nom seul ; ODT et DOCX vérifiés par conversion LibreOffice.

# Aurion 15.4.2

## Facturation électronique — socle de réception des factures fournisseurs (bloc 3)

- **Cadre** : Aurion est un logiciel de gestion connecté à la plateforme agréée (PA) choisie par l'entrepreneur ; il n'est pas une PA, ne transmet rien à l'administration fiscale et ne prétend jamais être immatriculé. Références DGFiP conservées dans `docs/PLATEFORME-AGREEE.md`.
- **Adaptateur isolé derrière une interface stable** (`backend/src/services/pa/`) : `types.ts` (interface `PaAdapter`), `generic.ts` (contrat générique signé de référence), `index.ts` (registre — aucun endpoint de PA réelle codé en dur, garde-fou de test inclus), `inbox.ts` (traitement webhook complet). Le JSON interne existant (`electronic-invoice.ts`, `standard: null`) reste un modèle interne, inchangé.
- **Webhook authentifié** `POST /pa/webhook/:token` : signature `X-Aurion-PA-Signature: t=<unix>,v1=<hex(HMAC-SHA256(secret, "<t>.<corps>"))>`, comparaison à temps constant, tolérance ±300 s (anti-rejeu), corps brut préservé, limiteur de débit ; jeton UUID par organisation/plateforme résolu via le pool d'administration journalisé (`platform_admin_access_log`) ; rotation possible (`POST /pa/endpoints {rotate:true}`) — l'ancien jeton devient inactif.
- **Idempotence et doublons** : registre `pa_webhook_events` (unicité `provider, event_id, organisation`, charge utile conservée en type `json` exact) ; rejeu du même `event_id` acquitté sans écriture ; même contenu sous un autre `event_id` (SHA-256) → copie marquée `duplicate` avec référence à l'original, fichier non re-archivé ; charge utile différente sous un même `event_id` refusée (409).
- **Archivage de l'original sans altération** : fichier stocké dans le stockage privé de l'organisation (`private/<org>/pa-inbox/<année>/<event>/<fichier>`), SHA-256 scellé en base, restitué à l'identique (`GET /pa/inbox/:id/file`), clé vérifiée pour rester dans le stockage de l'organisation.
- **Rapprochement fournisseur** : email exact prioritaire, sinon nom normalisé (minuscules/accents/espaces — interne au rapprochement) ; zéro correspondance → `unmatched`, plusieurs → `ambiguous` ; aucune création ni fusion automatique ; l'utilisateur rattache ensuite le fournisseur de son choix.
- **Statuts et journal** : cycle `received → reviewed → approved | rejected` (copie : `duplicate`) ; correction utilisateur (`PATCH /pa/inbox/:id` : catégorie comptable, fournisseur, statut) en une transaction tenant ; **l'approbation ne génère aucune écriture comptable automatique** ; chaque événement (réception, signature invalide, doublon, stockage, erreur, correction, reprise) est journalisé dans `supplier_electronic_invoice_events`.
- **Erreurs et reprise** : charge utile non conforme → 422 + événement conservé en statut `error` avec sa charge utile ; la re-tentative de la PA déclenche le re-traitement automatique ; reprise manuelle `POST /pa/events/:id/reprocess` (digest canonique : toute altération de la charge utile est refusée 409).
- **Migration `075_pa_supplier_invoice_inbox.sql`** (additive, idempotente, rejouée sur base neuve et sur base migrée) : 4 nouvelles tables portant `organization_id`, toutes couvertes par la politique `tenant_isolation` (65 politiques RLS au total, contre 61 en 15.4.1).
- **Configuration** : `AURION_PA_PROVIDER` (identifiant d'adaptateur ; vide = réception refusée explicitement 503), `AURION_PA_WEBHOOK_SECRET` (≥ 32 caractères dès que le provider est défini, y compris hors production ; jamais journalisé), `AURION_PA_MAX_FILE_BYTES` (10 Mo par défaut) ; documentés dans `backend/.env.example` et `render.yaml` ; CI fournie avec des valeurs de test dédiées.
- **Tests** : `backend/tests/pa-adapter.contract.test.mjs` (6 tests — signatures valides/altérées/rejeu, charge utile non conforme, type inconnu, registre, documentation) et `backend/tests/pa-inbox.integration.test.mjs` (9 tests sur PostgreSQL réel, rôle applicatif, RLS active — réception, rejeu, doublon de contenu, sécurité webhook/rotation, erreur + reprise, type ignoré, rapprochement ambigu, isolation A/B, échec fermé hors contexte). Suite complète : **348/348 réussis** (333 d'origine + 15 nouveaux), baseline B0 strictement verte.
- **Limites assumées** : aucune PA réelle connectée (réception non déclarée opérationnelle en production) ; pas d'interface graphique de boîte de réception à ce stade (API complète et testée ; l'UI accompagnera la connexion contractuelle d'une PA, blocs 4/5) ; formats Factur-X/UBL/CII, mentions obligatoires, émission et e-reporting relèvent des blocs 4 et 5.

# Aurion 15.4.1

## Sécurité — isolation multi-tenant par RLS PostgreSQL (bloc 2)
- Migration `074_multi_tenant_rls.sql` (additive, idempotente) : Row Level Security sur 61 tables métier — 54 portant `organization_id` et 7 liées via leur table mère (`quote_items`, `support_messages`, `support_status_events`, `supplier_parts`, `template_versions`, `activity_contributions`, `activity_profile_overrides`). Politique `tenant_isolation` avec `WITH CHECK` ; échec fermé sans contexte.
- Contexte tenant transactionnel (`SET LOCAL app.current_organization`) : enveloppe AsyncLocalStorage du cycle de vie HTTP (`app.ts`), inscription par le plugin d'authentification, `app.inject` couvert, `withTenant`/`applyTenant`/`withClientTenant`/`beginTenant` pour les services et transactions explicites. Aucune contamination du pool.
- Pool d'administration inter-entreprises explicite (`AURION_ADMIN_DATABASE_URL`, rôle `aurion_admin`) : console d'administration, travaux planifiés et webhook Stripe uniquement ; chaque accès journalisé dans `platform_admin_access_log` (inaccessible au rôle applicatif). Sans cette URL : refus explicite 503, jamais de données vides.
- Inscription, invitation VIP, callbacks OAuth Google/Drive et webhook Stripe adaptés au contexte tenant.
- Tests d'isolation réels A/B sur PostgreSQL avec le rôle applicatif : `backend/tests/tenant-isolation.rls.test.mjs` (7 tests, dont échec fermé, tenant falsifié, pool recyclé, journalisation admin).
- Documentation : `docs/SECURITE-RLS.md` (architecture, déploiement, limites).

## Qualité — CI honnête et stricte (bloc 1)
- `npm run check` entièrement vert en mode strict `AURION_BASELINE_STRICT=1` : build, typecheck, 79 tests smoke, lint, parcours navigateur E2E ; suite complète 333/333 (les 18 échecs historiques 15.3.20 et les 7 échecs smoke sont résolus dans cette archive ; vérifié sur PostgreSQL réel avec les rôles de migration et d'exécution séparés).
- Correction du lint frontend : `renderRegistryPreview` non défini dans Paramètres → réinitialisation masquant l'aperçu du registre comme le reste du parcours.
- Parcours d'accueil 8 étapes (15.4.0) désormais couvert par le test navigateur E2E (l'ancien test attendait le parcours à 3 étapes) ; le bruit console attendu de la sonde `/admin/me` (403 pour non-admin) est documenté et filtré précisément.
- Aperçu de signature : style inline retiré (conforme CSP `style-src 'self'`), classe `.pre-wrap-anywhere` dans `app.css`.

## Documentation fidèle au code (bloc 6)
- CGU et politique de confidentialité : retrait des descriptions du mode IA/Ollama/Qwen (fonctions retirées en 15.4.0) ; mention factuelle du retrait conservée.
- `ARCHITECTURE-PRODUCTION.md` : interface JavaScript vanilla sans build (pas React/Vite), pas de Redis, RLS multi-tenant, section IA marquée comme retirée.
- `SECURITY.md` : mesures classées en quatre états (implémentée et testée / partielle / absente / non vérifiée) avec preuves et emplacements, contrôle du 13 novembre 2026.

## Dépendances et migrations (bloc 17, partiel)
- Dependabot configuré (npm + GitHub Actions, regroupement maîtrisé).
- Audit npm explicite dans la CI (`npm audit --omit=dev`, seuil sur vulnérabilités high/critical), distinct de l'installation `--no-audit`.
- `light-my-request` déclaré en dépendance directe (utilisé par l'enveloppe tenant de `app.inject`).
- Détection des préfixes de migration dupliqués (042, 044) : avertissement existant conservé, aucun renumérotage (migrations déjà appliquées ; voir `docs/GUIDE-MIGRATIONS-15.3.0.md`).

# Aurion 15.4.3

## Ajouts (bloc 4 — facturation électronique : émission, formats et mentions)
- Génération de factures électroniques structurées **UBL 2.1** (CIUS EN 16931) et **CII D16B** (profil Factur-X BASIC), déterministes, validées avant archivage (XML bien formé, champs obligatoires, règles arithmétiques BR-CO-10/11/13/14/15/16/17, catégorie E avec motif art. 293 B pour la franchise en base).
- Les **quatre mentions obligatoires du 1er septembre 2026**, saisissables dans l'éditeur de facture et transportées dans les deux formats : numéro SIREN du client (BT-47, schéma 0002), catégorie de l'opération (BT-23 : LB / PS / LBPS), option pour le paiement de la TVA sur les débits (le cas échéant, en note BT-21/22), adresse complète de livraison si différente de la facturation (BT-79/BT-80). Catégorie et SIREN exigés à la préparation (refus explicite, jamais de valeur inventée).
- **Cycle de vie de transmission** via la plateforme agréée choisie : préparation idempotente (document archivé et scellé SHA-256 avant envoi), transmission signée HMAC (miroir du webhook de réception), **accusés signés obligatoires** — une facture n'est jamais marquée transmise sans accusé authentifié —, rejets tracés avec accusé archivé, reprises après délai dépassé avec le MÊME identifiant d'idempotence (aucun doublon côté PA, vérifié par test), journal complet des transmissions.
- Point d'entrée d'émission par organisation (`POST /pa/outgoing-endpoints`) : URL HTTPS publique imposée en production, secret ≥ 32 caractères chiffré AES-256-GCM au repos, jamais journalisé.
- Routes d'émission authentifiées : configuration du point d'entrée, préparation, transmission, liste/détail + journal, téléchargement du document structuré et des accusés.
- Dépendance `fast-xml-parser` (validation XML bien formé + lecture structurelle des documents émis, aucune dépendance native).

## Honnêteté (bloc 4)
- Aucune plateforme agréée réelle n'est connectée : le contrat sortant générique est testé de bout en bout contre un serveur HTTP de recette réel (boucle locale) ; la transmission n'est pas déclarée opérationnelle en production.
- L'assemblage Factur-X complet (PDF/A-3 avec CII embarqué) n'est pas livré : aucune chaîne de validation PDF/A disponible ; UBL 2.1 et CII D16B sont le périmètre effectivement choisi.
- La validation interne ne remplace pas la validation XSD/Schematron officielle effectuée par la PA à la réception ; la chaîne de personnalisation (BT-24) est le CIUS noyau `urn:cen.eu:en16931:2017`, à aligner sur la PA retenue en sandbox.

## Migration
- `076_outgoing_electronic_invoices.sql` (additive, idempotente) : mentions électroniques sur `quotes`, points d'entrée d'émission, transmissions sortantes + journal (RLS : 68 politiques `tenant_isolation`).

# Aurion 15.4.0

## Ajouts (cahier des charges « stockage documentaire cloud »)
- Stockage des documents dans le Google Drive de l'utilisateur (autorisation `drive.file`), arborescence « Aurion — Mon entreprise » créée une seule fois.
- File d'attente locale persistante (IndexedDB), reprise automatique, transferts idempotents, confirmation par MD5/taille, conflits sans écrasement, factures émises protégées.
- Quota affiché en permanence dans Paramètres → Stockage ; alertes 80/90/95/100 % dans le journal de bord (notification unique mise à jour).
- Archivage d'un devis ou d'une facture dans le cloud (bouton « Cloud » de Devis & factures).
- Notes de frais : ajout, modification, consultation, téléchargement, suppression, export CSV, transfert du justificatif vers le cloud ; prises en compte en achats HT, TVA déductible et sorties de trésorerie.
- Parcours d'accueil en 8 étapes (Vous, Entreprise, Activité, Logo, Messagerie, Signature, Documents, Récapitulatif) ; note « adresse e-mail dédiée » ; logo téléversable dès l'accueil (PNG/JPEG/WebP, type réel vérifié, SVG refusé).
- Rétractation dans « Mon compte » (formulaire prérempli + historique) ; route publique `/withdrawal` conservée.
- Fonction (poste) de l'utilisateur ; « Mon entreprise » visible dans Mon compte.
- Render : deux services (Frankfurt `aurion`, Oregon `aurion-web`), groupe de variables commun, déploiement automatique désactivé.

## Retraits
- Toute l'IA (routes `/ai/*`, service Ollama, variables, installateur, documentation). L'import de données reste disponible en mode déterministe (`/data-import/*`).
- Recherche d'entreprise par nom (outil dédié, menu, route `/suppliers/search`, bouton fournisseur « Détecter par nom »).
- Détection automatique pendant la saisie : la détection SIRET/SIREN se fait au clic.
- Code mort d'envoi administratif Gmail (parcours de création administrative).
- Lien de rétractation de la barre latérale et de l'écran d'accueil.
- Brevo codé en dur dans `render.yaml` et `.env.example`.

## Corrections
- `PATCH /activities/:id` n'efface plus la description, la forme juridique, les CGV ni le taux de cotisations quand ils ne sont pas transmis.
- L'interface servie par n'importe quel service Render appelle son propre backend (même origine) au lieu d'un service codé en dur.
- Liens « Commencer » / « Se connecter » de l'accueil alignés sur la page statique (test qui échouait déjà en 15.3.20).
- Registre public : SIRET d'établissement secondaire, unité ou établissement fermé signalés, exception La Poste, N° de TVA calculé, erreurs 429/indisponibilité distinguées, limitation de débit.
- Messagerie : recherche de préréglage robuste si la liste de domaines est absente.

## Migration
- `073_cloud_storage_expense_reports_onboarding.sql` (additive, idempotente, testée deux fois de suite sur PostgreSQL 16).

# Aurion 15.4.4

## Ajouts (bloc 5 — e-reporting : données de transaction et de paiement)
- Doctrine officielle vérifiée le 14 novembre 2026 (impots.gouv.fr ; BOFiP ACTU-2026-00145 du 30 septembre 2026) et documentée dans `docs/PLATEFORME-AGREEE.md` § 10 : deux composantes (données de transaction et données de paiement), échéances 1er septembre 2026 (GE/ETI) et 1er septembre 2027 (micro-entreprises et PME, option d'anticipation), périodicité mensuelle ou trimestrielle selon le régime de TVA.
- **Matrice de périmètre sans inférence** (`services/electronic-ereporting-matrix.ts`, module pur testable isolément) : B2C domestique (non-assujetti) et B2B international (assujetti non établi en France) dans le périmètre lorsque la TVA française est due ; B2B domestique exclu avec motif (relève de l'émission électronique du bloc 4) ; exonérations déclarées avec motif obligatoire ; TVA non facturée (franchise en base, taux 0) exclue. Le classement s'appuie exclusivement sur des déclarations utilisateur — catégorie d'acheteur, code pays ISO et numéro de TVA sur la fiche client, exonération et motif sur la facture — jamais sur le nom, le SIRET ou le type de document.
- **Déclarations par période** (`services/electronic-ereporting.ts`) : aperçu sans écriture (`POST /pa/ereporting/preview`), préparation scellée (`POST /pa/ereporting/declarations`) exigeant que chaque facture de la période soit classée ou explicitement exclue — **rapport d'écarts bloquant (422 `EREPORTING_CLASSIFICATION_INCOMPLETE`) tant que des données déclaratives manquent** ; flux JSON `aurion.ereporting/1` validé (structure, arithmétique Σ lignes = totaux, période) puis archivé scellé SHA-256, lignes figées en base ; exclusions motivées portées dans le flux (rien n'est omis en silence).
- **Transmission via la PA** (`POST /pa/ereporting/declarations/:id/transmit`) : même contrat sortant `generic` que l'émission (signature HMAC, `X-Aurion-PA-Format: ereporting`, JSON), **accusés signés obligatoires** — rejet tracé avec accusé archivé, timeout (« issue non confirmée ») et reprise avec le MÊME identifiant d'idempotence (aucun doublon côté PA, vérifié par test), intégrité du flux revérifiée avant chaque envoi (`EREPORTING_PAYLOAD_TAMPERED`).
- **Corrections** (`POST /pa/ereporting/declarations/:id/corrections`) : déclaration de correction référencée, lignes recalculées à partir des données corrigées, originale conservée sans altération (aucune réécriture de l'historique).
- **Données de paiement** : date de collecte, montant collecté et numéro de facture pour les factures du périmètre à TVA exigible à l'encaissement (PS/LBPS) dont l'option « TVA sur les débits » n'est pas exercée.
- **Migration `077_ereporting_declarations.sql`** (additive, idempotente, appliquée deux fois sur base neuve) : `ereporting_declarations`, `ereporting_lines`, `ereporting_events` + champs déclaratifs (`clients.buyer_category/country_code/vat_number`, `quotes.ereporting_exempt/ereporting_exempt_reason`) — 71 politiques RLS au total (68 en 15.4.3 + 3 nouvelles tables couvertes `tenant_isolation`).
- Routes authentifiées : aperçu, préparation (owner/admin), correction (owner/admin), transmission, liste/détail + journal, téléchargement du flux scellé et des accusés ; consultation ouverte aux membres, écritures réservées owner/admin.

## Corrections
- **Création de plusieurs clients désormais fonctionnelle** : la création d'un deuxième client échouait en 500 (`idx_client_time_active_user`, migration 012 — une session de temps ouverte par utilisateur) car la session ouverte à la première création n'était jamais close ; la session précédente est close avec la sémantique exacte de l'arrêt du chronomètre existant (durée accumulée si en cours, clôture simple si en pause). Défaut démontré en recette réelle (bloc 5), aucun autre comportement du chronomètre modifié.
- Les champs de classification e-reporting des clients suivent une **sémantique de présence** au PATCH (seuls les champs transmis sont modifiés — une valeur enregistrée n'est jamais remplacée par un vide), comme les mentions électroniques des factures.

## Honnêteté (bloc 5)
- Aucune plateforme agréée réelle n'est connectée : le contrat sortant est testé de bout en bout contre un serveur HTTP de recette réel (boucle locale) ; **la transmission e-reporting n'est pas déclarée opérationnelle en production** tant qu'aucune PA contractuelle n'a été validée en sandbox (génération conforme ≠ transmission opérationnelle, distinction explicite partout).
- Le format du flux (`aurion.ereporting/1`, JSON structuré validé) est le contrat du référentiel `generic` ; le format définitif dépendra de la PA retenue (aucun format consolidé imposé par la doctrine au 14 novembre 2026).
- L'interface de déclaration (boutons) accompagnera la connexion contractuelle d'une PA, comme en réception et à l'émission ; l'API complète est testée.
- La validation de la réception e-reporting côté administration suivra les états convenus avec la PA retenue.

## Tests
- `backend/tests/ereporting-matrix.test.mjs` : 9 tests de la matrice (périmètre B2C/B2B, exclusions motivées, écarts bloquants, construction déterministe du flux, validation arithmétique et périodique).
- `backend/tests/ereporting.integration.test.mjs` : 15 sous-tests d'intégration réels sur PostgreSQL (rôle applicatif, RLS active, serveur PA de recette réel) : rapport d'écarts bloquant, classification réelle, flux scellé et lignes figées, transmission acceptée avec accusé signé archivé, B2B international avec/sans numéro de TVA, exonération déclarée, rejet + re-tentative idempotente sans doublon, timeout + reprise au même identifiant, accusé non signé refusé, altération d'archive détectée avant envoi, correction sans réécriture de l'originale, isolation RLS A/B + échec fermé, périodes mensuelles/trimestrielles exactes, droits owner/admin.
- Contrats structurels suivis sans affaiblissement : `step14-doc-save.test.mjs` (56→58 colonnes/paramètres), `quote-update-parameters.test.mjs` (52→56).
- Suite complète en mode strict : **392/392 réussis, 0 échec, 0 ignoré** (368 en 15.4.3 + 24 nouveaux), baseline B0 strictement verte (`npm run check` complet : build, typecheck, frontend, lint, smoke, parcours navigateur).
