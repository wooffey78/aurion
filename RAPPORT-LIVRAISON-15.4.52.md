# RAPPORT DE LIVRAISON — Aurion 15.4.52

**Date :** 23 novembre 2026
**Base de travail :** 15.4.51 (phases A→F appliquées) — aucune fonction existante retirée
**Objet :** correction des trois anomalies constatées par l'éditeur (« requête échouée », création de chantier impossible, comptes du catalogue incohérents) + renforcement des moteurs de calcul, de gestion et de détection automatique des données.

---

## 1. Méthode : reproduction réelle avant correction

Chaque anomalie a été **reproduite dans un environnement réel** (PostgreSQL 17 local, chaîne de migrations 001→120 complète, serveur compilé, requêtes HTTP authentifiées, parcours navigateur réel) avant d'être corrigée. Les cause racines découvertes sont au nombre de **huit** — la première explainait les symptômes, les suivantes se cachaient derrière.

| # | Cause racine | Effet constaté |
|---|---|---|
| 1 | `query` (fonction) coulé en `SqlExecutor` sur 7 routes : `exec.query is not a function` | 500 « requête échouée » sur rentabilité chantier, rapport mensuel, bibliothèque prestations, fiabilité client, horaires contrat, **portail invité public**, maillon intégrité |
| 2 | `authFetch` (front) n'envoyait jamais `Content-Type: application/json` | Fastify ne parsait pas le corps → `r.body undefined` → 400 « Nom du chantier requis » **à chaque création de chantier depuis l'interface**, et même cause sur le contrat d'entretien |
| 3 | Schéma zod rejetant `location: null` | Toute création **sans lieu saisi** échouait, avec un message trompeur |
| 4 | Aucune garde d'appartenance sur `activityId`/`clientId` | Identifiant obsolète en cache → violation de clé étrangère → 500 |
| 5 | Rapport mensuel : sous-requête corrélée illégale dans un agrégat (42803) | 500 systématique |
| 6 | Bibliothèque : paramètre SQL `$1` jamais utilisé (42P18) | 500 systématique |
| 7 | Portail : colonne inexistante `quotes.currency` (42703) | **Page publique du portail client en 500 permanente** |
| 8 | Création d'activité insérait le catalogue suggéré sans dédoublonnage ni compteur ; « Suggestions métier » annonçait ensuite 0 ajouté face à des compteurs en totaux | Incohérence notif / compteurs signalée par l'éditeur |

## 2. Corrections (bug 1 : « requête échouée »)

- `db.ts` exporte désormais `sqlExecutor` (objet conforme `{ query }`) ; les 7 sites corrigés l'utilisent. Les usages `client as unknown as SqlExecutor` (transactions) restent valides — un client de transaction possède `.query`.
- Rapport mensuel : le solde dû est calculé **par facture** (sous-requête par ligne), plus d'agrégat corrélation illégale.
- Bibliothèque : la bibliothèque globale n'est pas scopée par organisation — le paramètre fantôme est supprimé.
- Portail : `currency` fixée à `'EUR'` (application mono-devise), la requête ne référence plus une colonne inexistante.
- **Front** : `authFetch` pose `Content-Type: application/json` pour tout corps texte non-FormData — correction globale qui répare tous les POST/PATCH `authFetch` (chantiers, contrats, portail admin…).

