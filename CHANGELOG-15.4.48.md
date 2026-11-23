# CHANGELOG 15.4.48

## Objet de la livraison

Intégration des exigences fonctionnelles des **prompts 10 à 16 et du prompt général 19**
(harmonisation globale) dans la version 15.4.47, selon la méthode du dépôt : audit factuel
préalable, blocs atomiques additifs (migrations 095 → 102), aucun retrait de fonctionnalité,
aucune migration existante modifiée, tests avant/après et traçabilité complète.

**Résultat de la vérification** : `tsc --noEmit` + build 0 erreur ; suite complète
`node --test` **650 tests — 579 pass, 0 fail, 71 skipped** (les sauts sont les tests
d'intégration PostgreSQL, non exécutables sans base provisionnée — comportement inchangé).

## Blocs livrés (fichiers nouveaux ou modifiés)

| Bloc (prompt) | Livraison | Fichiers |
|---|---|---|
| **10 — Stock traçable** | Mouvements de stock historisés (quantité signée, motif, acteur, lien opérationnel) : la saisie libre de `parts.stock` devient un AJUSTEMENT TRACÉ (valeur finale identique, traçabilité ajoutée). Réservations liées à devis/rendez-vous (diminuent le DISPONIBLE = physique − réservations actives ; surréservation refusée ; consommation confirmée = mouvement). Unité, seuil de réapprovisionnement et emplacement par article. Alertes de seuil dans le journal de bord (idempotentes) et propositions de réapprovisionnement tenant compte des commandes ouvertes — JAMAIS de commande automatique. | `migrations/095_stock_engine.sql`, `services/stock.ts`, `routes/stock.ts`, `routes/business.ts` (POST/PATCH /parts), `tests/stock-engine.contract.test.mjs` |
| **10 — Achats** | Commande fournisseur (draft → ordered → partially_received → received, annulation sans réception), réceptions PARTIELLES alimentant le stock à la confirmation uniquement, retours fournisseur tracés. Coûts réels conservés sur les réceptions ; AUCUNE écriture comptable automatique (invariant PA 075 maintenu). | `migrations/096_purchase_orders.sql`, `services/purchases.ts`, `routes/purchases.ts` |
| **11 — Comptabilité** | Verrou de période clôturée (clôture/rouverture explicites, refus 409 `PERIOD_CLOSED` de tout nouveau règlement/SAV/correction sur un exercice verrouillé). Correction de règlement AUDITÉE : motif obligatoire, interdite sur règlement rapproché ou exercice clôturé, copie intégrale conservée dans `payment_corrections`, réécriture déterministe de l'état facture + échéancier. Rapprochement bancaire attribué (`matched_by`/`unmatched_by`). Export comptable PDF exposé (`/accounting/report.pdf`, service existant non routé). FEC/agrégats excluent les écritures annulées. | `migrations/097_accounting_period_lock.sql`, `routes/business.ts`, `routes/bank.ts`, `services/accounting.ts`, `services/accounting-export.ts`, `services/accounting-report.ts` |
| **13 — Automatisations sans IA** | Moteur de règles DÉTERMINISTES : déclencheurs `invoice_overdue` / `stock_below_threshold` / `deadline_reminder`, actions internes (`journal_alert`, `create_task`), conditions explicitées, substitution déterministe, versionnage + activation/désactivation, simulation à blanc journalisée, runs idempotents (clé unique org+règle+déclencheur), balayage planifié par le scheduler. Tâches internes (`/tasks`). Scheduler durci : revendication atomique des relances (contrainte unique + statut `sending`) — plus de double envoi possible en multi-instances. | `migrations/098_workflow_rules_tasks.sql`, `services/workflows.ts`, `routes/automation.ts`, `routes/tasks.ts`, `services/scheduler.ts` |
| **14 — Portail client (fondation)** | Partage de document par lien public : création explicite, jeton aléatoire transmis une fois (SHA-256 stocké), expiration, RÉVOCATION immédiate, historique d'accès (compteur, date, IP tronquée), refus si document non validé ou supprimé. Aucune donnée au-delà du fichier partagé. | `migrations/100_document_centralisation.sql`, `routes/share-links.ts`, `routes/documents.ts` |
| **15 — Collaboration comptable** | Espace de collaboration : demandes de documents (état, auteur, échéance, résolution DOCUMENTÉE obligatoire), échanges contextualisés des deux parties, dossier annuel préparé depuis les données réelles avec critères de complétude (jamais « complet » si un critère manque, jamais « transmis » sans confirmation). Le comptable peut écrire UNIQUEMENT sur ces routes (allowlist garde, chaque écriture journalisée). Invitation livrée par e-mail (statut honnête), jeton retiré des listes. | `migrations/099_accountant_collaboration.sql`, `routes/accountant-collab.ts`, `plugins/auth.ts`, `routes/business.ts` |
| **16 — Gestion documentaire** | Upload durci : détection du type réel par octets magiques (EXE usurpé refusé 415), SHA-256 systématique, catégories déterministes, recherche insensible aux accents + filtres. Corbeille (suppression logique, restauration) et purge définitive APRÈS contrôle des références (liens métier, demandes comptable). Liens multi-objets sans duplication physique. Régularisation des justificatifs historiques en `clean`. | `migrations/100_document_centralisation.sql`, `services/doc-security.ts`, `services/storage.ts` (`savePrivateBuffer`), `routes/documents.ts` |
| **19 — Harmonisation transversale** | RLS comblée sur `account_deletion_requests` (trou d'isolation relevé par l'audit). Socle d'émission d'événements centralisé (`services/events.ts`, idempotent par `dedupe_key`). Référentiel de statuts partagé (`services/statuses.ts`). Réplication offline étendue aux nouvelles entités (migrations 095-102, `SYNC_SCHEMA_VERSION = 4`). Référentiel documenté des indicateurs dashboard. | `migrations/101_harmonisation_rls.sql`, `migrations/102_sync_entities.sql`, `services/events.ts`, `services/statuses.ts`, `services/sync-replication.ts`, `docs/REFERENCES-INDICATEURS-DASHBOARD.md` |
| Dashboard (12) | Trois compteurs propriétaires ajoutés à `/dashboard/summary` : `lowStockCount`, `tasksOpenCount`, `accountantOpenRequests` (projection des modules, aucun calcul parallèle ; dégradation tolérante). | `routes/business.ts` |
| Version | 15.4.48 partout (VERSION.txt, backend/VERSION.txt, package.json ×2, package-lock ×2, `sw.js` cache `aurion-shell-v15.4.48-r1`, index.html `?v=15.4.48-r1`). | fichiers racine |

## Tests

- **Nouveaux** : `tests/stock-engine.contract.test.mjs` (7 : migrations, service, routes, catalogue + unitaires purs signes/stock négatif/propositions/sécurité documentaire) et
  `tests/v24-blocks-10-16-harmonisation.contract.test.mjs` (9 : contrats blocs 11/13/15/16/19, unitaires règles de workflow, **recette d'intégration PostgreSQL complète** — stock → seuil → réservation → consommation → facture → règlement → clôture → correction auditée → workflow idempotent → isolation multi-tenant — exécutée quand une base réelle est provisionnée, comme les autres batteries intégration du dépôt).
- **Non-régression** : 650 tests, 0 échec. Les contrats existants (`parts-patch-contract-regression`, `dashboard-cards`, `bloc14`…) restent verts : le comportement observé des API est conservé, seule la traçabilité s'ajoute.

## Règles respectées

- V1 figée : aucune migration existante modifiée (095 → 102 additives et idempotentes) ; aucun push ni déploiement.
- Aucune fonctionnalité retirée ; aucune seconde comptabilité ni base parallèle ; aucun LLM/IA (règles explicites uniquement).
- Les actions sensibles restent des validations humaines : seuils = propositions, clôture comptable = action explicite réversible, correction = auditée et interdite sur exercice verrouillé.

## Limites honnêtes (non livrées dans cette version, dépendances relevées par l'audit)

- **Portail client complet** (identité client, invitation vérifiée, vue devis/factures) : la fondation documentaire est livrée (partages révocables) ; l'identité client distincte reste un chantier à part entière.
- **Permissions granulaires du comptable** par période/cabinet : le rôle reste lecture seule + espace de collaboration ; la refonte RBAC par ressource est un chantier dédié.
- **Scan antivirus** : non revendiqué (aucune dépendance disponible) ; le refus est déterministe par signature de contenu.
- **Multi-emplacements de stock** : un emplacement de rangement informatif par article ; l'inventaire multi-magasins reste à venir.
- **Avoirs clients** : non implémentés (le trésorier documente `avoirs: 'aucun module d'avoir'` inchangé).
- Les batteries d'intégration PostgreSQL (dont la recette 15.4.48) restent à rejouer sur une base provisionnée — procédure inchangée (`AURION_INTEGRATION_TESTS=1` + `DATABASE_URL` + `AURION_ADMIN_DATABASE_URL`).
