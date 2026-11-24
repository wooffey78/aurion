# CHANGELOG — 15.4.54

## Correctifs demandés (retour de déploiement)

### 1 · Le médiateur ne bloque plus la validation de la facturation
- `backend/src/services/mention-gate.ts` : le médiateur de la consommation sort de `BLOCKING_MENTION_KEYS` (désormais limitée à `identity` et `insurance`) et entre dans la nouvelle liste `REMINDER_MENTION_KEYS`. L'émission d'une facture n'est plus refusée (`422 MENTIONS_INCOMPLETES`) faute de médiateur ; les deux mentions réellement bloquantes restent l'identité légale (SIRET/SIREN) et l'assurance des métiers travaux.
- `backend/src/routes/business.ts` : la pré-vérification `GET /mentions/blocking` renvoie désormais `reminders` en plus de `gaps` — les mentions non bloquantes manquantes (médiateur) sont signalées comme simple rappel par le même moteur, jamais comme un refus.
- `assets/js/pages/dash/docs.js` : la fenêtre « Émission bloquée » ne s'ouvre plus que pour les mentions bloquantes. Quand le médiateur manque, la fenêtre « Transformer en facture » affiche un rappel informatif discret avec le chemin exact de configuration — la facturation se poursuit normalement.
- `docs/MENTIONS-OBLIGATOIRES.md` : référentiel mis à jour (section révisée 15.4.54, le médiateur rejoint le tableau des mentions non bloquantes). `npm --prefix backend run check:legal` reste cohérent code ↔ référentiel.
- `backend/tests/v52-emission-guards.test.mjs` : test unitaire réécrit — seules identity/insurance bloquent, le médiateur devient un rappel (`mentionReminders`).

### 2 · Le médiateur est configurable dans Aurion (et trouvable)
- `assets/js/pages/dash/settings.js` : dans Paramètres → Activités → « Facturation et documents », le champ devient « Médiateur de la consommation » avec exemple de saisie (« Ex. CM2C — 14 rue Saint-Jean, 75017 Paris — cm2c.net ») et aide contextuelle précisant qu'il alimente les documents et n'empêche jamais une émission. La recherche des Paramètres (« médiateur », « médiation », « consommation ») retrouve désormais la section.
- La persistance était déjà en place (`mediator_info`, `PATCH /activities/:id`) : aucune migration nécessaire, aucune donnée modifiée.

### 3 · Les trois modèles de documents ont de vraies différences
- `backend/src/services/document-layout.ts` : le type `Theme` porte désormais une `variant` (`minimal` | `classic` | `signature`) et les trois moteurs (PDF, DOCX, ODT) appliquent de vraies mises en page distinctes :
  - **Minimal** : monochrome encre, libellés en petites capitales, filets fins à la place des encarts, en-tête de tableau sans fond (double filet), total aligné à droite entre un double filet, signature par simple ligne.
  - **Classique** : design historique conservé (cartes claires, en-tête de tableau navy, zébrage gris, total dans un bloc bleu marine).
  - **Signature** : bandeau d'en-tête foncé chaleureux (nom blanc + titre doré + activité), typographie serif, encarts crème bordés bronze, en-tête de tableau brun à texte doré, zébrage crème, total sur fond doré au texte brun, zone « Bon pour accord » à double bordure bronze.
- `backend/src/services/document-renderer.ts` : chaque modèle choisit sa variante avec sa palette propre (minimal : encre `#111827`/sarcelle `#155e75` · classic : navy `#0b1220`/bleu `#0b63ce` · signature : brun `#2b1f14`/bronze `#a16207`).
- `tools/build-template-previews.mjs` (nouveau) : régénère les 6 aperçus PDF de la page « Modèles de documents » depuis le moteur réel ; les aperçus `assets/templates/*.pdf` sont recalés.
- `assets/js/pages/dash/other.js` : les descriptions des trois cartes décrivent les différences réelles de mise en page.

### 4 · Type de prestation par pièce au format Aurion (édition devis/facture)
- `assets/js/pages/dash/quote.js` : la colonne « Type de prestation » est désormais déclarée dans l'en-tête du tableau de lignes (elle n'apparaissait pas, le sélecteur flottait hors grille) et le sélecteur par ligne reprend le format Aurion : première option « Votre choix », aide sous le tableau (« Sans choix, la ligne hérite de la catégorie du document »).
- `assets/css/app.css` : la grille de lignes passe à 6 colonnes déclarées ; le sélecteur de ligne est stylé exactement comme les autres champs Aurion (fonds, bordures, focus, 16 px anti-zoom iOS, thèmes clairs) ; la variante mobile défile horizontalement (`min-width:760px`) sans compression des colonnes.

### 5 · Page d'accueil : l'image du tableau de bord revient
- `index.html` + `assets/js/main.js` : la composition « no-visual » sans image est abandonnée ; le héros affiche de nouveau l'illustration fidèle du tableau de bord (`assets/aurion-overview.svg`) dans la **moitié droite** de l'écran.
- `assets/css/app.css` : le cadre du visuel est **exactement à la même hauteur que le bloc de texte** (alignement `stretch`, image remplissant le cadre, illustration entière visible). Sous 1050 px le passage en une colonne place l'image **après le texte** ; sur mobile elle tombe juste en dessous, comme demandé.
- `assets/aurion-overview.svg` : le menu latéral de l'illustration reprend exactement la navigation réelle (Tableau de bord, Clients, Chantiers, Catalogue métier, Fournisseurs, Devis & factures, Modèles de documents, Agenda, Comptabilité & trésorerie, Support Aurion, Paramètres).
- `backend/tests/requirements-15.test.mjs` : le contrat de la page d'accueil est mis à jour (image présente, texte avant image, hauteur desktop, position mobile).

## Version
- `VERSION.txt`, `package.json`, `backend/package.json`, `sw.js`, `index.html` : 15.4.54.
- Aucune migration de base de données : aucun changement de schéma.
- Périmètre strict : les quatre correctifs ci-dessus et leurs tests ; aucun autre module touché.
