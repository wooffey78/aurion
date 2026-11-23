# AURION V2 — Fiche d'exigence 03 : référentiel fiscal, social, juridique et réglementaire intelligent

> **Statut** : exigence fonctionnelle de la conception V2, réceptionnée le 21 novembre 2026 et
> intégrée au dépôt en 15.4.47. Rattachement backlog V2 : chantier référentiel réglementaire V2 (nouveau chantier, non démarré — exigence réceptionnée uniquement).
> Cette fiche définit un chantier futur : aucune fonctionnalité n'est développée dans la
> livraison 15.4.47, qui se borne à intégrer l'exigence au backlog de la conception V2.
> Le texte ci-dessous est la fiche de l'éditeur, reprise sans modification de fond ; seuls
> l'en-tête et les annexes de traçabilité sont ajoutés par la présente intégration.

# AURION V2 — RÉFÉRENTIEL FISCAL, SOCIAL, JURIDIQUE ET RÉGLEMENTAIRE INTELLIGENT

## 1. OBJECTIF

Faire évoluer les connaissances fiscales, sociales, administratives et réglementaires d'Aurion pour fournir aux entreprises un accompagnement fiable, contextualisé, actualisé et exploitable.

Aurion doit aider l'entrepreneur à :

- Comprendre ses obligations.
- Identifier les formalités applicables à sa situation.
- Anticiper les échéances.
- Comprendre les conséquences d'une décision.
- Estimer ses charges et cotisations.
- Identifier les documents à produire.
- Éviter les oublis administratifs.
- Comprendre les changements réglementaires.
- Savoir ce qui a été effectué, ce qui reste à faire et ce qui nécessite une vérification.
- Accéder aux sources officielles justifiant les informations affichées.

Le système doit être capable d'adapter ses réponses au profil de l'entreprise, son activité, son régime, sa situation, ses options, sa date de création, ses salariés éventuels et ses paramètres fiscaux.

**Aurion ne doit jamais inventer une obligation, un taux, une échéance ou une règle juridique. Il ne doit jamais présenter une hypothèse comme une information officielle.**

---

## 2. AUDIT DE L'EXISTANT

Avant toute modification, examiner intégralement les systèmes existants, notamment :

- `backend/src/services/micro-referential.ts`
- `backend/src/services/fiscal-calendar.ts`
- `backend/src/services/accounting.ts`
- `backend/src/services/accounting-export.ts`
- `backend/src/services/document-forecast.ts`
- `backend/src/services/profiles.ts`
- Les routes fiscales, comptables, administratives et de gestion.
- Les migrations PostgreSQL associées.
- Les alertes et notifications existantes.
- Les paramètres des entreprises.
- Les tableaux de bord.
- Les documents et exports.

Le référentiel V1 possède déjà des taux versionnés, des dates d'effet, des sources et des informations de vérification.

Le calendrier fiscal comprend déjà certaines échéances et alertes.

Ne pas reconstruire ces mécanismes.

Établir un inventaire :

| Domaine | Fonction existante | Lacunes | Amélioration V2 |
|---|---|---|---|
| Cotisations | Auditer | À identifier | À définir |
| TVA | Auditer | À identifier | À définir |
| CFE | Auditer | À identifier | À définir |
| Calendrier fiscal | Auditer | À identifier | À définir |
| Déclarations | Auditer | À identifier | À définir |
| ACRE | Auditer | À identifier | À définir |
| Obligations administratives | Auditer | À identifier | À définir |
| Réglementation métier | Auditer | À identifier | À définir |
| Alertes | Auditer | À identifier | À définir |

Les lacunes doivent être établies à partir du code et du référentiel réel.

---

## 3. ARCHITECTURE DU RÉFÉRENTIEL CENTRAL

Créer un référentiel réglementaire central, versionné, structuré et exploitable par les différents modules Aurion.

Chaque règle doit pouvoir contenir, selon sa nature :

- Identifiant unique.
- Domaine.
- Sujet.
- Titre.
- Description.
- Explication simplifiée.
- Règle applicable.
- Population concernée.
- Conditions d'application.
- Exceptions.
- Date de début de validité.
- Date de fin de validité éventuelle.
- Date de publication.
- Date de dernière vérification.
- Source officielle.
- URL source.
- Niveau de fiabilité.
- Statut de validation.
- Version.
- Historique des modifications.
- Conséquences sur l'entreprise.
- Actions requises.
- Échéances associées.

Prévoir les statuts suivants ou des équivalents cohérents :

