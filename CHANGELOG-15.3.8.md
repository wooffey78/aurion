# Aurion 15.3.8

## Parcours administratif, responsive et fiabilité des données

- Ajout d’une vue d’ensemble administrative avec compteurs d’actions, de démarches et de pièces, ainsi qu’un guide en trois étapes.
- Affichage d’un avertissement explicite et d’une action de reprise lorsque le chargement des démarches échoue.
- Adaptation de l’indicateur des sept étapes à une navigation horizontale tactile sur petit écran ; amélioration des espacements et des zones de sélection.
- Sérialisation des sauvegardes du parcours, retour visuel sur les modifications en attente et avertissement avant de quitter avec un brouillon non confirmé.
- Persistance de la bonne étape lors des transitions, y compris lorsqu’une étape est passée.
- Enregistrement du parcours avant l’accès au tableau de bord depuis son en-tête.
- Fusion des objets d’étapes au niveau PostgreSQL afin qu’une sauvegarde partielle ne remplace pas les autres étapes.
- Ajout de transactions pour créer une démarche et ses événements de journal, et pour enregistrer conjointement les métadonnées d’un document et son lien administratif.
- Invalidation du cache web pour servir les ressources 15.3.8.

## Validation

- Les scénarios PostgreSQL réel, navigateur tactile et installation Windows n’ont pas été exécutés dans cette passe.
