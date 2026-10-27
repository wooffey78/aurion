# Aurion 15.2.43 — rétablissement de la navigation d’accueil

## Correction ciblée
- Retrait du gestionnaire personnalisé qui annulait le comportement natif des liens « Commencer » et « Se connecter ».
- Les liens conservent leurs destinations `#/auth` et `#/login`; le routeur existant traite le changement de hash et affiche le mode création ou connexion attendu.
- Incrémentation des versions d’actifs et du cache PWA vers `15.2.43-r1` pour écarter les anciens fichiers mis en cache.
- Aucun changement aux formulaires d’authentification, appels API, calculs métier ou écrans métier.

## Vérifications
- Test de régression consacré aux destinations natives, aux deux routes d’authentification, au mécanisme `hashchange` et à l’invalidation du cache.
- La CI GitHub et le déploiement Render doivent être contrôlés après le push. La validation manuelle des deux clics dans un navigateur reste requise pour fermer la recette.
