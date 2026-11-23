# CHANGELOG 15.4.51 — livrable « prompts appliqués » + correctif boutons

> Livraison unique consolidant : (1) le correctif des boutons inertes de la page d'accueil
> (15.4.50-r2, identique au ZIP « fix boutons »), (2) les parties **réalisables en code** des
> phases A→F du document « AURION 15.4.50 → 100 % commercialisable » (AURION-15.4.50-PROMPTS-70-vers-100.md).
> Les opérations console (Render/OVH/Stripe) et la conduite du pilote 10 clients restent des
> statuts **BLOQUÉ-éditeur / NON FAIT** honnêtes, récapitulés dans docs/GO-LIVE-15.4.51.md.
> Voir RAPPORT-LIVRAISON-15.4.51.md pour les résultats de tests avant/après et la traçabilité.

## Correctif critique — boutons inertes (15.4.50-r2, rétro-porté)

- **Cause racine** : `assets/js/core/charts.js` contenait des casts **TypeScript** (`… as number[]`) dans un fichier JavaScript navigateur → échec de parse du module → **toute la chaîne d'import de main.js s'effondrait** (dashboard → other → charts) → l'application ne démarrait pas : la page d'accueil statique restait affichée sans gestionnaires et **tous les boutons étaient inertes** (accueil du tableau de bord, cartes d'installation, « Commencer » sans rendu du formulaire).
- **Correctif** : 3 occurrences remplacées par un filtrage JS valide (ligne dédiée `const observed = extras.filter(...)`), commentaires d'origine explicites.
- **Détection** : reproduction navigateur réelle (Playwright) ; aucun test automatisé de la 15.4.50 ne couvrait le parse navigateur — d'où l'ajout du test de contrat « Navigation — aucune régression de la délégation data-go » (v52-front-branches) qui refuse toute syntaxe TypeScript dans le front.
- **Hardening connexe** (`assets/js/config.js`) : la déviation API vers `http://127.0.0.1:4000` ne s'applique plus à toute installation locale sur un port ≠ 4000 (elle cassait l'API sur toute installation servie sur un autre port) — désormais réservée aux serveurs statiques de développement (ports 5500/5173/3000, alignés sur CORS_ORIGIN) ; l'installation locale utilise la même origine quel que soit son port.

## Phase A — recettes de production et supervision

- **A4** : listing transverse des lettres mortes côté admin (`GET /admin/outbox/dead-lettered`, lecture seule, journalisé) ; **alerte quotidienne** e-mail d'exploitation (`AURION_OPS_ALERT_EMAIL`, dé-dupliquée par jour, contenu technique sans données métier) branchée sur le worker existant ; `/health` enrichi (version, `uptimeSeconds`, `outboxDeadLettered`, `lastBackupAt`) avec lectures tolérantes aux pannes. Le rejeu motivé existant est conservé tel quel.
- **A5** : `backend/scripts/backup-nightly.mjs` — enveloppe de backup-db (dump custom + vérification + rétention) avec journal JSON daté (checksum sha256, copie secondaire `--secondary`) exposé dans `/health` via `AURION_BACKUP_LOG_PATH` ; procédure cron documentée dans RUNBOOK-PRODUCTION.md §2.
- **A2** : recette PostgreSQL réelle livrée (`backend/tests/recipe-postgres-15.4.51.integration.mjs`, gated `AURION_PG_RECIPE=1` : concurrence de numérotation, RLS, outbox→dead letter, webhooks signés) — **exécution réelle à faire sur base jetable** (sans PG, la suite complète skippe, aucune régression).
- **A7** : docs/GO-LIVE-15.4.51.md — tableau de mise en production consolidé (statuts FAIT/NON FAIT/BLOQUÉ-éditeur avec emplacement de preuve).

## Phase B — les 4 branchements UI