- Brouillon.
- À vérifier.
- Vérifié.
- Actif.
- À venir.
- Expiré.
- Remplacé.
- Archivé.

Les règles doivent être séparées des données personnelles ou professionnelles de l'entreprise.

Le référentiel ne doit pas être dispersé dans des conditions codées en dur au sein de plusieurs modules.

---

## 4. SOURCES D'INFORMATION ET VALIDATION

Privilégier les sources officielles.

### Sources prioritaires

- URSSAF.
- Service-Public.fr.
- Direction générale des Finances publiques.
- Impots.gouv.fr.
- Ministères concernés.
- Légifrance.
- INSEE.
- Entreprendre.Service-Public.fr.
- Assurance maladie et organismes officiels concernés.
- Organismes professionnels officiels lorsque la réglementation relève d'un secteur particulier.

Les sources secondaires ne doivent servir qu'en complément et ne doivent pas remplacer une source officielle lorsqu'une règle légale ou fiscale est concernée.

### Vérification des informations

Chaque règle importante doit être vérifiée avant sa publication dans le référentiel actif.

Enregistrer :

- La source.
- La date de vérification.
- La date d'effet.
- La personne ou le processus ayant validé la règle.
- Les éventuelles divergences entre sources.
- Le niveau de certitude.

Si les sources sont contradictoires, le système ne doit pas arbitrer silencieusement.

Il doit signaler la règle comme nécessitant une vérification.

### Sources indisponibles

Si une source officielle est inaccessible :

- Ne pas inventer son contenu.
- Ne pas affirmer qu'une règle a été actualisée.
- Conserver la dernière version vérifiée si son utilisation reste acceptable.
- Afficher la date de dernière vérification.
- Signaler que l'information peut nécessiter une actualisation.

---

## 5. GESTION DES VERSIONS ET DES DATES D'EFFET

La gestion des dates est essentielle.

Une règle peut être publiée aujourd'hui mais ne s'appliquer que plusieurs mois plus tard.

Le système doit distinguer :

- Date de publication.
- Date de vérification.
- Date d'entrée en vigueur.
- Date de fin de validité.
- Date d'application à l'entreprise.
- Date de prise en compte par Aurion.

Le moteur doit permettre de gérer les règles futures sans les appliquer prématurément.

Il doit également gérer les règles abrogées ou remplacées.

Une modification de taux ne doit pas modifier rétroactivement un calcul historique sans mécanisme explicitement prévu.

Les calculs fiscaux et sociaux historiques doivent pouvoir retrouver les règles utilisées à l'époque.

Prévoir une stratégie de versionnement permettant de reproduire un calcul à partir de :

- La situation de l'entreprise.
- La date concernée.
- La version des règles.
- Les paramètres utilisés.

---

## 6. PROFIL RÉGLEMENTAIRE DE L'ENTREPRISE

Le référentiel doit s'adapter aux informations réelles de chaque entreprise.

Prendre en compte, lorsque ces données sont disponibles :

- Forme juridique.
- Date de création.
- Date de début d'activité.
- Activité principale.
- Activités secondaires.
- Profil métier retenu.
- Code NAF/APE.
- Régime fiscal.
- Régime social.
- TVA.
- Options fiscales.
- Situation géographique.
- Établissements.
- Présence de salariés.
- Employeur ou non.
- Situation particulière.
- Historique des changements.

Ne pas supposer qu'une entreprise est éligible à un régime simplement en raison de son métier.

Lorsqu'une information indispensable manque, demander à l'utilisateur de la renseigner ou signaler que la règle ne peut pas être déterminée avec certitude.

Les choix manuels de l'entreprise doivent être préservés.

Une détection automatique ne doit pas remplacer une option ou une situation explicitement confirmée.

---

## 7. COTISATIONS SOCIALES ET URSSAF

Enrichir le référentiel consacré aux cotisations sociales.

Le système doit pouvoir identifier les règles applicables selon la situation de l'entreprise et la période.

Prévoir la gestion de :

- Taux de cotisations.
- Contributions complémentaires.
- Catégories d'activité.
- Régimes spécifiques.
- Options.
- Dispositifs d'exonération.
- ACRE.
- Périodes de transition.
- Dates d'entrée en vigueur.
- Échéances de déclaration.
- Échéances de paiement.
- Régularisations éventuelles.

Le moteur doit fonctionner avec le moteur économique du prompt n° 3.

Il doit permettre de calculer ou d'estimer :

