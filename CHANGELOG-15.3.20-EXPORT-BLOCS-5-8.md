# Aurion 15.3.20 — intégration des blocs 5 à 8

Cette branche est fondée sur le commit de référence 15.3.20 eba2a831d9a37a194bef266cf6c57985d7c29787. Elle n’importe pas le fichier complet de routes de l’archive 15.3.19, afin de préserver les endpoints et comportements propres à 15.3.20.

- Bloc 5 : neutralisation des formules dans les seules cellules textuelles du CSV comptable; les valeurs numériques restent intactes.
- Bloc 6 : validation de l’année demandée pour l’export du PDF comptable; le manifeste indique si le PDF a été inclus et l’échec est journalisé.
- Bloc 7 : le manifeste ZIP compte les PDF/fichiers effectivement ajoutés et les omissions par catégorie, avec des avertissements exploitables.
- Bloc 8 : l’index des documents ne signale un fichier comme présent que lorsque ses octets ont bien été ajoutés; les chemins d’entrée d’archive dangereux sont rejetés. Les clés de stockage des documents restent omises de leurs index.
- Le commit de base 15.3.20 supprime déjà la dépendance au module de thème dans l’export comptable PDF; ce correctif existant est conservé.
- Le ZIP complet sera généré par l’action de cette branche après compilation et exécution du seul nouveau contrat de test d’intégration. Aucune suite historique n’est relancée.
- Le déploiement Render n’est pas déclenché par cette branche; les services Render restent configurés pour suivre `main`.
