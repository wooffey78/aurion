# CHANGELOG 15.4.53 — harmonisation design et boutons fonctionnels

Date : 23 novembre 2026. Type : correctifs interface (aucun changement de schéma, aucune
route modifiée, aucune modification de calcul métier).

## Correctifs fonctionnels (boutons inertes)

1. **« + Nouveau devis » depuis la fiche client et « + Devis » depuis la carte client** —
   `assets/js/pages/dash/other.js` : le callback `quote(c)` appelait
   `hooks.refresh('quote')` sans `{navigation:true}` ; dans `refresh()`, `show(id)` n'est
   exécuté que si `opts.navigation || S.pendingView===id` — depuis la liste clients,
   `pendingView` restait `'clients'` et l'écran de création de devis n'était jamais rendu
   (l'état était pourtant préparé, y compris la préselection du client). Correctif :
   demande explicite du changement d'écran, même mécanique que `docs.js:80` et
   `quote.js:303`. Vérifié par test de contrat + navigation réelle.
2. **Vue « Modèles de documents » (templates) branchée** — la vue existait
   (`other.js` export `templates`) mais n'était ni dans `VIEWS` ni dans la navigation :
   inaccessible, et `hooks.show('templates')` aurait levé une TypeError. Correctifs :
   `dashboard.js` (import + `VIEWS.templates` + `DATASETS.templates:['templates','mail']`),
   `navigation.js` (entrée « Modèles de documents » après « Devis & factures »),
   `backend/tests/navigation.test.mjs` mis à jour en conséquence (changement produit
   intentionnel).
3. **Zone de dépôt de la vue templates** — `bind()` cherchait `#template-drop` alors que
   la div n'avait pas d'id : TypeError, `bind()` interrompu (suppression de modèles et
   chargements différés inopérants). Correctif : `id="template-drop"` sur la div
   `drop-zone`.
4. **Rafraîchissement après upload de modèle** — `hooks.refresh('templates')` →
   `hooks.refresh('templates',{navigation:true})` : re-rendu explicite de la vue.

## Harmonisation design Aurion

5. **Barre de types de graphique** (`charts.js`) — les classes `.chart-toolbar`,
   `.chart-type-btn` (+ `.active`), `.chart-legend`, `.legend-dot`, `.chart-container`
   n'existaient pas dans `app.css` : les boutons de commutation des diagrammes
   s'affichaient en boutons bruts du navigateur. Section CSS 15.4.53 livrée : contrôle
   segmenté (même grammaire que `.auth-tabs`), états hover/active/focus-visible au
   clavier, légende du camembert.
6. **Jetons d'accent de la charte** — `:root{--accent:#0f2aa6;--accent-2:#166534}` :
   `--accent` était référencé mais jamais défini, ce qui cassait le rendu de
   `.shell-clock` (horloge de l'en-tête) et `.activity-choice.selected`, et faisait
   retomber les graphiques sur des secours d'une ancienne charte sombre. `charts.js`
   réaligné : `var(--accent,#0f2aa6)`, `var(--accent-2,#166534)`,
   `var(--line,#9fbde0)`, `var(--panel,#eaf3fd)` ; palette camembert issue de la charte
   claire (bleu fonctionnel, vert, or foncé, violet, sauge, rouge).
7. **Encarts chantiers au format Aurion** (`chantiers.js`) — modales « Nouveau chantier »,
   « Contrat d'entretien » et « Rattacher un élément » converties au balisage
   `.field`+`<span>` (menus déroulants et champs habillés, placeholders automatiques) ;
   filtre de statut sorti du style inline et habillé `.field.section-filter` ; KPI de
   rentabilité passés de `article.glass` + styles inline aux classes métier
   `.kpi-grid`/`.kpi` (réutilisées par la fiche client) ; liste des raisons en
   `.chantier-reasons` ; espacement des graphiques via CSS (#chantier-charts>.panel).
8. **Select portail de la fiche client** (`clientsheet.js`) — « Accès concerné » enveloppé
   dans `label.field` comme son voisin « Partager un devis ouvert ».
9. **Alertes au thème clair** — `.error` passe de l'ancien rose sombre (#cc7488) au rouge
   de charte `var(--red)` ; `.alert-loss` repise fond/bordure/texte lisibles ;
   `.confirm-icon.danger` stylé (l'icône « ! » des confirmations dangereuses était
   identique à la variante normale) ; `.legal-accept-bar` (bannière de re-acceptation)
   obtient son espacement.

## Vérifications (avant → après)

- Build TypeScript : vert. Typecheck : vert.
- Suite backend complète : 732 tests (647 pass, 16 échecs préexistants PostgreSQL-absent,
  69 skip) → **739 tests — 654 pass, 16 échecs préexistants inchangés, 69 skip, 0
  régression** (+7 = test de contrat v53).
- `backend/tests/v53-ui-harmonization.contract.test.mjs` : **7/7 verts** — verrouille les
  9 correctifs ci-dessus au niveau source.
- `backend/tests/navigation.test.mjs` : 6/6 verts (ordres de menu mis à jour).
- `npm run test:smoke` : 173/173 verts. Check-frontend : 50 fichiers OK (syntaxe, imports,
  exports). `lint:frontend` (eslint) : 0 problème.
- **Vérification navigateur réelle** (harnais statique chargeant le vrai `app.css` et les
  vrais modules) : 4 barres d'outils / 10 boutons de type rendus ; bascule « Courbe »
  vérifiée (`aria-pressed`, re-rendu SVG) ; confirmation danger au design Aurion ; modale
  chantier 4 champs `.field` + 2 selects habillés ; toasts succès/erreur dans
  `.toast-region` ; **aucune erreur console**.
- Version : `VERSION.txt`, `package.json` (racine) et `backend/package.json` à 15.4.53 ;
  cache PWA `sw.js` et cache-busters `index.html` passés à `v=15.4.53-r1` (assets
  modifiés).

## Non fait (délibéré)

- Les 16 échecs de tests préexistants (liste dans le prompt maître G9) : inchangés, ils
  exigent PostgreSQL réel ou des référentiels datés — hors périmètre de cette livraison UI.
- Aucune modification backend : routes, calculs, schéma et documents déjà émis intacts.
