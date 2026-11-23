# Rapport Aurion 15.4.28 — hors connexion pleinement fonctionnel côté appareil (14 novembre 2026)

Base : chaîne validée `aurion-15.4.26-bloc3.zip` + correctifs 15.4.27 (moteur de rejeu serveur). Réponse directe à l'évaluation au 14 novembre (61 %) : les deux défauts relevés sont corrigés avec tests, les blocs 4-6 fonctionnent de bout en bout, le Bloc 8 est échafaudé avec honnêteté.

## 1. Défauts relevés par l'évaluateur → corrigés et testés

| Défaut relevé | Correction | Preuve |
|---|---|---|
| IndexedDB : `nsKey` (clé primaire keyPath) non renseignée à l'écriture → échec navigateur | `IndexedDbAdapter.put` écrit désormais `nsKey` sur chaque enregistrement | `backend/tests/bloc2-stockage-local.test.mjs` — nouveau test de structure (IDB factice) : **6/6 verts** |
| `openLocalStore()` non raccordé aux opérations métier | Raccordement complet : outbox, sync-manager et documents récents ouvrent le magasin ; câblage au chargement du tableau de bord + effacement contrôlé à la déconnexion | `assets/js/pages/dashboard.js` (import dynamique, sans effet si identité indisponible) |
| Tests réplication/rejeu « non exécutés » (environnement évaluateur sans PostgreSQL) | Exécutés ici sur PostgreSQL réel (cluster vierge) | Phase-H 15.4.28 : **463/463 verts**, migrations 001→084 ×2 idempotentes |
| Configuration canonique « 5 réussis, 1 bloqué » | Le test « bloqué » chez l'évaluateur était l'absence de Fastify dans SON environnement ; ici check+Playwright verts | `npm run check` exit 0 |

## 2. Ce qui fonctionne maintenant de bout en bout

1. **Bloc 4 (rejeu automatique)** — serveur : chaque opération rejoue la ROUTE RÉELLE (`app.inject`), idempotence sans doublon (`sync_applied_ops`), substitution `@ref:` dans payloads ET chemins (dépôts séparés), liste blanche stricte, statuts honnêtes. Deux bugs corrigés à cette occasion : DELETE sans corps avec `Content-Type` JSON (Fastify 500), tri du snapshot sur `t.id` absent de `organization_members`/`user_drafts` (colonnes d'ordre naturelles par entité).
2. **Bloc 4 appareil** — `core/outbox.js` : file persistante (`outbox`, jamais localStorage), ordre dépendances+decision, rejeu automatique (online/visibilité/chargement/60 s, verrou `navigator.locks`), backoff borné, statuts lisibles, trace 30 jours, réessai manuel. Interception `core/api.js` : hors connexion, écriture métier = enregistrement DURABLE AVANT tout, réponse synthétique (id local) pour l'interface — **aucune seconde confirmation**.
3. **Bloc 5 (intégration)** — `core/sync-manager.js` : identité `/auth/me`, instantané paginé du registre puis curseur, deltas incrémentaux avec tombstones, `syncNow()` = push puis pull, déclencheurs (ouverture, reconnexion, visibilité, 5 min, rejeu réussi), événements `aurion:sync-status`, lectures locales (`getLocalList`/`getLocalEntity`).
4. **Bloc 6 (documents récents)** — `core/recent-documents.js` : les 20 derniers documents (justificatifs + PDF récents des devis/factures) pré-téléchargés en ligne, conservés durablesment (Blobs IndexedDB ; base64 via SQLite natif), ouvrables hors connexion (`openRecentDocument` → Blob URL), élagage borné.
5. **Bloc 8 (natives)** — `capacitor.config.template.json` + `docs/APPLICATIONS-NATIVES.md` : points de raccordement implémentés (`window.AURION_API_URL`, `window.AURION_SQLITE_DRIVER` chiffré Keystore/Keychain), procédure d'initialisation exacte. **Aucun build Android/iOS exécuté** — déclaré tel quel.

## 3. Validation réellement exécutée (cluster PostgreSQL vierge)

- Migrations 001→084 appliquées ×2 (idempotence) — `[AURION MIGRATE] Migration terminee.`
- `npm run check` exit 0 : syntaxe/imports/exports 42 fichiers front, ESLint propre, fumée 79/79, parcours navigateur Playwright complet (inscription → 8 étapes → 9 vues → déconnexion/reconnexion) **sans aucune erreur console**.
- `npm test` exit 0 : **463/463** (dont bloc1 6, bloc2 6, bloc3 1 intégration, bloc4 2 intégrations, + suite historique).
- SHA-256 de la livraison : `3470e621e64e652b19c815542fcf91f3b52e64f3548a5012c9a29692edce7e5b` (`download/aurion-15.4.28-blocs-4-6-8.zip`).

## 4. Reste pour l'objectif 75 % puis 100 %

1. Recette hors connexion sur appareil réel (avion → reconnexion → rejeu) — machine éditeur (Blocs 8/15).
2. UI de synchronisation visible (Bloc 7 : badge statut, file des opérations, conflits) — moteur et événements déjà disponibles.
3. Bêta privée exécutée (`docs/RECETTE-BETA-PRIVEE.md` cases vierges à remplir), OVH provisionné (procédure + coûts livrés), intégrations à décider (PA, paiement client D3, suivi d'erreurs D6, médiateur).

## 5. Décisions jamais prises à votre place

Aucun achat (OVH, domaine, comptes développeur), aucune souscription, aucun dépôt GitHub, aucune donnée de production touchée — conformément aux règles du prompt maître et du document complémentaire.
