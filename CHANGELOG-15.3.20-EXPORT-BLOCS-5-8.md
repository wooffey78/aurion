# Aurion 15.3.20 — intégration des blocs 5 à 8

Cette branche est fondée sur le commit de référence 15.3.20 eba2a831d9a37a194bef266cf6c57985d7c29787. Elle n’importe pas le fichier complet de routes de l’archive 15.3.19, afin de préserver les endpoints et comportements propres à 15.3.20.

- Bloc 5 : neutralisation des formules dans les seules cellules textuelles du CSV comptable; les valeurs numériques restent intactes.
- Bloc 6 : validation de l’année demandée pour l’export du PDF comptable; le manifeste indique si le PDF a été inclus et l’échec est journalisé.
- Bloc 7 : le manifeste ZIP compte les PDF/fichiers effectivement ajoutés et les omissions par catégorie, avec des avertissements exploitables.
- Bloc 8 : l’index des documents ne signale un fichier comme présent que lorsque ses octets ont bien été ajoutés; les chemins d’entrée d’archive dangereux sont rejetés. Les clés de stockage des documents restent omises de leurs index.
- Le commit de base 15.3.20 supprime déjà la dépendance au module de thème dans l’export comptable PDF; ce correctif existant est conservé.
- Une archive source GitHub est disponible à partir du commit final de cette branche. La compilation et les tests ciblés restent à confirmer : une exécution précédente de GitHub Actions a échoué avant le démarrage des étapes.
- Le déploiement Render n’est pas déclenché par cette branche; les services Render restent configurés pour suivre `main`.


## Blocs 9 et 10 — Complétude comptable et validation cohérente

- Bloc 9 : l’export ZIP inclut un rapport comptable pour chaque activité active. Le premier rapport conserve le chemin historique; les rapports supplémentaires ont un nom distinct incluant l’activité et son identifiant. Le manifeste détaille les rapports attendus, inclus et omis.
- Bloc 10 : l’export CSV direct applique la même règle d’année que le ZIP : année entière entre 1900 et 2100, sinon année courante.
- Un nouveau contrat ciblé est ajouté. Aucun test historique n’a été relancé. Le nouveau test et la compilation restent non confirmés, car le runner GitHub Actions n’a pas démarré les étapes sur la tentative précédente.
- Aucun déploiement n’a été lancé : les services Render suivent `main`, tandis que cette branche est basée sur le commit 15.3.20 `eba2a831`.
