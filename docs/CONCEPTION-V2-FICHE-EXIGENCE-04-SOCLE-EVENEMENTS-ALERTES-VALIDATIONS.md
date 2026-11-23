# AURION V2 — Fiche d'exigence 04 : socle transversal d'événements, alertes, confirmations et validations

> **Statut** : exigence fonctionnelle de la conception V2, réceptionnée le 21 novembre 2026 et
> intégrée au dépôt en 15.4.47. Rattachement backlog V2 : chantier socle transversal d'événements et alertes V2 (nouveau chantier, non démarré — exigence réceptionnée uniquement).
> Cette fiche définit un chantier futur : aucune fonctionnalité n'est développée dans la
> livraison 15.4.47, qui se borne à intégrer l'exigence au backlog de la conception V2.
> Le texte ci-dessous est la fiche de l'éditeur, reprise sans modification de fond ; seuls
> l'en-tête et les annexes de traçabilité sont ajoutés par la présente intégration.

# AURION V2 — SOCLE TRANSVERSAL D'ÉVÉNEMENTS, ALERTES, CONFIRMATIONS ET VALIDATIONS

## 1. OBJECTIF GÉNÉRAL

Développer un système transversal unifié permettant à Aurion de détecter, centraliser, analyser, prioriser et traiter les événements importants de la vie d'une entreprise.

Ce système doit être exploité par l'ensemble des modules Aurion V2.

Aurion doit pouvoir :

- Détecter un événement nécessitant une attention.
- Informer l'utilisateur au bon moment.
- Anticiper une échéance.
- Signaler un risque.
- Détecter une anomalie.
- Prévenir une erreur de manipulation.
- Demander une confirmation lorsque l'action présente un risque.
- Demander une validation explicite pour les opérations sensibles.
- Suivre les actions restant à effectuer.
- Conserver un historique des alertes et décisions.
- Éviter qu'un événement important soit oublié.
- Éviter de générer inutilement plusieurs alertes identiques.
- Permettre de comprendre pourquoi une alerte est apparue et comment la résoudre.

**Aurion doit devenir proactif, mais ne doit jamais devenir intrusif, désordonné ou prendre des décisions sensibles sans autorisation.**

---

## 2. AUDIT COMPLET DU SYSTÈME EXISTANT

Avant tout développement, analyser les mécanismes déjà présents dans Aurion V1.

Examiner notamment :

- Système de notifications.
- Alertes du calendrier fiscal.
- Alertes de facturation.
- Relances.
- Notifications client.
- Rappels de rendez-vous.
- Alertes de paiement.
- Alertes bancaires.
- Gestion des statuts.
- Tâches et journal du dashboard.
- Automatisations existantes.
- Scheduler.
- Emails.
- Système de stockage des événements.
- Logs.
- Routes API.
- Tables PostgreSQL.
- Frontend des notifications.

Identifier les mécanismes qui existent déjà, leurs déclencheurs, leurs destinataires et leurs limites.

Produire un inventaire détaillé :

| Mécanisme existant | Module | Déclencheur | Canal | Limite | Évolution V2 |
|---|---|---|---|---|
| À inventorier | | | | | |

Ne pas créer un système concurrent de notification si un système existant peut être étendu.

Ne pas supprimer les alertes opérationnelles fonctionnelles de V1.

---

## 3. ARCHITECTURE ÉVÉNEMENTIELLE UNIFIÉE

Créer une architecture commune de gestion des événements.

Tous les modules doivent pouvoir produire des événements standardisés.

Exemples :

