# Aurion 15.3.11

## Parcours et coordonnées

- Le parcours commence maintenant par le prénom, le nom, les téléphones fixe/mobile et la configuration de la messagerie professionnelle.
- Les coordonnées du compte sont enregistrées une seule fois puis reprises dans la signature d’e-mail et les paramètres qui en ont besoin.
- La configuration SMTP est affichée dès le début du parcours ; les autorisations Gmail de lecture et d’envoi restent séparées et demandées au moment utile.
- Ajout d’une migration additive pour les deux téléphones du compte. Les anciens comptes conservent leurs valeurs et peuvent continuer le parcours.

## Lisibilité et identité visuelle

- Le texte sélectionné au curseur utilise maintenant une sélection bleue opaque avec texte blanc.
- Renforcement du contraste des textes secondaires, bordures, états et indications de focus.
- Le service de rendu du bundle d’identité visuelle et ses déclinaisons n’ont pas été modifiés.

## Audit IA

- Ajout de l’audit du ZIP 15.3.10 et de l’inventaire des fonctions IA observées.
- Le dépôt ne contient pas de LLM local ou de moteur d’inférence local déjà retenu. L’audit consigne les fonctions qui reposent encore sur les fournisseurs distants et les étapes bloquées faute de modèle, de SHA ou de validation de licence.