- Cotisations prévisionnelles.
- Cotisations sur chiffre d'affaires déclaré.
- Provisions recommandées.
- Écart entre provisions et montants estimés.
- Impact sur le revenu disponible.
- Échéances à venir.

### ACRE

Intégrer les règles ACRE avec :

- Conditions d'éligibilité.
- Date de création.
- Date de demande lorsque applicable.
- Durée.
- Taux ou modalités applicables.
- Date d'effet.
- Évolution des règles.
- Sources officielles.

Ne pas appliquer automatiquement une ancienne règle ou un ancien taux.

L'éligibilité doit être déterminée selon les règles applicables à la date concernée.

Ne pas supposer que tous les entrepreneurs bénéficient de l'ACRE.

---

## 8. IMPÔTS ET OBLIGATIONS FISCALES

Développer un référentiel fiscal adapté aux entreprises ciblées par Aurion.

Prévoir notamment :

- Impôt sur le revenu.
- Régime micro-fiscal lorsque applicable.
- Régime réel lorsque applicable.
- TVA.
- Franchise en base.
- Déclarations.
- Obligations annuelles.
- Obligations périodiques.
- CFE.
- Options fiscales.
- Seuils.
- Conséquences du dépassement de seuils.
- Dates d'effet des changements de régime.

Le système doit être capable d'expliquer la différence entre les régimes, leurs conséquences et les informations nécessaires pour déterminer celui qui s'applique.

Ne pas présenter des conseils d'optimisation fiscale comme des garanties.

Ne pas recommander un changement de régime sans analyser les conséquences et afficher les hypothèses.

---

## 9. CFE ET OBLIGATIONS LOCALES

Enrichir le système de gestion de la CFE.

Prévoir :

- Déclaration initiale.
- Année de création.
- Exonération éventuelle.
- Situation des établissements.
- Informations nécessaires.
- Échéances.
- Paiement.
- Avis.
- Montant lorsque l'utilisateur le renseigne.
- Historique.
- Alertes.

Distinguer clairement :

- Obligation de déclaration.
- Exonération.
- Cotisation due.
- Paiement.
- Date limite de paiement.

Ne pas confondre l'année de création, la déclaration initiale et l'échéance annuelle de paiement.

Les règles doivent être contextualisées et vérifiées.

---

## 10. DÉCLARATIONS ET FORMALITÉS

Créer un référentiel des déclarations et formalités adaptées au profil de l'entreprise.

Pour chaque formalité :

- Nom.
- Description.
- Organisme concerné.
- Conditions d'application.
- Informations nécessaires.
- Documents nécessaires.
- Étapes.
- Échéance.
- Fréquence.
- Conséquences d'un retard lorsque vérifiées.
- Source officielle.
- Statut dans Aurion.

Exemples de formalités à examiner selon la situation :

- Déclarations de chiffre d'affaires.
- Déclarations fiscales annuelles.
- 2042-C-PRO.
- Déclarations de TVA.
- CFE.
- Formalités liées à la création ou modification d'activité lorsqu'elles concernent les entreprises existantes.
- Déclarations d'embauche.
- Formalités liées aux salariés.
- Obligations de conservation de documents.

Les formalités doivent être conditionnelles.

Ne pas afficher toutes les formalités à toutes les entreprises.

---

## 11. GESTION DES SALARIÉS ET OBLIGATIONS EMPLOYEUR

Lorsqu'une entreprise emploie des salariés ou indique vouloir embaucher, activer un référentiel spécifique.

Prévoir, selon la réglementation applicable :

- DPAE.
- Contrat de travail.
- Registre du personnel.
- Obligations déclaratives.
- Cotisations patronales.
- Paie.
- Congés.
- Temps de travail.
- Santé et sécurité.
- Obligations liées à l'embauche.
- Échéances administratives.

Ne pas activer les obligations employeur pour une entreprise sans salarié, sauf si elles sont présentées comme une préparation à l'embauche.

Une formalité doit être déclenchée en fonction d'un événement ou d'une situation confirmée.

Les informations liées au droit du travail doivent être sourcées et versionnées.

Aurion ne doit pas se substituer à un service de paie certifié ou à un expert lorsque le traitement dépasse son périmètre.

---

## 12. OBLIGATIONS SPÉCIFIQUES AUX MÉTIERS

Le référentiel doit être relié au catalogue métier du prompt n° 2.

Identifier les obligations qui peuvent dépendre :

