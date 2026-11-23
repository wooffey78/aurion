# CHANGELOG 15.4.52 — Correctifs runtime prouvés + moteurs renforcés

> Livraison du 23/11/2026. Cette version corrige les trois anomalies constatées par
> l'éditeur en conditions réelles (« requête échouée », création de chantier impossible,
> comptes du catalogue incohérents) et renforce les trois moteurs demandés : calcul,
> gestion, détection automatique des données. Chaque correctif a été **prouvé par
> reproduction** sur un environnement PostgreSQL 17 réel (base migrée, serveur réel,
> requêtes authentifiées) — pas seulement par des tests statiques.

## 1. Correctifs des anomalies constatées

### 1.1 « Requête échouée » — sept endpoints renvoyaient un 500 en conditions réelles
**Cause racine n°1 (exécuteur SQL)** : plusieurs routes coulaient la fonction `query`
directement en `SqlExecutor` (`query as unknown as SqlExecutor`). Un exécuteur doit
exposer une méthode `.query()` ; une fonction nue n'en a pas, d'où
`TypeError: exec.query is not a function` → réponse `{error:"INTERNAL_ERROR"}` → le
message générique « La requête a échoué. » de l'interface. Les endpoints concernés :
rentabilité d'un chantier, rapport mensuel du dirigeant, bibliothèque de prestations,
fiabilité client, horaires de contrat d'entretien, **vue publique du portail client**,
maillon d'intégrité à l'émission de facture.
**Correctif** : `db.ts` exporte `sqlExecutor` (objet conforme) ; les 7 sites l'utilisent.
**Cause racine n°2 (bugs SQL latents sous le premier)** : une fois l'exécuteur réparé,
la reproduction a révélé trois requêtes réellement invalides :
- `reports/monthly` : sous-requête corrélée illégale dans un agrégat (erreur 42803) —
  le solde dû est désormais calculé **par facture** ;
- `libraryForProfile` : paramètre `$1` jamais utilisé dans la requête (erreur 42P18) —
  la bibliothèque globale n'est pas scopée par organisation ;
- portail invité : `q.currency` n'existe pas dans le schéma (erreur 42703) — la vue
  publique plantait systématiquement ; l'application est mono-devise €.
**Preuve** : 21/21 sondes HTTP vertes sur serveur réel (voir scripts/repro-final-15452.mjs).

### 1.2 Création de chantier impossible
**Cause n°1** : le formulaire envoie `location: null` quand le lieu est vide ; le schéma
de validation refusait `null` et répondait 400 avec le message trompeur « Nom du chantier
requis ». **Correctif** : schéma `.nullish()` sur lieu et notes, et message d'erreur
**champ par champ** généré depuis les erreurs réelles.
**Cause n°2** : un identifiant d'activité ou de client obsolète (cache d'une version
précédente, activité supprimée) violait la clé étrangère → 500. **Correctif** : garde
d'appartenance — l'identifiant inconnu est ignoré, le chantier est créé et la réponse
porte un `warnings` explicite (« Activité demandée introuvable… »).
**Preuve** : POST /chantiers avec payload exact de l'interface → 200 ; avec activité
inexistante → 200 + avertissement (plus aucun 500).

### 1.3 Comptes du catalogue incohérents avec la notification
**Cause** : la création d'activité insérait déjà tout le contenu suggéré du profil
(sans dédoublonnage et sans compteur) ; le bouton « Suggestions métier » trouvait ensuite
tout existant et annonçait « 0 ajouté » pendant que les compteurs du catalogue affichaient
les totaux — trois nombres sans lien explicite. **Correctifs** :
- la création d'activité passe par le même service dédoublonné et renvoie `catalogSeeded` ;
- `POST /activities/:id/seed-catalog` renvoie désormais
  `{added, alreadyPresent, totals}` — ajoutés, déjà présents (doublons ignorés), totaux ;
- le toast affiche **les mêmes chiffres** : « X ajouté(s) · déjà présents : Y · catalogue
  désormais : Z » ;
- un événement de journal `catalog_enriched` porte exactement les mêmes nombres : la
  notification du Journal de bord et le compteur du catalogue racontent la même chose.

## 2. Moteurs renforcés (demande de l'éditeur)

