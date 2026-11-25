# CHANGELOG — 15.4.67

## Consignes de l'éditeur (recette 15.4.66 en ligne)
La barre supérieure doit afficher un **lien-image arrondi** reprenant l'avatar téléversé dans
« Mon compte ». Dans la fiche client, un **bouton Fermer** doit apparaître en bas — tous les
mécanismes du compteur de temps s'y appliquent. La bulle « Réparation smartphone / tablette »
du header doit disparaître. Sur mobile, **l'horloge reste visible** (fond transparent, heure au-dessus).
**Arrondis** : appliquer les règles comptables des journaux — résultat à deux décimales,
aucun arrondi intermédiaire sauf règle comptable explicite contraire. Les **e-mails en attente**
s'affichent dans le journal de bord avec un bouton « Envoyer ». La consultation **PDF** des
documents (fiche client, fiche produit, fiche fournisseur, facture, devis) renvoie vers
about:blank — corriger. Les fiches client acceptent une **photo/avatar** qui remplace les
initiales. Le **temps manuel estimé d'un client reste fixe** (compté une fois par client, jamais
par session). Le bloc « Prévision de facturation — scénario indicatif » disparaît ; le tableau
**« Horizon »** s'affiche au choix en tableau ou en graphique (bascule au clic). Les encarts
**Clients, Devis en cours, Entrées prévues** disparaissent du tableau de bord, ainsi que les
**bulles explicatives** et les informations temporaires. « Derniers documents » réunit
**factures et devis en sous-menus dépliables**. Le **TTC facturé au client** cumule les
prestations en temps réel ; une **remise (€ ou %)** s'applique au TTC via un bouton dédié et ne
touche que le CA TTC et les cotisations. Les déconnexions « votre session a expiré » cessent.
Les documents légaux sont mis à jour (plus de mention « brouillon ») et l'archive est nettoyée.

## 1 · Barre supérieure — lien-image arrondi « Mon compte » et bulle d'activité supprimée
Le lien « Mon compte » devient un **lien-image circulaire** : l'avatar téléversé dans
« Mon compte » (fetch authentifié, blob) le remonte dès le chargement du tableau de bord et à
chaque mise à jour (événement dédié) ; sans photo, les **initiales du compte** s'affichent.
La **bulle d'activité du header** (ex. « Réparation smartphone / tablette ») est supprimée
avec son alimentation `#shell-pill`. Sur mobile, la **bulle d'erreur « session expirée »**
reste la seule notification légitime (voir § 8).

## 2 · Fiche client — bouton « Fermer » en bas + photo/avatar
- **Bouton « Fermer »** en bas de fiche : il déclenche EXACTEMENT la même fermeture que la
  croix, Échap ou le clic hors fiche — `close()` → `POST /time-sessions/stop-client` : session
  RUNNING ou PAUSED terminée, durée accumulée préservée, session **comptabilisée**.
