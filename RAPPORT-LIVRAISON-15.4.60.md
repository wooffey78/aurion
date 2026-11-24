# RAPPORT DE LIVRAISON — 15.4.60 (carrousel des modèles : anneau 3D circulaire, aperçus directs, validation par la face avant)

Date : 24 novembre 2026 · Précédente : 15.4.59 (`0bb1cc2`, **publiée et vérifiée en ligne** : `/health/db` → `version 15.4.59`, coquille `v=15.4.59-r1`) · **Poussée 15.4.60 : voir §5**.

## 1 · Objet

Demande utilisateur (en complément du prompt maître) : les modèles de documents doivent être présentés **directement sous forme d'aperçu** (pas une carte avec bouton d'aperçu) ; un clic fait tourner le carrousel 3D (les cartes tournent visiblement derrière) ; après un tour complet l'anneau revient à la carte d'origine ; un clic sur la carte de face ouvre le modèle **taille réelle** et permet de **valider** son utilisation.

## 2 · Réalisation

| Élément | Détail |
|---|---|
| Faces d'aperçu réelles | 16 PNG (8 styles × devis/facture) générés par `scripts/gen-template-previews.sh` (`pdftoppm` 90 dpi) depuis les mêmes PDF que ceux servis — `assets/templates/previews/{type}-{id}.png` (745×1053, contenu vérifié non vide). |
| Cartes = aperçus | `other.js` : chaque carte affiche l'aperçu pleine carte (`template-face`), plus aucun bouton « Aperçu PDF » ni bouton de sélection sur les cartes ; étiquette papier (skeumorphisme) avec le nom du modèle et « Modèle utilisé » pour le modèle actif. |
| Anneau 3D | `app.css` : scène avec `perspective:1600px`, anneau `preserve-3d`, cartes posées sur un cylindre elliptique — chaque carte à son **angle monde continu** (`translate3d/rotateY` recalculés par le script), carte de face sortie du plan (+36px) pour rester nette et centrée, écartement latéral adaptatif (voisines visibles sur les côtés même à 375px), rayons recalculés au `resize`, scène `overflow:hidden` → aucun défilement horizontal de page. Verso dédié (carte estompée sans effet miroir) — les cartes du fond tournent visiblement derrière. Neumorphisme : flèches biconvexes, enfoncement à l'appui ; carte de face agrandie (×1.05) avec halo. |
| Rotation au clic | Flèches = une face par pas ; clic sur une carte du fond = cette carte passe devant par le chemin le plus court ; angle normalisé **modulo 360°** → après un tour complet, retour exact à la carte d'origine ; anneau démarrant sur le modèle actif. |
| Taille réelle + validation | Clic sur la face avant → fenêtre modale : PDF intégré (`embed`), description, « Télécharger le PDF », bouton **« Utiliser ce modèle »** (API `saveDocumentTemplateChoices`, choix indépendants devis/facture) ; fermeture croix/Fermer/fond/Échap. |
| Accessibilité | Cartes focalisables (`tabindex`, `role=button`), Entrée/Espace, `aria-label` détaillés, `prefers-reduced-motion` respecté (pas d'animation). |
| Responsive | Rayons recalculés au `resize` ; scène `overflow:hidden` → aucun défilement horizontal de page à 375 px. |

## 3 · Fichiers modifiés ou ajoutés

**Ajoutés** : `assets/templates/previews/` (16 faces PNG) ; `backend/tests/templates-carousel-15.4.60.contract.test.mjs` ; `CHANGELOG-15.4.60.md` ; ce rapport.
**Modifiés** : `assets/js/pages/dash/other.js` (vue + logique anneau + fenêtre d'aperçu) ; `assets/css/app.css` (bloc carrousel remplacé) ; `VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, `package-lock.json`, `backend/package-lock.json`, `sw.js`, `index.html`, `assets/js/main.js` (bump 15.4.60).

## 4 · Vérifications (bac à sable)

- Contrats carrousel 15.4.60 : 3/3 pass (faces réelles sur disque, anneau 3D + retour à l'origine, aperçu taille réelle + validation).
- Verrou versions 16/16 sur 15.4.60 ; check frontend OK (51 fichiers) ; build backend inchangé (aucun code serveur modifié) — `tsc` revalidé au build du nœud publié.
- Recette en ligne après déploiement : Paramètres → Modèles de documents — chaque carte montre l'aperçu réel ; clic flèche → rotation visible des cartes du fond ; 8 clics → retour à la carte de départ ; clic face avant → PDF taille réelle → « Utiliser ce modèle » → mention « Modèle utilisé » sur la carte et application aux prochains documents.

## 5 · Déploiement

Branche `publish-15.4.60` construite sur la base publiée `0bb1cc2` (15.4.59), patch `AURION-15.4.60-PUBLICATION.patch`, puis poussée sur `main` — Render auto-déploie ; vérification en ligne : `/health/db` → `15.4.60` et coquille `v=15.4.60-r1`. Le ZIP final correspondant au commit déployé est produit après la vérification (prompt maître §40).
