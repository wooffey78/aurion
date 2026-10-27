# Aurion 15.2.47 — correctifs de fiabilité

## Correctifs inclus
- Corrige le chargement du module d'accueil en déclarant asynchrone le binding de la vue qui utilise `await`.
- Corrige la réaffectation de `catalogPricing` lors du calcul et de l'édition des devis.
- Préserve les callbacks et l'état modal du parcours de configuration lors de la détection asynchrone de l'entreprise.
- Supprime un `return` dupliqué dans le flux d'installation.
- Supprime la clé `GOOGLE_NOT_CONNECTED` redéfinie dans la table de traduction API.
- Met à jour `qs` vers `6.17.0` dans le lockfile backend.
- Corrige la vérification du script d'installation des dépendances backend dans les tests.
- Aligne les versions, le cache du service worker et les références de cache-busting sur `15.2.47`.

## Vérifications
- Les assertions de version et de bootstrap sont alignées avec cette version.
- La vérification de syntaxe/imports frontend, ESLint, les tests navigateur et les correctifs de sécurité complémentaires sont ajoutés dans la suite suivante.

## Migration
Aucune migration existante n'est réécrite.
