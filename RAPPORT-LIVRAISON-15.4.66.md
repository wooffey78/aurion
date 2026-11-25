# RAPPORT DE LIVRAISON — 15.4.66 (signé devis = calculs intégrés · compteur 1 min lié à la fiche · administration allégée · lien Mon compte · scrollbar bleu Aurion)

Date : 25 novembre 2026 · Précédente : 15.4.65 · Patch de publication CUMULATIF (porte aussi 15.4.65) fourni, prêt à pousser sur `main` → Render.

## 1 · Consignes de l'éditeur — toutes réalisées (prouvées par contrats + harnais d'exécution)
1. **Compteur temps — minimum 1 minute par session terminée** (au lieu de 20) : moteur global (`/time-metrics`, `MANUAL_BASELINE_MINUTES=1`) ET statistiques de la fiche client harmonisés ; textes d'écran mis à jour.
2. **Bouton « Signé » sur les devis** : enregistre l'acceptation du client (`status='accepted'`, horodaté `accepted_at`, historique de statuts) — et **déclenche l'intégration des calculs**. En attendant la signature, **les calculs ne prennent pas le devis en compte** : « Entrées prévues » (moteur partagé accueil ⇄ trésorerie) ne somme que les devis signés ; la trésorerie affiche « Devis non signés (potentiel) » à part et « Devis signés (intégrés) » ; la fiche client compte « Devis en attente » hors signés ; le scénario indicatif ne dérive que des devis signés. Pastille « Signé » + historique « · Signé ».
3. **Fiche client — le compteur suit la fiche** : OUVRIR la fiche lance le compteur (idempotent : reprise d'une session en pause, cession de la place d'un autre client, durée accumulée préservée) ; le badge « ⏱ / ⏸ » met en pause et **relance** ; la SORTIE de la fiche (croix, Échap, clic dehors, autre écran) **arrête automatiquement** via le nouvel endpoint `POST /time-sessions/stop-client` — session terminée et comptabilisée, **jamais indéfiniment**.
4. **Administration : encart « Vue des indicateurs » supprimé complètement** (bascule, conteneur diagrammes, vue mémorisée, CSS dédiées, import devenu inutile) — cartes chiffrées uniquement.
5. **Bouton avatar → simple lien « Mon compte »** (design Aurion, `#/dashboard?view=account`) : bulle et toute la mécanique d'image retirées ; l'avatar téléversé reste géré dans la page Mon compte.
6. **Scrollbar de la sidebar en bleu Aurion** (#477bff → #19bfff) sous Firefox et Chromium — contraste nettement supérieur.

## 2 · Méthode
Contrats statiques mis à jour pour verrouiller chaque consigne (baseline 1 min, cycle de vie du compteur `startTimeSession`/`stopClientTimer`, absence totale de l'encart admin, libellés trésorerie, lien « Mon compte », moteur prévisionnel signés-seulement). Deux assertions préexistantes cassées à HEAD 15.4.65 réparées (`accounting-truth-labels`). Harnais de vues adapté (20 contrôles) ; harnais bind de l'éditeur inchangé et vert (calculateur, centimes).

## 3 · Vérifications (boucle complète, arbre estampillé 15.4.66)
Build Render exact **0 erreur** · typecheck **0 erreur** · smoke **177/177** · lot métier **50/50** · golden calculs **5/5** · contrats admin/temps/prévisionnel/trésorerie **verts** · smoke vues **20/20** · bind éditeur **tout réglé** · check frontend 50 fichiers · ESLint **0**. L'e2e navigateur exige PostgreSQL + Playwright (indisponibles dans le bac à sable de préparation) : il s'exécute dans la CI GitHub au push.

## 4 · Livraison
Patch de publication **cumulatif** prêt : `download/AURION-15.4.66-PUBLICATION.patch` (base `13238f7` = 15.4.64 publiée — il contient donc aussi la totalité de 15.4.65) → `git am` + `git push origin main` → déploiement Render automatique. ZIP complet : `download/AURION-15.4.66-production.zip`. Version estampillée 15.4.66 partout (VERSION.txt, package.json, locks, `?v=15.4.66-r1`, service worker `aurion-shell-v15.4.66-r1` → rechargement du cache au premier accès).

## 5 · Recette conseillée
1. **Devis** : créer un devis → « Entrées prévues » ne bouge PAS ; cliquer « Signé », confirmer → pastille verte « Signé », « Entrées prévues » intègre le TTC ; « Devis non signés (potentiel) » baisse d'autant dans Trésorerie.
2. **Fiche client** : ouvrir → badge « Compteur en cours » ; cliquer le badge → pause ; recliquer → relance ; fermer la fiche → « Compteur temps arrêté automatiquement » (la session est comptabilisée, minimum 1 min) ; rouvrir → le compteur repart. Quitter la section Clients sans fermer : arrêt de sécurité.
3. **Accueil** : « Temps économisé » affiche la formule 1 minute/session.
4. **Administration** : plus aucun encart « Vue des indicateurs » ni bascule — cartes chiffrées seules.
5. **Barre du haut** : lien « Mon compte » à la place de la bulle ; avatar toujours modifiable dans Mon compte.
6. **Sidebar** : barre de défilement bleue et contrastée.
