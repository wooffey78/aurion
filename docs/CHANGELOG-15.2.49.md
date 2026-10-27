# Aurion 15.2.49 — sécurité et fiabilité du frontend

## Sécurité des comptes
- Ajoute la migration additive 061 pour l'état de vérification e-mail et les jetons à usage unique.
- L'inscription ne crée plus de session tant que l'adresse n'a pas été confirmée ; un lien à durée de vie limitée est envoyé et le renvoi est limité en fréquence.
- Le login par mot de passe bloque les comptes non vérifiés.
- La connexion Google exige une identité Google vérifiée, invalide le mot de passe d'un compte préexistant non vérifié, augmente `session_version` et révoque les sessions de rafraîchissement.
- La connexion Google refuse de choisir arbitrairement un espace lorsqu'un utilisateur possède plusieurs organisations.

## Robustesse et performances
- Ajoute un garde-fou externe CSP-compatible lorsque le frontend ne démarre pas, ainsi qu'un bouton de rechargement.
- Aligne le HTML statique de la landing avec la landing rendue par JavaScript, y compris les cartes d'installation.
- Réduit la vérification de synchronisation à une base de 20 secondes avec backoff exponentiel, ETag/If-None-Match et limite dédiée à 120 requêtes/minute.
- Ajoute le contrôle de syntaxe et de liaison des imports/exports frontend, ESLint et les tests Playwright du parcours d'inscription/vérification/connexion et des vues visibles du tableau de bord.
- Documente les variables SMTP requises sur Render et la procédure de rôles PostgreSQL.

## Contrôles CI
`npm run check` construit le backend, lance typecheck, vérification syntaxe/imports, ESLint, tests smoke et tests navigateur avec PostgreSQL et SMTP factices.
