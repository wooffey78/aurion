# CHANGELOG — 15.4.65

## Constat d'entrée (recette 15.4.64 en ligne)
L'éditeur de devis/factures était mort (calculateur vide, choix pièces/prestations disparu,
bouton « Ajouter une prestation » sans effet, remplissage automatique du client inopérant,
enregistrement sans réaction) ; le compteur « Temps économisé » affichait 0 min ; les diagrammes
de comptabilité/trésorerie devaient disparaître ; l'encart « Réalisé encaissé » devait partir ;
des arrondis devaient être garantis au centime ; l'écran « sautait » toutes les deux secondes au
retour d'onglet ; l'avatar choisi ne s'affichait pas dans la bulle ; le logo manquait en pied de
page.

## 1 · Éditeur de devis/factures — réveillé (cause racine trouvée et prouvée)
`serviceExtras` était **utilisé avant sa déclaration** dans le bind (TDZ « Cannot access
'serviceExtras' before initialization ») : le bind s'interrompait avant d'attacher le moindre
écouteur — d'où calculateur vide, suggestions absentes, boutons inertes, enregistrement muet.
La déclaration est remontée avant la restauration du brouillon. **Prouvé par exécution** :
le bind s'exécute sans erreur, le calculateur est alimenté, `#quote-form.onsubmit` branché,
26 sélecteurs écoutés.

## 2 · Diagrammes supprimés · encart « Réalisé encaissé » supprimé
Le panneau « Analyse visuelle » (CA par mois + répartition des factures — les seuls diagrammes
hors administration) est retiré avec son bind ; l'encart « Réalisé encaissé » disparaît du Détail
du scénario. Contrat mis à jour pour verrouiller l'absence.

## 3 · Compteur « Temps économisé » — formule harmonisée
Chaque session terminée représente désormais **au minimum 20 minutes de travail manuel**
(recherche tarifaire, calculs HT/TVA/marges, mise en forme, archivage) ; vos estimations
s'appliquent au-delà. Temps économisé = manuel − réel, jamais négatif ; moyenne = économisé ÷
sessions. La même règle s'applique aux stats de la fiche client (harmonisation complète), avec
textes d'explication mis à jour. Exemple : 11 sessions → manuel ≥ 220 min ; contre 173 min réels,
l'économie affichée redevient significative au lieu de 0.

## 4 · Arrondis — preuve chiffrée au centime
Le calculateur réel a été exécuté avec des valeurs piégeuses (12,45 / 617,37 / 183,42 / 95,13) :
les 11 montants rendus sont tous à **exactement deux décimales** (money = locale fr-FR EUR,
2 chiffres imposés ; moteur de calcul partagé, arrondis au centime à la persistance uniquement).
Contrôles intégrés au harnais permanent.

## 5 · Le « saut » d'affichage toutes les deux secondes — supprimé
Le cycle métriques (5 s) pouvait re-rendre la vue entière avec une garde de seulement 1,2 s :
aligné sur **12 s** comme le rafraîchissement d'arrière-plan, le snapshot financier est
**resynchronisé après chaque re-rendu** (aucune boucle possible), et le **scroll** compte
désormais comme interaction (wheel/scroll/touchstart) — cliquer ou scroller suspend tout
re-rendu, comme constaté par l'exploitant.

## 6 · Avatar et logo
La bulle de la barre supérieure resynchronise l'avatar en tâche de fond (60 s + retour d'onglet) :
l'image téléversée s'affiche même après un échec transitoire, avec repli initiales.
Le **logo Aurion détouré** (`public/branding/aurion.svg`, fond transparent, palette Aurion)
est créé — il était purement et simplement absent (404) — et intégré **dans le pied de page
à côté du nom AURION**, ainsi que dans la barre latérale et les pages légales qui l'appelaient.

## Version
**15.4.65** harmonisé partout. Base : 15.4.64 (publiée). Validation : build Render exact 0 erreur,
smoke vues 21/21, bind éditeur complet avec preuve centimes, contrats 97/97 (motifs mis à jour :
diagrammes absents, baseline 20 min), lot métier 50/50, golden calculs 5/5, check frontend
50 fichiers.
