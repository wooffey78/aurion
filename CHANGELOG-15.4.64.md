# CHANGELOG — 15.4.64

## Constat d'entrée (recette 15.4.63 par l'exploitant)
Le prévisionnel du tableau de bord et les encarts de « Comptabilité & trésorerie » n'affichaient
toujours rien. Analyse : un défaut d'**ordre d'exécution** (le repli local des encarts comptables
s'appliquait **après** la lecture des valeurs par l'affichage) passait inaperçu parce que la
vérification 15.4.63 était statique. Correctif + changement de méthode : les vues sont désormais
**exécutées réellement** dans un harnais de test avec des données réalistes.

## 1 · Encarts comptables — corrigés et prouvés par exécution
Le repli local (factures avec montants encaissés) est maintenant appliqué **avant** la lecture des
encarts. Le harnais d'exécution vérifie, chiffres en main : Encaissements HT = 696,21 €, TVA =
96,29 €, Cotisations = 153,17 €, Factures encaissées = 2, Kilométrage = 27,00 € (jeu d'essai
réaliste) + note de repli affichée.

## 2 · Prévisionnel du tableau de bord — prouvé par exécution
Le panneau du scénario se rend (4 398 caractères), le **Détail** expose les projections HT du
scénario (non nulles), le réalisé encaissé lit `monthHt` du compteur, et le volume est dérivé des
documents récents (0,5/mois sur le jeu d'essai). Le panneau étant asynchrone, l'export du
générateur est testé directement (`forecastPanelMarkup`).

## 3 · Résidu automatique supprimé (devis/factures)
Dernier reliquat de redessin automatique à la détection de prestation retiré : **plus aucun effet
automatique** sur les lignes — ajout 100 % manuel (conforme à l'exigence), accolades réécrites
proprement (la syntaxe a été vérifiée après chaque modification).

## 4 · Administration — bascule prouvée par exécution
Le bind d'administration est exécuté dans le harnais : la bascule unique se rend, les anciens
double-boutons sont absents, les encarts chiffrés sont visibles par défaut et les diagrammes
masqués (exclusivité effective).

## 5 · Devis & factures — boîte d'envoi prouvée par exécution
Badge « E-mail en attente » rendu uniquement sur les documents concernés ; bouton « Envoyer les
e-mails en attente » présent uniquement quand une attente existe ; masqué sinon.

## Méthode — harnais d'exécution permanent
`scripts/smoke-views.mjs` exécute les vues réelles (DOM simulé, API simulée) : comptabilité,
prévisionnel, documents, accueil, administration, éditeur de devis — **21 vérifications** qui
échouent si un encart affiche un montant faux ou si une vue ne se rend pas. Il accompagne les
contrats statiques (qui vérifient le code) : ensemble, ils rendent impossible la reproduction
du défaut d'ordre détecté.

## Version
**15.4.64** harmonisé partout. Base : 15.4.63. Validation : build Render exact 0 erreur,
contrats **22/22** (15.4.63 + 15.4.61), lot métier **50/50**, golden calculs **5/5**, smoke
vues **21/21**, check frontend 50 fichiers.
