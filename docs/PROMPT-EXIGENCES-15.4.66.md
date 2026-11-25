# PROMPT — Exigences & corrections (Aurion 15.4.65 → 15.4.66)

> Consignes de l'éditeur (recette 15.4.65 en ligne) : compteur 1 minute, bouton « Signé » qui
> pilote les calculs, compteur lié à la fiche client (lance à l'ouverture, arrêt à la sortie),
> encart « Vue des indicateurs » supprimé, lien « Mon compte » à la place de l'avatar,
> scrollbar sidebar bleu Aurion. Toutes les corrections sont verrouillées par contrats et
> prouvées par les harnais d'exécution.
>
> **Ce prompt est intégré au dépôt** (`docs/PROMPT-EXIGENCES-15.4.66.md`) : il suit le projet
> dans Git et reste consultable sur GitHub — plus de téléchargement séparé.

## Exigences de l'éditeur → corrections livrées
1. **« Chaque session terminée représente au minimum 1 minute de travail manuel et non plus 20 »** — baseline `MANUAL_BASELINE_MINUTES=1` dans le moteur global `/time-metrics` ET dans les statistiques de la fiche client (harmonisation complète) ; textes d'écran actualisés. Contrat mis à jour (baseline 1 min partout).
2. **« Ajoute un bouton "signé" pour les devis. Ce bouton déclenche l'acceptation du devis par le client et donc l'intégration des calculs actuels. En attendant, les calculs ne sont pas encore pris en compte »** — bouton **« Signé »** sur chaque devis ouvert (confirmation Aurion puis `POST /quotes/:id/accept`, statut horodaté + historique) ; pastille « Signé » après signature. **Les calculs n'intègrent que les devis signés** : « Entrées prévues » (moteur partagé accueil ⇄ trésorerie `documentForecastEntries`), prévisionnel de trésorerie (`signedIn` séparé de `potentialIn` = non signés), « Devis en attente » de la fiche client, hypothèses du scénario indicatif. Les devis clos ne peuvent plus être signés.
3. **« Le clic sur "relancer le compteur de temps économisé" relance le compteur mais l'arrêt est automatique lorsque l'on sort de la fiche client. Le compteur ne tourne pas indéfiniment. De la même manière, ouvrir la fiche du client lance le compteur »** — ouverture de fiche → `startTimeSession` (idempotent, reprise des pauses, cession de la place d'un autre client) ; badge pause ⇄ relance conservé ; sortie de fiche (croix, Échap, clic dehors, autre écran) → **`POST /time-sessions/stop-client`** : session RUNNING ou PAUSED terminée avec la sémantique exacte de l'arrêt et comptabilisée. Garde existante à la sortie de la page Clients conservée.
4. **« Dans administration, l'encart "Vue des indicateurs" doit disparaître complètement »** — bascule, conteneur diagrammes, vue mémorisée, CSS dédiées et import des diagrammes retirés ; cartes chiffrées uniquement ; contrats + harnais de vues verrouillent l'absence.
5. **« Pour le bouton de l'avatar, on met un simple lien (design aurion) : Mon compte »** — bulle supprimée AVEC toute la mécanique image (cache Cache API, blob, resynchronisations) ; lien **« Mon compte »** au design Aurion (`#/dashboard?view=account`) ; l'avatar téléversé reste géré dans la page Mon compte.
6. **« La couleur de la barre de scroll dans la sidebar n'est pas assez contrastée. Fais-la bleu Aurion »** — `#477bff` → `#19bfff` (couleur de marque : favicon, icônes plateformes) sous Firefox (`scrollbar-color`) et Chromium (`::-webkit-scrollbar-thumb`), sidebar et navigation couvertes.

## Validation finale 15.4.66
Build Render exact **0 erreur** · typecheck **0 erreur** · smoke **177/177** · lot métier **50/50** · golden calculs **5/5** · smoke vues **20/20** · bind éditeur **tout réglé** · check frontend 50 fichiers · ESLint **0** · version estampillée **15.4.66** partout (VERSION.txt, package.json, locks, `?v=15.4.66-r1`, service worker `aurion-shell-v15.4.66-r1`).

## Publication — faite par l'atelier, directement sur `main` (aucune commande pour vous)
La 15.4.66 est poussée **directement sur `main` par l'atelier** (commit « Aurion 15.4.66 » posé
au-dessus de la 15.4.65 publiée, arbre vérifié identique au contrat) : Render redéploie
automatiquement, aucune manipulation locale n'est requise.
- Au premier accès après déploiement : **Ctrl+F5** (le service worker `aurion-shell-v15.4.66-r1`
  remplace le cache).
- Votre clone local (`C:\Users\damie\aurion\aurion`) reste sur la 15.4.65 : pour le
  resynchroniser, une seule commande facultative — `git pull origin main`.
- Procédure manuelle d'archive (seulement si un jour un patch devait être appliqué à la main) :
  `git am --abort` (« no am in progress » = normal, continuer), puis `git am` du patch
  `AURION-15.4.66-PUBLICATION.patch`, puis `git push origin main`. Ce patch est
  **incrémental 15.4.65 → 15.4.66** (30 fichiers, +311/−226) et vérifié par simulation exacte :
  `13238f7` + patch 15.4.65 + `git am` incrémental → arbre final identique au contrat 15.4.66.

## Recette express
- **Devis** : créer un devis → « Entrées prévues » ne bouge pas ; « Signé » → confirmation →
  « Entrées prévues » intègre le TTC ; Trésorerie : « Devis non signés (potentiel) » baisse
  d'autant.
- **Fiche client** : ouvrir → compteur en cours ; badge → pause ⇄ relance ; fermer la fiche →
  « Compteur temps arrêté automatiquement » (session comptabilisée, minimum 1 min).
- **Administration** : plus d'encart « Vue des indicateurs » ; **barre du haut** : lien
  « Mon compte » ; **sidebar** : défilement bleu Aurion.