**Preuves :** 21/21 sondes HTTP vertes sur serveur réel + parcours navigateur (création de chantier et de contrat d'entretien réussies à la souris).

## 3. Corrections (bug 2 : création de chantier)

- Schéma d'entrée `.nullish()` sur lieu/notes (le formulaire envoie `location: null`).
- Message d'erreur **champ par champ** généré depuis les erreurs zod réelles (plus de « Nom requis » trompeur) ; corps absent = message explicite sur le Content-Type.
- Garde d'appartenance : `activityId`/`clientId` inconnus ignorés, chantier créé quand même, réponse portant `warnings` honnêtes (« Activité demandée introuvable dans cette organisation… »).
- **Bonus découvert en vérification navigateur** : l'écran chantiers se re-rendait **à l'infini** (boucle `bind → loadList → bind`) — DOM instable, clics parfois perdus. Remplacé par `refreshList()` qui ne réécrit que le bloc liste.

## 4. Corrections + amélioration (bug 3 : comptes catalogue)

Nouveau service `services/catalog-detection.ts` :
- **dédoublonnage insensible à la casse et aux accents** (fonction pure `splitSuggested` testée) ;
- réponse exhaustive `{added, alreadyPresent, totals}` et toast affichant les trois : « 0 ajouté(s) · déjà présents : 31 (doublons ignorés) · catalogue désormais : 15 prestations, 14 articles, 2 garanties » ;
- événement de journal `catalog_enriched` portant **exactement les mêmes chiffres** que la notification ;
- la création d'activité amorce le catalogue par le même service dédoublonné et renvoie `catalogSeeded`.

## 5. Moteurs renforcés (demande explicite de l'éditeur)

### 5.1 Moteur de calcul — `computeChantierProfitability`
Nouveaux indicateurs déterministes (compatibilité ascendante complète : tous les champs existants inchangés, seuils 80 %/100 % conservés) :

| Indicateur | Définition honnête |
|---|---|
| `restToInvoiceTtc` | devis accepté − facturé ; `null` sans devis (« n/a », jamais 0 inventé) |
| `remainingBudgetTtc` | devis accepté − coûts réels (négatif = dépassement) |
| `collectedTtc` + `collectionPct` | règlements réels (`invoice_payments`) et taux de recouvrement |
| `laborValued` | main-d'œuvre réellement valorisée (taux > 0 **et** du temps saisi) |

Raisons enrichies : « Reste à facturer : 4 000,00 € TTC sur le devis accepté. », « Encaissé à 62,5 % du facturé (…) ». Golden tests : coûts 5 240 € TTC, reste 4 000 €, budget 6 760 €, recouvrement 62,5 %.

### 5.2 Moteur de gestion — cycle de vie chantier
- `PATCH /chantiers/:id` : transitions **fermées** — `active→completed`, `completed→archived`, réouvertures `completed→active` / `archived→active` ; transition interdite = 409 avec la liste des transitions admises ;
- journal dédié par transition (`chantier_completed`, `chantier_reopened`, `chantier_archived`) ; aucun chantier supprimé (il référence les sources de vérité) ;
- édition nom/lieu/notes par le même endpoint ; filtre de liste par statut validé côté serveur + sélecteur dans l'écran ;
- l'en-tête d'activité `x-aurion-activity-id` est désormais réellement envoyé par la liste (le paramètre était ignoré jusqu'ici).

### 5.3 Détection automatique des données — catalogue apprend du terrain
Les libellés réellement employés dans les devis et factures émis (les plus fréquents d'abord, 25 maximum) absents du catalogue sont ajoutés automatiquement avec la mention « Détecté automatiquement dans vos devis et factures émis (durée et prix à confirmer) ».
**Preuve sur serveur réel :** devis portant « Remplacement vanne d'arrêt » → `detectedFromHistory: 1`, prestation présente dans le catalogue (16 au total). Déterministe, sans IA, sans invention de prix.

## 6. Vérifications (toutes exécutées, pas seulement écrites)

| Vérification | Résultat |
|---|---|
| Sondes HTTP sur serveur réel (auth, chantiers, statuts, rapports, bibliothèque, fiabilité, contrats, seed ×3, journal, portail public) | **21/21 vertes** |
| Parcours navigateur réel (connexion, création chantier sans lieu, détail rentabilité, statut, catalogue, suggestions ×2, contrat d'entretien) | **Toutes les étapes réussies** |
| Suite backend complète | **732 tests** — échecs = **exactement les 16 préexistants** de 15.4.51 (aucune régression) ; +9 tests v52 verts |
| Tests v52 (statiques + unitaires purs, golden calcul/détection) | 9/9 verts |
| ESLint front + `check-frontend` (50 fichiers) | OK |
| dist-web régénérée (`v=15.4.52-r1` partout : index.html, sw.js, manifestes, lockfiles) | OK |

## 7. Compatibilité et déploiement
- **Aucune nouvelle migration** : les migrations 001→120 suffisent ; une base 15.4.51 migrée fonctionne telle quelle.
- Réponses API rétrocompatibles : `seed-catalog` conserve `added.{services,parts,warranties}` et ajoute les nouveaux champs ; la création de chantier peut ajouter `warnings`.
- Mise à jour depuis 15.4.50/15.4.51 : remplacer le code, recompiler le backend (`npm run build`), recharger l'interface (cache service worker bumpé en `15.4.52-r1`).

## 8. Ce qui reste hors périmètre (inchangé de 15.4.51)
Les 16 échecs de tests préexistants (calibration profils v2, référentiels datés 2026, intégration S3 cloud-storage, parité locale, FEC…) n'ont pas été touchés : ce sont des sujets distincts déjà connus, aucun n'a été aggravé ni introduit. Les opérations console éditeur (OVH/Render, Stripe, publication légale) restent à la charge de l'exploitation, comme documenté dans le rapport 15.4.51.
