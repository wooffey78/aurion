# RAPPORT DE LIVRAISON — 15.4.61 (les 10 évolutions/corrections demandées)

Date : 24 novembre 2026 · Précédente : 15.4.60 (`a2a8e65`, vérifiée en ligne) · Publication : branche `publish-15.4.61` sur la base `a2a8e65`, patch `AURION-15.4.61-PUBLICATION.patch`, push `main`, vérification en ligne `/health/db` → `15.4.61` et coquille `v=15.4.61-r1`.

## 1 · Compteur de temps économisé — démarrage automatique partout
POST `/clients` démarrait déjà la session ; la création **directe dans un devis/facture** ne le faisait pas. `createClientForDocument` (business.ts) reçoit désormais `userId` et insère la même session « running » (estimation de la fiche si renseignée) ; toast de confirmation côté liste clients ; badge de fiche inchangé.

## 2 · Prévision de facturation corrigée
`/dashboard/summary` : `month1` = réalisé du mois + moyenne historique HT (l'ancien `month1 = Σ devis ouverts` supposait tout signé à J+1) ; la moyenne historique passe sur la base **croisée** (voir §9) ; textes de méthode et d'aide mis à jour (panel « scénario indicatif » inclus).

## 3 · Pièce auto modifiable
`quote.js` : synchronisation DOM→état avant chaque redraw (les saisies non validées ne sont plus écrasées par la détection de prestation à 350 ms) ; `dismissedParts` empêche la ré-ajout automatique d'une pièce retirée.

## 4 · Carrousel desktop
`rz` plafond 300→400px, `rx` plafond 200→280px et coefficient 1.12→1.35 : espacement nettement plus aéré sur grand écran, planchers mobiles inchangés (scène bornée, aucun défilement horizontal).

## 5 · Aperçu taille réelle débloqué
Cause démontrée : `frame-ancestors 'none'` (helmet global + PDF généré) interdisait l'intégration du PDF même en même origine. Corrigé en **`'self'`** (iframes tiers toujours interdits). La modale passe à un **iframe** avec bouton **« Ouvrir dans un onglet »** (repli) + téléchargement + « Utiliser ce modèle ».

## 6 · Invitation (Administration) au design Aurion
Champ e-mail dans `label.field` (libellé, autocomplete, inputmode), ligne flex alignée avec le bouton, styles `.guest-invite-row`.

## 7 · Repli du menu déroulant
`suggest.js` : le focus ne rouvre pas une valeur venant d'être choisie ; **Entrée sans option active** replie et empêche la soumission ; le commit sans sélection (flou/change) replie.

## 8 · Téléversement de modèles personnels supprimé
UI (2 sections + handlers), API front (4 méthodes), routes serveur (4) retirées ; table `document_templates` **conservée** : les modèles déjà téléversés restent rendus ; contrats v53/routes mis à jour (`intentionallyRemoved`).

## 9 · Comptabilité — moteur croisé et encarts remplis
- `services/accounting.ts` : la source passe de « paiements détaillés seuls » à **paiements ∪ factures payées sans ligne de paiement** (`amount_paid`, date `paid_at`/`updated_at`/`created_at`, union sans double comptage) → Encaissements HT, TVA encaissée, Cotisations estimées, Factures encaissées, Kilométrage sur factures se remplissent ; exports CSV/FEC/livre de recettes héritent du même moteur.
- `business.ts` : « Factures encaissées » (count annuel) réécrit sur la même union.
- `account-sync.js` : l'appel `/accounting/summary` transmet désormais **l'activité sélectionnée** (`x-aurion-activity-id` depuis `aurion.activeActivityId`) — fini l'écrasement par la première activité.

## 10 · Chantiers filtrés (retour) + pied de page partenaires
- navigation.js (filtre rétabli), profile-features.js (repli hors connexion `chantiers:false` + motif), backend profile-features.ts (`CORE` sans chantiers, appariement par mots-clés rétabli, motif profil inconnu) — retour à l'état antérieur à 15.4.59, demandé par l'utilisateur.
- `index.html` : `<footer class="app-footer">` hors `#app` → **toutes les pages** : Documents légaux, Conditions de vente, Transparence & réversibilité, **Facturation électronique : Tiime** (tiime.fr) et **Paiements sécurisés : Stripe** (stripe.com), styles neumorphiques discrets et responsive.

## 11 · Fichiers modifiés
**Backend** : `plugins/security.ts`, `routes/documents.ts`, `routes/business.ts`, `services/accounting.ts`, `services/profile-features.ts`. **Front** : `pages/dash/other.js`, `pages/dash/quote.js`, `pages/dash/clientsheet.js` (inchangé), `core/suggest.js`, `core/navigation.js`, `core/profile-features.js`, `core/api.js`, `account-sync.js`, `pages/dashboard.js`, `index.html`, `assets/css/app.css`. **Tests** : `evolutions-15.4.61.contract.test.mjs` (nouveau, 10 contrats), `v50-workflows`, `v53-harmonization`, `time-metrics-15.4.59`, `routes.contract` + `routes-13.0.txt`, `templates-carousel-15.4.60` alignés. **Docs** : CHANGELOG + présent rapport. **Versions** : bump 15.4.61 partout.

## 12 · Vérifications
- Contrats 15.4.61 : 10/10 ; carrousel 15.4.60 : 3/3 (aligné iframe) ; v50/v53/time-metrics/routes/navigation : alignés et verts ; build Render exact (`npm ci` + `tsc`) sur le nœud publié ; check frontend OK (50 fichiers).
- Recette en ligne : compteur visible sur la fiche après création ; encarts comptables remplis sur les factures payées importées ; prévision « 1 mois » cohérente ; PDF taille réelle affiché dans la modale ; menu déroulant replié après choix ; pièce modifiable/supprimable ; Chantiers masqué selon le métier ; pied de page présent partout.