- Client créé.
- Client modifié.
- Devis créé.
- Devis envoyé.
- Devis accepté.
- Devis refusé.
- Devis expiré.
- Facture créée.
- Facture envoyée.
- Paiement reçu.
- Paiement partiel reçu.
- Paiement en retard.
- Échéance approchante.
- Rendez-vous créé.
- Rendez-vous modifié.
- Rendez-vous annulé.
- Intervention terminée.
- Stock faible.
- Rupture de stock.
- Achat à prévoir.
- Dépense enregistrée.
- Rapprochement bancaire à confirmer.
- Obligation réglementaire détectée.
- Nouvelle règle fiscale applicable.
- Document manquant.
- Document expirant.
- Anomalie détectée.
- Action sensible demandée.
- Synchronisation échouée.
- Sauvegarde échouée.
- Connexion externe indisponible.

### Structure commune d'un événement

Chaque événement doit disposer, selon sa nature, des champs suivants :

- Identifiant unique.
- Type.
- Domaine.
- Entreprise concernée.
- Utilisateur concerné.
- Entité source.
- Identifiant de l'entité.
- Date de création.
- Date de survenue.
- Date de traitement.
- Données contextuelles.
- Niveau de priorité.
- Source de l'événement.
- Statut de traitement.
- Version du schéma.
- Clé d'idempotence.
- Éventuelles références aux événements précédents.

La structure définitive doit être adaptée à l'architecture existante.

Les événements doivent être suffisamment structurés pour être exploités par les alertes, les automatisations, les statistiques et les historiques.

Ne pas utiliser un simple message texte non structuré comme seule source de données.

---

## 4. SYSTÈME CENTRAL DE PRIORITÉ

Créer un mécanisme unifié permettant d'évaluer l'importance d'un événement.

Prévoir plusieurs niveaux :

### Niveau 1 — Information

Événement informatif sans action urgente.

Exemples :
- Nouveau client.
- Mise à jour réussie.
- Document ajouté.
- Paiement enregistré.

### Niveau 2 — Attention

Une action ou vérification est recommandée.

Exemples :
- Devis sans réponse.
- Stock bientôt insuffisant.
- Donnée à compléter.
- Rendez-vous nécessitant une préparation.

### Niveau 3 — Avertissement

Un risque, une échéance proche ou une anomalie nécessitant une action.

Exemples :
- Facture proche de son échéance.
- Provision insuffisante.
- Document bientôt expiré.
- Rapprochement bancaire ambigu.
- Rentabilité faible.

### Niveau 4 — Critique

Un événement susceptible d'avoir des conséquences importantes ou nécessitant une intervention rapide.

Exemples :
- Échéance importante dépassée.
- Échec d'une opération critique.
- Risque de perte de données.
- Erreur importante dans un processus.
- Facture en situation de risque élevé.
- Problème de sécurité.

Les niveaux de gravité ne doivent pas être définis arbitrairement dans chaque module.

Créer un référentiel commun de priorités et permettre aux modules de définir des règles spécifiques compatibles avec celui-ci.

Une priorité doit être explicable et adaptée au contexte.

---

## 5. MOTEUR DE RÈGLES ET DE DÉCLENCHEMENT

Créer un moteur permettant de définir les conditions de génération d'événements et d'alertes.

Il doit pouvoir traiter :

- Événement ponctuel.
- Échéance.
- Condition de seuil.
- Changement de statut.
- Inactivité.
- Absence de réponse.
- Retard.
- Échec.
- Répétition.
- Combinaison de plusieurs conditions.
- Condition temporelle.
- Condition liée à une entité.

Exemples :

- Si une facture reste impayée après une échéance, créer une alerte.
- Si un stock passe sous son seuil, signaler une action.
- Si un devis reste sans réponse pendant une durée configurée, proposer une relance.
- Si une obligation fiscale approche, prévenir l'entreprise.
- Si la rentabilité d'un devis devient négative, avertir avant validation.
- Si un rendez-vous est prévu demain, préparer les informations nécessaires.
- Si une synchronisation échoue, signaler le problème et suivre les tentatives.

Les règles doivent être centralisées, testables et versionnées.

Éviter de disperser des conditions identiques dans plusieurs routes ou composants frontend.

---

## 6. ALERTES CONTEXTUALISÉES ET ACTIONNABLES

