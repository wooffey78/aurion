# Politique relative aux cookies et stockages du navigateur — Aurion

> **DOSSIER DE PRÉPARATION — NE PAS PUBLIER AVANT VÉRIFICATION NAVIGATEUR.** Version 2.3, Aurion 15.3.19, 30 octobre 2026. Inventaire statique du dépôt; contrôle navigateur en production encore à faire.

Éditeur déclaré : Coulibaly Damien, EI, nom commercial Easyweb-dev. Contact : [easyfixit.reparation@gmail.com](mailto:easyfixit.reparation@gmail.com).

## Cookies de session et sécurité

| Nom | Finalité | Durée observée dans le code | Attributs observés |
|---|---|---:|---|
| `aurion_session` | Session de connexion | 30 minutes | HttpOnly, SameSite=Strict, Secure en production lorsque `COOKIE_SECURE=true` |
| `aurion_refresh` | Renouvellement de session native | 30 jours | HttpOnly, SameSite=Strict, chemin `/auth`, Secure en production |
| `aurion_google_login` | Protection de la transaction OAuth Google | 10 minutes | HttpOnly, SameSite=Lax, chemin du rappel, Secure selon configuration |

Ces cookies sont nécessaires à la connexion ou à la sécurité du service. Le navigateur peut les bloquer ou les supprimer, ce qui peut interrompre la connexion. La durée effective doit être revérifiée selon le navigateur et la configuration publiée.

## Stockages locaux

Le code utilise `localStorage` pour des préférences d’affichage, l’activité sélectionnée, l’e-mail du dernier compte et des révisions de synchronisation; l’application utilise aussi le cache du service worker pour ses ressources statiques. Ces données restent sur le terminal, mais peuvent contenir une adresse e-mail ou des préférences. Elles ne sont pas des cookies. Les supprimer peut effacer ces préférences ou déconnecter l’utilisateur. Le cache local ne supprime pas les informations hébergées dans son compte.

## Traceurs tiers et mesure d’audience

L’examen statique du dépôt 15.3.19 n’a pas identifié de bibliothèque d’audience ou de publicité. Une connexion facultative à Google peut être activée par l’utilisateur et entraîne alors une communication avec Google. Aucun traceur non essentiel ne doit être activé avant le consentement applicable. Si une mesure d’audience ou un service marketing est ajouté, il faudra compléter cette politique et mettre en place un mécanisme de choix/refus et de retrait avant sa mise en production.

## Gérer ses choix

L’utilisateur peut effacer cookies, stockage local et cache depuis les paramètres du navigateur. Cela n’efface pas son compte ou ses données Aurion; pour les demandes de données, écrire à [easyfixit.reparation@gmail.com](mailto:easyfixit.reparation@gmail.com).

## À vérifier avant publication

- Contrôler en navigateur vierge les cookies et stockages réellement émis sur chaque chemin public, authentifié et Google.
- Vérifier que le service worker ne conserve aucune réponse métier ou document privé en cache.
- Confirmer qu’aucun tag, police distante, outil de support, paiement ou audience n’a été ajouté par la configuration de production.
