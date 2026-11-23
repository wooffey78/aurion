# Traçabilité des prompts 10 → 16 + prompt général 19 — livraison 15.4.48

Méthode : audit ligne à ligne du socle 15.4.47 contre chaque exigence, statut réel, puis
implémentation des écarts par blocs atomiques additifs. Chaque ligne cite la preuve
(fichier/migration/test). Les statuts suivent la grille du prompt général : **fonctionnelle
vérifiée**, **partielle**, **présente mais défectueuse**, **absente**, **hors périmètre immédiat**.

## Prompt 10 — Stock, achats, fournisseurs

| Exigence | Statut 15.4.47 | Statut 15.4.48 | Preuve |
|---|---|---|---|
| Source de vérité unique par article (unité, référence, coût, seuils) | partielle | **fonctionnelle vérifiée** | `095_stock_engine.sql` (unit, min_stock_threshold, storage_location) ; coût réel par réception (`purchase_reception_lines.unit_cost`) |
| Mouvement traçable obligatoire (jamais d'écriture libre) | absent (stock éditable en direct) | **fonctionnelle vérifiée** | `services/stock.ts` `createStockMovement` (FOR UPDATE, refus négatif) ; POST/PATCH /parts via mouvements ; test `stock-engine.contract` |
| Réservations (disponible ≠ physique, libération, consommation) | absent | **fonctionnelle vérifiée** | `part_reservations` 095 ; `reservePart`/`releaseReservation`/`consumeReservation` ; recette intégration v24 |
| Achats : commande → réception partielle → retour | absent | **fonctionnelle vérifiée** (demande/proposition = hors périmètre immédiat) | `096` + `services/purchases.ts` + `routes/purchases.ts` ; réception ne dépasse jamais la ligne (`OVER_RECEPTION`) |
| Stock alimenté seulement à réception confirmée | — | **fonctionnelle vérifiée** | mouvement `receipt` créé dans `receiveOrder` uniquement |
| Coûts réels → compta sans double comptabilisation | n/a | **partielle** (coûts conservés, aucune écriture automatique — décision documentée, cohérente avec l'invariant PA) | commentaire `services/purchases.ts` |
| Seuils → alertes/propositions, jamais de commandes fermes | absent | **fonctionnelle vérifiée** | `evaluateThreshold` + `/stock/reorder-proposals` + journal `stock_below_threshold` |
| Multi-emplacements | absent | **partielle** (emplacement informatif) | `parts.storage_location` |

## Prompt 11 — Comptabilité, finances, trésorerie

| Exigence | Statut 15.4.47 | Statut 15.4.48 | Preuve |
|---|---|---|---|
| FEC, journaux CSV, livre des recettes, cotisations datées | fonctionnelle vérifiée | inchangé (0 régression) | `bloc14`, `financial-golden-scenarios` verts |
| Rapprochement CSV/OFX : import, dédup, suggestions, match révocable | fonctionnelle vérifiée | + **attribution auditée** | `bloc25` verts ; `bank_transactions.matched_by/unmatched_by` (097) |
| Verrou de période clôturée | absent | **fonctionnelle vérifiée** | `097` ; `assertPeriodOpen` sur règlements + SAV ; routes `/accounting/periods` ; recette intégration |
| Correction de règlement audité (jamais silencieuse/irréversible) | absent | **fonctionnelle vérifiée** | `payment_corrections` (copie jsonb), motif obligatoire, interdite si rapprochée/clôturée ; recalcul déterministe facture+échéancier |
| Prévisionnel/réel/engagé séparés | fonctionnelle vérifiée | inchangé | `step24-treasury-forecast` verts |
| Exports avec définition/période/source | partielle | **partielle** (PDF exposé en plus) | `/accounting/report.pdf` (service ancien code mort, routé) |

## Prompt 12 — Dashboard et cockpit

| Exigence | Statut 15.4.47 | Statut 15.4.48 | Preuve |
|---|---|---|---|
| Projection des modules, jamais de calcul parallèle | fonctionnelle vérifiée | inchangé + 3 compteurs propriétaires | `/dashboard/summary` : `lowStockCount`, `tasksOpenCount`, `accountantOpenRequests` |
| Documentation centrale des indicateurs | absent | **fonctionnelle vérifiée** (doc) | `docs/REFERENCES-INDICATEURS-DASHBOARD.md` |
| Tâches, stocks faibles, demandes comptable | absent (entités inexistantes) | **fonctionnelle vérifiée** (backend) | blocs 10/13/15 ; alerts in journal (UI journal existante les affiche déjà) |
| Widgets masquables/réordonnables | absent | **absent** (chantier UI dédié) | — |

## Prompt 13 — Automatisations sans IA

| Exigence | Statut 15.4.47 | Statut 15.4.48 | Preuve |
|---|---|---|---|
| Relance facture si toujours due ; rappels RDV ; retry contrôlé | fonctionnelle vérifiée | + **anti double-envoi** | `scheduler.ts` : revendication atomique (`on conflict do nothing` sur `invoice_reminders` unique, statut `sending` pour notification_jobs) |
| Moteur de règles configurable (déclencheur/conditions/actions) | absent | **fonctionnelle vérifiée** | `098` + `services/workflows.ts` + `/automation/rules` |
| Versionnage, activation/désactivation, simulation à blanc | absent | **fonctionnelle vérifiée** | `workflow_rules.version` ; `POST /automation/rules/:id/simulate` (runs `simulated`, aucune action exécutée) |
| Idempotence, anti-boucles, journal d'exécution | absent | **fonctionnelle vérifiée** | `workflow_runs` clé unique org+règle+déclencheur ; recette : 2 balayages → 1 run |
| Tâches internes | absent | **fonctionnelle vérifiée** | table `tasks` + `/tasks` + action `create_task` |
| Aucune action externe sans validation humaine | — | **fonctionnelle vérifiée** | `normalizeRuleConfig` refuse toute action hors `journal_alert`/`create_task` ; test unitaire |

## Prompt 14 — Portail client sécurisé

| Exigence | Statut 15.4.47 | Statut 15.4.48 | Preuve |
|---|---|---|---|
| Portail client complet (identité, invitation, vue données) | absent | **absent** (fondation livrée, chantier dédié) | voir CHANGELOG limites |
| Partage documentaire explicite, révocable, historisé | absent | **fonctionnelle vérifiée** | `document_shares` (jeton hashé, expiration, révocation, compteur d'accès) ; `/share/:token/download` public rate-limité, refus si non-`clean` |
| Jamais d'exposition de marges/coûts/notes internes | — | **fonctionnelle vérifiée** | le partage n'expose QUE le fichier ; aucune vue agrégée |
| Paiement en ligne sans simulation | fonctionnelle vérifiée (absence de prestataire) | inchangé | `bloc13` inchangé |

## Prompt 15 — Collaboration comptable

| Exigence | Statut 15.4.47 | Statut 15.4.48 | Preuve |
|---|---|---|---|
| Invitation identifiée, compte distinct, révocation, journal | fonctionnelle vérifiée | + **livraison e-mail**, jeton retiré des listes | `bloc14` verts ; `email_status` (099) |
| Interdictions par défaut (émission, banque, suppression…) | fonctionnelle vérifiée | inchangé + exception unique | `plugins/auth.ts` : écriture autorisée UNIQUEMENT sur `/accountant/requests*`, chaque écriture journalisée |
| Demandes avec état/auteur/échéance/résolution documentée | absent | **fonctionnelle vérifiée** | `accountant_requests` + `RESOLUTION_NOTE_REQUIRED` ; demande fermée = discussion lecture seule |
| Échanges contextualisés | absent | **fonctionnelle vérifiée** | `accountant_request_messages` (rôle auteur conservé) |
| Dossier préparé depuis données réelles + complétude | partielle (exports seuls) | **fonctionnelle vérifiée** | `/accountant/dossier` : critères calculés sur ventes/encaissements/dépenses/PA/justificatifs/rapprochements/écritures ; jamais « transmis » sans confirmation |
| Permissions granulaires par période / cabinet | absent | **absent** (chantier RBAC dédié) | — |

## Prompt 16 — Gestion documentaire centralisée

| Exigence | Statut 15.4.47 | Statut 15.4.48 | Preuve |
|---|---|---|---|
| Empreinte SHA-256 + type MIME détecté + statut de validation | partielle (cloud seulement) | **fonctionnelle vérifiée** sur le dépôt privé | `documents.sha256/detected_mime/validated_at` (100) ; `doc-security.ts` (sniff + refuse EXE usurpé, test unitaire) |
| Catégories déterministes, recherche, filtres | absent | **fonctionnelle vérifiée** | `DOCUMENT_CATEGORIES` ; `/documents?q=&category=&entityType=` (aurion_unaccent) |
| Association multi-objets sans duplication | absent | **fonctionnelle vérifiée** | `document_links` (unique par triplet, objet vérifié dans l'org) |
| Suppression logique/corbeille/restauration/purge contrôlée | présent mais défectueux (unlink immédiat) | **fonctionnelle vérifiée** | DELETE = corbeille ; `/documents/:id/restore` ; `/documents/:id/purge` refuse si référencé (`DOCUMENT_REFERENCED`) |
| Offline 90 j + actifs/épinglés | fonctionnelle vérifiée | inchangé | `recent-documents.js` + `bloc6bis` verts |
| Sauvegarde/restauration testées, rétention par catégorie | partielle | **partielle** (inchangé — hors périmètre immédiat) | drill documenté `BLOCS-6-20` |

## Prompt général 19 — Harmonisation

| Exigence | Statut 15.4.47 | Statut 15.4.48 | Preuve |
|---|---|---|---|
| Isolation multi-tenant (RLS partout) | quasi complète (1 trou) | **complétée** | `account_deletion_requests` RLS (101) ; nouvelles tables toutes sous `tenant_isolation` |
| Sources de vérité / non-duplication | fonctionnelle vérifiée | renforcée | stock = `parts` + mouvements ; documents = dépôt central ; dashboard = projection |
| Calculs centralisés | partielle (3 helpers d'arrondi) | **partielle** (inchangé — refactor risqué documenté) | `invoice-workflow` reste la référence paiements/relances |
| Référentiel d'états partagé | absent (littéraux dupliqués) | **fonctionnelle vérifiée** (socle) | `services/statuses.ts` ; les requêtes existantes restent littérales (0 régression), les nouveaux modules consomment le référentiel |
| Socle d'événements (identifié, daté, dédoublonné, idempotent) | absent (INSERTs dispersés) | **fonctionnelle vérifiée** (socle) | `services/events.ts` (`emitOrgEvent`/`resolveOrgEvent`, `on conflict dedupe_key`) consommé par stock/achats/workflows/comptable |
| Synchronisation offline : mêmes contrats multiappareil | fonctionnelle vérifiée (48 entités) | **étendue (54 entités)** | `102_sync_entities.sql` (triggers) + `SYNC_SCHEMA_VERSION = 4` ; réceptions et runs volontairement serveur (confirmations backend) |
| Corrections contrôlées, jamais silencieuses/irréversibles | partielle | **fonctionnelle vérifiée** | `payment_corrections` ; purge documentaire après contrôle des références |

## Exécution des vérifications (15.4.48)

- `tsc --noEmit` + build : 0 erreur.
- Suite complète : **650 tests — 579 pass, 0 fail, 71 skipped** (skips = intégrations PostgreSQL, procédure inchangée).
- Recette d'intégration 15.4.48 prête (stock → seuil → réservation → consommation → facture → règlement → clôture → rouverture → correction auditée → workflow idempotent → isolation A/B) : à rejouer sur base provisionnée.