Une alerte ne doit pas simplement informer l'utilisateur qu'un problème existe.

Elle doit lui permettre de comprendre et d'agir.

Chaque alerte doit comporter, lorsque pertinent :

- Titre.
- Description.
- Motif.
- Entité concernée.
- Niveau de priorité.
- Date.
- Échéance.
- Conséquence potentielle.
- Action recommandée.
- Action principale.
- Action secondaire.
- Lien vers le module concerné.
- Source de l'information.
- Statut.
- Historique.

Exemple :

**Facture en retard**

- Facture : F-2026-0148
- Client : client concerné
- Montant restant : montant réel calculé
- Retard : nombre de jours réel
- Conséquence : risque de retard d'encaissement
- Action recommandée : vérifier le paiement puis envoyer une relance
- Actions : ouvrir la facture, préparer une relance, ignorer avec justification si nécessaire.

Les données affichées doivent provenir de l'entité réelle et non être dupliquées ou inventées.

---

## 7. CONFIRMATIONS ET VALIDATIONS DES ACTIONS SENSIBLES

Créer un système de validation centralisé.

Les modules doivent pouvoir demander une confirmation avant une opération sensible.

Exemples :

- Envoyer un devis.
- Envoyer une facture.
- Déclencher une relance client.
- Annuler un rendez-vous.
- Supprimer un document.
- Supprimer un client.
- Modifier un prix déjà utilisé.
- Changer un paramètre fiscal.
- Valider un rapprochement bancaire.
- Confirmer une dépense.
- Appliquer une modification de profil métier.
- Déclencher une synchronisation importante.
- Modifier des données en masse.
- Archiver une entité.

### Niveaux de validation

Prévoir une classification commune :

- Aucune confirmation : action réversible et à faible risque.
- Confirmation simple : action nécessitant une vérification.
- Confirmation renforcée : action importante, irréversible ou à conséquences financières.
- Autorisation spécifique : action nécessitant un rôle ou une permission particulière.

Le niveau doit être déterminé selon le risque réel de l'action.

Ne pas demander une confirmation pour chaque clic.

Éviter la fatigue de confirmation.

### Contenu d'une confirmation

Afficher :

- L'action exacte.
- L'entité concernée.
- Les conséquences.
- Les éventuels montants.
- Les données qui seront modifiées.
- Les données qui seront supprimées.
- La possibilité d'annuler.
- Le résultat attendu.

Les confirmations doivent utiliser des composants Aurion cohérents et accessibles.

Ne jamais utiliser `window.alert()`, `window.confirm()` ou `window.prompt()`.

---

## 8. PROTECTION CONTRE LES ACTIONS DESTRUCTRICES

Pour les opérations irréversibles ou dangereuses, mettre en place une protection spécifique.

Exemples :

- Suppression définitive.
- Suppression en masse.
- Modification de données historiques.
- Annulation d'une facture ou d'un document.
- Modification d'un paramètre ayant un impact sur plusieurs modules.
- Suppression d'un profil métier utilisé.
- Modification de droits d'accès.
- Déconnexion d'intégrations.
- Réinitialisation de données.

Prévoir lorsque nécessaire :

- Confirmation renforcée.
- Affichage du nombre d'éléments concernés.
- Affichage des conséquences.
- Motif de l'opération.
- Vérification des permissions.
- Journalisation.
- Possibilité de restauration lorsque techniquement possible.

La suppression logique doit être privilégiée lorsqu'elle permet de préserver l'historique et la cohérence métier.

Ne pas laisser une opération destructive s'exécuter par erreur à la suite d'un double clic ou d'une interaction ambiguë.

---

## 9. SYSTÈME DE DÉDUPLICATION

Le moteur doit empêcher la génération de multiples alertes identiques.

Créer un mécanisme de déduplication basé sur des critères adaptés :

- Type d'événement.
- Entité.
- Entreprise.
- Période.
- Règle déclenchante.
- Statut.
- Clé d'idempotence.

