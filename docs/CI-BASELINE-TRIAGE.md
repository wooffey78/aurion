# CI Aurion — baseline historique et politique stricte

La baseline `docs/BASELINE-TESTS-B0-15.3.20.json` est un relevé historique de 15.3.20. Elle sert à expliquer les anciens écarts, jamais à accepter un test rouge.

Politique actuelle :
- build, typecheck, lint, front-end, smoke, Playwright et suite backend doivent retourner le code 0 ;
- aucune assertion TAP `not ok` n'est tolérée, même si son nom figure dans l'ancienne baseline ;
- l'environnement CI utilise PostgreSQL 17 jetable, un rôle propriétaire pour les migrations et un rôle runtime distinct ;
- les migrations sont appliquées avant les tests d'intégration ;
- les journaux détaillés sont conservés comme artefacts de run.

Le rapport `validation-b0.txt` garde le nom historique pour compatibilité des artefacts, mais sa conclusion est désormais une validation stricte.

La CI ne remplace pas la protection GitHub des branches. Le dépôt doit exiger le job `quality` comme contrôle obligatoire sur les branches de fusion. Une configuration GitHub de protection de branche doit être vérifiée séparément par un administrateur.
