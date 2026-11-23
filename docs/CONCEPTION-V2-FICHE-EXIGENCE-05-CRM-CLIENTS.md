# AURION V2 — Fiche d'exigence 05 : CRM avancé, gestion clients et historique relationnel unifié

> **Statut** : exigence fonctionnelle de la conception V2, réceptionnée le 21 novembre 2026 et
> intégrée au dépôt en 15.4.47 (complément d'intégration). Rattachement backlog V2 : chantier
> CRM avancé, gestion clients et historique relationnel unifié — **futur chantier, non
> démarré ; exigence réceptionnée uniquement**. Le titre d'origine (« AURION V2 — CRM AVANCÉ,
> GESTION CLIENTS ET HISTORIQUE RELATIONNEL UNIFIÉ ») avait été transmis sans contenu le
> 20 novembre 2026 ; le corps complet a été fourni par l'éditeur le 21 novembre 2026. Le
> texte ci-dessous est la fiche de l'éditeur, reprise sans modification de fond (seuls les
> espaces des titres sont normalisés) ; l'en-tête et l'annexe A de traçabilité sont ajoutés
> par la présente intégration. La fiche se réfère au socle transversal d'événements
> ([fiche 04](CONCEPTION-V2-FICHE-EXIGENCE-04-SOCLE-EVENEMENTS-ALERTES-VALIDATIONS.md),
> « prompt n° 5 ») pour la chronologie, les tâches et les notifications.

