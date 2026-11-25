# Politique relative aux cookies et stockages du navigateur — Aurion

Version **5.1**, révision du 25 novembre 2026 pour Aurion 15.4.67 (mise à jour de la version 4.0 du 20 novembre 2026 ; les coordonnées et engagements du propriétaire sont inchangés ; révision technique compatible : droit à l'effacement en ligne depuis l'application et depuis la page publique).

Éditeur : Coulibaly Damien, EI, nom commercial Easyweb-dev. Contact : [easyfixit.reparation@gmail.com](mailto:easyfixit.reparation@gmail.com).

## Cookies de session et sécurité

| Nom | Finalité | Durée | Attributs |
|---|---|---:|---|
| `aurion_session` | Session de connexion | 30 minutes | HttpOnly, SameSite=Strict, Secure en production lorsque `COOKIE_SECURE=true` |
| `aurion_refresh` | Renouvellement de session native | 30 jours | HttpOnly, SameSite=Strict, chemin `/auth`, Secure en production |
| `aurion_google_login` | Protection de la transaction OAuth Google | 10 minutes | HttpOnly, SameSite=Lax, chemin du rappel, Secure selon configuration |

Ces cookies sont nécessaires à la connexion ou à la sécurité du service : ils ne nécessitent pas de consentement. Le navigateur peut les bloquer ou les supprimer, ce qui peut interrompre la connexion.

## Stockages locaux

Le service utilise `localStorage` pour des préférences d’affichage, l’activité sélectionnée, l’e-mail du dernier compte, un identifiant d’appareil technique et des révisions de synchronisation ; l’application utilise aussi le cache du service worker pour ses ressources statiques. Le stockage local **IndexedDB** conserve, strictement cloisonné par compte, organisation et appareil : les répliques des données métier autorisées (consultation hors connexion), la file des décisions prises hors connexion (rejouées automatiquement au retour du réseau), les documents récents téléchargés selon la politique de récence configurable, et des marqueurs techniques de synchronisation. Ces données restent sur le terminal et ne sont jamais celles d’autres comptes ; elles sont effacées lors de la déconnexion quand l’utilisateur le demande, par la révocation d’un appareil depuis Mon compte, ou en effaçant les données du site dans le navigateur. Sur les applications natives, un stockage SQLite chiffré peut remplacer IndexedDB ; il n’est pas déployé à cette version. Ces données restent sur le terminal, mais peuvent contenir une adresse e-mail ou des préférences. Elles ne sont pas des cookies. Les supprimer peut effacer ces préférences ou déconnecter l’utilisateur. Le cache local ne supprime pas les informations hébergées dans son compte.

## Traceurs tiers et mesure d’audience

Le service n’intègre aucune bibliothèque d’audience ou de publicité, ni aucun service de suivi d’erreurs ou d’observabilité côté navigateur transmis à un tiers. Une connexion facultative à Google peut être activée par l’utilisateur et entraîne alors une communication avec Google. Si une mesure d’audience, un service marketing ou un outil de suivi d’erreurs hébergé était ajouté, la présente politique serait complétée et un mécanisme de choix et de retrait serait mis en place avant sa mise en production.

## Gérer ses choix

L’utilisateur peut effacer cookies, stockage local et cache depuis les paramètres du navigateur. Cela n’efface pas son compte ou ses données Aurion; pour les demandes de données, écrire à [easyfixit.reparation@gmail.com](mailto:easyfixit.reparation@gmail.com).
