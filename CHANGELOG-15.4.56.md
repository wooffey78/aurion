# CHANGELOG — 15.4.56

## Fiabilisation de l'affichage, expérience des encarts et bibliothèque de modèles

### 1 · Encarts financiers — 0 par défaut, jamais « à renseigner » figé
- `assets/js/pages/dash/other.js` (Comptabilité) : les cinq encarts (Encaissements HT, TVA encaissée, Cotisations estimées, Factures encaissées, Kilométrage sur factures) affichent désormais `0,00 €` tant qu'aucune donnée n'est saisie, puis suivent les données réelles dès le premier mouvement — la consigne 15.4.35 (« à renseigner ») est remplacée par la consigne 15.4.56 (l'utilisateur doit voir la valeur évoluer de 0 vers le réel).
- Trésorerie : les encarts (Créances restantes, Devis ouverts, Sorties prévues, Solde engagé, SAV) reçoivent des identifiants stables (`trez-*`) pour être actualisés directement.
- Tableau de bord (accueil) : les encarts reçoivent des identifiants stables (`home-clients`, `home-open-quotes`, `home-month-revenue`, `home-rdv`, `home-tickets-caption`, `home-entries-caption`) et sont mis à jour par le timer de fond sans dépendre du nombre exact de cartes d'action — la mise à jour de l'encaissement du mois était auparavant piégée dans un garde `cards.length===2`.

### 2 · Synchronisation des encarts — mappage corrigé + hook global
- `assets/js/account-sync.js` : `refreshFinancialCards` visait des libellés qui n'existaient pas dans les pages réelles (« Chiffre d'affaires HT », « Entrées prévues », « Solde prévisionnel ») — elle ne remplissait donc quasiment rien. Elle met désormais à jour les encarts par identifiants (accueil, comptabilité, trésorerie) avec repli par libellé réel, respecte l'année sélectionnée dans l'écran comptable, accepte `force=true` (appel après rendu de vue, jamais pendant une frappe) et est exposée via `window.aurionRefreshFinancialCards`.
- `assets/js/pages/dashboard.js` : après CHAQUE rendu des vues home / accounting / treasury, les encarts sont rafraîchis immédiatement — les valeurs affichées suivent les données même si la vue a été rendue avec un état local.

### 3 · Éditeur devis/factures — kilomètres en placeholder
- `assets/js/pages/dash/quote.js` : le champ « Kilomètres à parcourir » affiche un placeholder explicite (« Kilomètres à parcourir (ex. 12) ») au lieu d'un `0` hérité d'un brouillon/instantané — une valeur enregistrée non nulle reste affichée, un 0 ou vide reste vide.

### 4 · Modèles de documents — huit modèles, carrousel 3D, téléversement enfin effectif
- **Cinq nouveaux modèles natifs** (`backend/src/services/document-renderer.ts`, liste validée côté `backend/src/routes/documents.ts`) : Horizon (émeraude, classic), Orchidée (violet, serif/signature), Encre (graphite carré, minimal), Corail (chaleur, carré/classic), Glacier (bleu clair, minimal). Chacun porte sa teinte d'accent, son fond foncé, sa typographie et son rayon — même moteur de mise en page, aucun changement de structure.
- **PDF d'aperçu** générés par le vrai moteur (`assets/templates/{quote,invoice}-aurion-*.pdf`, 16 fichiers) : l'aperçu proposé correspond au rendu final.
- **Carrousel 3D** (`assets/js/pages/dash/other.js` + `assets/css/app.css`) : défilement horizontal avec perspective, transformation « coverflow » pilotée par le scroll (rotateY + translateZ selon la distance au centre), flèches de navigation, aperçu VISUEL par style (mini-document aux couleurs du modèle) au lieu d'un descriptif texte, sélection « Utiliser ce modèle » par type (devis / facture indépendants).
- **Téléversement effectif** : le serveur de démonstration n'avait pas LibreOffice — le PDF retombait silencieusement sur le modèle natif. Corrections : (1) `render.yaml` installe `libreoffice-writer` à chaque build (best effort, jamais bloquant) ; (2) `backend/src/services/document-renderer.ts` ne marque plus le PDF comme « issu du modèle » (`template_id`) que si la conversion a réellement produit le fichier — sinon la génération suivante réessaie : dès que LibreOffice devient disponible, les PDF repassent automatiquement par le modèle téléversé au lieu de rester figés natifs ; (3) la page Modèles affiche le statut de conversion du serveur et un avertissement explicite au téléversement si la conversion PDF est indisponible.

### 5 · Paramètres — cotisations préremplies et épure
- `backend/src/routes/business.ts` : `POST /activities/detect-fiscal` n'exige plus une forme juridique — sans elle, le service suppose le régime micro-entrepreneur et le signale (`legalFormAssumed`). Fini l'écran qui refusait de préremplir les cotisations précisément quand l'entreprise n'était pas encore configurée.
- `assets/js/pages/dash/settings.js` : la détection s'exécute donc même sans forme juridique, préremplit TVA et taux URSSAF (jamais une saisie manuelle — `manualEdited` respecté) et affiche la mention « régime micro supposé ».
- Suppression des encarts demandés par l'éditeur : « Situation fiscale déclarée » et « Ventilation par catégorie d'activité » de l'écran Comptabilité (les données `byCategory`/`fiscalOptions` restent calculées côté serveur et les options déclaratives restent saisissables dans Paramètres → Entreprise).

### 6 · Accueil — encart de configuration conditionnel et compact
- `assets/js/pages/dash/other.js` : l'encart « Configuration et paramètres d'Aurion » disparaît une fois la configuration achevée (parcours terminé + `configuration_incomplete` levée) ; tant qu'elle ne l'est pas, il s'affiche en version compacte (classe `onboarding-guide-panel--compact`, CSS dédié) nettement plus discrète qu'avant.

### 7 · Parcours d'accueil — récapitulatif cliquable
- `assets/js/pages/onboarding.js` : chaque ligne du récapitulatif final porte désormais un bouton « Paramètres » qui renvoie DIRECTEMENT à l'étape du parcours concernée (Vous, Entreprise, Activité, Logo, Messagerie, Signature, Cloud) — corriger une étape sans refaire tout le tour.

### 8 · Avatar — visible et persistant dans la barre supérieure
- `assets/js/pages/dashboard.js` : `syncShellAvatar` affiche l'avatar immédiatement depuis un cache local (Cache API, persiste entre les sessions), puis actualise avec UNE nouvelle tentative réseau — un 401 transient au démarrage ou une réponse lente ne fait plus disparaître l'avatar téléversé ; le cache est purgé quand aucun avatar n'existe. L'événement `aurion-avatar-updated` (téléversement dans Mon compte) met toujours à jour la barre à chaud.

## Version
- `VERSION.txt`, `package.json`, `backend/package.json`, `sw.js`, `index.html`, liens d'assets : 15.4.56. Aucun changement de schéma de base de données ; migrations inchangées.
