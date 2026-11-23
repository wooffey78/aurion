# PROMPT GÉNÉRAL — AURION V2
## Harmonisation globale, synchronisation intermodules et cohérence du système

Tu es l'architecte logiciel responsable de la consolidation du périmètre défini dans les 18 prompts fonctionnels. Aurion V2 doit devenir un système unique, et non une juxtaposition de modules. Ce prompt est la couche transversale obligatoire qui harmonise les 18 blocs ; il ne remplace aucun d'eux.

## 1. Règles de périmètre
- Aurion s'adresse aux entreprises déjà existantes. Ne réintroduis ni création juridique d'entreprise, ni parcours administratif de création, ni générateur d'identité visuelle de création.
- Aucun composant IA, LLM ou agent IA. Toute assistance repose sur règles explicites, calculs déterministes, événements, seuils, workflows et validation humaine.
- V1 est figée et protégée. Ne touche pas à `main`, au déploiement ni aux données de production sauf autorisation expresse. Distingue le code de base réellement audité des exigences qui restent à implémenter.
- Ne présente jamais un mockup, une route isolée, un clic ou une demande envoyée comme une opération achevée.

## 2. Audit préalable
Inspecte le dépôt réel, sa version, les commits, les routes, services, tables, migrations, composants UI, calculs, permissions, événements, synchronisation, stockage, tests et configuration. Exécute les contrôles disponibles avant modification et enregistre les résultats. Pour chaque exigence des 18 prompts, attribue un statut : fonctionnelle vérifiée, partielle, présente mais défectueuse, absente, bloquée par une dépendance ou hors périmètre immédiat. La présence d'un bouton ou d'un fichier ne prouve pas qu'une fonction marche.

## 3. Sources de vérité
Pour chaque entité, définis un module propriétaire, un identifiant stable, ses champs modifiables, ses consommateurs, ses règles de validation, son historique, sa suppression, sa sécurité et son comportement offline. Au minimum : entreprise/établissement, activité, client/contact/adresse, fournisseur, article, stock/mouvement, devis, facture, paiement, intervention, rendez-vous, achat, période comptable, événement, tâche, notification, document et utilisateur/permission. Les autres modules référencent l'entité propriétaire, sans dupliquer les fiches.

Les documents émis conservent leurs instantanés légaux/historiques. Les données courantes peuvent évoluer sans réécrire les pièces déjà émises. Une donnée synchronisée depuis un registre ne doit pas écraser une correction manuelle confirmée.

## 4. Contrats et interactions entre modules
Produis une cartographie complète et une matrice `module source → événement/donnée → module cible → validation → conséquence → mode de reprise`. Inclure tous les parcours croisés : client→devis→intervention→agenda→stock→facture→paiement→comptabilité→dashboard ; achats→stock→comptabilité ; document→comptable/portail ; événement→workflow/notification ; modification offline→serveur→autres appareils. Définis des contrats d'API/services typés, versionnés et documentés. Évite les modifications directes non contrôlées et les dépendances circulaires.

## 5. Calculs centralisés
Audite et centralise les calculs : prix, coûts, temps, frais, TVA, cotisations, marges, rentabilité, paiement partiel, solde, échéancier, retard, trésorerie et indicateurs. Un même jeu d'entrées produit le même résultat dans tous les modules. Distingue réel/prévisionnel/engagé, HT/TTC, facturé/encaissé, réservé/consommé. Documenter précision, arrondis, unités, source et version des paramètres. Ne pas recalculer rétroactivement des documents émis.

## 6. Statuts et cycle de vie
Définis un référentiel d'états partagé ou des états métier propres mais cohérents. Pour chaque objet, établir transitions autorisées, prérequis, permissions, actions, annulation, réouverture, impacts intermodules et trace d'audit. Harmoniser vocabulaire et sémantique. Empêcher qu'une facture payée soit en retard, qu'une intervention annulée bloque l'agenda, qu'une réservation soit consommée par erreur ou qu'une demande résolue reste active.

## 7. Événements, notifications et workflows
Le bloc 5 est le socle transversal des événements. Chaque événement est identifié, daté, attribué, corrélé, versionné et idempotent. Utiliser outbox/queues si nécessaire, reprise, retry contrôlé, déduplication, dead-letter et prévention des boucles. Distinguer événement métier, notification créée/envoyée, action demandée, action exécutée et résultat confirmé. Le bloc 13 réutilise ce moteur et ne réimplémente aucun module. Toute action sensible nécessite droits et validation.

## 8. Documents communs
Le bloc 16 est la source unique du stockage. Les documents peuvent être associés à plusieurs objets sans duplication physique. Centraliser métadonnées, empreintes, versions, historique, permissions, prévisualisation, partage, archivage, restauration et cache offline. Les transmissions au comptable ou partage portail client sont explicites et révocables. Aucune pièce financière/juridique validée ne doit être modifiée rétroactivement.