- **B1** : `GET /clients/:id/reliability` (moteur 15.4.50 enfin appelé) + encart « Fiabilité de paiement » sur la fiche client (score, bande, taux de retard, raisons du moteur, mention « aucune prédiction », échec non bloquant).
- **B2** : garde-fou de dérive devis→facture branché à l'émission — l'interface transmet les rubriques comparées, le **serveur recalcule** la dérive (`detectDeviation`, seuil 10 %) et exige une justification au-delà du seuil (`422 DEVIATION_JUSTIFICATION_REQUIRED`) ; justification horodatée + rubriques conservées (migration **119**) ; fenêtre de justification avec les raisons exactes du moteur.
- **B3** : maillon de chaîne d'intégrité écrit **à chaque émission de facture** (empreinte du contenu canonique : identifiant, numéro, client, totaux, lignes, échéance — idempotent, append-only) ; `recordDocumentIntegrity` déplacée dans services/integrity-chain.ts (réexport conservé) ; échec d'écriture non bloquant mais signalé (`integrityRecorded`) et journalisé ; bouton « Intégrité » sur les factures (verdict serveur, jamais recalculé côté client).
- **B4** : page PUBLIQUE du portail (`#/portail/<token>`, alias `#/portal/`) — consultation des devis partagés, acceptation avec nom de signataire horodaté, messages neutres token inconnu/révoqué, expiration dédiée, liens légaux, aucune donnée personnelle demandée au-delà du nom ; panneau de gestion sur la fiche client (création avec lien affiché une seule fois + copie, partage de devis ouvert, révocation) ; styles dédiés (mobile d'abord).

## Phase C — mentions obligatoires bloquantes

- `services/mention-gate.ts` (fonction pure) : seules `identity`, `insurance`, `mediator` sont bloquantes à l'émission de facture (`422 MENTIONS_INCOMPLETES` avant toute écriture, avec liste des champs et renvoi Paramètres) ; `vat/payment/validity/legal-warranty` restent non bloquantes (auto/détectées).
- Instantané des mentions conservé à chaque émission réussie (`quotes.mentions_snapshot`, migration **120**) — reproductibilité du document.
- Pré-vérification UI au clic « Facturer » (`GET /mentions/blocking`, même moteur) : écran de **résolution** (liste + bouton « Compléter dans Paramètres »), jamais un mur ; grandfathering documenté (aucun re-contrôle rétroactif).
- Référentiel partagé docs/MENTIONS-OBLIGATOIRES.md ; `check:legal` vérifie la cohérence référentiel ↔ `BLOCKING_MENTION_KEYS` et exige la cohérence en `--strict`.

## Phase D — documents contractuels 5.0 et DPA

- Version contractuelle **4.0 → 5.0** : CGU (5 nouvelles sections : portail, webhooks, e-facture préparatoire, contrats d'entretien, re-acceptation versionnée) et politique de confidentialité (3 nouvelles sections : données portail, webhooks/lettres mortes, chaîne d'intégrité) — ajouts marqués « à validation juridique externe ».
- **DPA-RGPD.md** (nouveau) : contrat de sous-traitance art. 28 construit sur les réalités du produit ; ajouté aux documents contractuels (`LEGAL_SEEDS`), à l'acceptation à l'inscription et à la liste exigée par `legalDocumentsReadyForContracts` (5 catégories) ; fixture CI Stripe alignée (5 catégories) ; test de contrat mis à jour.
- **Re-acceptation versionnée** : `GET /legal/acceptance-status` + `POST /legal/accept` (acceptation datée, IP hachée) + bannière de mise à jour dans le tableau de bord (documents en brouillon jamais bloquants — décision éditeur 15.4.40 conservée ; le blocage dur des écritures reste une décision distincte, insertion point identifié dans plugins/auth.ts).
- docs/REGISTRE-TRAITEMENTS.md (nouveau) et docs/SOUS-TRAITANTS.md (mise à jour datée : plateforme agréée « à venir »).

## Phase E — préparation commerciale

- **E2** : jeu de démonstration réaliste (`npm --prefix backend run db:demo`) — 3 organisations métier, clients, devis/factures aux états démonstratifs (fiabilité, dérive justifiée, devis à partager au portail), idempotent, **garde-fou anti-production** (refus des URLs hébergées sans `--force`), aucun e-mail envoyé, aucune donnée juridique inventée.
- **E3** : docs/GUIDE-DEMARRAGE-CLIENT.md (première facture en 30 minutes, aligné sur la checklist réelle : identité légale et mentions obligatoires d'abord — la porte bloquante rend ces étapes structurantes).
- **E4** : SLA pilote formalisé dans docs/EXPLOITATION-SUPPORT.md (48 h ouvrées, P1/P2/P3, journal) + exploitation des lettres mortes documentée.
- **E5** : docs/TARIFS-ABONNEMENT.md (source de vérité du prix, alignée sur le code : essai **60 jours** réel du moteur, pas 14) et docs/COMMERCIAL-ARGUMENTAIRE.md (pitch, démo 10 min, objections/réponses). **E1** : runbook console docs/CONFIGURATION-STRIPE.md (l'activation reste éditeur).

## Phase F — pilote (artefacts)

- docs/CONTRAT-PILOTE.md (gratuité 3 mois, engagements réciproques, -50 % an 1) et docs/PILOTE-SUIVI.md (tableau hebdomadaire sans métrique inventée, journal de triage, **7 critères de go/no-go écrits avant le pilote**).

## Technique

- `check:legal` : porte 5.0 + cohérence mentions (sortie enrichie, échec `--strict` si divergence).
- Version : VERSION.txt, package.json racine et backend → **15.4.51**.
- Tests ajoutés : `v51-ops-supervision.contract.test.mjs`, `v52-emission-guards.test.mjs` (unitaires + contrats), `v52-front-branches.contract.test.mjs`, `recipe-postgres-15.4.51.integration.mjs` (gated) ; `legal-publication-version.contract.test.mjs` mis à jour (5.0 + DPA).
- Migrations additives : 119 (dériver), 120 (mentions) — idempotentes, aucune réécriture.
- Conforme à la méthode du dépôt : aucun retrait de fonction, aucune migration destructive, aucun secret dans les sources, statuts honnêtes.
