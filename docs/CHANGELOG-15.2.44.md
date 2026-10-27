# Aurion 15.2.44 — navigation d’accueil déclenchée directement

## Correction ciblée
- Les actions « Commencer » et « Se connecter » sont gérées par une délégation de clic au niveau du document, adaptée au rendu dynamique de la page.
- Au clic, Aurion met à jour la route attendue et appelle directement le mode de formulaire correspondant (`register` ou `login`), sans attendre uniquement `hashchange`.
- Les ancres `#/auth` et `#/login`, les routes existantes et les formulaires d’authentification sont conservés.
- Références d’actifs et cache PWA incrémentés vers `15.2.44-r1`. Aucun changement des API métier, calculs, données ou schémas.

## Vérifications
- Test de régression étendu pour la délégation, le rendu direct du mode attendu, les routes et l’invalidation du cache.
- Déploiement Render et CI à contrôler après le push. Un clic de recette réel sur desktop et smartphone reste nécessaire pour confirmer le comportement dans le navigateur utilisateur.