## 9. Permissions et isolation
Établir une matrice commune de rôles entreprise, dirigeants, collaborateurs, comptables/cabinets, clients et administrateurs techniques. Appliquer les droits côté serveur, API, fichiers, recherche, synchronisation, cache local et interfaces. Masquer un bouton n'est jamais une protection suffisante. Garantir l'isolation multi-tenant, la journalisation et les règles de conservation/RGPD.

## 10. Synchronisation offline et multiappareil
Définir les mêmes contrats métier sur web/PWA/Android/iOS. Répliquer les données structurées autorisées, conserver les opérations en outbox persistante, utiliser idempotency keys, synchronisation delta, résolution de conflits selon la nature de la donnée et reprise après interruption. Pas d'écrasement silencieux. Indiquer l'état de synchronisation et la fraîcheur des données. Les fichiers récents sont mis en cache selon la règle 90 jours + actifs/ouverts/épinglés ; les archives anciennes sont récupérées à la demande. Distinguer cache et archive persistante.

## 11. Dashboard et UX
Le dashboard agrège les modules propriétaires et n'invente pas de calcul. Chaque indicateur possède définition, formule, période, provenance et état de fraîcheur. Unifier navigation, formulaires, boutons, modales, tableaux, filtres, statuts, erreurs, confirmations et composants. Préserver l'identité visuelle et les comportements fonctionnels existants pendant la consolidation ; la refonte graphique complète est une phase ultérieure, une fois les fonctions stabilisées. Responsive, accessibilité, clavier et états de chargement/erreur sont obligatoires.

## 12. Cohérence, erreurs et non-duplication
Identifier données orphelines, doubles enregistrements, calculs concurrents, statuts contradictoires, documents manquants, notifications en doublon, boucles, synchronisations en échec et droits incomplets. Proposer correction contrôlée et auditée. Ne jamais corriger silencieusement ou de manière irréversible des données comptables, fiscales, financières ou juridiques. Chaque fonction doit avoir un propriétaire ; les autres modules la consomment via un contrat commun.

## 13. Traitement particulier des blocs 17 et 18
Le bloc 17 (facturation électronique et intégrations) et le bloc 18 (apps natives, équipes et infrastructure) appartiennent à la vision globale de ce cahier des charges. Leur présence dans les spécifications ne prouve pas qu'ils sont opérationnels. Ils doivent être audités, dépendances listées et priorisés dans la roadmap. Leur activation externe, migration d'hébergement, publication store, coûts, secrets ou connexion de prestataire nécessite validation spécifique et autorisation explicite.

## 14. Livrables obligatoires avant tout code
1. Rapport d'audit factuel, version/commit/base et résultats de tests.
2. Matrice de traçabilité des 18 prompts : exigence, statut réel, source, module propriétaire, dépendances, tests, priorité et risques.
3. Cartographie des données et sources de vérité.
4. Matrice de synchronisation intermodules.
5. Référentiel des statuts et transitions.
6. Catalogue des calculs partagés.
7. Architecture événementielle et workflows.
8. Matrice permissions/isolation.
9. Architecture documentaire et offline/multiappareil.
10. Diagnostic des doublons et incohérences.
11. Graphe de dépendances et plan d'implémentation ordonné, découpé en blocs testables.
12. Plan de tests unitaires, intégration, E2E, offline, sécurité et non-régression.

## 15. Ordre de réalisation indicatif
L'ordre définitif résulte de l'audit, mais doit généralement traiter en premier les fondations de données, identités et permissions ; ensuite calculs/référentiels/événements ; puis documents et synchronisation ; puis CRM/commercial/opérations/agenda/stock ; puis comptabilité et collaboration ; ensuite automatisations et portail ; enfin intégrations externes, apps/infrastructure et harmonisation UI finale. Le dashboard est raccordé progressivement aux vraies sources. Aucun ordre ne doit contourner une dépendance critique.

## 16. Règles d'exécution
Ne commence pas le code avant validation de la spécification consolidée et du plan. Une fois autorisé, travailler par blocs atomiques, commits explicites, migrations additives, tests avant/après, preuves d'exécution et ZIP complet à chaque livraison si demandé. Ne jamais modifier une migration déjà appliquée. Ne pousser ni déployer sans ordre explicite.

## 17. Critère de réussite
Aurion V2 est harmonisé lorsque les 18 blocs sont couverts par une traçabilité complète, les modules utilisent des données et calculs de référence, les statuts/événements sont cohérents, le dashboard reflète les sources, les documents et permissions sont centralisés, offline/multiappareil est fiable, les parcours E2E passent, les erreurs sont récupérables et aucune fonctionnalité validée n'a régressé. Le logiciel doit se comporter comme un système unique, cohérent et déterministe.