Une alerte déjà ouverte doit être mise à jour lorsque cela est pertinent, plutôt que recréée.

Exemple :

Une facture impayée ne doit pas générer une nouvelle alerte identique chaque jour sans raison.

Elle peut toutefois évoluer :

- Retard de 3 jours.
- Retard de 7 jours.
- Retard de 15 jours.
- Nouveau risque.
- Nouvelle action requise.

Dans ce cas, mettre à jour la priorité ou l'état de l'alerte existante, ou créer un événement d'évolution lié à celle-ci.

La logique doit empêcher les doublons tout en conservant l'historique des changements importants.

---

## 10. GESTION DES STATUTS ET DU CYCLE DE VIE

Définir un cycle de vie commun des alertes.

Prévoir des statuts cohérents, par exemple :

- Nouvelle.
- À traiter.
- En cours.
- En attente.
- Résolue.
- Ignorée.
- Archivée.

Chaque statut doit correspondre à une action réelle.

### Résolution

Une alerte peut être résolue :

- Automatiquement lorsque la condition n'existe plus.
- Manuellement par l'utilisateur.
- À la suite d'une action effectuée.
- Après validation d'un événement.

La résolution automatique ne doit pas supprimer l'historique.

### Ignorer

L'utilisateur peut ignorer certaines alertes.

Prévoir :

- Une durée d'ignorance.
- Une possibilité de réactivation.
- Un motif lorsque cela est nécessaire.
- Des restrictions pour les alertes critiques.

Une alerte ignorée ne doit pas être considérée comme une action réalisée.

### Archivage

Les alertes résolues doivent pouvoir être consultées.

L'historique ne doit pas être supprimé à chaque nettoyage du système.

---

## 11. GESTION DES ÉCHÉANCES ET RAPPELS

Le système doit être capable de gérer les échéances de tous les modules.

Prévoir des rappels :

- Plusieurs jours avant.
- La veille.
- Le jour même.
- Après échéance.
- Selon une cadence adaptée à l'événement.

La cadence doit être configurable et contextualisée.

Exemples :

- Échéance fiscale.
- Paiement client.
- Rendez-vous.
- Contrat à renouveler.
- Document à renouveler.
- Stock à réapprovisionner.
- Devis à relancer.
- Intervention à préparer.

Ne pas générer des rappels sans limite.

Prévoir un mécanisme d'arrêt, de résolution et de déduplication.

---

## 12. CENTRE DE NOTIFICATIONS UNIFIÉ

Créer un centre de notifications Aurion regroupant les informations provenant des différents modules.

Le centre doit permettre :

- Consulter les nouvelles notifications.
- Identifier les notifications prioritaires.
- Filtrer par catégorie.
- Filtrer par module.
- Filtrer par statut.
- Rechercher.
- Marquer comme lu.
- Marquer comme traité.
- Ouvrir l'entité associée.
- Consulter l'historique.
- Retrouver les notifications archivées.

Prévoir des catégories :

- Clients.
- Commercial.
- Facturation.
- Paiements.
- Agenda.
- Interventions.
- Stock.
- Finances.
- Fiscalité.
- Documents.
- Système.
- Sécurité.

L'interface doit afficher un indicateur de notifications non lues et un indicateur de priorité lorsque nécessaire.

Ne pas transformer le centre en flux de messages désordonné.

Les notifications doivent être triées de façon pertinente.

---

## 13. CANAUX DE NOTIFICATION

Créer une architecture permettant de gérer plusieurs canaux.

### A. Notification interne Aurion

Canal principal :

- Centre de notifications.
- Indicateurs.
- Alertes dans les modules.
- Dashboard.

### B. Email

Permettre l'envoi d'emails lorsqu'une intégration opérationnelle existe.

Exemples :

- Échéance importante.
- Rappel de rendez-vous.
- Alerte critique.
- Rapport périodique.

