# Aurion 15.3.9

## Parcours administratif et intégrité des données

- Ajout d’une recherche textuelle et de filtres de suivi pour retrouver rapidement une démarche.
- Mise en évidence des états à traiter, en attente et terminés avec des badges lisibles et une disposition adaptée aux petits écrans.
- Remplacement des sélections multi-choix difficiles sur téléphone par des cases à cocher dans les suggestions documentaires et les pièces jointes.
- Ajout d’un bouton de nouvelle tentative après une erreur de sauvegarde et d’un rechargement explicite lorsqu’un autre onglet a enregistré une version plus récente.
- Ajout d’un numéro de révision serveur et d’un verrou de concurrence transactionnel pour éviter qu’un brouillon ancien remplace silencieusement une version plus récente.
- Enregistrement de l’état, de sa révision et de l’événement de journal dans la même transaction PostgreSQL.
- Finalisation du parcours, mise à jour de la configuration entreprise et écriture dans le journal rendues atomiques.
- Validation des clés d’étapes reçues par l’API ; migration additive `068_journey_revision_lock.sql`.
- Mise à jour des références de version et du cache web.

## Contrôle

- La nouvelle archive source est vérifiée à la création. Les tests automatisés et un scénario PostgreSQL réel ne sont pas exécutés dans cette livraison.
