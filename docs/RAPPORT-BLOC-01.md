# RAPPORT-BLOC-01 — Baseline stable, versions et documentation de travail (15.4.31)

## Objectif
Corriger les incohérences de version/packaging et aligner checklist/runbook sur les décisions éditeur (Render gratuit temporaire, OVH cible), sans changement métier.

## Constat (issu du Bloc 0)
`CHECKLIST-PRE-PRODUCTION.md` (lignes 1, 3, 51, 75) et `RUNBOOK-PRODUCTION.md` (lignes 1, 13) mentionnaient « 15.4.22 » et un Render « plan payant », contredisant `render.yaml` (`plan: free`) et la décision éditeur. `LEGAL-NOTICE.md` (document vivant) décrivait aussi Render « plan payant ».

## Fichiers modifiés
- `docs/CHECKLIST-PRE-PRODUCTION.md` : titre/périmètre/version courante 15.4.30 (85 migrations ×2, check exit 0, 466/466 — résultats de session) ; case Render réécrite : gratuit/temporaire strict, OVH cible, aucune donnée client réelle après bascule.
- `docs/RUNBOOK-PRODUCTION.md` : titre 15.4.30 ; §1 recadré (OVH cible, services « non provisionnés » tant que non créés) ; case Render « **plan gratuit** (jamais Starter/payant) » ; 85 migrations ; nouveau §0 distinguant développement/démonstration, bêta privée, préproduction, production.
- `docs/LEGAL-NOTICE.md` : hébergement décrit à la réalité (Render gratuit temporaire ; OVH non provisionné, migration non exécutée).
- `VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, `CHANGELOG-15.4.0.md` → 15.4.31.

## Migration
Aucune (aucun changement de schéma).

## Tests et résultats exacts
- Recherche « plan payant » dans les documents vivants : **0 occurrence** (les rapports historiques et l'audit du Bloc 0 citent l'ancien texte comme preuve et restent inchangés).
- Vérification « 15.4.22 » dans documents vivants : CHECKLIST/RUNBOOK/LEGAL-NOTICE réécrits ; rapports historiques conservés comme preuves datées.
- Scripts Windows : 7 scripts présents, Launcher `--start-maximized` (×2), aucun `--start-fullscreen`, aucune écriture registre — contrats couverts par `bloc21-22-windows-clock.test.mjs` (vert cette session).
- Suite stricte : `npm run check` (build+typecheck+frontend+lint+fumée+browser) et `npm test` (466) rejoués au Bloc 0 **exit 0** sur base PostgreSQL neuve ; installation reproductible confirmée par `npm ci` exécuté deux fois cette session.
- Aucun test masqué : les `skip` conditionnels dépendent d'environnement réel (PostgreSQL/variables), jamais d'un échec.

## Limites
- L'exécution réelle du runbook exige les accès OVH de l'éditeur (Blocs 12-13).
- Les documents juridiques restent non publiables tant que les placeholders/coordonnées/contrats sont ouverts (Bloc 18).

## Actions éditeur
Aucune pour ce bloc.

## Confirmation
Aucun push, aucun déploiement, aucune dépense, aucune action sur données réelles.

## État du bloc : **validé** (critères : installation reproductible ✓, scripts cohérents ✓, zéro test masqué ✓, aucun changement métier non nécessaire ✓).
Livraison : `aurion-15.4.31-baseline.zip` (SHA consigné dans la livraison).
