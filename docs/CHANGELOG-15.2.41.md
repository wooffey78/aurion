# Aurion 15.2.41 — interface claire et prévisionnel par scénario

## Changements ciblés
- Palette d’interface clarifiée : fonds blancs, bordures bleues discrètes, contraste et hiérarchie typographique orientés usage professionnel.
- Catalogue métier : catégories repliées par défaut, avec commandes accessibles pour déployer/rétracter ; une recherche qui trouve des éléments ouvre les catégories correspondantes. Les opérations métier existantes restent inchangées.
- Prévisionnel spéculatif des réparations futures, réglable par activité : réparations potentielles/clientèle mensuelle, ticket moyen TTC, coût variable par réparation, frais fixes mensuels et provision complémentaire.
- Projections à 1, 3, 6 et 12 mois : réparations, entrées, sorties et solde estimés. Les hypothèses sont persistées en base et isolées par activité.
- Les devis et factures déjà identifiés restent dans un bloc distinct de la trésorerie pour éviter de les compter deux fois dans le scénario. Les calculs de devis/factures et le routage documentaire ne sont pas modifiés.

## Limites et garde-fous
- Les projections reflètent strictement les hypothèses saisies ; elles ne sont pas des prévisions garanties. La provision est une hypothèse de simulation, pas un calcul fiscal ou social réglementaire.
- Les hypothèses initiales sont à zéro, afin de ne pas inventer un volume client, un ticket moyen ni des coûts propres à l’activité.
- Déploiement à valider par CI, migration PostgreSQL, health check et revue de la page de production.
