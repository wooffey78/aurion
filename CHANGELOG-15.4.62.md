# CHANGELOG — 15.4.62

## Les 8 évolutions et corrections demandées

### 1 · Devis — toutes les pièces proposées
La liste des pièces d'une ligne proposait uniquement les pièces « pertinentes » détectées pour la prestation : une seule pièce (celle configurée) était choisissable. Désormais les pièces pertinentes d'abord, puis **TOUTES les pièces du catalogue** — on peut choisir n'importe quelle pièce.

### 2 · Prévisionnel — les devis sont pris en compte
Le volume mensuel du scénario (« Prévision de facturation — scénario indicatif ») comptait uniquement les factures récentes : une activité qui devisse sans encore facturer restait à 0. Le volume retient désormais **factures récentes + devis récents** (sur 6 mois), avec une note explicite de la base retenue.

### 3 · Prévision de facturation — plus aucun menu déroulant
Le sélecteur « Période de référence » est retiré : les horizons 1/3/6/12 mois sont déjà le tableau du scénario ; les projections HT du backend restent accessibles via le bouton « Détail » (pas un menu déroulant).

### 4 · Carrousel — espacement PC nettement supérieur
Anneau plus profond (rz plafonné à **560px**), cartes beaucoup plus écartées latéralement (rx plafonné à **360px**, coefficient 1.5) et scène agrandie (hauteur jusqu'à 560px sur grand écran). Planchers mobiles conservés.

### 5 · Mention du développeur
Le pied de page (toutes les pages) ajoute : « Développement & support : easyfixit.reparation@gmail.com » — le contact réel déjà présent dans les documents légaux de l'application (aucune dénomination juridique inventée, conforme prompt maître §éditeur).

### 6 · Avatar — plus jamais un « rond vide »
La page Compte affiche désormais **toujours les initiales** sous l'image : l'avatar téléversé les recouvre quand il charge réellement ; toute image manquante, vide (blob 0 octet) ou en erreur fait revenir les initiales. La barre supérieure applique la même règle (blob vide refusé explicitement → initiale de l'entreprise conservée).

### 7 · Administration → Intégrations → Plateformes agréées → Tiime
- Encart au titre prévu : **« Activez votre facturation électronique avec Aurion et Tiime »**, bouton **« Créer mon compte Tiime »** vers le site officiel (repli garanti), et l'activation directement dans Aurion explicitement désactivée tant que Tiime n'a pas officiellement autorisé l'authentification embarquée, la création de compte partenaire, le rattachement d'entreprise, l'acceptation des conditions, la désignation réglementaire et le retour d'autorisation — **aucun partenariat présenté comme signé**.
- Module de connexion (§15, réservé administrateur, déjà cloisonné par le garde + journalisation) : identifiant API, secret API, URL API, URL OAuth, URI de retour, scopes, secret de signature des webhooks, environnement test/production. Stockage **côté serveur** (table `platform_tiime_config`, migration 122) ; les secrets ne sont **jamais renvoyés en clair** (booléens « configuré », champ vide = conserve l'existant).

### 8 · Administration — indicateurs affichables en diagrammes
Les mêmes encarts d'indicateurs restent affichés en cartes et une bascule **Cartes ⇄ Diagrammes** permet de les voir en graphiques : répartition des organisations par catégorie (camembert), accès gratuits admin/VIP (barres), abonnements actifs et résiliations (barres), conversion des essais terminés (camembert) — mêmes données du backend, aucune invention.

### Version
**15.4.62** harmonisé partout. Migration SQL : **122** (création de `platform_tiime_config`, aucune donnée existante modifiée). Base de publication : 15.4.61 (`4e37205`).
