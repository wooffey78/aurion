# Recette responsive et accessibilité — Aurion 15.3.4

## Résultat de cette livraison

Les règles mobiles déjà présentes dans `assets/css/app.css` ont été conservées, notamment le défilement tactile des suggestions de pièces et l’adaptation de la navigation du tableau de bord en paysage. Les contrôles CSS présents dans la suite smoke passent. Aucun navigateur avec base PostgreSQL dédiée n’était disponible ; aucune réussite visuelle ou mesure d’accessibilité n’est revendiquée.

## Recette à exécuter sur une installation locale

| Écran | Orientation | Vérifications |
|---|---|---|
| 320–360 px | Portrait | Pas de débordement horizontal, champs et boutons accessibles, menu déroulant des pièces défilable sans sélectionner un résultat au passage. |
| 375–430 px | Portrait et paysage | Clavier virtuel, hauteur dynamique, bas de page et actions non masqués, navigation du tableau de bord utilisable. |
| Tablette | Portrait et paysage | Grilles, modales, tableaux, barre latérale et sélecteur d’activité. |
| Ordinateur portable et écran large | Paysage | Contrôle des flux existants et absence de changement de mise en page involontaire. |
| Toutes tailles | Zoom et clavier | Zoom navigateur, ordre de tabulation, focus visible, labels, états d’erreur et contrastes des textes/placeholders/contrôles. |

Pour les modales de pièces, faire défiler avec le doigt au milieu d’une liste, relâcher sur une ligne, puis vérifier qu’une sélection ne survient qu’après un tap/clic distinct. Tester fermeture, retour arrière et conservation des valeurs du devis. Capturer les vues portrait/paysage et consigner navigateur, système, dimensions et zoom.

## Contrôles réalisés ici

- `npm run test:smoke` : 48 tests réussis ; cela comprend des contrats CSS/statique, pas un rendu navigateur.
- `npm run test:frontend` : analyse syntaxique des modules et vérification de leurs imports/exports.
- `npm run test:browser` : bloqué avant lancement, car `DATABASE_URL` vers une base PostgreSQL de test migrée n’est pas configurée.
- Tests sur appareils physiques, contraste mesuré sur l’ensemble de l’interface et captures visuelles : non exécutés.
