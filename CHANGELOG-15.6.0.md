# Aurion 15.6.0 — édition premium

Date de livraison : 25 novembre 2026.

Cette version rassemble les corrections d’usage demandées sur les documents, les calculs et
l’administration, et ajoute les fonctions manquantes du parcours d’accueil. Toutes les
fonctions existantes et l’identité visuelle Aurion sont conservées ; les migrations sont
additives et les bases existantes restent compatibles.

## 1. Documents PDF : plus aucun « null »

- `cleanText` traite désormais `null`, `undefined`, `NaN`, `n/a` et `none` (casse et espaces
  ignorés) comme une valeur vide, dans le moteur natif **et** dans les variables des modèles
  personnalisés DOCX/ODT.
- Les fiches **client**, **fournisseur** et **produit** utilisent le même nettoyage : un champ
  non configuré est simplement omis, jamais remplacé par « null ».
- Les valeurs numériques et les mentions légales sont également protégées ; le PDF reste
  lisible même avec des instantanés anciens ou des imports incomplets.

## 2. Bordereau : analyse sans LibreOffice

- Nouveau décodeur PDF intégré (`extractPdfText`) : lecture des flux `FlateDecode`, des
  opérateurs `Tj`/`TJ` et des chaînes littérales ou hexadécimales.
- L’analyse d’un bordereau PDF texte aboutit même si `soffice`, `pdftotext` ou
  `mutool` sont absents : plus de crash `spawnSync soffice ENOENT`.
- Les convertisseurs externes ne servent plus que de repli pour les PDF image ; si aucun
  convertisseur n’est disponible, l’erreur est explicite et l’interface propose la saisie
  manuelle au lieu d’échouer silencieusement.

## 3. Carrousel : 20 lots devis + facture

- Le catalogue passe de 12 à **20 modèles** : Minimal, Classique, Signature, Horizon,
  Orchidée, Encre, Corail, Glacier, Ivoire, Océan, Menthe, Bordeaux, Indigo, Ambre, Rubis,
  Carbone et quatre variantes premium supplémentaires.
- Chaque carte du carrousel réunit **le devis et la facture du même modèle** : un seul choix
  désigne le lot, avec aperçu double et boutons d’ouverture des deux PDF.
- Les lots sont **numérotés** (`01` à `20`) et un compteur indique le lot courant ainsi que le
  nombre de tours effectués : on sait toujours quand la boucle est complète.
- Le choix est enregistré pour les deux types de documents. Le thème du lot conditionne
  aussi les fiches client, fournisseur et produit, ainsi que les documents natifs.
- 40 aperçus (20 devis + 20 factures) sont livrés dans `assets/templates/` et
  `assets/templates/previews/`.

## 4. Journal de bord : actions lisibles

- « Reprendre l’étape », « Marquer lu » et « Supprimer l’alerte » sont placés sous le message,
  sur des lignes distinctes, alignés à gauche et espacés régulièrement.
- L’état de lecture reste visible séparément ; les actions ne se collent plus au texte ni
  entre elles, y compris avec un libellé long ou un écran étroit.

## 5. Calculs : le TTC facturé est le prix encaissé

- Le **TTC affiché sur le devis et la facture est le prix réellement dû par le client** ;
  les remises, la main-d’œuvre et les frais éventuels sont intégrés avant l’affichage.
- La **main-d’œuvre** saisie en HT ajuste le TTC client du delta TTC (TVA comprise) ; un
  témoin `lastLabourTtc` évite le double comptage lors des modifications successives.
- Le brouillon enregistre les mêmes valeurs que l’écran (`labor_selling_ht`, TTC cible) et
  une ligne « dont main-d’œuvre facturée (TTC) » explicite la part facturée.
- Les calculs de marge, de coût interne et de rentabilité restent inchangés : seul le prix
  client est corrigé, la vérité comptable n’est pas maquillée.

## 6. Tableau de bord : derniers documents consultables

- Chaque ligne de « Derniers documents » est un bouton : elle ouvre directement le PDF du
  devis ou de la facture dans la visionneuse Aurion, sans passer par la liste complète.
- Le type et l’identifiant sont portés par des attributs de données, donc le clic fonctionne
  aussi après un rechargement partiel du tableau de bord.

## 7. Administration : diagrammes au choix

- Les données d’administration sont présentées en diagrammes : barres, courbes, aires et
  répartition (camembert/anneau), avec une barre d’outils accessible.
- L’utilisateur choisit le type ; son choix est mémorisé (`aurion.adminChartType`) et
  respecté au rechargement.
- Les tableaux restent disponibles pour l’export et la lecture détaillée ; aucune donnée
  n’est inventée, les séries proviennent des mêmes requêtes que les indicateurs.

## 8. Parcours d’accueil et modules

- Nouvelles questions facultatives pour détecter les besoins : chantiers, maintenance,
  garanties, suivi du temps, appareils, portail client, facturation électronique, prévisions.
- Les modules utiles sont **recommandés automatiquement** à partir de l’activité, des
  réponses et du profil ; l’utilisateur garde la main et peut tout décocher.
- Le numéro de TVA est déduit du SIREN lorsque possible, avec validation et possibilité de
  correction manuelle.
- Migration `126_module_catalog_v2.sql` : douze modules ajoutés (stock, support, agenda,
  comptabilité, chantiers, maintenance, garanties, temps, appareils, portail, e-invoice,
  prévisions) sans dupliquer les modules existants.
- Le frontend (accueil, réglages, tableau de bord) reflète les nouveaux modules et les
  nouveaux documents.

## 9. Qualité et compatibilité

- Version harmonisée **15.6.0** : manifestes, lockfiles, `VERSION.txt`, coquille HTML et
  service worker.
- Suite backend : **861 tests, 769 réussis, 0 échec, 92 ignorés** (PostgreSQL, Stripe,
  Google et LibreOffice indisponibles localement).
- Correction des imports dynamiques Windows (`pathToFileURL`) dans les contrats historiques :
  la suite est verte sur Windows comme sur Linux.
- Aucune suppression de fonctionnalité, aucun changement de schéma destructif ; les
  migrations 126 et suivantes sont additives et idempotentes.

## Vérifications effectuées

- `npm run build` (TypeScript backend) : succès.
- `npm run test:frontend` : 50 fichiers vérifiés, imports/exports valides.
- `npm run lint:frontend` : aucune erreur.
- `node --test` (backend complet) : 861 tests, 0 échec.
- `backend/tests/v2-premium.test.mjs` : 9 contrats V2 (PDF sans null, extraction PDF sans
  LibreOffice, bordereau, journal, derniers documents, carrousel, main-d’œuvre, diagrammes,
  onboarding).
