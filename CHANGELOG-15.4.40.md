# CHANGELOG — Aurion 15.4.40

Version corrective des problèmes constatés sur l'installation Render 15.4.39. Conformément à la consigne éditeur, rien de ce qui fonctionnait n'a été modifié : les parcours de devis/facturation, la console d'administration (une fois les données accessibles), la connexion par mot de passe et la préparation Auth0 existante restent intacts.

## 1. Console d'administration : les 6 sections en échec sont rétablies

**Cause** : toutes les routes `/admin/*` (Statistiques, Tickets, Invités VIP, Virements en attente, Demandes de suppression, Demandes de rétractation) passent par le pool d'administration SQL. Sans `AURION_ADMIN_DATABASE_URL` sur le service Render, chaque requête échouait en 503 `ADMIN_DB_NOT_CONFIGURED` — d'où « Le serveur Aurion a rencontré une erreur » et « Les indicateurs ne sont pas disponibles ».

**Correctif** (`backend/src/db.ts`) : lorsque le pool d'administration dédié n'est pas configuré, `adminQuery`, `adminTransaction` et `logAdminAccess` basculent sur le pool principal. Ce repli est sûr : le rôle de `DATABASE_URL` a exécuté les migrations (propriétaire des tables) et la RLS 074 est `ENABLE` sans `FORCE` — le propriétaire n'est pas soumis à l'isolation tenant, la console affiche donc les vraies données inter-entreprises au lieu d'un 503. Les installations provisionnées qui définissent `AURION_ADMIN_DATABASE_URL` (rôle membre de `aurion_admin`) gardent exactement le même comportement strict qu'avant.

**Recommandation d'exploitation** : à la bascule OVH, renseigner `AURION_ADMIN_DATABASE_URL` vers un rôle dédié membre de `aurion_admin` (moindre privilège) ; le repli ne doit rester qu'un filet de sécurité pour les installations simples.

## 2. Création d'espace : les documents contractuels ne sont jamais bloquants

**Cause** : `/auth/register`, l'acceptation d'invitation VIP et `/billing/subscribe` répondaient 503 `LEGAL_DOCUMENTS_UNPUBLISHED` tant que les documents juridiques n'étaient pas publiés en version 4.0 ; l'écran de connexion désactivait le bouton « Créer mon espace » avec le message « La création de compte sera réactivée lorsque les documents contractuels auront été finalisés et publiés. »

**Correctif** (décision éditeur) : les documents non publiés ne sont plus jamais bloquants — ni côté serveur (`/auth/registration-status` renvoie désormais `available: true` dans tous les cas ; les trois portes 503 sont retirées), ni côté interface (le bouton reste actif, plus aucun message de blocage). L'acceptation explicite des CGV et de la politique de confidentialité reste exigée à l'inscription (case obligatoire + `recordAcceptances`) : c'est un consentement produit, pas une porte de publication. La finalisation et la publication des documents restent un chantier éditeur suivi par les outils juridiques existants (`check:legal` inchangé).

## 3. Devis et factures : les boutons « + Nouveau devis », « + Nouvelle facture » et « Modifier » réagissent de nouveau partout

**Cause** : `refresh()` ne rendait la vue demandée que si `pendingView` correspondait déjà à cette vue. Depuis l'écran « Devis & factures », les boutons appelaient `hooks.refresh('quote')` sans flag de navigation : `pendingView` restait sur la vue courante, `show()` n'était jamais appelé — les boutons paraissaient morts. Depuis le tableau de bord, la navigation passait le flag (`{navigation:true}`), d'où l'illusion « ça ne marche que depuis l'accueil ».

**Correctif** : le garde devient `opts.navigation || S.pendingView === id` — tout appel qui nomme explicitement une autre vue change d'écran ; les appels multi-jeux de données (`hooks.refresh(['invoices',…])` après un règlement) re-rendent la vue courante au lieu de laisser l'écran figé. Corrigés au passage : le retour automatique à la liste après enregistrement d'un devis/facture.

## 4. Connexion : clé d'accès explicite adaptative, aucun bouton inerte

- **Clé d'accès (WebAuthn) sur tous les appareils** : nouveau bouton « Continuer avec Face ID / Touch ID / Windows Hello / l'empreinte ou le code de l'appareil / votre clé de sécurité » selon la plateforme détectée (`device.js` : `supportsWebAuthn()` n'exclut plus les ordinateurs ; `platformPasskeyLabel()` adapte le libellé). L'autofill conditionnel mobile et la proposition d'activation après connexion sont conservés ; en cas d'annulation, un message explique quoi faire (mot de passe, puis activation depuis « Mon compte »).
- **Google / Auth0** : les boutons ne s'affichent que lorsque la configuration serveur est réellement complète (`/auth/google/status`, `/auth/auth0/status`) — un bouton qui ne mène nulle part n'est jamais rendu. À la place, une note discrète indique que ces méthodes attendent la configuration éditeur et que la clé d'accès fonctionne dès maintenant. Les flux OIDC/PKCE existants sont inchangés.
- **Inscription** : plus aucun blocage légal côté interface (voir §2).

## 5. Tests et paquet

- Nouveau contrat `backend/tests/editor-decisions-15.4.40.contract.test.mjs` : verrouille les quatre décisions ci-dessus (portes légales jamais bloquantes, repli administration, navigation documents, authentification adaptative sans bouton inerte).
- Contrats existants préservés : Auth0 (bouton facultatif, aucun secret côté client), publication juridique 4.0 (outil et fixture CI inchangés), isolation RLS, e2e navigateur (recette locale).
- `dist-web` régénéré depuis `assets/js` via `tools/build-web-dist.mjs`.
