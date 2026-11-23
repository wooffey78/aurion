# RAPPORT-BLOC-05 — Conflits, cohérence et synchronisation multi-appareils (15.4.32)

## Objectif (prompt §5-BLOC 5)
Comparaison champ par champ, deux valeurs préservées avec origine/date, règles par type, indépendance d'ordre, suppression vs modification.

## Constat (Bloc 0)
Tombstones + rejeu ordre-indépendant testés côté réplication ; mais AUCUN contrôle de concurrence sur les entités modifiées depuis deux appareils (dernière écriture gagnante silencieuse), aucune comparaison visible, aucune règle par type.

## Changements
1. **Concurrence optimiste déterministe (serveur, additive et rétro-compatible)** — `backend/src/routes/business.ts` :
   - `PATCH /clients/:id` et `PATCH /suppliers/:id` acceptent `baseUpdatedAt` (schémas zod étendus). Présent → contrôle actif : si le serveur connaît une version plus récente → **409 `CONFLICT_VERSION`** avec les DEUX valeurs (`server.{name,email,phone,address,updated_at}` + `client.updated_at` = référence de la décision) et **aucune écriture silencieuse**. Absent → comportement historique conservé (toutes les décisions existantes continuent de s'appliquer).
   - Suppression vs modification : modifier un client supprimé → **404 précis** (jamais de résurrection silencieuse).
2. **Comparaison champ par champ (UI)** — `assets/js/core/sync-ui.js` : les opérations en conflit sur clients/fournisseurs se déplient en tableau « Champ / Votre valeur (date de décision) / Valeur serveur (date) » ; les champs non divergents ne s'affichent pas ; hors connexion, la comparaison se fait à la reconnexion. Factures émises, paiements, écritures et événements réglementaires ne sont jamais réécrits silencieusement : ils restent en conflit jusqu'à décision explicite.
3. **Sémantique documentée** : le PATCH clients/fournisseurs est un « formulaire complet, dernière écriture gagnante » (l'UI envoie la fiche entière) ; la fusion champ par champ entre deux appareils passe donc par `baseUpdatedAt` (409 → comparaison → renvoi du formulaire fusionné), testé.

## Test exécuté — `backend/tests/bloc5-conflicts.test.mjs` **1/1 VERT**
Deux sessions concurrentes du même compte : A modifie (v0 → 200) ; B modifie en croyant v0 → **409 avec valeur serveur exposée** ; aucune écriture silencieuse du champ refusé ; B rejoue le formulaire fusionné avec v1 → 200, champ de A conservé + champ de B appliqué ; suppression → modification ultérieure = 404 précis ; sans base de référence, deux écritures complètes produisent un état déterministe.

## Limites (déclarées)
- Le contrôle optimiste est branché sur clients et fournisseurs (les entités les plus co-éditées) ; les documents émis suivent des règles plus strictes (refus serveur existants : ALREADY_PAID, versions, etc.) et ne sont pas réécrits par design.
- L'écran de comparaison couvre les champs clients/fournisseurs ; l'extension à d'autres entités suivra le même motif si l'usage le justifie.

## Tests de non-régression
Phase-H complète sur l'arbre final (migrations ×2, `check` avec parcours hors connexion, suite intégrale) — résultats exacts dans la livraison de session.

## Actions éditeur
Aucune. — **Confirmation** : aucun push, aucun déploiement, aucune dépense, aucune donnée réelle.

## État du bloc : **validé** (critères : comparaison champ par champ ✓, deux valeurs préservées ✓, suppression vs modification ✓, indépendance d'ordre déterministe ✓).
