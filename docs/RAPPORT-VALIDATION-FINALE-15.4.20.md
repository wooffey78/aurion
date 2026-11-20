# Validation globale finale — Aurion 15.4.20 (bloc 26)

Date : 14 novembre 2026 · Version validée : 15.4.20 (paquet reconstruit) · Porte : `tools/verify-b0-baseline.mjs`, mode strict (`AURION_BASELINE_STRICT=1`)

## Objet et périmètre

Ce rapport clôt le bloc 26, dernière étape du plan de correction d'Aurion : la validation globale de l'ensemble des 25 blocs livrés depuis la 15.4.0, sur un paquet final reconstruit. Contrairement aux validations intermédiaires de chaque bloc (qui ne rejouaient que les tests du bloc et la suite régression), la validation finale rejoue la totalité de la chaîne CI sur une base de données neuve : build et typecheck TypeScript, vérification syntaxique du frontend (38 fichiers), lint ESLint, suite smoke (79 tests), parcours navigateur Playwright réel, puis la suite backend complète (439 tests) contre un PostgreSQL réel avec RLS active, migrations appliquées deux fois pour prouver l'idempotence.

Le paquet 15.4.20 a été reconstruit pour intégrer quatre corrections issues de cette validation, détaillées plus bas. Aucune fonctionnalité n'a été ajoutée ni retirée à cette occasion : le périmètre fonctionnel reste exactement celui du bloc 25 (rapprochement bancaire, décision D5 avec défaut « import de fichiers »).

## Ce que la validation finale a trouvé et corrigé

**Une violation CSP réelle, présente depuis la 15.4.8 (bloc 9).** Le fieldset « Options fiscales déclarées · Bloc 9 » de la page Paramètres portait un attribut `style="border:…;border-radius:…;padding:…"` en ligne. La CSP stricte d'Aurion (`style-src 'self'`, aucune directive assouplie) refuse les styles en ligne : le navigateur journalisait une erreur à chaque affichage de la vue et le cadre perdait réellement sa bordure et son padding. Le parcours navigateur, rejoué intégralement lors de cette validation finale (il n'était pas inclus dans les validations des blocs récents), a détecté l'erreur console et a échoué. La correction remplace le style en ligne par une classe `fieldset-box` dans `assets/css/app.css` — rendu visuel identique, CSP inchangée.

**Une accumulation d'écouteurs dans l'horloge locale (`core/ui.js`, bloc 22).** À chaque redémarrage d'une horloge sur un même élément, l'ancien écouteur `visibilitychange` n'était jamais retiré : le code lisaient l'empreinte de l'écouteur APRÈS écrasement de l'entrée du `WeakMap`. Chaque retour de veille redessinait donc l'heure N fois. Les écouteurs et l'intervalle sont désormais stockés ensemble (`{timer, onVisible}`) et retirés proprement avant remplacement.

**Une requête 401 à chaque démarrage (`quote.js` / `catalog.js`).** Le référentiel micro (catégories de cotisations URSSAF) était chargé au chargement du module, donc avant toute connexion : le navigateur journalisait un 401 inutile à chaque lancement. La requête part désormais au premier rendu de la vue concernée, avec une garde anti-double-chargement.

**Treize faux échecs d'environnement éliminés (zéro échec résiduel).** Les premières exécutions de la porte ont échoué sur 13 tests (webhooks PA, webhooks Stripe, RLS 074, FEC bloc 14) tous traçés à une seule cause environnementale : le mot de passe du rôle PostgreSQL `aurion_admin_app` du cluster local persistant ne correspondait plus aux identifiants CI. Le rôle a été réaligné sur les valeurs du workflow GitHub Actions, la base recréée à l'identique du CI (base neuve + migrations ×2), et la porte rejouée : **439/439**. Ces échecs n'existaient pas dans le code livré et n'ont donné lieu à aucun correctif applicatif ; la procédure de validation (base neuve, rôles conformes au CI) est désormais documentée ici pour les exécutions futures.

## Résultats de la validation finale (base neuve, PostgreSQL réel)

