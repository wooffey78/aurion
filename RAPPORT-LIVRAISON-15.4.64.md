# RAPPORT DE LIVRAISON — 15.4.64 (recette 15.4.63 : encarts et prévisionnel)

Date : 24 novembre 2026 · Précédente : 15.4.63 · Push GitHub + déploiement demandés et exécutés.

## 1 · Ce qui a été corrigé
1. **Encarts comptables (Encaissements HT, TVA encaissée, Cotisations estimées, Factures encaissées, Kilométrage sur factures)** : le repli local introduit en 15.4.63 s'appliquait **après** la lecture des valeurs — l'affichage restait à zéro. Le repli s'applique désormais **avant** la lecture (objet recalculé) : les encarts affichent les montants réels de vos factures encaissées, avec la note de repli.
2. **Prévisionnel du tableau de bord** : prouvé par exécution — panneau rendu, Détail avec projections HT du scénario non nulles, réalisé encaissé (`monthHt`) lu, volume dérivé des documents récents. Le générateur du panneau est exporté et testé directement.
3. **Résidu automatique supprimé** : le dernier redessin automatique lié à la détection de prestation est retiré — plus aucun effet automatique sur les lignes de pièces (exigence 15.4.63 respectée à 100 %).
4. **Administration** : bascule unique prouvée par exécution du bind (exclusive, encarts par défaut).
5. **Devis & factures** : badge e-mail en attente + bouton de vidage prouvés par exécution (présence conditionnelle correcte).

## 2 · Méthode (pourquoi le défaut est passé)
La vérification 15.4.63 était **statique** (contrats sur le code). Le défaut d'ordre
d'exécution était donc invisible. 15.4.64 introduit un **harnais d'exécution**
(`scripts/smoke-views.mjs`) qui exécute réellement les vues avec des données réalistes et un
DOM simulé : 21 vérifications chiffrées (montants affichés comparés aux attendus, présence
conditionnelle des éléments, rendu sans erreur). Statique + exécution = le défaut ne peut plus
revenir.

## 3 · Vérifications (boucle complète)
- Build Render exact : **0 erreur**.
- Smoke vues : **21/21** (comptabilité 6, prévisionnel 4, documents 3, accueil 2, administration 3, devis 2 — plus les contrôles transverses).
- Contrats : **22/22** (15.4.63 mis à jour au nouveau motif + 15.4.61).
- Lot métier : **50/50**. Golden calculs (moteur = classeur Excel) : **5/5**. Check frontend : 50 fichiers.

## 4 · Livraison
- Push GitHub (`main`) exécuté → déploiement Render déclenché par le push.
- ZIP complet : `download/AURION-15.4.64-production.zip`.
- Prompt récapitulatif mis à jour : `download/PROMPT-EXIGENCES-15.4.64.md`.

## 5 · Recette conseillée
Comptabilité & trésorerie (encarts alimentés par vos factures encaissées + note), Accueil →
prévisionnel → Détail (projections HT du scénario), Devis (prestations complémentaires, aucune
ligne automatique), Administration (bascule unique), Facturer sans messagerie (alerte + badge +
journal, envoi automatique après configuration), compteur temps (arrêt en quittant la fiche, arrêt à la facturation).
