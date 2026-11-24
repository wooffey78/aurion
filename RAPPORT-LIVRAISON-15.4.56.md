# RAPPORT DE LIVRAISON — 15.4.56

Date : 24 novembre 2026 · Version : 15.4.56 (précédente : 15.4.55) · Objet : fiabilisation de l'affichage des encarts, bibliothèque de modèles (carrousel 3D + téléversement effectif), épure des écrans et robustesse de la topbar — sans changement de schéma.

## 1 · Objet

Consignes de l'éditeur après la mise en live de la 15.4.55 : les encarts « à renseigner » doivent afficher 0 puis évoluer vers la valeur réelle ; les kilomètres doivent être un placeholder à la création ; les modèles téléversés doivent être utilisables ; davantage de modèles de devis/factures présentés en carrousel 3D avec aperçu visuel ; cotisations préremplies ; suppression des encarts « Situation fiscale déclarée » et « Ventilation par catégorie d'activité » ; encart de configuration masqué/compact ; récapitulatif du parcours avec retour direct aux étapes ; avatar visible dans la topnavbar ; remplissage systématique des encarts du tableau de bord avec un moteur de calcul plus fiable.

## 2 · Correctifs et améliorations réalisés

### 2.1 Encarts « à renseigner » → 0 par défaut et évolutifs
- Comptabilité : les cinq encarts affichent `0,00 €` et suivent les données réelles (fini le « à renseigner » figé). Trésorerie et accueil : identifiants stables sur chaque encart.
- Synchronisation : `account-sync.js` visait des libellés inexistants dans les pages — elle met désormais à jour les encarts par identifiants (avec repli par libellé réel), sur l'année sélectionnée, et est appelée après chaque rendu des vues home / comptabilité / trésorerie (`window.aurionRefreshFinancialCards`, hook `show()` de `dashboard.js`). Le timer d'accueil met à jour chaque encart par son identifiant — la mise à jour de l'encaissement du mois n'est plus piégée derrière un garde sur le nombre de cartes.

### 2.2 Kilomètres : placeholder à la création
- L'éditeur de devis/facture affiche « Kilomètres à parcourir (ex. 12) » ; un 0 hérité d'un brouillon ne s'affiche plus comme une valeur saisie ; une valeur réelle reste affichée en édition.

### 2.3 Modèles de documents : 8 modèles, carrousel 3D, téléversement effectif
- 5 nouveaux modèles natifs (Horizon, Orchidée, Encre, Corail, Glacier) construits avec le moteur de mise en page existant (variantes × teintes × typographies × rayons) ; liste validée côté serveur ; 16 PDF d'aperçu générés par le VRAI moteur (`assets/templates/`).
- Carrousel 3D horizontal (perspective CSS + coverflow piloté par le scroll, flèches, snap), aperçu visuel par style aux couleurs du modèle, choix indépendant devis/facture conservé.
- Téléversement : cause racine identifiée — pas de LibreOffice sur le serveur de démonstration, donc le PDF retombait silencieusement sur le modèle natif et le modèle téléversé semblait « non utilisé ». Corrections cumulées : installation best-effort de `libreoffice-writer` à chaque build Render ; `template_id` n'est posé que si la conversion a réellement produit le PDF (sinon la génération suivante réessaie — plus de figeage natif) ; statut de conversion affiché sur la page et avertissement au téléversement quand la conversion est indisponible.

### 2.4 Paramètres : cotisations préremplies, écrans allégés
- La détection fiscale fonctionne désormais sans forme juridique (régime micro-entrepreneur supposé et signalé) : TVA, taux URSSAF et cotisations détaillées se préremplissent — les saisies manuelles restent toujours prioritaires.
- Encarts « Situation fiscale déclarée » et « Ventilation par catégorie d'activité » supprimés de Comptabilité ; les options déclaratives restent dans Paramètres → Entreprise et les données restent calculées côté serveur (aucune perte de données, aucune migration).

### 2.5 Accueil et parcours : moins de bruit, plus d'actions
- Encart « Configuration et paramètres » : masqué quand la configuration est achevée (parcours terminé + configuration_incomplete levée), compact sinon (nouvelle classe CSS dédiée).
- Récapitulatif final du parcours : chaque ligne porte un « Paramètres » cliquable qui renvoie à l'étape du parcours concernée (vous/entreprise/activité/logo/messagerie/signature/cloud).
- Avatar : affichage immédiat depuis un cache local persistant + retry réseau ; purge du cache en l'absence d'avatar ; mise à jour à chaud après téléversement (événement existant conservé).

## 3 · Vérifications

- `tsc --noEmit` (backend) : sans erreur, build `tsc` complet effectué.
- Suites moteurs : `pricing.test.mjs`, `pricing-extensions.test.mjs`, `step12-pricing-cost-mileage.test.mjs`, `v55-engines-hardening.test.mjs` — 31/31 pass (parité navigateur/serveur du moteur inchangée).
- Syntaxe esbuild des 6 fichiers front modifiés (other, quote, settings, dashboard, onboarding, account-sync) : OK.
- Marqueurs de version vérifiés cohérents (VERSION.txt, package.json ×2, sw.js, index.html) : 15.4.56.

## 4 · Déploiement

- `render.yaml` : buildCommand enrichi (installation LibreOffice best-effort, jamais bloquante) ; autoDeploy inchangé — le push sur `main` déclenche le déploiement ; `/health/db` reste le health check. Aucune variable d'environnement nouvelle, aucun changement de schéma : démarrage et migrations inchangés.

## 5 · Perspectives (non réalisées dans cette version)

- Tests de contrat navigateur du carrousel (recette Playwright) et test unitaire des thèmes PDF (nécessite un mock de base) — à ajouter à la chaîne CI.
- Génération d'aperçus DOCX/ODT des modèles personnalisés (actuellement : aperçu PDF natif uniquement).
- Cache des agrégats comptables côté serveur (dérive d'invalidation à définir avant tout gain réel).
