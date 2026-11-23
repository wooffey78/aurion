# AUDIT FINAL 15.4.30 — Bloc 0 (audit contradictoire, sans modification) — 14 novembre 2026

Base : `aurion-15.4.30-blocs-metier-design.zip` — SHA-256 `292711f44bacc73a7c1b64a93e6c9fe15c9ac800bc93f9f1731efd1a638f66e9` vérifié, `unzip -t` sans erreur, arbre de travail strictement identique au ZIP (diff vide hors artefacts de build). **Aucune modification métier dans ce bloc.**

## 1. Inventaire et versions

| Élément | État |
|---|---|
| VERSION.txt / backend/VERSION.txt / package.json ×2 | 15.4.30 partout ✓ |
| CHANGELOG | entrée 15.4.30 en tête ✓ |
| Migrations | 001→085 (084/085 = réplication) |
| Tests backend | 140 fichiers, 466 tests ; e2e Playwright offline inclus |
| render.yaml | `plan: free`, Frankfurt, autoDeploy désactivé ✓ |
| Capacitor | 6.2.3, `capacitor.config.json` (appId `fr.aurion.app`, `webDir: dist-web`, https, sans `server.url` bloquant) |
| android/ | présent (projet généré, **aucun AAB signé**) |
| ios/ | **absent** |

**Baseline rejouée cette session** : migrations ×2 idempotentes sur PostgreSQL 16 réel, `npm run check` **exit 0** (45 fichiers, ESLint 0, fumée 79/79, parcours Playwright avec scénario hors connexion, aucune erreur console), `npm test` **exit 0 : 466/466** (rejoués dans cette session, base PostgreSQL neuve).

## 2. Revendications 15.4.30 ↔ code (vérifiées par source)

| Revendication | Preuve code | Verdict |
|---|---|---|
| Facture réglée : plus d'échéancier/relance | `business.ts` (3 occurrences `next_reminder_at=case when…`, garde échéancier « déjà entièrement réglée ») ; `scheduler.ts` (re-vérification payé avant envoi) ; `docs.js` boutons conditionnés | CONFIRMÉ (tests bloc1) |
| Échéances fiscales en direct | `other.js` : re-rendu via `hooks.refresh('accounting')` avec gardes vue/saisie/modale | CONFIRMÉ |
| Carte VL conditionnelle | `other.js` : `vlOption==='oui'?…:''` | CONFIRMÉ |
| Trésorerie potentiel/engagé | `business.ts` `potentialIn/committedIn/committedOut/savTotal/committedNet` | CONFIRMÉ (tests bloc4-treasury) |
| Historique mensuel enrichi | `other.js` détail dépliable (TVA, achats, cotisations…) | CONFIRMÉ |
| 4 horizons prévision | `other.js` `forecastHorizonMonths` (3/6/year/365) | CONFIRMÉ |
| Course de navigation | `dashboard.js` `S.pendingView` + `refresh(id,{navigation})` | CONFIRMÉ |
| Remplissage client | `quote.js` résumé + `data-autofilled` | CONFIRMÉ |
| Juridique 4.0/15.4.30 | 7 docs révisés ; mais CHECKLIST/RUNBOOK encore 15.4.22 + Render « plan payant » (voir §6) | PARTIEL |

## 3. Hors connexion — cartographie

### 3.1 Chaîne de réplication (EXISTE ET TESTÉ)
- Serveur : `/sync/registry|cursor|snapshot/:entity|delta|ops` ; journal `sync_entity_changes` par triggers ; idempotence `sync_applied_ops` ; tombstones ; migrations 084/085.
- Client : `local-store.js` (Memory/IndexedDB), `sync-manager.js` (curseur avant snapshot, deltas, pagination), `outbox.js` (bail, `@ref`, ordre topologique, bootstrap identité), `sync-ui.js` (indicateur/panneau/reprise), `account-sync.js` (+056-059), `cloud-sync.js` (historique conservé).
- Tests : `bloc3` (snapshot paginé, isolation A/B, curseur, delta, tombstone, migration idempotente), `bloc4` (rejeu sans doublon, références, dépendances, isolation), e2e offline (création client → pending → rejeu sans clic → sans doublon).

