# CHANGELOG — 15.4.60

## Carrousel des modèles de documents : anneau 3D circulaire, aperçus directs et validation par la carte de face

### Évolution (demande utilisateur)
- **Les modèles sont présentés directement sous forme d'aperçu** : chaque carte du carrousel EST l'aperçu du modèle — face générée (`PNG 745×1053`) depuis le **même PDF que celui servi** au téléchargement (`assets/templates/previews/`, 8 styles × devis/facture = 16 faces). Fini la carte résumée avec bouton « Aperçu PDF » et bouton de sélection : plus aucun bouton sur les cartes.
- **Anneau 3D circulaire** (les cartes tournent derrière) : les huit faces sont posées sur un cylindre elliptique (`perspective:1600px`, `transform-style:preserve-3d`, géométrie `translate3d/rotateY` calculée par le script). Chaque carte est posée directement à son **angle monde continu** (`i·45°+angle`) — la carte de face reste exactement centrée quel que soit l'écran, et sort du plan de l'anneau (+36px) pour que les voisines ne la percent plus ; l'écartement latéral s'adapte à la demi-largeur projetée de la carte avant (les voisines restent visibles sur les côtés, même sur mobile). Le verso de chaque carte est dédié (image estompée, **sans effet miroir**), les cartes du fond restent visibles pendant la rotation.
- **Rotation au clic** : flèches ‹ › (une face par clic) ou clic sur une carte du fond (cette carte passe devant par le chemin le plus court, les autres tournant derrière).
- **Retour à la carte d'origine après un tour complet** : l'angle est normalisé modulo 360° — après huit pas, la carte de départ est de nouveau face avant. L'anneau démarre sur le modèle actuellement utilisé (`data-start`).
- **Aperçu taille réelle + validation** : un clic sur la carte de face ouvre une fenêtre modale avec le **PDF intégré** (embed, le fichier réel), sa description, le téléchargement, et le bouton **« Utiliser ce modèle »** qui enregistre le choix (même API `saveDocumentTemplateChoices`, choix indépendants devis/facture). Fermeture par croix, « Fermer », clic sur le fond ou touche Échap.
- **Design Aurion** : neumorphisme (ombres douces biconvexes sur les flèches, enfoncement à l'appui) et skeumorphisme (feuille de papier blanche à coins doux, étiquette sur la face inférieure portant le nom du modèle et la mention « Modèle utilisé »), accessible au clavier (tabulation, Entrée/Espace) et respectueux de `prefers-reduced-motion`.
- **Responsive** : géométrie recalculée au redimensionnement ; sur mobile (375 px) l'anneau s'insère sans défilement horizontal de page (`overflow:hidden` sur la scène, rayons recalculés).

### Ancienneté conservée
- Choix indépendants devis/facture, modèle personnel téléversable, statut de conversion LibreOffice, suppression des modèles personnels : inchangés.

### Tests
- `tests/templates-carousel-15.4.60.contract.test.mjs` : 3 contrats — cartes = aperçus directs (16 faces vérifiées sur disque, plus aucun bouton par carte), anneau 3D tournant avec retour à l'origine (angle modulo 360°, chemin le plus court, verso dédié), aperçu taille réelle avec validation (`embed` PDF + « Utiliser ce modèle »).

### Version
- `VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, lockfiles, `sw.js`, `index.html`, `assets/js/main.js` : **15.4.60**. Aucune migration SQL ; aucune donnée touchée ; base de publication : 15.4.59 (`0bb1cc2`).