## 1. OBJECTIF GÉNÉRAL
Faire évoluer le système de gestion clients Aurion vers un CRM complet, intelligent, centralisé et connecté à l'ensemble des modules de l'entreprise.
Le CRM doit permettre à l'utilisateur de gérer toute la relation avec un client, depuis sa création jusqu'à l'historique complet de ses échanges, prestations, documents, devis, factures, paiements, rendez-vous, interventions et éventuels contrats récurrents.
Aurion doit permettre de répondre rapidement à des questions telles que :
- Qui est ce client ?
- Comment le contacter ?
- Où intervenir ?
- Quelle est son adresse de facturation ?
- Quelles sont ses autres adresses ?
- Quel est son historique ?
- Quels devis lui ont été envoyés ?
- Quels devis sont encore en attente ?
- Quelles factures sont impayées ?
- Quels paiements a-t-il effectués ?
- Quelles interventions ont été réalisées ?
- Quels appareils ou équipements lui appartiennent ?
- Quelles garanties sont encore actives ?
- Quand a eu lieu notre dernier échange ?
- Quelle action dois-je effectuer prochainement ?
- Quelle est la valeur commerciale de ce client ?
- Quels services utilise-t-il le plus ?
- Existe-t-il des opportunités de suivi ou de fidélisation ?
Le CRM doit être le point central de la relation client dans Aurion.
**Règle fondamentale : les informations client doivent être centralisées et réutilisées par les autres modules. Il ne doit pas exister plusieurs fiches client indépendantes pour les devis, factures, interventions, agenda ou SAV.**
## 2. AUDIT COMPLET DU CRM EXISTANT
Avant toute modification, examiner intégralement :
- `backend/src/services/clients.ts`
- Routes clients.
- Routes client-addresses.
- Schéma PostgreSQL.
- Migrations liées aux clients.
- Fiches clients frontend.
- Recherche.
- Création et modification de clients.
- Historique de documents.
- Rendez-vous.
- Appareils.
- Statistiques commerciales.
- Statistiques financières.
- Sessions de temps.
- Adresses d'intervention.
- Liens entre clients, devis, factures et interventions.
- Système de permissions.
- Exports et documents.
La fonction `clientSummary()` existe déjà et fournit une partie des données nécessaires.
Le modèle `client_intervention_addresses` existe également.
Ne pas reconstruire ces fonctionnalités.
Produire un inventaire des capacités existantes et des données réellement enregistrées.
Identifier les données déjà centralisées, les données dispersées et les éventuelles duplications.
## 3. FICHE CLIENT UNIFIÉE
Faire évoluer la fiche client pour qu'elle devienne un dossier relationnel complet.
### A. Identité
Prévoir selon le type de client :
- Client particulier.
- Client professionnel.
- Société.
- Association.
- Autre type d'entité.
Informations :
- Nom.
- Prénom.
- Nom de société.
- Nom commercial.
- Forme juridique lorsque pertinente.
- SIREN/SIRET lorsque pertinent.
- TVA intracommunautaire lorsque pertinente.
- Identifiant client Aurion.
- Date de création.
- Statut.
- Origine du client.
- Type de relation.
Ne pas imposer des champs professionnels aux particuliers.
Ne pas imposer des champs personnels aux sociétés.
### B. Coordonnées
Permettre de gérer :
- Téléphone principal.
- Téléphone secondaire.
- Email principal.
- Emails secondaires.
- Site internet.
- Contact principal.
- Contacts supplémentaires.
- Préférences de communication.
- Informations utiles à la relation.
Prévoir la validation des formats et la gestion des doublons.
### C. Adresses
Étendre le système d'adresses existant pour permettre de gérer :
- Adresse principale.
- Adresse de facturation.
- Adresse de livraison.
- Adresse de siège.
- Adresse d'intervention.
- Adresse secondaire.
- Adresse temporaire.
- Autres types configurables.
Une même adresse peut servir à plusieurs usages.
Une entreprise ou un particulier peut disposer de plusieurs adresses d'intervention.
Permettre :
- Nom de l'adresse.
- Type.
- Adresse complète.
- Complément.
- Code postal.
- Ville.
- Pays.
- Instructions d'accès.
- Contact sur place.
- Téléphone sur place.
- Notes.
- Adresse par défaut.
- Historique.
Ne pas supprimer le modèle d'adresses d'intervention existant : le généraliser et l'enrichir.
Les adresses utilisées dans les documents historiques doivent rester conservées.
### D. Contacts multiples
Pour les clients professionnels, permettre plusieurs contacts :
- Dirigeant.
- Responsable.
- Contact administratif.
- Contact facturation.
- Contact technique.
- Contact intervention.
- Autre.
Chaque contact doit pouvoir avoir ses coordonnées, son rôle et ses préférences.
Ne pas remplacer le contact principal sans validation.
## 4. HISTORIQUE RELATIONNEL COMPLET
Créer une chronologie client unifiée.
Elle doit regrouper les événements provenant des modules Aurion sans recopier inutilement leurs données originales.
Exemples :
- Création du client.
- Modification de coordonnées.
- Appel enregistré.
- Email envoyé.
- Email reçu lorsqu'une intégration réelle le permet.
- Note.
- Rendez-vous.
- Devis créé.
- Devis envoyé.
- Devis accepté.
- Devis refusé.
- Facture créée.
- Facture envoyée.
- Paiement reçu.
- Relance.
- Intervention.
- SAV.
- Garantie.
- Document ajouté.
- Contrat.
- Réclamation.
- Tâche.
- Action de suivi.
La chronologie doit être alimentée par le socle transversal d'événements du prompt n° 5.
Ne pas créer une seconde source de vérité pour les documents ou les opérations.
La chronologie doit référencer les entités d'origine.
### Fonctionnalités
- Fil chronologique.
- Filtres par catégorie.
- Filtres par période.
- Recherche.
- Détail d'un événement.
- Accès direct à l'entité concernée.
- Historique des modifications importantes.
- Notes privées.
- Événements système clairement distingués des interactions humaines.
Ne pas présenter une action automatisée comme un échange humain.
## 5. NOTES, JOURNAL ET SUIVI CLIENT
Permettre de consigner les informations utiles à la relation client.
Prévoir :
- Notes libres.
- Notes datées.
- Auteur.
- Catégorie.
- Importance.
- Rappel éventuel.
- Liens vers devis ou intervention.
- Notes privées internes.
- Informations de suivi.
Permettre de rechercher et retrouver facilement une note.
Les notes doivent être clairement distinguées des communications envoyées au client.
Prévoir des permissions lorsque des collaborateurs sont ajoutés à l'entreprise.
Ne pas afficher de notes internes dans le portail client.
## 6. TAGS, SEGMENTATION ET CLASSIFICATION
Créer un système de classification flexible.
Prévoir des tags tels que :
- Client régulier.
- Nouveau client.
- VIP.
- Professionnel.
- Particulier.
- Prospect.
- À relancer.
- Client inactif.
- Client à risque.
- Client sous contrat.
- Client SAV.
- Catégorie personnalisée.
Les tags doivent être configurables.
Permettre :
- Ajout.
- Suppression.
- Modification.
- Filtrage.
- Recherche.
- Attribution multiple.
- Segmentation.
Ne pas attribuer automatiquement un tag sensible ou péjoratif.
Les tags automatiques doivent être clairement identifiés et leur origine traçable.
Permettre de créer des segments de clients à partir de critères objectifs.
Exemples :
- Clients n'ayant pas commandé depuis 12 mois.
- Clients ayant plusieurs interventions.
- Clients avec devis en attente.
- Clients avec factures impayées.
- Clients ayant acheté une prestation particulière.
- Clients ayant un contrat récurrent.
- Clients situés dans une zone géographique.
## 7. RECHERCHE CLIENT AVANCÉE
Améliorer la recherche clients.
Elle doit permettre de rechercher à partir de :
- Nom.
- Prénom.
- Société.
- Téléphone.
- Email.
- Adresse.
- Code postal.
- Ville.
- SIREN/SIRET.
- Identifiant client.
- Tags.
- Appareil.
- Numéro de série.
- IMEI lorsque applicable.
- Référence devis.
- Référence facture.
- Référence intervention.
Prévoir :
- Recherche rapide.
- Recherche partielle.
- Tolérance aux erreurs de saisie raisonnable.
- Filtres.
- Tri.
- Pagination.
- Résultats pertinents.
- Gestion des homonymes.
Ne pas fusionner automatiquement des clients sur la seule base d'un nom identique.
## 8. DÉTECTION DES DOUBLONS
Créer un mécanisme de détection des clients potentiellement en doublon.
Comparer selon plusieurs critères :
- Email.
- Téléphone.
- Nom.
- Prénom.
- Société.
- Adresse.
- Identifiant professionnel.
Attribuer un niveau de correspondance.
Présenter les doublons potentiels à l'utilisateur.
Ne pas fusionner automatiquement les fiches.
### Fusion contrôlée
Permettre à l'utilisateur de fusionner deux fiches après vérification.
Prévoir :
- Comparaison des fiches.
- Choix des données à conserver.
- Préservation des documents.
- Préservation des devis et factures.
- Préservation des rendez-vous.
- Préservation des interventions.
- Préservation des appareils.
- Préservation des paiements.
- Préservation de l'historique.
- Conservation des anciennes références.
- Traçabilité de la fusion.
- Possibilité de récupération lorsque techniquement possible.
Une fusion ne doit jamais entraîner la perte de documents comptables ou d'historique relationnel.
## 9. HISTORIQUE COMMERCIAL ET FINANCIER
Le CRM doit fournir une vue consolidée de la relation commerciale.
Afficher, selon les données disponibles :
- Nombre de devis.
- Devis en attente.
- Devis acceptés.
- Devis refusés.
- Montant des devis.
- Chiffre d'affaires facturé.
- Montant encaissé.
- Montant restant dû.
- Nombre d'interventions.
- Dernière intervention.
- Prochaine intervention.
- Ticket moyen.
- Fréquence des achats.
- Prestations les plus utilisées.
- Rentabilité estimée.
- Rentabilité réelle lorsque disponible.
Les indicateurs doivent utiliser les sources de calcul centralisées.
Ne pas confondre :
- Devis et ventes réalisées.
- Facturation et encaissement.
- Montant TTC et HT.
- Montant encaissé et rentabilité.
Ne pas afficher de rentabilité client fiable lorsque les données de coûts sont incomplètes sans le signaler.
## 10. GESTION DES APPAREILS, ÉQUIPEMENTS ET PASSPORTS CLIENT
Réutiliser et enrichir le système d'appareils existant.
Permettre d'associer au client des appareils, équipements, installations ou biens suivis selon le métier.
Exemples :
- Smartphone.
- Tablette.
- Ordinateur.
- Équipement électronique.
- Installation.
- Matériel professionnel.
- Équipement entretenu.
- Autre bien suivi.
Selon le type d'équipement, prévoir :
- Type.
- Marque.
- Modèle.
- Numéro de série.
- IMEI lorsque applicable.
- Date d'achat.
- Date de mise en service.
- État.
- Garantie.
- Historique des interventions.
- Pièces remplacées.
- Documents.
- Notes.
- Photos.
- Références.
Créer un historique de vie de l'équipement.
Ne pas forcer les champs électroniques sur les métiers qui ne les utilisent pas.
Le passeport numérique de l'équipement doit être relié au client et aux interventions.
Ne pas dupliquer les informations d'intervention dans l'équipement.
## 11. GESTION DES GARANTIES ET SAV
Permettre de retrouver les garanties et opérations SAV associées à un client.
Prévoir :
- Intervention d'origine.
- Date.
- Prestations.
- Équipements concernés.
- Garantie applicable.
- Date de début.
- Date de fin.
- Conditions.
- Exclusions.
- Historique SAV.
- Réclamations.
- Résolution.
- Documents.
Les garanties doivent être déterminées à partir des données réellement enregistrées et des règles applicables.
Ne pas créer automatiquement une garantie fictive.
Ne pas confondre garantie commerciale et garantie légale.
Prévoir des alertes lorsqu'une garantie arrive à échéance ou qu'une intervention est concernée par une garantie existante.
## 12. RELANCES ET SUIVI COMMERCIAL
Intégrer le CRM au système de relances.
Permettre de gérer :
- Relance après devis.
- Suivi après intervention.
- Demande de retour client.
- Rappel de maintenance.
- Renouvellement de contrat.
- Réactivation d'un client inactif.
- Suivi d'une réclamation.
- Rappel de rendez-vous.
- Action commerciale.
Chaque relance doit pouvoir être :
- Manuelle.
- Préparée par Aurion.
- Automatisée selon les règles autorisées.
- Validée avant envoi lorsque nécessaire.
Prévoir une chronologie des relances.
Ne pas envoyer automatiquement de communications sans respecter les préférences, les permissions et les règles applicables.
Ne pas confondre relance commerciale et relance de paiement.
## 13. OPPORTUNITÉS DE FIDÉLISATION ET SUGGESTIONS
Aurion doit pouvoir identifier des opportunités commerciales pertinentes à partir de données vérifiables.
Exemples :
- Client n'ayant pas utilisé un service depuis longtemps.
- Entretien à prévoir.
- Équipement nécessitant un suivi.
- Contrat à renouveler.
- Service complémentaire cohérent.
- Plusieurs interventions permettant une offre groupée.
- Client susceptible de bénéficier d'une prestation déjà proposée par l'entreprise.
Les suggestions doivent être pertinentes et non artificielles.
Chaque suggestion doit expliquer pourquoi elle apparaît.
Ne pas transformer les données client en recommandations intrusives.
Ne pas envoyer de proposition commerciale automatiquement sans validation, sauf règle explicite autorisée par l'utilisateur et conforme.
## 14. GESTION DE LA RELATION ET PRÉFÉRENCES DE COMMUNICATION
Permettre d'enregistrer les préférences du client :
- Email.
- Téléphone.
- SMS si une intégration existe.
- Canal préféré.
- Horaires préférés.
- Consentements lorsque requis.
- Opposition à certaines communications.
- Préférences de rappel.
- Notes relationnelles.
Les consentements et oppositions doivent être traçables.
Ne pas déduire un consentement à partir d'une simple interaction.
Ne pas utiliser un canal non configuré ou non autorisé.
Prévoir une gestion conforme aux règles de protection des données.
## 15. GESTION DES DOCUMENTS CLIENT
La fiche CRM doit offrir une vue documentaire unifiée.
Afficher ou référencer :
- Devis.
- Factures.
- Reçus.
- Contrats.
- Attestations.
- Documents d'intervention.
- Photos.
- Rapports.
- Documents SAV.
- Garanties.
- Documents fournis par le client.
Les documents doivent rester stockés dans le système documentaire central.
Le CRM ne doit pas créer un stockage parallèle.
Permettre :
- Consultation.
- Recherche.
- Filtrage.
- Téléchargement.
- Ajout de document.
- Association à une entité.
- Historique.
Respecter les permissions et les règles de conservation.
## 16. TÂCHES ET ACTIONS À EFFECTUER SUR UN CLIENT
Permettre d'associer des tâches à la fiche client.
Exemples :
- Appeler le client.
- Envoyer un devis.
- Vérifier un paiement.
- Préparer une intervention.
- Commander une pièce.
- Effectuer un suivi.
- Renouveler un contrat.
- Traiter une réclamation.
Les tâches doivent exploiter le système transversal du prompt n° 5.
Ne pas créer un moteur de tâches parallèle.
Chaque tâche doit être liée au client et, lorsque pertinent, à une facture, un devis, un rendez-vous ou une intervention.
## 17. SEGMENTATION ET ANALYSE CRM
Créer des outils de pilotage de la relation client.
Permettre d'analyser :
- Nouveaux clients.
- Clients actifs.
- Clients récurrents.
- Clients inactifs.
- Clients perdus.
- Clients à réactiver.
- Valeur client.
- Fréquence.
- Ticket moyen.
- Évolution des achats.
- Répartition par métier.
- Répartition géographique.
- Origine des clients.
- Conversion prospects.
- Conversion devis.
- Fidélisation.
Prévoir des périodes :
- Mois.
- Trimestre.
- Année.
- Période personnalisée.
Les indicateurs doivent être calculés à partir de données centralisées et cohérentes.
Ne pas inventer des statistiques en cas de données insuffisantes.
## 18. IMPORT, EXPORT ET MIGRATION
Permettre l'import de clients depuis des fichiers compatibles, après audit des capacités existantes.
Prévoir :
- CSV.
- XLSX si l'architecture le permet.
- Mapping de colonnes.
- Prévisualisation.
- Validation.
- Détection de doublons.
- Gestion des erreurs.
- Rapport d'import.
- Annulation lorsque techniquement possible.
Ne jamais importer silencieusement des données incorrectes.
Permettre l'export de données autorisées.
Préserver les identifiants et liens entre entités.
Les opérations en masse doivent utiliser des validations adaptées.
## 19. INTÉGRATION AU RESTE D'AURION
Le CRM doit devenir la source client commune.
### Devis
Utiliser la fiche client, ses contacts et les adresses pertinentes.
### Factures
Utiliser les coordonnées validées et conserver les informations historiques.
### Agenda
Utiliser les contacts et adresses d'intervention.
### Interventions
Relier le client, le lieu, les prestations, les appareils et les documents.
### Stock et achats
Permettre de retrouver les équipements et interventions nécessitant des pièces.
### Banque
Relier les opérations et encaissements à la relation client lorsque cela est pertinent.
### Rentabilité
Utiliser le moteur économique centralisé pour les analyses.
### Portail client
Préparer la compatibilité avec un espace client sécurisé.
### Notifications
Exploiter le socle événementiel et les alertes.
### Comptabilité
Utiliser les mêmes références clients sans créer de doublons.
## 20. INTERFACE UTILISATEUR
Prévoir une fiche client organisée et progressive.
### Vue principale
Afficher les informations les plus importantes :
- Identité.
- Coordonnées.
- Statut.
- Dernière interaction.
- Prochaine action.
- Indicateurs commerciaux.
- Alertes.
- Résumé de la relation.
### Sections de la fiche
Prévoir une organisation logique, à ajuster après la refonte globale :
- Vue d'ensemble.
- Chronologie.
- Contacts.
- Adresses.
- Devis.
- Factures.
- Paiements.
- Interventions.
- Équipements.
- Garanties et SAV.
- Documents.
- Notes.
- Tâches.
- Contrats.
Ne pas afficher toutes les sections si elles sont vides ou non pertinentes.
Utiliser une navigation claire.
Prévoir des actions rapides :
- Appeler.
- Email.
- Nouveau devis.
- Nouvelle facture selon le parcours.
- Nouveau rendez-vous.
- Nouvelle intervention.
- Ajouter une note.
- Ajouter une tâche.
Respecter le responsive, l'accessibilité et l'identité visuelle Aurion.
La refonte UI complète est reportée après stabilisation fonctionnelle de l'ensemble de la V2.
## 21. SÉCURITÉ ET PROTECTION DES DONNÉES
- Isolation stricte des entreprises.
- Contrôle d'accès.
- Permissions.
- Protection des informations personnelles.
- Journalisation des opérations sensibles.
- Gestion des consentements.
- Respect des durées de conservation.
- Gestion des demandes de rectification.
- Gestion des demandes de suppression.
- Limitation des données collectées.
- Protection des exports.
- Protection des documents.
- Sécurisation des imports.
- Prévention des injections.
- Contrôle des accès au portail client futur.
Prévoir la compatibilité avec les exigences RGPD.
Ne pas exposer des notes internes, documents, appareils ou historiques dans le portail client sans autorisation explicite.
## 22. TESTS OBLIGATOIRES
### Fiche client
1. Création d'un particulier.
2. Création d'un professionnel.
3. Création d'une société.
4. Modification des coordonnées.
5. Gestion de contacts multiples.
6. Gestion de plusieurs adresses.
7. Adresse de facturation.
8. Adresse d'intervention.
9. Adresse par défaut.
10. Préservation des données historiques.
### Chronologie
11. Création d'un événement.
12. Devis lié.
13. Facture lié.
14. Paiement lié.
15. Rendez-vous lié.
16. Intervention liée.
17. Document lié.
18. Note interne.
19. Tâche.
20. Filtrage.
21. Recherche.
22. Historique.
### Doublons
23. Détection par email.
24. Détection par téléphone.
25. Homonymes.
26. Doublons potentiels.
27. Fusion manuelle.
28. Préservation de l'historique.
29. Préservation des documents.
30. Préservation des données financières.
### Équipements
31. Ajout d'appareil.
32. Numéro de série.
33. IMEI.
34. Historique d'interventions.
35. Garantie.
36. SAV.
37. Documents.
### Relation commerciale
38. Relance devis.
39. Suivi post-intervention.
40. Client inactif.
41. Suggestion de fidélisation.
42. Préférences de communication.
43. Consentement.
44. Opposition.
### Intégrations
45. Devis.
46. Factures.
47. Agenda.
48. Interventions.
49. Banque.
50. Rentabilité.
51. Notifications.
### Sécurité
52. Isolation entre entreprises.
53. Permissions.
54. Notes privées.
55. Documents privés.
56. Exports.
57. Imports.
58. Portail client futur.
Exécuter les tests et fournir les résultats réels.
## 23. LIVRABLES ATTENDUS
1. Audit complet du CRM V1.
2. Inventaire des données existantes.
3. Architecture cible du CRM.
4. Modèle de données.
5. Migrations nécessaires.
6. Fiche client unifiée.
7. Gestion des contacts.
8. Généralisation des adresses.
9. Chronologie relationnelle.
10. Notes et journal.
11. Tags et segmentation.
12. Recherche avancée.
13. Détection des doublons.
14. Fusion contrôlée.
15. Historique commercial et financier.
16. Gestion des appareils.
17. Garanties et SAV.
18. Suivi et relances.
19. Suggestions de fidélisation.
20. Gestion des tâches.
21. Import et export.
22. Intégration aux modules.
23. Interface responsive.
24. Tests automatisés.
25. Résultats de tests.
26. Documentation technique.
## 24. CONTRAINTES ABSOLUES
- Ne pas modifier Aurion V1.
- Ne pas toucher à GitHub `main`.
- Aucun commit.
- Aucun push.
- Aucun déploiement.
- Ne pas créer ou modifier de branche sans autorisation explicite.
- Travailler dans un environnement V2 isolé.
- Ne pas reconstruire la fiche client depuis zéro.
- Ne pas supprimer `clientSummary()` sans justification.
- Ne pas supprimer le système d'adresses d'intervention existant.
- Ne pas dupliquer les devis, factures, rendez-vous, interventions ou documents.
- Ne pas fusionner automatiquement des clients.
- Ne pas écraser les données manuelles.
- Ne pas modifier rétroactivement les documents historiques.
- Ne pas exposer les données privées.
- Ne pas afficher de notes internes au client.
- Ne pas envoyer de communication externe sans les autorisations requises.
- Ne pas considérer une suggestion commerciale comme une décision automatique.
## 25. CRITÈRES DE VALIDATION FINALE
Le CRM V2 est validé uniquement lorsque :
- La fiche client est unifiée.
- Les coordonnées et contacts sont fiables.
- Les adresses sont correctement gérées.
- L'historique relationnel est complet et cohérent.
- Les données des modules sont référencées sans duplication.
- La recherche est efficace.
- Les doublons sont détectés sans fusion automatique.
- Les fusions manuelles préservent l'ensemble des données.
- Les équipements et garanties sont correctement reliés.
- Le suivi commercial fonctionne.
- Les suggestions sont pertinentes et explicables.
- Les tâches et notifications sont intégrées.
- Les statistiques sont cohérentes.
- Les imports et exports sont fiables.
- La sécurité est démontrée.
- Les tests passent.
- Aucune régression V1 n'est introduite dans l'environnement V2.
Ne déclarer le CRM terminé qu'après validation des fonctionnalités, des données, des intégrations et des tests.

