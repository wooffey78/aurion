# RAPPORT-BLOC-06-07-19 — Documents récents (fraîcheur/quota/intégrité), référentiels datés, exploitation (15.4.33)

## Bloc 6-bis — Documents récents : fraîcheur, saturation, intégrité, échecs bornés

**Changements** (`assets/js/core/recent-documents.js`, `backend/src/routes/documents.ts`) :
1. **ETag faible serveur** sur `GET /documents/:id/download` : `W/"sha256(storage_key+created_at)[:24]"` ; `If-None-Match` connu → **304 sans corps** (vérification de fraîcheur sans retéléchargement).
2. **Fraîcheur client** : un document local est « périmé » dès que la réplication connaît une version postérieure (`updated_at`/`created_at` répliqué > `downloadedAt`) → retéléchargement avec `If-None-Match` ; **304 = copie locale déjà à jour** (horodatage rafraîchi, aucun octet perdu).
3. **Saturation de quota intelligente** : si le document entrant dépasse le budget, `makeRoom()` élaguera les plus anciens **hors fenêtre et non épinglés** pour un document PLUS utile (récent/épinglé/actif) — jamais d'épinglés, jamais d'originaux serveur ; si la place ne peut être libérée, échec explicite (pas de faux « disponible »).
4. **Intégrité** : `verifyStoredIntegrity()` re-vérifie par échantillon le hash SHA-256 du contenu local ; entrée corrompue supprimée (retéléchargée au prochain passage).
5. **Compteur d'échecs borné** (5 tentatives par clé, remis à zéro au succès) : plus de martèlement d'un téléchargement impossible ; reprise aux sessions suivantes.

**Test** `backend/tests/bloc6bis-7-freshness.test.mjs` — `bloc6bis` : upload réel → 200 + ETag faible → `If-None-Match` → **304** → nouvelle version → **200 avec ETag différent**. **VERT.**

## Bloc 7 — Référentiels datés globaux versionnés

**Changements** :
1. **Serveur** : `GET /micro/referential` renvoie version + historique + taux, avec **ETag de version** et `If-None-Match` → **304** (le référentiel daté — cotisations URSSAF, seuils — est vérifiable sans retéléchargement).
2. **Client** (`assets/js/core/api.js`) : `api.microReferential()` devient **cache-through** — cache local cloisonné par compte (`meta:referentials:micro` avec `{data, etag, fetchedAt}`) ; en ligne : 304 → cache servi tel quel ; hors connexion : **cache servi avec `_cachedAt` et `_stale:true`** — jamais un référentiel présenté comme frais si la version est inconnue ; `catalog.js`/`quote.js` restent inchangés (ils consomment l'objet retourné).

**Test** — `bloc7` : version + rates + catégories + historique servis, ETag présent, `If-None-Match` → 304, **401 sans authentification**. **VERT.**

## Bloc 19-partiel — Sauvegarde et restauration

- **Script `db:backup` vérifié en échec sûr** : sans `pg_dump` disponible, il échoue avec un message opérateur précis (chemin `PG_DUMP_PATH`) et **sans fichier partiel** — comportement fail-safe confirmé.
- **Drill de restauration NON exécutable dans le bac à sable** : `pg_dump`/`pg_restore` absents (PostgreSQL embarqué limité aux binaires serveur `initdb/pg_ctl/postgres`) et installation impossible (pas de root, dpkg verrouillé). Les bases de drill ont été créées, migrées, alimentées (5 clients, 3 factures) puis nettoyées — la procédure est prête : `npm run db:backup -- --out <dir>` sur la machine éditeur (ou OVH) avec les outils clients, puis `AURION_RESTORE_TARGET_URL=<base jetable> npm run db:restore:drill`, puis comparaison des compteurs et connexion applicative sur la base restaurée.
- **Reste bloqué pour la preuve finale** : exécution réelle avec outils clients + copie hors serveur (règle 3-2-1).

## Validation
Migrations ×2 (aucune nouvelle migration : uniquement routes ETag et code client), tests ci-dessus verts, non-régression complète en fin de session (voir MISSION-ETAT).

## Actions éditeur
- Bloc 19 : exécuter le drill sur une machine disposant de `pg_dump`/`pg_restore` (ou OVH), puis copier la sauvegarde hors serveur.
- Aucune dépense pour ces blocs.

## Confirmation
Aucun push, aucun déploiement, aucune dépense, aucune donnée réelle.

## État : **Blocs 6-bis et 7 validés** (critères : fraîcheur ✓, saturation ✓, intégrité ✓, référentiel versionné ✓) ; **Bloc 19 PARTIEL** (drill de restauration restant, bloqué sur outils externes).
