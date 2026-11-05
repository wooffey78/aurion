# Avancement Aurion 15.4.0

Livraison sous forme d'archive ZIP (aucun push GitHub ni déploiement Render n'a été effectué : pas d'accès réseau ni d'identifiants dans l'environnement de travail).
Le détail des corrections, des vérifications réellement exécutées et des points restants figure dans `RAPPORT-AURION-15.4.0.odt` à la racine.

| Bloc | Intitulé | État |
|---|---|---|
| B0 | Cadrage, base de tests | Fait (tests statiques rejoués ; build/typecheck réels à refaire en CI) |
| B1 | Retrait de l'IA | Fait, porte statique verte |
| B2 | Recherche par nom retirée, détection SIRET/SIREN améliorée | Fait |
| B3 | Propagation (source unique) | Fait (`docs/PARCOURS-15.4.0.md`) |
| B4/B5 | Parcours 8 étapes | Fait, vérifié navigateur 1280 et 360 px (API simulée) |
| B6 | Mon compte et rétractation | Fait |
| B7 | Charte graphique | Fait (jetons `:root` uniquement) ; captures 768 px à produire |
| B8 | Nettoyage, versions, Brevo | Fait |
| Cahier | Stockage cloud, quota, journal | Fait ; OAuth Google réel à valider manuellement |
| Ajout | Notes de frais | Fait |
| B9 | Non-régression complète | Partielle (dépendances npm non installables ici) |
| B10 | Release et déploiement | Non exécuté (à faire par le propriétaire) |
