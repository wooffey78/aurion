# Aurion 15.2.39

## Fiabilisation et performances
- Aligner les versions des manifests npm et du lockfile avec `VERSION.txt` (15.2.39).
- Exécuter en parallèle les lectures indépendantes du résumé du tableau de bord afin de réduire l’attente cumulée des requêtes sans changer les champs ni les formules métier exposés.
- Exécuter en parallèle les deux lectures indépendantes de la comptabilité mensuelle : encaissements et écritures comptables.
- Ajouter des tests de contrat ciblés pour empêcher le retour aux attentes séquentielles et préserver la forme de la réponse du tableau de bord.

## Validation requise avant release commerciale
- Exécuter build et suite de régression complète sur le commit final.
- Relever au moins 20 échantillons par scénario de performance et comparer médiane/p95 avec la référence.
- Vérifier le déploiement `aurion-web` sur le SHA final, le health check et les routes principales.
- Réaliser les parcours navigateur, la recette finale de facturation/PDF, la vérification sauvegarde/restauration et la validation sécurité/juridique/accessibilité.
