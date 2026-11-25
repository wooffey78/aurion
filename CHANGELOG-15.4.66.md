# CHANGELOG — 15.4.66

## Consignes de l'éditeur (recette 15.4.65 en ligne)
Compteur temps : chaque session terminée doit représenter au minimum **1 minute** de travail
manuel (et non plus 20). Un bouton « **Signé** » doit déclencher l'acceptation du devis par le
client — et donc l'intégration de ses calculs ; en attendant, les calculs ne sont pas pris en
compte. Dans la fiche client, « relancer le compteur de temps économisé » relance le compteur,
l'arrêt est **automatique à la sortie de la fiche** (le compteur ne tourne jamais indéfiniment),
et **ouvrir la fiche lance le compteur**. L'encart administration « Vue des indicateurs » doit
disparaître complètement. La bulle avatar devient un **simple lien « Mon compte »** (design
Aurion). La barre de défilement de la barre latérale passe au **bleu Aurion** (contraste).

## 1 · Compteur « Temps économisé » — baseline 1 minute
La formule harmonisée applique désormais `greatest(manual_minutes, 1)` : chaque session terminée
vaut au minimum **1 minute** de travail manuel, vos estimations s'appliquent au-delà ; temps
économisé = manuel − réel, jamais négatif. Le changement couvre le compteur global
(`/time-metrics`, `MANUAL_BASELINE_MINUTES=1`) ET les statistiques de la fiche client
(`backend/src/services/clients.ts`) — harmonisation complète. Tous les textes d'écran
(accueil, formulaire client) sont mis à jour.

## 2 · Fiche client — le compteur suit la fiche (ouvre → lance, ferme → arrête)
- **Ouvrir la fiche lance le compteur** : `startTimeSession` est appelé à l'ouverture
  (idempotent — une session déjà en cours pour ce client est conservée, une session en pause
  est relancée, la session d'un autre client lui cède la place avec durée accumulée préservée).
- **Le badge reste une commande** : « ⏱ Compteur de temps économisé en cours — cliquer pour
  mettre en pause » ⇄ « ⏸ … en pause — cliquer pour relancer ».
- **La sortie de la fiche arrête automatiquement** (croix, Échap, clic hors fiche, ouverture
  d'un autre écran) : nouvel endpoint `POST /time-sessions/stop-client` — la session ouverte
  (RUNNING comme PAUSED) est terminée avec la sémantique exacte de l'arrêt
  (`stopClientTimer`) : durée accumulée préservée, `status='completed'`, donc **comptabilisée**
  (baseline 1 min). Le compteur ne tourne jamais indéfiniment ; la garde existante à la sortie
  de la page Clients reste en ceinture de sécurité.
- La création d'un client annonce désormais : le compteur démarre à l'ouverture de la fiche et
  s'arrête à sa fermeture.

## 3 · Devis — bouton « Signé » : l'acceptation client pilote les calculs
- **Bouton « Signé »** sur chaque devis ouvert (page Devis & factures, avant « Facturer ») :
  dialogue de confirmation au design Aurion, puis `POST /quotes/:id/accept` — le statut
  `accepted` est horodaté (`accepted_at`) et écrit dans l'historique des statuts (106). Le
  devis affiche alors la pastille « Signé » (et « · Signé » dans l'historique de la fiche
  client). Les devis clos (annulés, refusés, expirés) ne peuvent plus être signés.
- **En attendant la signature, un devis n'est PAS pris en compte dans les calculs** :
  - `documentForecastEntries` (moteur partagé accueil ⇄ trésorerie) ne somme que les devis
    **signés** → « Entrées prévues » et prévisionnel de trésorerie ;
  - trésorerie : `potentialIn` = devis **non signés** uniquement (nouvelle séparation
    `signedIn` = devis signés intégrés), libellés « Devis non signés (potentiel) » et
    « Devis signés (intégrés) » ;
  - fiche client : « Devis en attente » = devis non signés ;
  - scénario indicatif : les hypothèses dérivées (volume, ticket) ne retiennent que les devis
    signés récents — textes d'aide actualisés.
- Conversion en facture (« Facturer ») inchangée ; le contrôle serveur d'acceptation (409 sur
  devis déjà clos) reste la porte finale.

## 4 · Administration — « Vue des indicateurs » supprimé complètement
La bascule « Vue diagrammes », le conteneur `#admin-charts`, la vue mémorisée
(`aurion-admin-view`) et les CSS dédiées (`.admin-charts-grid`, `.admin-view-switch`) sont
retirés ; l'import des diagrammes (devenu inutile) aussi. La section statistiques reste
affichée en **cartes chiffrées uniquement**. Contrats et harnais de vues mis à jour pour
verrouiller l'absence.

## 5 · Barre supérieure — simple lien « Mon compte » (design Aurion)
La bulle avatar (bouton rond + toute la mécanique d'image : cache Cache API, blob objet,
resynchronisation 60 s / retour d'onglet) est remplacée par un lien texte **« Mon compte »**
(`#/dashboard?view=account`) au design Aurion. L'avatar téléversé reste disponible dans la
page Mon compte (upload et affichage inchangés) ; l'événement coquille obsolète est retiré.

## 6 · Barre latérale — défilement en bleu Aurion
La barre de défilement de la sidebar (et de la navigation) passe au bleu de la marque
(`#477bff` → `#19bfff`, piste sombre), couvrant Firefox (`scrollbar-color`) et Chromium
(`::-webkit-scrollbar-thumb`) — contraste nettement supérieur au vert translucide précédent.

## 7 · Contrats et harnais
Contrats actualisés au nouveau comportement (baseline 1 min, cycle de vie de la fiche, encart
admin supprimé, libellés trésorerie, lien « Mon compte », devis signés dans les calculs). Deux
assertions préexistantes cassées à HEAD 15.4.65 sont réparées
(`accounting-truth-labels` : requête « Factures encaissées » en UNION et libellé de projection
HT du Détail). Version estampillée **15.4.66** partout (VERSION.txt, package.json, locks,
cache-busting `index.html`, service worker `aurion-shell-v15.4.66-r1`).
