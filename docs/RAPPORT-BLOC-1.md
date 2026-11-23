# RAPPORT BLOC 1 — Bootstrap identité, outbox et espaces de noms (14 novembre 2026)

Défaut §2.2-1 et §2.2-2 corrigés. **Aucun module reconstruit** : même moteur, même schéma de file, même liste blanche.

## Modifications (fichiers et raisons)

1. **`assets/js/core/session-identity.js` (nouveau)** — fournisseur UNIQUE d'identité et d'identifiant d'appareil : `getIdentity()` (promesse partagée, `/auth/me` résolu UNE fois par session), `deviceId()` (une seule clé `aurion.deviceId`, donnée technique — jamais métier), `resetIdentity()` à la déconnexion/changement de compte.
2. **`assets/js/core/offline-bootstrap.js` (nouveau)** — `bootstrapOffline()` : identité → ouverture coordonnée et attendue de la file outbox, de la réplication et du magasin documents dans le MÊME espace de noms (compte/organisation/appareil). Mémorisée (une seule exécution).
3. **`assets/js/core/outbox.js`** — `setOutboxOwner()` résout l'identité partagée quand elle est appelée sans argument (plus de retour silencieux) ; `outboxReady(timeoutMs)` permet à l'interception d'attendre la file ; récupération au démarrage des opérations `sending` à bail expiré (voir Bloc 4) ; dépendances déduites automatiquement (voir Bloc 4).
4. **`assets/js/core/api.js`** — l'écriture hors connexion n'est acceptée que si `outboxReady()` répond ; sinon erreur explicite (« réessayez, votre décision n'a pas été perdue ») — aucune perte silencieuse, jamais `OUTBOX_NOT_READY` invisible.
5. **`assets/js/core/sync-manager.js` / `assets/js/core/recent-documents.js`** — identité et deviceId via le fournisseur unique (le défaut `deviceId: undefined` de recent-documents est corrigé : même nsKey que outbox/réplication).
6. **`assets/js/pages/dashboard.js`** — `await bootstrapOffline()` AVANT toute interaction possible (plus d'appel sans argument) ; `resetIdentity()` à la déconnexion.

## Tests d'acceptation (exécutés réellement)

- Scénario Playwright hors connexion de bout en bout (ajouté à `backend/tests/frontend-browser.e2e.mjs`, étape « 9 · Hors connexion ») : après connexion réelle, la file est ouverte (pas d'`OUTBOX_NOT_READY`), une création client hors connexion est enregistrée durablement (compteur `pending:1` vérifié dans la page), le statut affiché est « Enregistré localement — en attente de synchronisation », puis au retour du réseau la décision est rejouée automatiquement (aucun clic), vérifiée en base PostgreSQL (1 ligne, pas de doublon) et visible dans la vue clients.
- Suites de non-régression : `npm run check` + `npm test` complets (voir rapport 15.4.29).

## Limites

Le test de changement d'UTILISATEUR sur un même appareil est couvert par la séparation par espace de noms (testée au niveau du store, bloc2) et par l'effacement contrôlé à la déconnexion ; le scénario Playwright ne couvre qu'un compte (un seul parcours automatisé).
