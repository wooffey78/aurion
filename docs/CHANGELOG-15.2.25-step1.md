# Aurion 15.2.25 — étape 1

## Forme juridique et cotisations d’activité

- Ajout d’un menu Aurion de formes juridiques françaises lors de la création/modification d’une activité.
- Détection immédiate du régime social et de la TVA après sélection.
- Ajout d’un détail persistant des cotisations par activité (`activity_contributions`).
- Pour le régime micro, préremplissage des cotisations sociales et de la contribution à la formation professionnelle avec leur taux 2026.
- Pour les régimes dont le calcul dépend du revenu ou de la rémunération, Aurion conserve une règle variable au lieu d’inventer un taux fixe.
- Le taux agrégé existant reste utilisé par le calculateur et est prérempli lorsqu’un taux fixe est déterminable.
- Les cotisations configurées sont reprises dans l’export comptable PDF/CSV.

## Non-régression

- Aucun routeur, authentification, support, paramètres d’organisation, fournisseur, paiement ou document existant n’a été supprimé.
- Nouvelle migration additive : `027_legal_form_contributions.sql`.
- Le ZIP est construit à partir de `Aurion-15.2.24-final.zip`, sans dépendance aux anciens ZIP de la Library.
