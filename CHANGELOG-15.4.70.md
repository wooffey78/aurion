# Aurion 15.4.70 — fiabilité du tableau de bord, calculs croisés et modèles

Cette livraison corrige les défauts signalés sans modifier les écrans qui fonctionnaient déjà.

## Tableau de bord

- **Erreur `Cannot access 'quoteSamples' before initialization` supprimée.** Les devis signés
  sont désormais sélectionnés avant le choix de l'échantillon du prévisionnel ; le tableau de
  bord et ses encarts se chargent à nouveau sans erreur JavaScript.
- **Avatar du header.** L'avatar téléversé dans « Mon compte » est appliqué immédiatement dans
  la bulle du header via l'événement `aurion:avatar-updated` (auparavant il fallait recharger la
  page). Les initiales restent le repli si l'image est absente ou illisible.
- **Entrée Chantiers.** La navigation reçoit les fonctionnalités du profil actif ; le serveur
  répond pour l'activité réellement sélectionnée (`x-aurion-activity-id`), et le changement
  d'activité force le rechargement des fonctionnalités. Les profils « réparation smartphone »
  (module Appareils/Dossiers) et « dépannage informatique » (module Matériel) ne sont plus
  assimilés à des chantiers.
- **Trois encarts alignés.** Les deux indicateurs et l'encart Tickets forment une seule rangée
  de trois colonnes sur ordinateur ; le contenu des cartes est centré verticalement.
- **Derniers documents repliés.** Les listes Factures et Devis sont masquées par défaut ; le
  clic sur l'en-tête déplie, un second clic replie. Le style `display:flex` n'écrase plus
  l'attribut `hidden`.

## Devis et factures

- **Toutes les prestations sont enregistrées.** Le type de ligne (`kind: service` / `part`) est
  conservé lors de la validation : un devis avec plusieurs prestations n'affiche plus le prix
  d'une seule prestation. Les prestations complémentaires restent cumulées au TTC, remise
  comprise.
- **Matériel vendu pris en compte.** Une pièce dont le prix de vente HT est renseigné ajoute
  quantité × prix × (1 + TVA) au TTC client, dans le calculateur comme dans le prix catalogue
  du serveur. Sans prix de vente, elle reste un coût interne.
- **Calculs croisés.** La base du prix, les prestations complémentaires, le matériel vendu, la
  remise et le champ « Prix TTC facturé au client » se recalculent dans le même ordre. Le
  calculateur affiche le total TTC, le détail des prestations, du matériel, la remise, le HT,
  la TVA, la marge et les cotisations à partir du même moteur.
- **Encarts de prestations identiques.** Chaque prestation ajoutée reprend une carte pleine
  largeur avec libellé et prix TTC, au lieu d'une ligne compacte.
- **Matériel plus large.** Les lignes de pièces occupent toute la largeur utile, comme les
  prestations.

## Session

- Jeton d'accès porté de 30 minutes à **12 heures** ; la fenêtre de grâce du refresh token passe
  de 60 secondes à **5 minutes** pour absorber les rafraîchissements concurrents de plusieurs
  onglets. La révocation immédiate (mot de passe, déconnexion globale) reste inchangée.

## Documents et modèles

- **Quatre nouveaux modèles sélectionnables** pour les devis et les factures : **Ardoise**,
  **Azur**, **Terracotta** et **Forêt**, en plus des huit existants. Les PDF d'aperçu sont
  générés par le moteur natif et les vignettes PNG sont fournies.
- **Contrôle du bandeau DOCX** ajouté aux échantillons : nom commercial, numéro et date sont
  présents dans le document, sans variable non résolue.
- Les documents restent générés par les mêmes moteurs PDF, DOCX et ODT ; aucune mise en page
  existante n'a été supprimée.

## Vérifications

- `npm --prefix backend run typecheck` : OK.
- `npm --prefix backend run build` : OK.
- `npm run test:frontend` : 50 fichiers vérifiés, imports/exports OK.
- Contrats ciblés (calcul, catalogue, devis, documents, profils, avatars, détection) : **52 réussis, 1 ignoré** (le contrôle d'intégration PostgreSQL nécessite une base de test dédiée).
- Échantillons PDF/DOCX/ODT : 8 thèmes générés, bandeau Signature contrôlé, **bandeau DOCX OK**.
- Les tests d'intégration PostgreSQL/LibreOffice restent dépendants d'une base de test et d'une
  installation locale ; ils sont ignorés lorsque ces prérequis ne sont pas présents.
