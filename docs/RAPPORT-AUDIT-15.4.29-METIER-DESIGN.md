# RAPPORT AUDIT 15.4.29 — Fiabilisation métier, design et juridique (14 novembre 2026)

Bloc 0 du prompt maître « fiabilisation » : **aucune modification métier** dans ce bloc ; seule cette documentation est ajoutée. Source : `aurion-15.4.29-blocs-0-8.zip` (SHA-256 vérifié `7eb5ca58c34808459d29252ae6d6f24e11e0f54eaeea4c443de654ff24a76e08`, `unzip -t` sans erreur ; le ZIP `(1)` annoncé n'étant pas dans `upload/`, la base livrée identique est utilisée — versions cohérentes 15.4.29/15.4.29, code métier strictement identique à l'arbre de travail, écarts limités aux artefacts Android générés).

## 1. Constats §2 — TOUS CONFIRMÉS (preuves exactes)

| Réf | Constat | Preuve auditée | Statut |
|---|---|---|---|
| A | Boutons Échéancier/Relance/majoration affichés même facture réglée | `docs.js:60` — `schedule-doc` rendu pour toute facture (`document_type==='invoice'` sans condition `payment_status`) ; `remind-doc` si `reminder_count<1000` (sans condition paid) ; `penalty-config` si `reminder_count===3` (sans condition paid). Serveur : 409 `ALREADY_PAID` existe (`business.ts:1472`) mais l'UI présente toujours l'action | CONFIRMÉ |
| B | Rafraîchissement après paiement | `docs.js:139` — le submit ne rafraîchit que via le générique `hooks.refresh()` de `modalForm` (vue courante) ; aucune coordination explicite comptabilité/trésorerie/compteurs/échéances | CONFIRMÉ (à coordonner) |
| C | Calendrier fiscal asynchrone sans re-rendu | `other.js:160` — `api.fiscalCalendar().then(fc=>{S.fiscalCalendar=fc;…})` met l'état à jour SANS re-rendu ; `nextDeadline` calculé au rendu (`other.js:147`) reste figé | CONFIRMÉ |
| D | Carte « Impôt estimé (VL) » toujours dans le DOM | `other.js:151` — carte rendue avec `—` si `vlOption!=='oui'` (jamais supprimée) | CONFIRMÉ |
| E | Trésorerie partielle | `business.ts:1744` — n'inclut NI le reste dû des factures partiellement payées (`total_ttc` entier pour les impayées), NI les échéanciers fractionnés, NI les notes de frais à rembourser, NI les écritures/achats ; mélange devis (potentiel) et factures (engagé) sans séparation | CONFIRMÉ |
| F | Historique mensuel limité à revenueHt | `other.js:154` — `money(m.revenueHt||0)` seul | CONFIRMÉ |
| G | Sélection 1-10 ans + `années × 12` | `other.js:31` (select `[1..10]` ans) et `other.js:47` (`S.forecastMonths=Number(ev.target.value)*12`) | CONFIRMÉ |
| H | Remplissage client partiel | `quote.js:91-93` — adresse de facturation et adresses d'intervention gérées ; e-mail/téléphone/SIRET du client sélectionné ne sont pas reportés automatiquement (formulaire ne les affiche que pour `__new__`) | CONFIRMÉ |
| I/J/K | Landing, connexion, avatar, plein écran, horloge | `index.html:33` img landing ; titres via `--radius`/clamp dans `app.css` ; avatar 38/32 px ; `dashboard.js:259` `requestFullscreen` sans garde native ; `ui.js:40` `startLocalClock` chaîne brute | CONFIRMÉ |
| M | Documents juridiques obsolètes | `docs/CGU-CGV.md`, `POLITIQUE-CONFIDENTIALITE.md`, `LEGAL-NOTICE.md`, `COOKIES.md` contiennent « 15.4.22 »/« Render » | CONFIRMÉ |

**Découvertes additionnelles** (Bloc 12) : mentions internes visibles « Bloc 9 · déclarations » (`other.js:151`), « Bloc 10 · référentiel » (`other.js:150`), « Bloc 11 — création directe… » (`quote.js:48`).

## 2. Matrice cartes/champs (extraits structurés, complète dans les blocs concernés)

| Carte/champ | Source | Endpoint | Formule actuelle | Écart |
|---|---|---|---|---|
| Prochaine échéance (calendrier fiscal) | `fiscal-calendar.ts` | `api.fiscalCalendar(year)` | 1re `dueDate>=aujourd'hui` | rendu non rafraîchi après chargement (C) |
| Impôt estimé (VL) | `accounting/by-category` | `S.accounting.byCategory.taxTotal` | taxTotal catégorisé | carte affichée même sans option (D) |
| Entrées prévues (trésorerie) | `quotes` | `/treasury/summary` | somme devis ouverts + SAV | reste dû partiel/échéanciers/notes de frais absents (E) |
| Sorties prévues | `quotes` (coûts) | `/treasury/summary` | pièces+port+MO interne+kilométrage+TVA achat+social sur devis ET factures impayées | social calculé sur CA HT des factures impayées — à documenter ; notes de frais absentes (E) |
| Historique mensuel | `accounting.ts` | `/accounting/summary` | `months[].revenueHt` seul affiché | TVA/achats/cotisations/notes non présentés (F) |
| Horizons prévision | `dashboard/summary` | `S.forecastMonths` | mois = années×12 | 1-10 ans → 4 horizons (G) |

## 3. Baseline technique (rejouée à l'identique de la livraison)

- `npm run check` et `npm test` de la 15.4.29 : **déjà exécutés sur cet arbre** (voir RAPPORT-15.4.29.md, exit 0, 464/464) — référence historique ; rejeu complet en Bloc 15 sur l'arbre final.
- Aucun test métier/design nouveau n'est encore exécutable (blocs 1-16 à venir).

## 4. Stratégie de test par bloc

- Bloc 1 : tests serveur déterministes (payé → `next_reminder_at` NULL, refus échéancier/relance/majoration, historique conservé) + conditions UI.
- Bloc 2 : tests de calcul d'échéances (mensuel/trimestriel, effet futur, fin d'année) + rendu après chargement.
- Bloc 3 : tests VL oui/non/inconnu/effet → carte absente du DOM + jamais charge effective.
- Bloc 4 : tests PostgreSQL de trésorerie (partiel/échéancier/payé/devis converti/notes de frais/tenant A/B/sans double comptage).
- Bloc 5 : réconciliation mois/sources/exports.
- Blocs 6-11 : tests DOM ciblés + non-régression parcours Playwright.
- Bloc 12-13 : recherche automatisée des motifs internes dans les ressources visibles.

## 5. Limites de l'audit

La matrice complète par carte sera étendue dans chaque bloc au fur et à mesure des corrections (Bloc 8 : matrice transversale finale). Aucune donnée réelle utilisateur n'est manipulée ; tous les tests s'exécutent sur le cluster PostgreSQL de test isolé (5433, `aurion_it078`).
