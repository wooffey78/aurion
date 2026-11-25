# PROMPT — Exigences & corrections (Aurion 15.4.66 → 15.4.67)

> Consignes de l'éditeur (recette 15.4.66 en ligne) : lien-image arrondi reprenant l'avatar de
> « Mon compte », bouton Fermer en bas de fiche client (compteur complet), bulle
> « réparation smartphone/tablette » du header supprimée, horloge visible sur mobile, arrondis
> selon les règles comptables des journaux (2 décimales, pas d'arrondis intermédiaires),
> e-mails en attente + bouton « Envoyer » dans le journal de bord, PDF jamais about:blank,
> photo/avatar des fiches client, temps manuel FIXE par client, bloc scénario supprimé,
> Horizon tableau ⇄ graphique, encarts Clients/Devis en cours/Entrées prévues supprimés,
> bulles explicatives et infos temporaires retirées, Derniers documents groupés (Factures /
> Devis dépliables), TTC facturé cumulé en temps réel, remise €/% sur le TTC via bouton dédié,
> « votre session a expiré » corrigé, documents légaux mis à jour sans mention « brouillon »,
> archive nettoyée. **Ce prompt est intégré au dépôt** (`docs/PROMPT-EXIGENCES-15.4.67.md`).

## Exigences de l'éditeur → corrections livrées
1. **« le lien vers "mon compte" doit laisser la place a un lien image arrondie qui reprends l'avatar televersé dans "mon compte" »** — lien circulaire dans la barre supérieure : fetch authentifié de `/account/avatar` → image ; repli initiales du compte ; resynchronisation immédiate après téléversement (événement `aurion:avatar-updated`).
2. **« dans les fiches client, un bouton fermer doit egalement apparaitre en bas ... et tous les mecanismes de compteur temps doivent s'y appliquer »** — bouton « Fermer » en bas de fiche, branché sur la même fermeture centralisée que croix / Échap / clic hors fiche (`stop-client` : session terminée, durée accumulée préservée, comptabilisée).
3. **« dans le header, la bulle "reparation smartphone/tablette" doit disparaitre »** — `#shell-pill` retiré du bandeau et de son alimentation.
4. **« sur la version mobile, l'horloge doit rester visible (background transparent et heure en z-index) »** — plus aucun masquage ≤ 720 px : fond transparent, z-index au-dessus du bandeau, taille réduite.
5. **« pour la gestion des arrondis ... règles de comptabilité ... résultat a deux decimales, pas d'arrondis sauf règle comptable explicite contraire »** — moteur exact (BigInt, demi-point supérieur) n'arrondissant qu'aux bornes comptables : TTC→HT du document (HT = TTC ÷ (1 + taux), TVA = TTC − HT), chaque cotisation sur son assiette, km en micro-unités ; agrégats sommant des valeurs exactes avec un seul arrondi de présentation.
6. **« lorsqu'il y a des email en attente, l'information doit etre affichée dans le journal de bord ... avec un bouton "envoyer" »** — compteur `pendingEmails` exposé par `/dashboard/summary`, ligne dédiée du journal + `POST /communications/email/flush`, résultat annoncé (envoyés / échecs / restants).
7. **« lorsque je consulte un document en PDF ... ne m'affiche rien et me renvoi about blank »** — cause : `window.open('','_blank')` puis assignation différée du blob (popup bloquée = page blanche). Corrigé par une **visionneuse intégrée** (blob: autorisé par la CSP) pour fiches client / produit / fournisseur / devis / facture / justificatifs ; « Ouvrir dans un onglet » et « Télécharger » conservés ; **fiche produit PDF** créée côté serveur.
8. **« dans les fiches client, on doit pouvoir televerser une photo qui sert d'avatar au client et vient remplacer ses initiales »** — `POST /clients/:id/avatar` (≤ 3 Mo, objet précédent supprimé), bulle avec image dans la fiche ET la liste, repli initiales ; migration 124.
9. **« le temps manuel estimé d'un client reste fixe ... les calculs se font sur cette base en prenant en compte le nombre de client »** — le compteur global additionne `estimated_minutes` de chaque client DISTINCT ayant au moins une session terminée (une seule fois par client) ; la fiche applique la même valeur fixe ; baseline « 1 min/session » supprimée partout ; temps réel inchangé ; économisé = manuel − réel ≥ 0.
10. **« toute cette partie doit disparaitre : Prévision de facturation — scénario indicatif ... »** — projections HT 3/6/12 mois, bouton « Détail », cartes d'hypothèses et textes pédagogiques supprimés ; le tableau **« Horizon »** reste avec **bascule tableau ⇄ graphique** au simple clic (SVG natif, valeurs exactes au survol) ; bouton « Charges fixes » conservé.
11. **« les encarts: client, devis en cours et entreés prévues doivent egalement disparaitre ... toutes les informations temporaires ... les bulles explicative ... doivent disparaitre »** — accueil épuré (encarts et pills retirés, mises à jour périodiques réalignées par identifiants `#tm-*`) ; « **Derniers documents** » réunit **Factures** et **Devis** en sous-menus dépliables/retractables au clic.
12. **« lorsque j'ajoute une deuxieme prestation ... le prix ttc facturé au client reste au montant d'une prestation unique ... ce montant se mette a jour en temps réel »** — le champ affiche le TOTAL cumulé (base catalogue ou saisie + prestations complémentaires), maintenu par `baseTtcMain` + `applyTargetTtc()` à chaque ajout/retrait/saisie ; le serveur cumule aussi les lignes « service » dans `catalogQuoteTarget` (TTC reconstitué avec la TVA du document).
13. **« je veux que l'utilisateur puisse appliquer une remise (en euros ou en pourcentage) sur le montant ttc ... grace a un bouton prévu a cet effet ... QUE sur le montant ttc facturé au client et donc n'a d'impact que sur le calcul du CA ttc et des cotisations »** — champ + unité € / % + boutons « Appliquer la remise » / « Retirer la remise » ; le moteur déduit la remise du TTC cible avant calcul (règle contractuelle préexistante : HT = TTC ÷ (1 + taux), instantané `listPriceTtc − discountTtc`) — CA TTC et cotisations s'ajustent, HT/TVA recalculés, lignes intactes ; refus si ≥ TTC ; retirée automatiquement en calcul inverse.
14. **« regulierement aurion s'arrete de fonctionner et m'affiche une notification : votre session a expiré ... corrige ceci »** — la rotation révoquait immédiatement l'ancien refresh token : deux onglets rafraîchissant en parallèle se révoquaient en chaîne. **Fenêtre de grâce de 60 s** (migration 124) ; révocations explicites inchangées.
15. **« tu devras mettre a jour les documents legaux ... enlever la mention "brouillon" »** — six documents en **version 5.1, révision du 25 novembre 2026** (nouvelles fonctions décrites, hébergeur Render Services, Inc. identifié d'après ses conditions de service vérifiées, médiateur CM2C complété d'après cm2c.net, photographies traitées dans la politique et le DPA) ; pill « Brouillon » retirée de l'écran légal ; contrat de version aligné.
16. **« tu supprimera de l'archive les fichiers qui ne servent plus a rien pour le projet »** — 83 fichiers morts supprimés (changelogs/rapports racine 15.4.0→15.4.66, MISSION-ETAT, ODT, prompts historiques, cahier-des-charges) après vérification d'absence de référence code/test/CI.
17. **« tu devras integrer le patch au projet et non en faire un fichier a part »** — changements commités directement dans le dépôt (CHANGELOG-15.4.67.md, RAPPORT-LIVRAISON-15.4.67.md et ce prompt intégrés), publication directe sur `main` par l'atelier ; plus aucun patch séparé.

## Validation finale 15.4.67
Build Render exact **0 erreur** · typecheck **0 erreur** · check frontend **50 fichiers** · ESLint **0** · smoke **177/177** · golden calculs et lot métier rejoués · **diff de régressions mesuré contre la baseline 51d0297** (les seuls tests restants exigeant PostgreSQL sont identiques à la baseline — prouvé par rejeu). Version estampillée **15.4.67** partout (VERSION.txt, package.json, locks, `?v=15.4.67-r1`, service worker `aurion-shell-v15.4.67-r1`).

## Publication — par l'atelier, directement sur `main` (aucune commande pour vous)
Les changements sont **commités dans le projet** et poussés directement sur `main` : Render
redéploie automatiquement, aucune manipulation locale n'est requise.
- Au premier accès après déploiement : **Ctrl+F5** (le service worker `aurion-shell-v15.4.67-r1`
  remplace le cache).
- Votre clone local (`C:\Users\damie\aurion\aurion`) reste sur la 15.4.66 : pour le
  resynchroniser, une seule commande facultative — `git pull origin main`.

## Recette express
- **Header** : plus de bulle d'activité ; lien-image arrondi avec l'avatar de Mon compte ;
  horloge visible sur téléphone.
- **Fiche client** : « Fermer » en bas → compteur arrêté automatiquement ; « Photo » →
  l'image remplace les initiales.
- **Temps** : estimation fixe (10 min restent 10 min, quel que soit le nombre d'ouvertures ;
  2 clients à 10 min = 20 min).
- **Accueil** : Horizon en tableau ou graphique au clic ; documents groupés ; e-mails en
  attente → « Envoyer ».
- **Devis** : deux prestations → TTC cumulé temps réel ; remise €/% via bouton → CA TTC et
  cotisations ajustés.
- **PDF** : aperçus dans la visionneuse Aurion, plus d'onglet blanc.
- **Sessions** : plus de déconnexion multi-onglets.