### 2.1 Moteur de calcul (rentabilité chantier)
Nouveaux indicateurs déterministes, tous issus des sources de vérité (aucune invention) :
- **Reste à facturer** = devis accepté − facturé (null sans devis : honnêteté « n/a ») ;
- **Budget restant** = devis accepté − coûts réels (négatif = dépassement) ;
- **Encaissé** + taux de recouvrement depuis `invoice_payments` (règlements réels) ;
- **laborValued** : main-d'œuvre réellement valorisée (taux > 0 et du temps saisi) ;
- raisons explicites supplémentaires (« Reste à facturer : … », « Encaissé à X % du
  facturé ») ; les seuils de dérive 80 %/100 % et tous les champs existants sont inchangés
  (compatibilité ascendante testée).

### 2.2 Moteur de gestion (cycle de vie chantier)
- `PATCH /chantiers/:id` : transitions fermées et validées —
  `active→completed`, `completed→archived`, réouvertures `completed→active` et
  `archived→active` ; toute transition interdite renvoie 409 avec la liste des transitions
  admises ;
- chaque transition journalise un événement dédié (`chantier_completed`, `chantier_reopened`,
  `chantier_archived`) ; le chantier ne se supprime jamais (il référence les sources de
  vérité) ;
- édition du nom, du lieu et des notes via le même endpoint ;
- filtre de liste par statut (`GET /chantiers?status=…`, validé côté serveur) et sélecteur
  de filtre dans l'écran ;
- l'en-tête `x-aurion-activity-id` est désormais réellement envoyé par la liste des
  chantiers (le paramètre d'activité était ignoré jusqu'ici).

### 2.3 Détection automatique des données (catalogue métier)
Nouveau service `services/catalog-detection.ts`, déterministe, sans IA :
- dédoublonnage insensible à la casse **et aux accents** (`Réparation de fuite` ≡
  `reparation de fuite`) — plus de doublons à l'amorçage ;
- **détection depuis les documents émis** : les libellés réellement employés dans les
  devis et factures (les plus fréquents d'abord, 25 maximum, longueur ≥ 3) absents du
  catalogue sont ajoutés avec la mention « Détecté automatiquement dans vos devis et
  factures émis (durée et prix à confirmer) » ;
- comptes exhaustifs et vérifiés : `splitSuggested` est une fonction pure testée qui
  garantit que les compteurs annoncés correspondent exactement à ce qui est écrit.
**Preuve** : un devis portant « Remplacement vanne d'arrêt » → seed-catalog renvoie
`detectedFromHistory: 1`, la prestation apparaît dans le catalogue (16 prestations).

## 3. Front
- `catalog.js` : toast exhaustif (ajoutés / déjà présents / totaux), info vs succès.
- `chantiers.js` : nouveaux KPI (Reste à facturer, Encaissé, Budget restant), boutons de
  statut (Marquer terminé / Réouvrir / Archiver / Réactiver), filtre par statut, badge de
  statut sur chaque chantier, en-tête d'activité correct.

## 4. Tests et vérifications
- Nouveau fichier `tests/v52-runtime-fixes.test.mjs` (8 tests : statiques + unitaires
  purs, golden sur les indicateurs de calcul et la détection) — 8/8 verts.
- `tests/v52-emission-guards.test.mjs` mis à jour : il assertait **le code bogué**
  (`query as unknown as SqlExecutor`) ; il vérifie désormais `sqlExecutor`.
- Suite complète : **731 tests** (8 de plus qu'en 15.4.51), échecs = **exactement les 16
  échecs préexistants** de 15.4.51 (aucune régression, aucun échec nouveau) ;
- lint ESLint front : OK ; `check-frontend` (50 fichiers, imports/exports) : OK ;
- dist-web régénérée avec le cache-busting `v=15.4.52-r1` (index.html, sw.js, manifestes
  et lockfiles harmonisés) ;
- sondes runtime : **21/21 vertes** + preuve de détection automatique sur serveur réel.

## 5. Compatibilité
- Aucune migration nouvelle : tout est additif au niveau code ; les migrations 110–120
  existantes suffisent. Une base 15.4.51 migrée fonctionne telle quelle.
- La réponse de `seed-catalog` reste compatible : `added.{services,parts,warranties}`
  conservés, `detectedFromHistory`/`alreadyPresent`/`totals` s'ajoutent.
- Aucun changement de schéma de table, aucun changement de route existante supprimée.
