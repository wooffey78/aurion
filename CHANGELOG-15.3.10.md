# Aurion 15.3.10

## Parcours administratif et identité visuelle

- Le parcours « entreprise à créer » suit les étapes canoniques 1, 3, 4, 5, 6 et 7. L’identification d’une entreprise et la recherche publique restent réservées au statut « existante ».
- Le statut « je ne sais pas encore » propose une clarification sans exiger d’identifiant ou de choix juridique. Les trois parcours conservent les brouillons sous leurs clés d’étapes historiques.
- Les boutons précédent, suivant, passer, le stepper, le pourcentage et les URL d’étape s’alignent sur la route visible. Une URL vers l’étape masquée est redirigée vers la prochaine étape visible.
- La préparation projet recueille prestations, clientèle, zone, organisation, calendrier, lieu et ressources à estimer. Les réponses hypothétiques d’un projet non créé ne remplacent pas l’activité ou la forme juridique de la fiche entreprise.
- L’analyse IA générique est limitée au profil d’activité. Le naming s’appuie sur un prompt visible, modifiable et copiable ; l’ouverture d’un assistant externe ne prétend pas envoyer le prompt.
- Le nom commercial est séparé de la dénomination légale et n’est transmis au brief du logo qu’après confirmation. Les noms proposés ne sont pas présentés comme juridiquement disponibles.
- Le générateur de logo conserve les identifiants historiques et ajoute positionnements, clientèles, tons, typographies, styles, compositions, palettes nommées, symboles, complexité et usages.
- Le fond de l’application est légèrement plus bleu et plus profond. Les curseurs sombres restent adaptés aux zones interactives et de saisie ; les barres de défilement sont plus larges et contrastées.
- Le cache applicatif et les métadonnées de thème sont mis à jour pour cette version.

## Données et compatibilité

- Aucun identifiant d’étape n’est renuméroté ; `data.steps['1'..'7']`, `currentStep` et `expectedRevision` restent le modèle de persistance.
- Les états de formalités, documents, logos et thèmes déjà enregistrés ne sont pas migrés ni supprimés.
- La finalisation d’un projet à créer ne requiert pas de raison sociale ni de forme juridique définitive. Un statut encore inconnu reste incomplet dans la fiche de configuration.

## Tests

- Ajout de tests unitaires pour les routes visibles, les prompts de naming/logo et les contrats du parcours conditionnel.
- La recette PostgreSQL, les intégrations IA externes réelles et les captures navigateur doivent être réalisées dans un environnement disposant des dépendances et services associés ; les limites constatées figurent dans le rapport de livraison.
