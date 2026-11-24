# RAPPORT DE LIVRAISON — 15.4.63 (neuf chantiers demandés, rien d'autre touché)

Date : 24 novembre 2026 · Précédente : 15.4.62 (vérifiée en ligne) · **Aucun push GitHub** (demande explicite) — livraison par ZIP + prompt récapitulatif.

## 1 · Ce qui a été corrigé (résumé)
1. **Administration** : bascule unique exclusive encarts ⇄ diagrammes (choix mémorisé) + diagrammes au design Aurion (verre dépoli, palette du thème).
2. **Pied de page** : « Développement & support : EasyWeb-dev ».
3. **Avatar** : initiale statique dans le HTML + barre supérieure défensive (plus jamais de bulle vide) ; page Compte : initiales toujours rendues sous l'image.
4. **Modèles** : aperçus plus petits (205px), écart entre cartes garanti par construction (≥ ~40px, ≈ 50-100px sur PC), anneau plus profond (600px), scène élargie.
5. **Anti-sauts** : dimensions réservées (aperçus), hauteurs stables (diagrammes, détail prévisionnel).
6. **Détail prévisionnel** : projections HT du scénario (volume × ticket HT, 3/6/12 mois) + réalisé encaissé — plus trois zéros inexpliqués.
7. **Encarts comptables** : repli local honnête sur vos factures réelles quand le résumé serveur est vide (note affichée, mêmes règles que le moteur).
8. **Devis/factures** : plus aucune ligne de pièce automatique ; bloc « Prestations complémentaires » (ajout/retrait manuels, intégrés aux calculs, au PDF et à la comptabilité comme lignes `kind='service'`).
9. **Compteur temps** : arrêt à la facturation (toujours), arrêt automatique en quittant la fiche client, pause manuelle conservée (badge).
10. **E-mail document** : facturation validée, e-mail en **boîte d'envoi** (alerte Aurion, journal de bord avec lien, badge sur le document, bouton de vidage), envoi automatique dès que la messagerie est opérationnelle (enregistrement/test réussi). Aucun succès simulé.
11. **Calculs** : classeur Excel de référence intégré (`assets/reference/AURION-classeur-calculs.xlsx`) + contrat golden (5 tests) qui garantit moteur JS = formules Excel ; mapping documenté (`docs/reference/CLASSEUR-REFERENCE.md`).

## 2 · Interprétations assumées (signalées à l'utilisateur)
- « Mettre un devis en pause » : Aurion n'a pas d'état « devis en pause » ; la mise en pause du compteur reste manuelle (badge de la fiche client) et l'arrêt automatique couvre la sortie du contexte client/facturation.
- « Valider + file d'attente » retenue parmi les quatre options d'envoi d'e-mail (la plus complète : notification + journal + badge + envoi automatique + alerte de résultat).
- Le Détail prévisionnel affiche les projections **du scénario** (basées sur vos documents) — le réalisé encaissé reste visible et renvoie à Trésorerie.

## 3 · Fichiers modifiés
**Backend** : `routes/business.ts` (boîte d'envoi, kind lignes, compteur, indicateur email_pending), `routes/mail.ts` (auto-flush après enregistrement/test), nouveau `services/email-outbox.ts`, `migrations/123_email_outbox_multi_services.sql`. **Front** : `pages/dash/other.js` (admin, comptabilité, carrousel, détail prévisionnel), `pages/dash/quote.js` (multi-prestations, fin de l'auto-ligne), `pages/dash/docs.js` (badge + boîte d'envoi), `pages/dash/core.js` (alerte e-mail honnête), `pages/dashboard.js` (avatar, compteur), `core/forecast.js` (entrées HT par horizon), `core/api.js` (+flushEmails), `index.html` (EasyWeb-dev), `assets/css/app.css`. **Référence** : classeur Excel + JSON + doc de mapping. **Tests** : `evolutions-15.4.63.contract.test.mjs` (12), `calculs-reference.contract.test.mjs` (5 golden), alignements 15.4.61/62, v50, merge-15.4.35, quote-contract-v3, instant-refresh. **Docs** : CHANGELOG + présent rapport. **Versions** : bump 15.4.63.

## 4 · Vérifications (boucle vérifier → corriger → re-vérifier)
- Build Render exact (`npm ci` + `tsc`) : OK après correction de 3 erreurs de typage détectées.
- Contrats : **92/92** (dont 15.4.63 : 12/12 ; golden calculs : 5/5) — 6 allers-retours de correction d'assertions documentés.
- Lot métier : **50/50** (1 assertion alignée au nouveau `kind` des lignes).
- Check frontend : OK (50 fichiers, syntaxe + imports/exports).
- Incident corrigé : `minimumSellingHt` et `laborSellingHt` du miroir Excel alignés sur la sémantique exacte du moteur (minimum SANS main-d'œuvre interne ; main-d'œuvre bornée à 0 en perte).

## 5 · Recette conseillée (sans déploiement)
Administration (bascule unique, diagrammes Aurion), Compte + barre supérieure (avatar jamais vide), Paramètres → Modèles (cartes plus petites, espace visible), Accueil → scénario → Détail (projections réelles), Comptabilité (encarts alimentés), Devis (prestations complémentaires, aucune pièce automatique), Facturer sans messagerie (alerte + badge + journal, puis envoi automatique après configuration), Compteur temps (arrêt en quittant la fiche, arrêt à la facturation).
