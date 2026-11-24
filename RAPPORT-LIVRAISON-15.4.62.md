# RAPPORT DE LIVRAISON — 15.4.62 (les 8 évolutions/corrections demandées)

Date : 24 novembre 2026 · Précédente : 15.4.61 (`4e37205`, vérifiée en ligne) · Publication : branche `publish-15.4.62` sur la base `4e37205`, patch `AURION-15.4.62-PUBLICATION.patch`, push `main`, vérification en ligne `/health/db` → `15.4.62` et coquille `v=15.4.62-r1`.

## 1 · Devis — toutes les pièces proposées
`quote.js` : la liste des suggestions d'une ligne fusionne les pièces pertinentes (prestation détectée) puis **toutes les autres** — fini la pièce unique imposée par la configuration de la prestation.

## 2 · Prévisionnel — les devis comptent
`forecast.js` : `potentialClientsPerMonth = (factures récentes + devis récents) / 6` ; la note de volume explique la base retenue (factures, devis, ou les deux).

## 3 · Prévision de facturation — sans menu déroulant
Le `<select id="forecast-history">` et son gestionnaire sont supprimés ; le bouton « Détail » (non déroulant) déplie toujours les projections HT backend.

## 4 · Carrousel PC nettement plus espacé
`rz` plafond 400→**560px** (formule 44%→50% de la scène), `rx` plafond 280→**360px** (coefficient 1.35→1.5), hauteur de scène plafond 470→**560px**. Mobile inchangé (planchers).

## 5 · Mention du développeur
Pied de page global : « Développement & support : easyfixit.reparation@gmail.com » — contact réel issu des documents légaux de l'application (aucune dénomination inventée, prompt maître §éditeur).

## 6 · Avatar jamais vide
Page Compte : pile « initiales + image » (CSS `.account-avatar-stack`) — les initiales sont toujours rendues ; l'image ne s'applique que si le blob existe et n'est pas vide, avec `onerror` qui retire l'image au profit des initiales. Barre supérieure : `applyAvatarBlob` refuse explicitement un blob vide (`AVATAR_EMPTY`) et garde l'initiale de l'entreprise.

## 7 · Administration → Intégrations → Plateformes agréées → Tiime
- Encart §14 : titre « Activez votre facturation électronique avec Aurion et Tiime », bouton « Créer mon compte Tiime » (site officiel, repli garanti), option 2 (activation dans Aurion) explicitement désactivée sans autorisations officielles de Tiime, aucun partenariat présenté comme signé.
- Connexion §15 : `GET/PUT /admin/tiime` (module administrateur, garde + journalisation existants), table **`platform_tiime_config`** (migration **122**) : identifiant/secret API, URL API, URL OAuth, URI de retour, scopes, secret webhooks, environnement test/production. Secrets stockés côté serveur, **jamais renvoyés en clair** ; champ vide = conserve l'existant.

## 8 · Administration — Cartes ⇄ Diagrammes
Bascule dans la section Indicateurs : cartes (état actuel) ou diagrammes — organisations par catégorie (camembert), accès gratuits admin/VIP (barres), abonnements et résiliations (barres), conversion des essais (camembert). Mêmes données backend, composant graphique Aurion existant.

## 9 · Fichiers modifiés
**Backend** : `routes/admin.ts` (+2 routes), `migrations/122_tiime_platform_config.sql` (nouvelle). **Front** : `pages/dash/other.js` (Tiime, diagrammes, select retiré, carrousel), `pages/dash/quote.js` (toutes les pièces), `pages/dash/account.js` + `pages/dashboard.js` (avatar), `core/forecast.js` (volume avec devis), `core/api.js` (+2 méthodes), `index.html` (mention développeur), `assets/css/app.css`. **Tests** : `evolutions-15.4.62.contract.test.mjs` (nouveau, 8 contrats), `evolutions-15.4.61` + `instant-refresh-and-validation` alignés. **Docs** : CHANGELOG + présent rapport. **Versions** : bump 15.4.62.

## 10 · Vérifications
- Contrats : 75/75 (dont 15.4.62 : 8/8) ; lot métier **50/50** ; build Render exact (`npm ci` + `tsc`) sur le nœud publié ; check frontend OK (50 fichiers).
- Incident corrigé pendant la session : un script d'outillage avait écrasé `app.css` — fichier restauré depuis la publication 15.4.61 vérifiée en ligne, puis additions 15.4.62 ré-appliquées et re-vérifiées (75/75 + front OK sur le fichier restauré).
- Recette en ligne : devis (toutes les pièces dans la liste), scénario (volume incluant les devis, aucun menu déroulant), carrousel (anneau très espacé sur PC), pied de page (mention développeur), Compte (avatar : image sinon initiales), Administration (encart Tiime complet, bascule Cartes/Diagrammes).
