# RAPPORT DE LIVRAISON — 15.4.67 (avatar-image header · Fermer fiche + photo client · temps fixe par client · Horizon tableau⇄graphique · TTC cumulé + remise · PDF intégré · sessions stables · légaux 5.1 · archive nettoyée)

Date : 25 novembre 2026 · Précédente : 15.4.66 · **Publiée directement sur `main` par l'atelier** (commits intégrés au projet, plus aucun patch séparé) → Render redéploie automatiquement.

## 1 · Consignes de l'éditeur — toutes réalisées
1. **Lien-image arrondi « Mon compte »** : l'avatar téléversé dans Mon compte remonte dans la barre supérieure (fetch authentifié → blob, repli initiales) ; resynchronisation immédiate après téléversement.
2. **Bouton « Fermer » en bas de fiche client** : même mécanique de compteur que les autres fermetures (session terminée et comptabilisée via `/time-sessions/stop-client`).
3. **Bulle « Réparation smartphone / tablette » du header supprimée** (`#shell-pill` retiré).
4. **Horloge visible sur mobile** : fond transparent, heure au-dessus du bandeau (z-index), taille réduite.
5. **Arrondis comptables** : résultat à 2 décimales, aucun arrondi intermédiaire sauf règles explicites (TTC→HT du document, cotisations par assiette, km en micro-unités — moteur BigInt exact, golden classeur 5/5).
6. **E-mails en attente** : ligne dédiée dans le journal de bord + bouton **« Envoyer »** (flush immédiat de la boîte d'envoi, résultat annoncé).
7. **PDF corrigé** : visionneuse intégrée (blob:) pour fiches client/produit/fournisseur/devis/facture/justificatifs — plus jamais about:blank ; **fiche produit PDF** créée (`/parts/:id.pdf`).
8. **Photo/avatar client** : téléversement depuis la fiche, remplace les initiales dans la bulle à côté du nom (fiche + liste), stockage privé authentifié.
9. **Temps manuel fixe par client** : 10 min estimées = 10 min quoi qu'il arrive (2 ouvertures, 5 ouvertures) ; deux clients à 10 min = 20 min au tableau de bord ; baseline par session supprimée (global + fiche).
10. **Bloc « scénario indicatif » supprimé** ; tableau **« Horizon »** avec **bascule tableau ⇄ graphique** au clic (SVG natif) ; **encarts Clients / Devis en cours / Entrées prévues supprimés** ; **bulles explicatives et informations temporaires retirées** ; **« Derniers documents » groupé** (Factures / Devis dépliables au clic).
11. **TTC facturé au client cumulé en temps réel** (bug multi-prestations corrigé côté écran ET serveur) + **remise € ou % sur le TTC** via bouton dédié — impact limité au CA TTC et aux cotisations, HT/TVA recalculés par la règle comptable.
12. **« Votre session a expiré » corrigé** : fenêtre de grâce de 60 s sur la rotation du refresh token (deux onglets ne se révoquent plus en chaîne).
13. **Documents légaux mis à jour** (version 5.1 du 25 novembre 2026, hébergeur Render identifié, médiateur CM2C complété, photos traitées) — **mention « Brouillon » retirée** de l'écran des documents.
14. **Archive nettoyée** : 83 fichiers morts supprimés (anciens changelogs/rapports racine, prompts historiques, cahier-des-charges) sans aucune référence code/test/CI.

## 2 · Vérifications (boucle complète, arbre estampillé 15.4.67)
Build Render exact **0 erreur** · typecheck **0 erreur** · check frontend **50 fichiers** · ESLint **0** · smoke **177/177** · golden calculs et lot métier rejoués · **diff de régressions mesuré contre la baseline 51d0297** : seuls les tests exigeant PostgreSQL (absents du bac à sable) restent limités, **identiques à la baseline** (prouvé par rejeu sur l'arbre 15.4.66 avec dist construit). L'e2e navigateur et les tests d'intégration PG s'exécutent dans la CI GitHub au push.

## 3 · Livraison — intégrée au projet, plus de fichier à part
Les changements sont **commités directement dans le projet** (convention nouvelle : plus de patch séparé) et poussés sur `main` par l'atelier → Render redéploie automatiquement. **Aucune commande n'est requise de votre côté** (Ctrl+F5 au premier accès ; `git pull origin main` facultatif pour resynchroniser le clone local). Le prompt d'exigences est intégré au dépôt (`docs/PROMPT-EXIGENCES-15.4.67.md`). Version estampillée 15.4.67 partout (VERSION.txt, package.json, locks, `?v=15.4.67-r1`, service worker `aurion-shell-v15.4.67-r1` → rechargement du cache au premier accès). ZIP complet de production fourni séparément dans l'atelier.

## 4 · Recette conseillée
1. **Header** : la bulle d'activité a disparu ; le lien-image arrondi affiche l'avatar de Mon compte (initiales sans photo) ; sur téléphone l'horloge reste visible.
2. **Fiche client** : bouton « Fermer » en bas → « Compteur temps arrêté automatiquement » ; « Photo » → l'image remplace les initiales (fiche + liste).
3. **Temps** : estimez un client à 10 min, ouvrez/fermez sa fiche plusieurs fois → toujours 10 ; deux clients à 10 min → 20.
4. **Accueil** : plus d'encarts Clients/Devis en cours/Entrées prévues ni de bloc scénario ; « Horizon » bascule tableau ⇄ graphique au clic ; « Derniers documents » déplie Factures et Devis ; e-mails en attente → bouton « Envoyer ».
5. **Devis** : ajoutez deux prestations → le TTC facturé cumule en temps réel ; « Appliquer la remise » (€ ou %) → le TTC, le CA TTC et les cotisations s'ajustent ; le confirm récapitule remise comprise.
6. **PDF** : tout aperçu s'ouvre dans la visionneuse Aurion (fiche produit incluse) — plus d'onglet blanc.
7. **Sessions** : deux onglets ouverts n'entraînent plus de déconnexion.
8. **Documents légaux** : plus de pill « Brouillon », version 5.1 du 25 novembre 2026.