Ne pas considérer le canal email comme opérationnel si le fournisseur ou la configuration est indisponible.

### C. Notifications push

Prévoir l'architecture pour les applications mobiles et PWA.

### D. Autres canaux futurs

Prévoir la possibilité d'intégrer ultérieurement d'autres canaux sans modifier l'ensemble du moteur.

### Gestion des préférences

Permettre à l'utilisateur de personnaliser :

- Canaux.
- Types de notifications.
- Horaires.
- Fréquence.
- Résumés.
- Notifications non essentielles.

Les alertes critiques ne doivent pas être désactivées silencieusement par une simple préférence générale.

---

## 14. DÉTECTION D'ANOMALIES ET RISQUES

Le socle doit permettre aux modules de signaler des anomalies.

Exemples :

- Devis incohérent.
- Prix anormalement faible.
- Marge négative.
- Facture en retard.
- Dépense inhabituelle.
- Rapprochement bancaire incertain.
- Doublon de document.
- Client avec données manquantes.
- Échéance oubliée.
- Synchronisation incomplète.
- Écart entre prévision et réel.
- Erreur de calcul.
- Rupture de stock.
- Plusieurs rendez-vous incompatibles.

L'analyse doit reposer sur des règles explicites et des données vérifiables.

Ne pas créer de fausses alertes basées sur des seuils arbitraires.

Permettre aux modules de fournir une explication et un niveau de fiabilité.

Les anomalies détectées par IA, si une IA est utilisée, doivent être distinguées des anomalies déterministes.

Ne pas présenter une suspicion algorithmique comme une erreur certaine.

---

## 15. JOURNAL D'ACTIONS ET AUDIT

Créer ou enrichir un journal centralisé des événements importants.

Tracer notamment :

- Action.
- Auteur.
- Date.
- Entreprise.
- Entité.
- Valeurs précédentes lorsque pertinent.
- Valeurs nouvelles lorsque pertinent.
- Origine.
- Validation.
- Motif.
- Résultat.
- Éventuelle erreur.

Les actions importantes doivent être traçables.

Prévoir un journal dédié aux validations et aux opérations sensibles.

Ne pas stocker inutilement des données sensibles en clair dans les logs.

Les journaux doivent être protégés contre les modifications non autorisées.

Les permissions doivent permettre de consulter uniquement les événements autorisés.

---

## 16. GESTION DES TÂCHES ISSUES DES ALERTES

Une alerte peut nécessiter une action.

Le système doit pouvoir transformer une alerte en tâche, ou l'associer à une tâche existante.

Prévoir :

- Titre.
- Description.
- Responsable.
- Échéance.
- Priorité.
- Module.
- Entité associée.
- Statut.
- Historique.
- Résultat.

Éviter de dupliquer les tâches déjà existantes.

Si Aurion dispose déjà d'un système de tâches ou d'un journal d'actions, l'étendre.

Une tâche créée depuis une alerte doit conserver le lien vers l'alerte d'origine.

Lorsqu'une tâche est terminée, mettre à jour l'alerte uniquement si la condition métier est réellement résolue.

---

## 17. INTÉGRATION AU DASHBOARD

Le dashboard doit utiliser le socle transversal.

Il doit afficher les éléments prioritaires :

- Actions urgentes.
- Échéances.
- Alertes critiques.
- Éléments en attente de validation.
- Tâches en retard.
- Risques.
- Événements importants à venir.

Ne pas afficher toutes les notifications sur le dashboard.

Le dashboard doit répondre rapidement à trois questions :

1. Que dois-je faire maintenant ?
2. Qu'est-ce que je risque d'oublier ?
3. Que nécessite mon attention prochainement ?

Les éléments affichés doivent être priorisés et actionnables.

---

## 18. AUTOMATISATIONS ET VALIDATION HUMAINE

Le socle doit préparer les futures automatisations du chantier dédié.

Il doit pouvoir gérer :