- **Photo de fiche client** : bouton « Photo » → `POST /clients/:id/avatar` (PNG/JPEG/WebP
  ≤ 3 Mo, stockage privé, objet précédent supprimé). L'image **remplace les initiales** dans la
  bulle à côté du nom — dans la fiche ET dans la liste des clients (lecture authentifiée,
  repli initiales en cas d'échec). Migration 124 (`clients.avatar_key`).

## 3 · Temps manuel — valeur FIXE par client (fin de la baseline par session)
**Règle éditeur** : si un client est estimé à 10 minutes, interagir deux fois avec sa fiche
reste **10 minutes** ; deux clients estimés à 10 minutes chacun font **20 minutes**. Le compteur
global `/time-metrics` additionne désormais l'estimation (`clients.estimated_minutes`) de chaque
client **distinct** ayant au moins une session terminée — **une seule fois par client** — et la
fiche client applique la même valeur fixe (`estimated − réel`). La baseline « 1 minute par
session » est supprimée partout ; le temps réel reste la somme exacte des durées ; temps
économisé = manuel − réel, jamais négatif ; moyenne = économisé / sessions.

## 4 · Tableau de bord — épuré pour les premiers utilisateurs
- **Supprimés** : encarts « Clients », « Devis en cours », « Entrées prévues », pill
  « Mesure cumulée », pill « À surveiller », textes d'aide pédagogiques du panneau temps,
  et tout le bloc « **Prévision de facturation — scénario indicatif** » (projections HT
  3/6/12 mois, bouton « Détail », cartes d'hypothèses).
- **Horizon de facturation** : le tableau 1/3/6/12 mois reste, avec une **bascule
  tableau ⇄ graphique au simple clic** (graphique SVG natif : barres groupées entrées /
  sorties / solde, valeurs exactes au survol). Le bouton « Charges fixes » reste fonctionnel.
- **Derniers documents** : deux sous-menus **Factures** et **Devis** (5 plus récents chacun),
  dépliables et retractables au clic.
- **Journal de bord** : quand des **e-mails sont en attente** (boîte d'envoi), une ligne
  dédiée s'affiche avec un bouton **« Envoyer »** qui tente l'envoi immédiat de la file
  (`POST /communications/email/flush`) et rend le résultat (envoyés / échecs / restants).
- Le compteur « Temps économisé » porte les **identifiants dédiés** (`#tm-*`) pour un
  rafraîchissement périodique exact.

## 5 · Éditeur devis/factures — TTC cumulé en temps réel + remise dédiée
- **Bug corrigé** : à l'ajout d'une prestation complémentaire, le « Prix TTC facturé au client »
  restait au montant d'une prestation unique — l'override catalogue (`catalogQuoteTarget`)
  écrasait le total en ne lisant que la prestation principale. Désormais le **champ affiche le
  TOTAL cumulé en temps réel** (base catalogue ou base saisie + toutes les prestations
  complémentaires), le serveur cumule aussi les lignes « service » (reconstituées en TTC avec la
  TVA du document), et le calculateur/moteur reçoivent le TTC complet.
- **Remise TTC** : champ montant + unité **€ ou %**, bouton **« Appliquer la remise »** (et
  « Retirer la remise »). Elle est déduite du TTC cible **avant calcul** par le moteur exact
  (règle déjà contractuelle : HT = TTC ÷ (1 + taux), instantané tracé `listPriceTtc −
  discountTtc`) — donc le **CA TTC et les cotisations s'ajustent** et le HT/TVA du document se
  recalculent, sans jamais toucher les lignes. Refusée si elle atteint le TTC ou en calcul
  inverse (retirée automatiquement avec information).
- **Confirmation** : le récapitulatif avant enregistrement porte le total cumulé et la remise.

## 6 · Comptabilité — règles de journaux appliquées
Règle appliquée : **résultat à deux décimales, aucun arrondi intermédiaire sauf règle
comptable explicite**. Le moteur (arithmétique exacte BigInt, demi-point supérieur) n'arrondit
qu'aux bornes prévues : conversion TTC→HT du document (HT = TTC ÷ (1 + taux), TVA = TTC − HT),
chaque cotisation sur son assiette, kilométrage en micro-unités. Les agrégats du tableau de
bord et de trésorerie somment des valeurs exactes et ne présentent qu'un arrondi final ; le
classeur de référence (golden 5/5) reste la norme. Les affichages restent en 2 décimales.

## 7 · PDF — visionneuse intégrée (fin des about:blank)
Tous les aperçus PDF (fiche client, fiche produit, fiche fournisseur, devis, facture,
justificatifs) s'ouvrent désormais dans une **visionneuse intégrée** d'Aurion (blob: autorisé
par la CSP) avec « Ouvrir dans un onglet » et « Télécharger ». Plus aucun `window.open('')`
différé — donc plus jamais d'onglet **about:blank** ni de popup bloquée (notamment mobile).
Nouveau : **fiche produit PDF** (`GET /parts/:id.pdf`, pdfkit) et bouton « Fiche PDF » dans la
fiche de consultation du catalogue.

## 8 · Sessions — fin des déconnexions « votre session a expiré »
Cause racine : la rotation du refresh token **révoquait immédiatement** l'ancien jeton — deux
onglets (ou deux requêtes) qui rafraîchissaient en parallèle se révoquaient en chaîne.
Désormais une **fenêtre de grâce de 60 secondes** (migration 124) laisse un jeton fraîchement
roté finir sa course ; passé ce délai il reste invalide. Les déconnexions multi-onglets
disparaissent sans affaiblir la révocation (déconnexion, déconnexion globale).

## 9 · Documents légaux mis à jour — plus de mention « brouillon »
Les six documents (CGU-CGV, Confidentialité, Cookies, Mentions légales, DPA, Accessibilité)
passent en **version 5.1, révision du 25 novembre 2026** : nouvelles fonctions décrites
(« Signé », remises, photos de fiches, visionneuse, e-mails en attente), **hébergeur identifié**
(Render Services, Inc. — conditions de service vérifiées), **coordonnées officielles du
médiateur CM2C** complétées (cm2c.net), photographies de fiches clients traitées dans la
politique et le DPA. La **pill « Brouillon »** disparaît de l'écran des documents légaux.
Contrat de version légale aligné (merge-15.4.35).

## 10 · Archive nettoyée
83 fichiers morts supprimés : anciens CHANGELOG/RAPPORT/CONSOLIDATION racine (15.4.0 → 15.4.66),
MISSION-ETAT, RAPPORT-AURION-15.4.0.odt, docs de prompts historiques (15.4.48/50/52) et
cahier-des-charges/. Aucune référence code/test/CI n'y pointait (vérifié par recherche).

## 11 · Contrats et harnais
Contrats mis à jour au nouveau comportement verrouillé : encarts supprimés, Horizon à bascule,
documents groupés, temps fixe par client (global + fiche), TTC cumulé + remise, lien-image
avatar, horloge mobile, badge compteur, légaux 5.1. Build Render exact 0 erreur · typecheck
0 erreur · check frontend 50 fichiers · ESLint 0 · smoke 177/177 · lot métier et golden
rejoués · diffs de régressions mesurés contre la baseline 51d0297 (seuls les tests exigeant
PostgreSQL restent limités au bac à sable, identiques à la baseline). Version estampillée
**15.4.67** partout (VERSION.txt, package.json, locks, `?v=15.4.67-r1`, service worker
`aurion-shell-v15.4.67-r1`).