| Contrôle | Résultat |
| --- | --- |
| Build + typecheck TypeScript | OK |
| Vérification frontend (`node --check` + imports/exports) | 38 fichiers OK, 37 modules vérifiés |
| Lint ESLint (`assets/js`) | 0 erreur |
| Suite smoke | 79/79 — 0 échec de référence, 7 résolus depuis B0 |
| Régression complète backend | 439/439 — 0 échec de référence, 18 résolus depuis B0 |
| Migrations 001→083 | Appliquées 2 fois consécutives, idempotentes |
| Parcours navigateur (Playwright, Chromium réel) | Inscription immédiate, parcours d'accueil 8 étapes, navigation 9 vues, déconnexion/reconnexion — aucune erreur console |
| Porte B0 stricte (`AURION_BASELINE_STRICT=1`) | VERTE (EXIT 0) |

Environnement : PostgreSQL 18.6 réel en local (serveur embarqué, cluster persistant de recette), Node v24.22.2, Playwright 1.56.1. Les validations des blocs précédents documentaient PostgreSQL 17 en local ; le serveur embarqué réinstallé pour cette validation finale est la version 18.6 — aucune régression liée au moteur n'a été observée sur cette version.

## Inventaire des blocs livrés (15.4.0 → 15.4.20)

| Version | Bloc(s) | Contenu |
| --- | --- | --- |
| 15.4.0 → 15.4.5 | Blocs 1-6 | Stockage cloud Google Drive, e-reporting (matrice de périmètre, déclarations scellées, transmission), réception PA |
| 15.4.6 | Bloc 7 | Recentrage exclusif sur les micro-entreprises |
| 15.4.7 | Bloc 8 | Détection SIRET, activité réelle, calcul des cotisations |
| 15.4.8 | Bloc 9 | Versement libératoire, périodicité URSSAF |
| 15.4.9 | Bloc 10 | Calendrier fiscal, alertes de seuils |
| 15.4.10 | Bloc 11 | Devis et factures sans client préexistant |
| 15.4.11 | Bloc 12 | Bordereaux professionnels → préparation de facture |
| 15.4.12 | Bloc 13 | Paiement en ligne et relances (D3 non tranchée) |
| 15.4.13 | Bloc 14 | Export expert-comptable, accès comptable |
| 15.4.14 | Blocs 15-16 | Accents ; champs libres et placeholders |
| 15.4.15 | Blocs 17-18 | Popups de confirmation ; audits migrations/e-mail/dépendances |
| 15.4.16 | Bloc 19 | Cryptographie et gestion des secrets |
| 15.4.17 | Bloc 20 | Transparence, sécurité documentée, réversibilité |
| 15.4.18 | Blocs 21-22 | Installation Windows ; horloge et barre des tâches |
| 15.4.19 | Blocs 23-24 | Architecture Render/GitHub ; observabilité |
| 15.4.20 | Bloc 25 | Rapprochement bancaire (import CSV/OFX, décision D5 : défaut = import de fichiers) |

## Décisions ouvertes et limites assumées (inchangées)

- **D3 (paiement en ligne)** : non tranchée ; l'implémentation reste en mode préparatoire documenté.
- **D5 (connexion bancaire)** : le mode agrégateur (lecture seule avec consentement) n'est pas livré ; le défaut est l'import de fichiers CSV/OFX, rapprochement validé par l'utilisateur, écarts listés et jamais résolus silencieusement.
- **D6 (suivi d'erreurs externe)** : couche prête, non connectée — déclaré tel quel dans le runbook d'observabilité.
- **Transmission e-reporting / PA réelle** : aucune plateforme agréée contractuelle validée en sandbox ; génération conforme ≠ transmission opérationnelle, distinction explicite dans toute la documentation.

## Conclusion

La ligne 15.4 est complète : les 25 blocs du plan de correction sont livrés, et la validation globale finale passe intégralement sur un paquet reconstruit qui corrige les trois défauts détectés (CSP, horloge, 401 au démarrage) sans toucher au périmètre fonctionnel. Les prochains jalons ne relèvent plus du développement mais des décisions produit restées ouvertes (D3, D5 mode agrégateur, D6) et des validations externes à accomplir (plateforme agréée en sandbox, confirmation Render, conformité juridique des rétentions).