### 3.2 Registre de réplication (classement des 101 tables)
- **Dans le registre (29)** : 26 tables `id+organization_id` (084) + `organization_members` (user_id) + `user_drafts` (user_id:draft_key) + `quote_items` via parent (085) + `dashboard_journal_events`/`ereporting_*` (085).
- **Manquantes avec valeur métier** (Bloc 2) : `activity_forecast_assumptions`, `activity_profile_overrides`, `document_themes`, `email_signatures`, `electronic_invoice_profiles`, `template_versions`, `payment_links`, `notification_jobs`, `bank_import_configs`, `cloud_documents` (métadonnées), `outgoing_electronic_invoices`/`outgoing_transmission_events`/`supplier_electronic_invoices` (statuts e-invoicing), `support_status_events`, `legal_acceptances`.
- **Référentiels datés nécessaires aux calculs hors ligne** (Bloc 7) : `micro_rates`, `micro_referential_versions`, `regulatory_rules` — **globales (sans organization_id)** → besoin d'un canal de synchronisation dédié versionné, pas du registre tenant.
- **Exclusions justifiées (documentées)** : secrets/sessions/tokens (`mail_accounts`, `google_oauth_states`, `webauthn_*`, `password_reset_tokens`, `email_verification_tokens`, `native_sessions`, `admin_*`), billing/abonnement (`plans`, `subscriptions*`, `billing_*`, `vip_guest_accounts` — géré par account-sync), numérotation serveur (`document_number_sequences` — JAMAIS répliquée), tables sans organization_id (`activity_contributions`, `supplier_parts`, `support_messages`), tables des fonctions retirées du produit (`administrative_*`), tables techniques (`sync_*`, `schema_migrations`, `users`, `organizations`).

### 3.3 Consommation locale par vue
- `dashboard.js:81-90` : repli local pour **12 entités** (clients, quotes+items enrichis, appointments, suppliers, parts, interventions, supplies, warranties, warranty_policies, devices, sav_cases, templates) — enrichissement croisé quotes←items/clients.
- **Manquantes (Bloc 3)** : notes de frais (`expense_reports`), paiements/échéanciers/relances en vue docs (les factures viennent de `quotes` ✓ mais les paiements ne sont pas rejoints localement), comptabilité/trésorerie (dernier état en ligne — PARTIEL assumé), banque, e-invoicing, journal, paramètres (mail/templates partiels), `clients`→adresses d'intervention enfants.
- Règle « données locales disponibles jusqu'au… » : indicateur présent dans `sync-ui.js` ; fraîcheur par vue à consolider (Bloc 3).

### 3.4 Outbox (Bloc 4)
- Liste blanche 19 motifs : clients(+adresses), suppliers, supplies, parts(+prices), devices, sav, warranty-policies, interventions, appointments, expense-reports, activities, quotes(+invoice), invoices/{payments,installments,reminders,penalty,payment-link}, settings/draft, document-template-choices, fiscal-calendar/margins, forecast/assumptions, journal events, support tickets.
- **Absent** : `/communications/email/document` (intention d'envoi email choisie hors connexion) — à ajouter avec permissions/idempotence/anti-doublon.
- Tests existants couvrent rejeu/dépendances/idempotence ; **chaîne E2E client→devis→facture numérotée→PDF→email hors connexion non couverte de bout en bout** (PDF/email après rejeu à construire).

### 3.5 Conflits (Bloc 5)
- Tombstones + rejeu ordre indépendant testés ; **aucune interface de comparaison champ par champ**, aucune règle par type (brouillons fusionnables vs factures émises non réécrites), pas de test à deux sessions concurrentes sur le même enregistrement.

### 3.6 Documents récents (Bloc 6)
- `recent-documents.js` : politique configurable (fenêtre, `maxTotalMB`), `pinDocument/unpinDocument`, UI épinglage raccordée dans docs.js/quote.js, `cloud-sync.js` appelle `navigator.storage.persist()`.

## 4. Android/iOS/intégrations
- Android : projet présent, Capacitor 6.2.3 ; **aucun build signé, aucun test appareil** — Bloc 9 non exécuté. iOS : dossier absent — Bloc 10 bloqué (Mac/Xcode requis).
- Google : docs `GOOGLE-CONFIGURATION.md` (flux séparés OIDC/Gmail/Drive/Agenda) ; code OAuth présent ; bouton signalé défaillant par l'éditeur ; **aucune recette réelle** — Bloc 14.
- Stripe : service abonnement présent, compte non configuré — Bloc 16. Brevo : SMTP config possible, domaine absent — Bloc 16.
- PA : socle UBL 2.1/CII + e-reporting + adaptateurs génériques ; aucune PA contractuelle ; **la gratuité intégrale (offre entrepreneur + API éditeur) n'est confirmée pour aucun prestataire à ce stade** — Bloc 15 (recherche sur sources officielles à faire à l'exécution).
- VIP : `/auth/vip-invite/accept` refuse encore `ACCOUNT_EXISTS` (auth.ts:141) si l'adresse possède déjà un compte — cas « rattacher sans doublon » non couvert — Bloc 17.
- OVH : docs `INFRA-OVH-COUTS.md` + `MIGRATION-RENDER-OVH.md` ; stockage objet S3-compatible déjà branché par variables ; **rien de provisionné, migration non exécutée** — Blocs 12-13.