- Du métier.
- Des prestations proposées.
- Des équipements utilisés.
- Des qualifications.
- Des certifications.
- Des assurances.
- Des lieux d'intervention.
- Des produits utilisés.
- Des risques professionnels.
- De la présence de salariés.

Pour chaque obligation métier :

- Définir les conditions d'application.
- Identifier la source officielle.
- Indiquer les éventuelles qualifications requises.
- Distinguer obligation et recommandation.
- Indiquer les conséquences lorsqu'elles sont vérifiées.
- Afficher les contrôles ou démarches à réaliser.

Ne jamais attribuer automatiquement à l'utilisateur une qualification ou une certification.

Ne pas considérer un profil métier Aurion comme preuve d'autorisation d'exercer.

---

## 13. CALENDRIER INTELLIGENT ET ÉCHÉANCES

Enrichir le calendrier fiscal et administratif existant.

Le calendrier doit générer les échéances en fonction du profil réel de l'entreprise.

Il doit pouvoir distinguer :

- Échéance obligatoire.
- Échéance conditionnelle.
- Rappel.
- Action recommandée.
- Date de vérification.
- Événement informatif.

Prévoir :

- Échéances mensuelles.
- Échéances trimestrielles.
- Échéances annuelles.
- Échéances ponctuelles.
- Échéances liées à un événement.
- Échéances futures.
- Échéances expirées.
- Retards.

Pour chaque échéance, afficher :

- Nom.
- Date.
- Motif.
- Action attendue.
- Organisme concerné.
- Documents nécessaires.
- Source.
- Statut.
- Niveau de priorité.

Permettre à l'utilisateur de marquer une action comme effectuée, d'ajouter une preuve ou un document, et de conserver l'historique.

Ne pas marquer automatiquement une formalité comme réalisée sans preuve ou confirmation.

---

## 14. SYSTÈME DE VEILLE RÉGLEMENTAIRE

Créer un mécanisme de veille permettant de détecter les changements susceptibles d'affecter les entreprises utilisant Aurion.

Surveiller les sources officielles pertinentes concernant :

- Fiscalité.
- Cotisations.
- TVA.
- Seuils.
- ACRE.
- CFE.
- Obligations déclaratives.
- Facturation électronique.
- Réglementation métier.
- Droit du travail.
- Formalités administratives.

Le système de veille doit détecter les changements, mais ne doit pas les appliquer automatiquement au référentiel actif.

### Processus de traitement

1. Détecter une nouvelle publication ou modification.
2. Identifier le domaine concerné.
3. Comparer avec la règle existante.
4. Identifier les entreprises potentiellement concernées.
5. Évaluer la date d'effet.
6. Préparer une nouvelle version de la règle.
7. Vérifier la source.
8. Valider la nouvelle règle.
9. Publier dans le référentiel.
10. Déclencher les notifications adaptées.

Lorsque la validation humaine est nécessaire, la nouvelle règle doit rester en attente.

Ne jamais laisser une extraction automatique de texte officiel modifier seule un taux, une obligation ou une règle sensible en production.

---

## 15. IMPACT DES CHANGEMENTS RÉGLEMENTAIRES

Lorsqu'une nouvelle règle est validée, Aurion doit déterminer son impact.

Exemples :

- Entreprises concernées.
- Paramètres à mettre à jour.
- Calculs affectés.
- Échéances à modifier.
- Documents à préparer.
- Actions à entreprendre.
- Utilisateurs à informer.

Prévoir un mécanisme d'analyse d'impact.

Ne pas modifier les paramètres personnels d'une entreprise sans vérifier les règles de protection des choix manuels.

Lorsqu'un changement est applicable, afficher :

- Ancienne règle.
- Nouvelle règle.
- Date d'application.
- Impact estimé.
- Action recommandée.
- Source officielle.

Les changements importants doivent générer une notification adaptée.

---

## 16. ASSISTANT EXPLICATIF RÉGLEMENTAIRE

Développer un système d'explication accessible permettant à l'utilisateur de comprendre les informations réglementaires.

L'assistant doit pouvoir répondre à des questions contextualisées telles que :

- Pourquoi dois-je effectuer cette déclaration ?
- Cette obligation me concerne-t-elle ?
- Quel est le montant à provisionner ?
- Quand dois-je payer ?
- Quels documents dois-je conserver ?
- Pourquoi cette échéance apparaît-elle ?
- Que se passe-t-il si je change de régime ?
- Quelles sont les démarches nécessaires ?

Les réponses doivent être basées sur le référentiel Aurion.

Chaque réponse réglementaire importante doit pouvoir afficher :