## Annexe A (intégration 15.4.47) — État du CRM V1 au 21 novembre 2026

Audit initial des capacités existantes, conformément au §2 (à approfondir au démarrage
effectif du chantier), établi à partir du code audité :

**Déjà présent dans le socle V1 (à généraliser, pas à reconstruire) :**

- **`clientSummary()`** (`backend/src/services/clients.ts`) : vue consolidée par client —
  coordonnées, documents (devis et factures avec statuts d'envoi et de paiement), rendez-vous
  (passés et à venir), appareils (`devices` avec type, marque, modèle, IMEI, numéro de série),
  indicateurs financiers calculés en SQL (nombre de factures, TTC facturé, encaissé, restant
  dû, devis en attente), sessions de temps complétées (temps estimé vs réel), source de
  l'adresse de facturation utilisée. C'est la base des §9 et §20 — la fiche l'exige
  explicitement (§24).
- **Adresses d'intervention** : table `client_intervention_addresses` exploitée par les
  routes `backend/src/routes/client-addresses.ts`, les documents et la synchronisation,
  couverte par RLS (migration 074) et par un contrat dédié
  (`journal-client-addresses.contract.test.mjs`). Base du §3.C à généraliser (types
  multiples, défaut, historique) sans la supprimer (§24).
- **Garanties** : `warranty_policies` par activité (migration 003), texte de garantie sur
  les devis (migration 004) — point de départ du §11 ; les garanties actuelles sont des
  règles par activité, pas un suivi SAV par client/équipement.
- **Relances** : mécanismes présents dans les routes business (relance de factures et suivi
  commercial), à raccorder aux préférences et consentements (§12, §14).
- **Import de données** : route `backend/src/routes/data-import.ts` (import CSV existant) —
  le §18 s'appuie dessus pour le mapping, la validation et le rapport d'import.
- **Isolation et sécurité** : RLS multi-tenant (migration 074), batterie d'isolation A/B
  déjà démontrée — socle du §21.

**À construire (l'essentiel du chantier) :** chronologie relationnelle unifiée (§4, dépend de
la fiche 04), notes et journal client (§5), tags/segments (§6, §17), recherche étendue
(téléphone, SIRET, références documentaires, appareils — §7), détection de doublons et
fusion contrôlée (§8), contacts multiples (§3.D), types de client particuliers/professionnels
(§3.A), suivi SAV et garanties par équipement (§10-§11), suggestions de fidélisation
explicables (§13), préférences et consentements tracés (§14), tâches liées (§16, dépend de la
fiche 04), vue documentaire unifiée sans stockage parallèle (§15).