## 5. Incohérences documentaires confirmées (Bloc 1)
- `docs/CHECKLIST-PRE-PRODUCTION.md` lignes 1, 3, 75 : « 15.4.22 » ; ligne 51 : « plan payant » Render.
- `docs/RUNBOOK-PRODUCTION.md` ligne 1 : « 15.4.22 » ; ligne 13 : « plan payant ».
- Ces documents contredisent `render.yaml` (`plan: free`) et la décision éditeur (Render gratuit/temporaire, OVH cible). Correction obligatoire avant toute procédure de production.

## 6. Risques classés

- **P0** : OVH non provisionné + migration/restauration non exécutées (E) ; Android non buildé/testé, iOS absent (D) ; intégrations externes sans recette réelle (G) ; PA gratuite non identifiée/contractée (G).
- **P1** : registre de réplication incomplet (~14 tables métier + référentiels datés) ; vues locales manquantes (notes de frais, paiements, comptabilité) ; conflits sans résolution champ par champ ; intention email hors connexion absente ; VIP `ACCOUNT_EXISTS` sur compte existant.
- **P2** : CHECKLIST/RUNBOOK obsolètes (version/Render) ; fraîcheur par vue à consolider ; test de restauration sauvegardes à exécuter ; monitoring externe absent.

## 7. Score pondéré recalculé (section 4 du prompt, règle 0/25/50/75/90/100)

| Domaine | Poids | Score | Points | Justification (preuves) |
|---|---|---|---|---|
| A. Produit métier, calculs, non-régression | 12 | 90 % | 10,8 | 466/466 + check 0 ; moteur facturation/compta/trésorerie/fiscal testés ; recette cible restante faible |
| B. Sync, réplication, outbox, conflits | 16 | 60 % | 9,6 | chaîne testée (A/B, tombstones, rejeu) MAIS ~14 tables métier hors registre, vues locales partielles, conflits sans UI champ par champ, intention email absente |
| C. Documents locaux, stockage natif, appareils | 7 | 60 % | 4,2 | politique 90j/épinglés/quota + UI + persist OK ; SQLite chiffré natif absent |
| D. Web/Windows/Android/iOS buildés et testés | 10 | 42 % | 4,2 | Web/PWA validée ; Windows scripts testés sur contenu mais pas machine réelle cette session ; Android projet sans build ; iOS absent |
| E. OVH, migration, sauvegardes, restauration | 12 | 25 % | 3,0 | docs + code S3-OVH ; rien provisionné, migration/restauration non exécutées |
| F. Sécurité, RLS, secrets, RGPD technique, supervision | 10 | 70 % | 7,0 | RLS 074 A/B, fail-closed, rôles migrateur/runtime, secrets hors ZIP, logs redacted ; supervision externe/alertes incidents absentes |
| G. Google, Brevo, Stripe, PA/e-reporting | 12 | 35 % | 4,2 | code et docs complets ; zéro recette réelle ; PA gratuite non confirmée |
| H. Juridique, médiateur, tarification | 8 | 50 % | 4,0 | 7 docs révision 4.0 alignés au réel ; médiateur non choisi, tarif non arrêté, publication verrouillée |
| I. Tests réels, accessibilité, bêta, support, exploitation | 13 | 55 % | 7,2 | suite automatisée sérieuse + accessibilité automatisée ; matrice appareils réels, bêta, support, backup/restore testé : absents |
| **TOTAL** | **100** | | **54,2 %** | |

**Recalibrage expliqué** : l'évaluation précédente retenait 61 % sur une base moins granulaire. Le recalcul par domaine sur preuves donne **≈54 %** — ce n'est ni une régression ni une progression du code : la 15.4.30 est inchangée ; la pondération fixe attribue plus de poids aux domaines encore non exécutés en environnement cible (OVH 12 pts à 25 %, mobiles 10 pts à 42 %, intégrations 12 pts à 35 %).

## 8. Conclusion Bloc 0
État réel établi sans modification. Le chemin vers 100 % exige d'abord les blocs 2-8 (offline complet) et 9/10/12/13 (mobiles + OVH), puis les recettes externes (14-17) et l'exploitation (18-20). Les blocs dépendant d'actions éditeur (achats, comptes, appareils, contrats) seront préparés et documentés, jamais simulés.