- La règle utilisée.
- La situation prise en compte.
- La date de validité.
- La source officielle.
- Les limites de la réponse.
- Les éléments nécessitant confirmation.

Si les informations sont insuffisantes, l'assistant doit poser une question ciblée ou signaler son incertitude.

Ne pas inventer de références légales.

Ne pas produire de réponse définitive lorsqu'une situation complexe nécessite une expertise professionnelle.

---

## 17. ALERTES, VALIDATIONS ET NOTIFICATIONS

Ce chantier doit s'intégrer au moteur transversal d'événements et d'alertes prévu dans Aurion V2.

Prévoir notamment :

- Nouvelle obligation.
- Échéance à venir.
- Échéance imminente.
- Retard.
- Modification de règle.
- Changement de taux.
- Seuil approché.
- Seuil dépassé.
- Document manquant.
- Formalité non terminée.
- Donnée de profil à confirmer.
- Référentiel nécessitant actualisation.

Les alertes doivent être contextualisées, priorisées et dédupliquées.

Ne pas générer plusieurs notifications pour le même événement.

Permettre de retrouver l'historique des alertes et des actions.

Les règles de notification doivent être paramétrables, sans désactiver silencieusement les alertes critiques.

---

## 18. FACTURATION ÉLECTRONIQUE ET OBLIGATIONS ASSOCIÉES

Intégrer le référentiel des obligations liées à la réforme de la facturation électronique.

Prévoir :

- Calendrier de déploiement.
- Obligations de réception.
- Obligations d'émission.
- E-reporting lorsque applicable.
- Conditions de mise en conformité.
- Formats.
- Plateformes agréées.
- Statuts.
- Exceptions.
- Date d'application selon le profil de l'entreprise.

Les informations doivent être vérifiées auprès des sources officielles.

Aurion doit distinguer :

- Fonctionnalité disponible dans l'application.
- Fonctionnalité techniquement préparée.
- Intégration réellement connectée.
- Transmission réellement effectuée.
- Conformité validée.

Ne jamais afficher une entreprise comme conforme sur la seule base d'une configuration interne Aurion.

Ne pas présenter une intégration générique comme une connexion opérationnelle à une plateforme agréée.

---

## 19. DOCUMENTS ET PREUVES

Permettre de relier les formalités aux documents justificatifs.

Exemples :

- Attestations.
- Déclarations.
- Avis.
- Accusés de réception.
- Justificatifs de paiement.
- Documents fiscaux.
- Documents sociaux.
- Contrats.
- Certificats.
- Notifications officielles.

Les documents doivent pouvoir être :

- Associés à une formalité.
- Datés.
- Classés.
- Consultés.
- Téléchargés.
- Conservés selon les règles applicables.
- Retrouvés dans l'historique.

Prévoir une gestion de documents expirés ou devant être renouvelés.

Ne pas prétendre que l'enregistrement d'un document dans Aurion remplace son dépôt auprès de l'organisme concerné.

---

## 20. INTERFACE ET PRÉSENTATION

Créer une expérience claire, simple et orientée action.

Prévoir une organisation cohérente avec les futurs espaces Aurion V2 :

- Vue des obligations.
- Calendrier.
- Fiscalité.
- Social.
- Réglementation métier.
- Veille.
- Documents.
- Historique.

La priorité d'affichage doit être :

1. Ce qui doit être fait.
2. Ce qui approche.
3. Ce qui nécessite une vérification.
4. Ce qui a changé.
5. Ce qui est déjà réalisé.
6. Les explications et références.

Ne pas afficher une liste exhaustive de lois ou de formalités sans pertinence pour l'entreprise.

Utiliser une présentation progressive des informations.

Conserver le style Aurion : interface claire, fond légèrement bleuté, textes foncés, cartes sobres, responsive et accessible.

La refonte globale de l'interface interviendra lorsque le périmètre V2 sera stabilisé.

---

## 21. SÉCURITÉ, TRAÇABILITÉ ET FIABILITÉ

- Isolation des données entre entreprises.
- Contrôle des permissions.
- Traçabilité des modifications.
- Historique des règles.
- Historique des validations.
- Protection des choix manuels.
- Gestion des conflits.
- Aucune modification rétroactive non contrôlée.
- Aucune règle sensible publiée sans validation.
- Aucune source inventée.
- Aucune échéance créée sans règle fiable.
- Aucune notification présentée comme une obligation si elle ne l'est pas.

Les données réglementaires doivent pouvoir être auditées.

