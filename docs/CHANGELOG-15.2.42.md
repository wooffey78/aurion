# Aurion 15.2.42 — connexions d’accueil, suppression de factures et mobile

## Corrections ciblées
- La page d’accueil utilise des URL d’actifs CSS/JavaScript versionnées 15.2.42-r1 et un nouveau cache-shell pour éviter de réutiliser les scripts de la page d’accueil d’une version antérieure.
- Les appels à l’action « Commencer » et « Se connecter » reçoivent un gestionnaire de navigation explicite vers /auth et /login. Les liens et routes existants restent inchangés.
- L’action « Supprimer » est visible sur les devis et les factures, y compris les factures déjà réglées. Le dialogue de confirmation existant est conservé ; la suppression passe par la route API existante, sans réécrire les calculs de facturation ni les mouvements de paiement.
- Le plein écran indique son état actif, actualise son libellé et son attribut aria-pressed, et affiche un style distinct lorsque l’API signale le mode plein écran.
- Sur smartphone, les principales actions, titres de page, cartes et contrôles du bandeau sont centrés. Les règles de formulaire et la lisibilité des données restent préservées.

## Contrôles
- Des tests de régression couvrent les routes d’accueil, le bouton de suppression sur facture réglée, le retour d’état plein écran et les règles responsives.
- La recette navigateur manuelle et le déploiement Render restent à confirmer par la CI et l’état réel de production.
