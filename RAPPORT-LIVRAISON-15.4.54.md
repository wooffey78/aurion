# RAPPORT DE LIVRAISON — 15.4.54

Date : 23 novembre 2026 · Version : 15.4.54 (précédente : 15.4.53) · Périmètre : correctifs ciblés demandés, sans régression du reste.

## 1 · Objet

Cette version traite les quatre points remontés sur la version 15.4.53 déployée : le médiateur bloquait la validation de la facturation, il n'était pas trouvable dans Aurion, les trois modèles de documents étaient visuellement identiques et le choix du type de prestation par pièce dans l'éditeur de devis/facture n'était pas au format Aurion. S'y ajoute le rétablissement de l'image du tableau de bord sur la page d'accueil aux positions demandées (moitié droite à hauteur des textes sur ordinateur, sous le texte en mobile).

## 2 · Corrections réalisées

### 2.1 Médiateur : non bloquant à l'émission
- La porte des mentions (`mention-gate.ts`) ne bloque plus que sur l'identité légale (SIRET/SIREN) et l'assurance des métiers travaux. Le médiateur de la consommation bascule dans `REMINDER_MENTION_KEYS` : la mention continue d'être gérée par le moteur (jamais inventée) mais ne refuse plus l'émission (`POST /quotes/:id/invoice` ne renvoie plus `MENTIONS_INCOMPLETES` pour cette clé).
- La pré-vérification `GET /mentions/blocking` expose désormais deux listes : `gaps` (bloquant) et `reminders` (non bloquant). L'interface « Devis & factures » ouvre la fenêtre « Émission bloquée » uniquement pour `gaps` ; le médiateur manquant apparaît au pire comme un rappel dans la fenêtre « Transformer en facture », avec le chemin exact de configuration.
- Le référentiel `docs/MENTIONS-OBLIGATOIRES.md` et le test unitaire `backend/tests/v52-emission-guards.test.mjs` sont alignés ; la cohérence code ↔ référentiel (`check:legal`) reste vérifiable.

### 2.2 Médiateur : configurable et trouvable
- Paramètres → Activités → « Facturation et documents » : champ « Médiateur de la consommation » avec exemple de saisie et aide contextuelle. La recherche des Paramètres retrouve la section via les mots-clés « médiateur / médiation / consommation ».
- La persistance (`mediator_info` sur l'activité, routes create/patch) existait : aucune migration, aucune donnée d'existant modifiée.

### 2.3 Modèles de documents : trois mises en page réellement différentes
- PDF, DOCX et ODT appliquent désormais trois structures distinctes, pas seulement une teinte :
  - **Minimal** : monochrome encre, aucune carte ni fond coloré, filets fins, total aligné à droite entre double filet, signature par ligne.
  - **Classique** : design historique (cartes claires, tableau à en-tête navy, total en bloc bleu marine).
  - **Signature** : bandeau d'en-tête brun chaleureux, serif, encarts crème bordés bronze, total sur fond doré, double bordure bronze pour la signature client.
- Nouvel outil `tools/build-template-previews.mjs` : les six aperçus PDF de la bibliothèque sont produits par le moteur réel et recalés dans `assets/templates/`. Les descriptions des cartes (« Minimal / Classique / Signature ») décrivent les différences réelles.

### 2.4 Édition devis/facture : type de prestation par pièce au format Aurion
- La colonne « Type de prestation » est déclarée dans l'en-tête du tableau de lignes et le sélecteur par ligne suit la convention Aurion (option vide « Votre choix », aide expliquant l'héritage de la catégorie du document).
- CSS : grille à 6 colonnes, sélecteur stylé comme les autres champs (fond, bordure, focus, 16 px mobile, thèmes clairs), défilement horizontal sous 760 px sans compression.

### 2.5 Page d'accueil : image fidèle du tableau de bord
- `index.html` et la route client (`main.js`) réaffichent `assets/aurion-overview.svg` dans la moitié droite du héros ; le cadre est exactement à la même hauteur que le bloc de texte (`align-items:stretch` + image remplissant le cadre, illustration entière).
- ≤ 1050 px et ≤ 700 px : l'image passe en flux normal, **après le texte** (juste en dessous sur smartphone).
- L'illustration est restée fidèle au produit : son menu latéral reprend les onze entrées réelles de la navigation (Chantiers et Modèles de documents inclus, « Comptabilité & trésorerie » exact).
- Le contrat de test `backend/tests/requirements-15.test.mjs` est mis à jour : image présente, texte avant image, hauteur desktop, position mobile.

## 3 · Vérifications exécutées

- `npm --prefix backend run typecheck` : OK.
- Régénération des six aperçus : OK (6 PDF, tailles distinctes par variante).
- Génération DOCX/ODT/PDF des trois variantes en mémoire : OK (aucune erreur, tailles distinctes).
- Tests ciblés : porte des mentions (unitaire + contrat), page d'accueil (`requirements-15`), branches front C3 (`v52-front-branches`), contrôles de navigation : voir traces d'exécution dans la console de livraison.
- Contrôle visuel des trois aperçus côte à côte et de la page d'accueil desktop/mobile.

## 4 · Périmètre strict

Fichiers modifiés : `backend/src/services/mention-gate.ts`, `backend/src/services/document-layout.ts`, `backend/src/services/document-renderer.ts`, `backend/src/routes/business.ts`, `backend/tests/v52-emission-guards.test.mjs`, `backend/tests/requirements-15.test.mjs`, `assets/js/pages/dash/docs.js`, `assets/js/pages/dash/settings.js`, `assets/js/pages/dash/other.js`, `assets/js/pages/dash/quote.js`, `assets/js/main.js`, `assets/css/app.css`, `index.html`, `sw.js`, `VERSION.txt`, `package.json`, `backend/package.json`, `docs/MENTIONS-OBLIGATOIRES.md`, `assets/aurion-overview.svg`, `assets/templates/*.pdf` (recalés), nouveaux : `tools/build-template-previews.mjs`, `CHANGELOG-15.4.54.md`, `RAPPORT-LIVRAISON-15.4.54.md`. Aucune autre route, calcul, module ou migration touché.