Les règles appliquées à un calcul doivent pouvoir être retrouvées.

---

## 22. TESTS OBLIGATOIRES

### Référentiel
1. Une règle possède un identifiant stable.
2. Une règle possède une source.
3. Une règle possède une date de vérification.
4. Une règle possède une période de validité.
5. Les versions sont correctement conservées.
6. Une règle expirée n'est pas appliquée à une période future.
7. Une règle future n'est pas appliquée prématurément.

### Fiscalité et social
8. Calcul de cotisations selon le bon profil.
9. Gestion des taux différents.
10. ACRE selon conditions et période.
11. TVA selon situation.
12. CFE selon conditions.
13. Déclarations périodiques.
14. Déclarations annuelles.
15. Gestion de seuils.
16. Gestion des changements de régime.

### Obligations
17. Formalité conditionnelle.
18. Formalité obligatoire.
19. Entreprise sans salarié.
20. Entreprise avec salarié.
21. Obligation métier.
22. Obligation non applicable.
23. Données insuffisantes.

### Veille
24. Détection d'une modification.
25. Source non officielle.
26. Source inaccessible.
27. Publication sans date d'effet immédiate.
28. Nouvelle règle en attente de validation.
29. Modification validée et publiée.
30. Analyse d'impact sur les entreprises.

### Alertes
31. Échéance créée.
32. Échéance mise à jour.
33. Notification dédupliquée.
34. Retard.
35. Formalité terminée.
36. Preuve ajoutée.
37. Alerte critique.

### Régression et sécurité
38. Les calculs historiques sont préservés.
39. Les données d'une entreprise sont isolées.
40. Les choix manuels restent intacts.
41. Aucun module n'utilise un taux différent du référentiel central.
42. Les données et calculs V1 restent compatibles dans l'environnement V2.

Exécuter tous les tests et fournir les résultats.

---

## 23. LIVRABLES ATTENDUS

1. Audit du référentiel V1.
2. Inventaire des règles existantes.
3. Inventaire des sources.
4. Architecture cible.
5. Modèle de données.
6. Migrations.
7. Référentiel fiscal et social enrichi.
8. Référentiel des obligations administratives.
9. Référentiel réglementaire métier.
10. Gestion des dates et versions.
11. Moteur de contextualisation.
12. Calendrier intelligent.
13. Mécanisme de veille.
14. Analyse d'impact.
15. Assistant explicatif.
16. Notifications.
17. Gestion des documents justificatifs.
18. Tests automatisés.
19. Résultats de tests.
20. Documentation de maintenance et de validation des règles.

---

## 24. CONTRAINTES ABSOLUES

- Ne pas modifier Aurion V1.
- Ne pas toucher à GitHub `main`.
- Aucun commit, push ou déploiement.
- Aucun changement de branche sans autorisation explicite.
- Travailler uniquement dans un environnement V2 isolé.
- Ne pas dupliquer les référentiels existants.
- Ne pas coder les taux en dur dans plusieurs modules.
- Ne pas inventer de règles.
- Ne pas utiliser de sources non vérifiées pour valider des obligations.
- Ne pas appliquer une règle avant sa date d'effet.
- Ne pas modifier rétroactivement des calculs ou documents sans procédure.
- Ne pas remplacer les choix manuels.
- Ne pas déclencher des formalités automatiquement sans validation de l'utilisateur.
- Ne pas déclarer une fonctionnalité conforme sans preuve.
- Ne pas présenter Aurion comme un organisme officiel.
- Ne pas présenter l'assistant comme un expert-comptable, avocat ou organisme administratif.

---

## 25. CRITÈRES DE VALIDATION FINALE

Le chantier est validé uniquement lorsque :

- Les référentiels existants sont préservés et enrichis.
- Les règles sont versionnées.
- Les sources officielles sont traçables.
- Les dates d'effet sont correctement gérées.
- Le profil entreprise est correctement pris en compte.
- Les obligations sont contextualisées.
- Les échéances sont pertinentes.
- Les alertes sont fiables.
- Les changements réglementaires sont détectés et contrôlés.
- Les règles fiscales et sociales sont cohérentes avec le moteur économique.
- Les informations incertaines sont signalées.
- Les tests passent.
- Les preuves de validation sont disponibles.
- Aucun calcul historique n'est modifié de façon non contrôlée.

La fonctionnalité ne doit être déclarée terminée qu'après validation de la qualité, de la fiabilité, de la traçabilité et de l'intégration de l'ensemble du référentiel.
