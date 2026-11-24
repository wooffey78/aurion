# CHANGELOG — 15.4.63

## Constat d'entrée
Neuf dysfonctionnements ou exigences nouveaux, sans toucher à ce qui fonctionne. Un incident
d'outillage a été corrigé pendant la session (aucun impact produit).

## 1 · Administration — encarts OU diagrammes (exclusifs)
Une seule bascule : un clic affiche les diagrammes, un nouveau clic revient à la vue chiffrée
classique. Les deux vues sont mutuellement exclusives et le choix est mémorisé
(`aurion-admin-view`). Les diagrammes adoptent le design Aurion (panneaux verre dépoli,
typographie et palette du thème — plus de couleurs importées).

## 2 · Pied de page — « Développement & support : EasyWeb-dev »
L'adresse e-mail est remplacée par la mention EasyWeb-dev (toutes les pages).

## 3 · Avatar — la bulle n'affiche plus jamais « rien »
La bulle de la barre supérieure reçoit une initiale statique dans le HTML (aucun instant sans
contenu), la barre supérieure tolère l'absence de société/activité (plus aucun blocage qui
laissait la bulle vide) et la page Compte garde ses initiales toujours rendues sous l'image.

## 4 · Modèles de documents — exemples plus petits, espace réellement visible
Les cartes d'aperçu sont rétrécies (anneau 205px max) ; l'écart entre cartes est **garanti par
construction** : le rayon latéral est calculé à partir des demi-largeurs projetées pour laisser
≥ ~40px entre la carte de face et ses voisines (≈ 50-100px sur PC), l'anneau est plus profond
(600px) et la scène élargie. Les aperçus réservent leurs dimensions (plus de saut au chargement).

## 5 · Petits sauts de pages corrigés
Dimensions réservées pour les aperçus de modèles, hauteurs stables pour les blocs dynamiques
(diagrammes d'administration, détail prévisionnel) — plus de reflow au chargement des images.

## 6 · « Prévision de facturation — scénario indicatif » (Détail) — fonctionne
Le Détail affichait trois zéros parce qu'il lisait les compteurs backend (paiements réels),
souvent vides. Désormais il montre les **projections HT du scénario lui-même** (volume × ticket
HT de vos documents, horizons 3/6/12 mois) + le réalisé encaissé du mois — des chiffres réels,
cohérents avec le tableau du scénario.

## 7 · Encarts comptables (Encaissements HT, TVA, cotisations, factures encaissées, kilométrage) — fonctionnent
Quand le résumé serveur est vide alors que vos factures portent des montants encaissés, Aurion
calcule les encarts **localement sur vos documents réels** (mêmes règles que le moteur :
TTC ÷ (1+TVA) = HT, cotisations sur le HT, kilométrage facturé) avec une note de repli — plus
de zéros trompeurs quand les données existent.

## 8 · Devis & factures — plus de ligne de pièce automatique + multi-prestations
- Le choix d'une prestation n'ajoute **plus jamais** une ligne de pièce automatiquement
  (l'ajout est manuel, les suggestions restent disponibles).
- Nouveau bloc **« Prestations complémentaires »** : ajoutez/retirez autant de réparations
  supplémentaires que nécessaire (suggestions des prestations, prix TTC), elles s'intègrent aux
  calculs (HT, TVA, TTC, cotisations), au PDF et à l'export comptable (lignes « service »).

## 9 · Compteur temps — automatique
- Le compteur s'arrête **dès la facturation** (côté serveur, que l'e-mail parte ou non).
- Quitter la fiche client arrête automatiquement le compteur (alerte discrète).
- La mise en pause manuelle (badge de la fiche) reste disponible ; la facturation clôturait
  auparavant le compteur seulement si l'e-mail était parti — corrigé.

## 10 · E-mail de document — honnête et fiable (option « valider + file d'attente »)
Facturer ne bloque plus et ne prétend plus que l'e-mail est parti : la facturation est validée,
l'e-mail passe en **boîte d'envoi** — alerte Aurion explicite, entrée dans le journal de bord
(avec lien), badge **« E-mail en attente »** sur le document dans Devis & factures, et bouton
« Envoyer les e-mails en attente ». Dès que la messagerie est enregistrée/testée avec succès,
les e-mails en attente partent **automatiquement**. Aucun succès simulé.

## 11 · Zéro erreur de calcul — classeur Excel de référence intégré
Création du **classeur de référence** `assets/reference/AURION-classeur-calculs.xlsx` (formules
réelles) et de son lien documenté avec le moteur (`docs/reference/CLASSEUR-REFERENCE.md`). Un
contrat golden vérifie à chaque exécution que le moteur JS produit **exactement** les mêmes
nombres que le classeur sur trois jeux d'essai (standard, km facturé, vente à perte) : toute
divergence de calcul est désormais bloquante avant publication.

## Version
**15.4.63** harmonisé partout. Migration SQL : **123** (boîte d'envoi + `kind` des lignes).
Base : 15.4.62 vérifiée en ligne. Validation : build Render exact, contrats **92/92** (dont
15.4.63 : 12/12 et golden calculs 5/5), lot métier **50/50**, check frontend 50 fichiers.
