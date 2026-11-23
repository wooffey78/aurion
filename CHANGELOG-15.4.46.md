# CHANGELOG — Aurion 15.4.46

Version V2 : **la suite de tests complète (182 fichiers, 660 tests) exécutée pour de vrai sur PostgreSQL** en mode provisionné à deux rôles (RLS 074 effective) — **660/660 verts, 0 ignoré** —, **accessibilité des écrans de propositions** (noms accessibles, liste sémantique), **correction d'un débordement horizontal réel sur mobile (375 px)** et **outil de rejouage du calibrage** (chantier 3 du moteur de propositions).

## 1. Suite intégrale sur PostgreSQL réel — tous les skips levés

- Le corpus backend complet (182 fichiers, 660 tests) s'exécute désormais **sans aucun skip** sur un PostgreSQL réel embarqué (17.4, binaires portables, sans privilège administrateur).
- **Mode provisionné à deux rôles reproduit** (comme l'installeur) : `aurion_runtime` (rôle applicatif, RLS réellement appliquée) + un login membre de `aurion_admin` (pool d'administration journalisé) + `AURION_RUNTIME_DB_ROLE` pour l'application des droits par le migrateur.
- Premier passage (mono-instance, rôle propriétaire) : 641/657 verts — les 16 échecs étaient **les gardes RLS 074 refusant à juste titre le rôle propriétaire/superuser** (ni superuser, ni propriétaire, ni BYPASSRLS, journal d'administration protégé, échec fermé sans contexte tenant). Reproduit en mode provisionné : **54/54 verts** puis **660/660** sur la suite intégrale.
- Aucune correction de code nécessaire côté moteur/isolation : la 15.4.45 avait déjà implémenté les droits runtime (`migrate.ts`) — le banc de test manquait simplement de l'environnement à deux rôles. `tools/recette-e2e.sh` provisionne désormais ce mode automatiquement.

## 2. Accessibilité des écrans de propositions

- **Chaque bouton « Utiliser » porte désormais un nom accessible** (« Utiliser la proposition <métier> ») dans le parcours guidé et dans le modal d'activité : un lecteur d'écran n'entend plus quatre boutons identiques sans contexte.
- **Liste sémantique** : les propositions sont rendues en `ul`/`li` (`.profile-proposal-list`), la zone reste une région vive (`aria-live="polite"`).
- Garde de régression : `backend/tests/v2-a11y-proposals.contract.test.mjs` (noms accessibles, structure de liste, styles, breakpoints mobiles).

## 3. Débordement horizontal corrigé sur mobile (375 px, vérifié au navigateur)

Trois causes combinées rendaient le parcours guidé (et donc les écrans de propositions) horizontalement scrollable sur un téléphone :
1. la carte onboarding (élément de grille) était gonflée par son contenu au-delà du viewport — `min-width:0` ajouté ;
2. la primitive de mise en page `.stack` laissait une piste de grille dépasser son conteneur — `grid-template-columns:minmax(0,1fr)` ;
3. la pilule de confiance « Très élevé — … » (sans retour à la ligne) forçait la largeur des rangées en disposition colonne — retour à la ligne autorisé à ≤ 640 px.
Vérifié au navigateur à 375×812 : `scrollWidth ≤ clientWidth`, 3/3 boutons nommés, rangées en colonne, captures livrées.

## 4. Rejouage du calibrage (chantier 3)

- `tools/calibration-replay.mjs` : rejoue le corpus de calibrage (24 combinaisons nom/description/NAF), l'invariant du signal secondaire, 19 hints NAF (nouveaux + stables) et le déterminisme du moteur — **45/45 contrôles conformes** ; rapport texte ou `--json`, code de sortie 1 en cas de dérive.
- Le corpus est désormais une **source unique** partagée : `backend/tests/fixtures/calibration-cases.mjs` (consommé par le contrat de calibration et par l'outil) — toute extension du catalogue se rejoue d'une commande, exactement comme le prévoit la conception V2.

## 5. Tests et vérifications

- Suite complète provisionnée : **660/660 verts, 0 skip** ; suite de contrat standard (V2, a11y, gardes E2E, versions…) : 0 échec ; `tsc --noEmit` + build : 0 erreur.
- `tools/recette-e2e.sh` : provisionne le mode à deux rôles et démarre le serveur de recette sous le rôle applicatif (RLS réelle) — la fumée API passe dans ce mode.
- Version harmonisée : `VERSION.txt` ×2, manifestes ×2, lockfiles ×2, `index.html`, `sw.js` en **15.4.46**.
