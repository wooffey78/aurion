# GO-LIVE 15.4.51 — tableau de mise en production (référence du go/no-go)

Document créé en 15.4.51 (PROMPT A7 du document « PROMPTS 70 vers 100 »). Il consolide les preuves datées des phases de mise en production et sera complété à chaque phase suivante (C, D, E, puis décision finale en Phase F5). **Statuts honnêtes : FAIT (avec preuve), NON FAIT, BLOQUÉ-éditeur (accès console requis).** Aucune case ne se coche sans preuve collée.

## Infrastructure (PROMPT A1 — opération éditeur)

| Item | Statut | Preuve datée |
|---|---|---|
| PostgreSQL géré région UE créé, rôles migrateur/runtime selon POSTGRES-ROLES.md | BLOQUÉ-éditeur | — |
| Bucket Object Storage privé région `de` + clés minimales | BLOQUÉ-éditeur | — |
| Secrets renseignés dans le tableau de bord (jamais dans Git) | BLOQUÉ-éditeur | — |
| Premier déploiement : /health + /health/db 200, migrations appliquées puis rejouées sans effet | BLOQUÉ-éditeur | — |

## Recettes et restauration (PROMPT A2/A3)

| Item | Statut | Preuve datée |
|---|---|---|
| Recette PostgreSQL réelle (concurrence numérotation, paiements concurrents, RLS, outbox, webhooks signés, réplication) — `AURION_PG_RECIPE=1` | NON FAIT — exécution exige PostgreSQL réel (test livré et gated) | — |
| Test de restauration complète tracé (dump → base jetable → 7 vérifications fonctionnelles) | NON FAIT — opérations console éditeur (scripts livrés : db:backup, db:restore:drill) | — |

## Supervision (PROMPT A4/A6 — livré en code, activation éditeur)

| Item | Statut | Preuve datée |
|---|---|---|
| Lettres mortes : listing transverse admin (`/admin/outbox/dead-lettered`), rejeu motivé existant | FAIT (code + tests contrat) | backend/tests/v51-ops-supervision.contract.test.mjs |
| Alerte quotidienne (résumé technique sans contenu métier) si `AURION_OPS_ALERT_EMAIL` configuré | FAIT (code) / activation = BLOQUÉ-éditeur (renseigner l'adresse) | — |
| `/health` enrichi : version, uptime, `outboxDeadLettered`, `lastBackupAt` | FAIT (code + tests) | v51-ops-supervision.contract.test.mjs |
| Supervision externe de disponibilité sur `/health/db` | BLOQUÉ-éditeur (fournisseur au choix) | — |

## Sauvegardes (PROMPT A5)

| Item | Statut | Preuve datée |
|---|---|---|
| Script `backup-nightly.mjs` (dump → vérification → journal JSON → copie secondaire → purge) | FAIT (livré) | backend/scripts/backup-nightly.mjs |
| Cron quotidien configuré (VPS OVH recommandé) | BLOQUÉ-éditeur | — |
| Première sauvegarde réelle + restauration vérifiée | BLOQUÉ-éditeur | — |

## Légal (PROMPT C/D — livré, publication = éditeur)

| Item | Statut | Preuve datée |
|---|---|---|
| Mentions bloquantes à l'émission + snapshot + référentiel docs/MENTIONS-OBLIGATOIRES.md | FAIT (code + tests) | v52-emission-guards.test.mjs |
| Documents contractuels 5.1 (CGU, confidentialité, cookies, mentions, DPA) + registre + sous-traitants | FAIT (contenu) — **validation juridique externe à obtenir avant publication** | — |
| Publication effective (AURION_LEGAL_PUBLICATION_APPROVAL=5.1 + variables d'identité) + re-acceptation | BLOQUÉ-éditeur (`npm --prefix backend run check:legal` liste les blocages) | — |
| Contrat plateforme agréée (e-facture) | BLOQUÉ-éditeur / externe | — |

## Commercial (PROMPT E)

| Item | Statut | Preuve datée |
|---|---|---|
| Stripe de bout en bout en mode test (checkout, webhook, activation, facture d'abonnement) | NON FAIT — tests d'intégration livrés, exécution console = éditeur | — |
| Prix unique configuré (aucun identifiant en dur) + webhook + clés test/production | BLOQUÉ-éditeur (docs/CONFIGURATION-STRIPE.md) | — |
| Jeu de démonstration rejouable (`npm --prefix backend run db:demo`) | FAIT (livré, garde-fou anti-production) | backend/scripts/demo-dataset.mjs |
| Guide de démarrage + support SLA pilote + argumentaire cohérent | FAIT (docs) | docs/GUIDE-DEMARRAGE-CLIENT.md, EXPLOITATION-SUPPORT.md |

## Décision de commercialisation (PROMPT F5)

À la fin du pilote 10 clients (12 semaines), les 7 critères chiffrés de docs/PILOTE-SUIVI.md sont mesurés et la décision GO/NO-GO est consignée ici avec ses données. Aucune commercialisation ouverte avant : restauration prouvée (A3), publication légale 5.1 validée, Stripe testé.