- Déclencheur.
- Conditions.
- Action.
- Délai.
- Répétition.
- Statut.
- Résultat.
- Erreur.
- Validation requise.
- Annulation.

Distinguer :

- Action automatique sans conséquence sensible.
- Action automatique préparée mais non exécutée.
- Action nécessitant une validation.
- Action interdite sans autorisation spécifique.

Exemples :

- Préparer une relance mais demander confirmation avant envoi.
- Préparer un devis mais ne pas l'envoyer automatiquement.
- Proposer une correction mais ne pas modifier les données.
- Détecter un échéancier mais demander validation avant de l'appliquer.
- Générer un rapport automatiquement.
- Archiver une notification résolue selon une règle définie.

L'utilisateur doit toujours pouvoir comprendre ce qu'Aurion fait et pourquoi.

---

## 19. INTERFACE ET ERGONOMIE

Le système de notifications doit s'intégrer à l'interface Aurion V2.

Prévoir :

- Centre de notifications.
- Badge compteur.
- Alertes contextuelles dans les modules.
- Confirmations.
- Historique.
- Filtres.
- Recherche.
- Actions rapides.
- Gestion des priorités.

### Principes UX

- Ne pas interrompre l'utilisateur sans nécessité.
- Ne pas multiplier les popups.
- Utiliser les confirmations uniquement lorsque le risque le justifie.
- Afficher les alertes directement dans le contexte de l'action.
- Rendre les actions compréhensibles.
- Permettre de revenir à l'entité concernée.
- Respecter la navigation mobile.
- Respecter l'accessibilité.
- Prévoir les états chargement, erreur, succès et indisponibilité.

Conserver l'identité visuelle d'Aurion.

Les confirmations doivent être accessibles au clavier et compatibles avec les lecteurs d'écran.

Les alertes ne doivent pas reposer uniquement sur une couleur pour exprimer leur gravité.

---

## 20. FIABILITÉ TECHNIQUE

### A. Traitement des événements

Prévoir :

- Idempotence.
- Déduplication.
- Retry contrôlé.
- Gestion des erreurs.
- Gestion des événements en échec.
- Ordre de traitement lorsque nécessaire.
- Concurrence.
- Traçabilité.

### B. Durabilité

Un événement important ne doit pas être perdu si le traitement échoue.

Évaluer la nécessité d'un pattern transactionnel de type outbox pour les événements produits par les opérations métier.

Ne pas introduire une infrastructure lourde sans justification.

### C. Scheduler

Auditer le scheduler existant.

L'étendre pour les rappels, les échéances et les traitements différés.

Prévoir :

- Répétition.
- Reprise.
- Déduplication.
- Fuseaux horaires.
- Gestion des dates.
- Arrêt des règles.
- Résolution automatique.

### D. Performance

Éviter :

- Les notifications recalculées à chaque affichage.
- Les scans inutiles de toutes les entités.
- Les doublons.
- Les traitements bloquants.
- Les boucles infinies.

Le système doit rester performant même lorsque le volume de notifications augmente.

---

## 21. API ET CONTRATS

Auditer les routes et services existants.

Créer ou faire évoluer les contrats nécessaires pour :

- Consulter les notifications.
- Consulter les alertes.
- Filtrer.
- Marquer comme lu.
- Marquer comme traité.
- Résoudre.
- Ignorer.
- Réactiver.
- Archiver.
- Créer une tâche.
- Valider une action.
- Annuler une validation.
- Consulter un historique.
- Configurer les préférences.
- Consulter les règles applicables.

Les opérations doivent vérifier :

- Permissions.
- Entreprise.
- Entité.
- Statut.
- Validité.
- Conditions d'exécution.

Ne pas laisser le frontend décider seul qu'une action sensible est autorisée.

---

## 22. TESTS OBLIGATOIRES

### Événements

1. Création d'un événement.
2. Événement correctement enregistré.
3. Événement dupliqué.
4. Clé d'idempotence.
5. Échec du traitement.
6. Retry.
7. Événement en échec définitif.
8. Concurrence.

### Alertes

9. Alerte générée.
10. Alerte mise à jour.
11. Alerte dédupliquée.
12. Changement de priorité.
13. Résolution automatique.
14. Résolution manuelle.
15. Réactivation.
16. Ignorer.
17. Archivage.

### Validations

18. Confirmation simple.
19. Confirmation renforcée.
20. Permission insuffisante.
21. Action annulée.
22. Double clic.
23. Action destructive.
24. Opération concurrente.

### Notifications

25. Notification interne.
26. Notification email configurée.
27. Email non configuré.
28. Push indisponible.
29. Préférences utilisateur.
30. Alerte critique.
31. Déduplication multicanal.

### Intégration

32. Facture en retard.
33. Échéance fiscale.
34. Rendez-vous.
35. Stock faible.
36. Rapprochement bancaire.
37. Marge négative.
38. Document expiré.
39. Tâche issue d'une alerte.
40. Dashboard.

### Sécurité et régression

41. Isolation entre entreprises.
42. Contrôle des permissions.
43. Historique protégé.
44. Données sensibles absentes des logs.
45. Fonctionnalités V1 préservées.

Exécuter les tests et fournir les résultats.

---

## 23. LIVRABLES ATTENDUS

1. Audit du système V1.
2. Inventaire des notifications existantes.
3. Architecture événementielle.
4. Modèle d'événements.
5. Modèle de données.
6. Migrations.
7. Moteur de règles.
8. Moteur de priorités.
9. Gestion des alertes.
10. Gestion des validations.
11. Déduplication.
12. Centre de notifications.
13. Gestion des échéances.
14. Gestion des tâches.
15. Journal d'audit.
16. Intégration au dashboard.
17. Intégration aux modules existants.
18. API documentée.
19. Tests automatisés.
20. Résultats de tests.
21. Documentation technique.
22. Guide de maintenance.

---

## 24. CONTRAINTES ABSOLUES

- Ne pas modifier Aurion V1.
- Ne pas toucher à GitHub `main`.
- Aucun commit.
- Aucun push.
- Aucun déploiement.
- Ne pas créer ou modifier de branche sans autorisation.
- Travailler dans un environnement V2 isolé.
- Ne pas créer un moteur de notifications concurrent.
- Ne pas supprimer les notifications fonctionnelles existantes.
- Ne pas utiliser de popups intrusives systématiquement.
- Ne pas utiliser `alert()`, `confirm()` ou `prompt()` JavaScript.
- Ne pas déclencher de doublons.
- Ne pas exécuter une action sensible sans autorisation.
- Ne pas considérer une alerte ignorée comme résolue.
- Ne pas perdre l'historique.
- Ne pas exposer les données d'une autre entreprise.
- Ne pas envoyer de communications externes sans validation lorsque celle-ci est requise.
- Ne pas désactiver silencieusement les alertes critiques.

---

## 25. CRITÈRES DE VALIDATION FINALE

Le chantier est terminé uniquement lorsque :

- Les événements sont standardisés.
- Les modules peuvent produire et exploiter des événements.
- Les alertes sont contextualisées.
- Les priorités sont cohérentes.
- Les alertes sont dédupliquées.
- Les échéances sont gérées.
- Les validations sont centralisées.
- Les opérations sensibles sont protégées.
- Le centre de notifications est opérationnel.
- Les tâches sont liées aux alertes.
- Les historiques sont traçables.
- Le dashboard exploite correctement les alertes.
- Les automatisations sont compatibles avec le socle.
- Les tests passent.
- La sécurité et l'isolation des entreprises sont démontrées.
- Aucune régression V1 n'a été introduite dans l'environnement V2.

Aucune fonctionnalité ne doit être déclarée opérationnelle sans preuve de fonctionnement et de validation.
