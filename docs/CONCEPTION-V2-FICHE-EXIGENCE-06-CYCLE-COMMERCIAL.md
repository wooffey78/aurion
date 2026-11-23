# AURION V2 — Fiche d'exigence 06 : Refonte et extension du cycle commercial

> **Statut** : exigence fonctionnelle de la conception V2, réceptionnée le 21 novembre 2026 et
> intégrée au dépôt en 15.4.47 (complément d'intégration). Rattachement backlog V2 : chantier
> refonte et extension du cycle commercial — **futur chantier, non démarré ; exigence
> réceptionnée uniquement**. Le titre (« PROMPT TECHNIQUE N° 7 — REFONTE ET EXTENSION DU
> CYCLE COMMERCIAL D'AURION V2 ») avait été transmis sans contenu dans le message du
> 21 novembre 2026 ; le corps complet a été fourni par l'éditeur le 21 novembre 2026. Le
> texte ci-dessous est la fiche de l'éditeur, reprise sans modification de fond ; l'en-tête et
> l'annexe A de traçabilité sont ajoutés par la présente intégration, et l'arborescence
> d'exemple du §2 est présentée dans un bloc de code.
>
> **Correspondance avec la numérotation éditeur** : cette fiche est le « prompt technique
> n° 7 ». Les fiches déjà intégrées se réfèrent à cette numérotation : le référentiel fiscal
> et réglementaire versionné est la
> [fiche 03](CONCEPTION-V2-FICHE-EXIGENCE-03-REFERENTIEL-REGLEMENTAIRE.md) (« prompt
> technique n° 4 », citée au §16), le socle transversal d'événements la
> [fiche 04](CONCEPTION-V2-FICHE-EXIGENCE-04-SOCLE-EVENEMENTS-ALERTES-VALIDATIONS.md)
> (« prompt technique n° 5 », cité au §25), le CRM la
> [fiche 05](CONCEPTION-V2-FICHE-EXIGENCE-05-CRM-CLIENTS.md), et le moteur de propositions la
> [fiche 01](CONCEPTION-V2-FICHE-EXIGENCE-01-MOTEUR-PROPOSITIONS.md).

## OBJECTIF
Faire évoluer Aurion V2 pour disposer d'un cycle commercial complet, cohérent, automatisé, fiable et adapté aux petites entreprises, indépendants, artisans, prestataires de services et autres activités professionnelles.

Le système doit couvrir l'intégralité du cycle commercial :

**Prospect → Devis → Révision du devis → Validation client → Engagement commercial → Acompte → Intervention / prestation → Facturation → Paiements → Relances → Solde final → Archivage.**

L'objectif est de fournir une gestion commerciale complète, centralisée et intelligente, sans créer de doublons fonctionnels avec les outils déjà existants dans Aurion.

Ce travail doit impérativement s'appuyer sur les systèmes déjà présents dans Aurion V1, notamment :
- Le moteur de calcul des prix.
- Les catalogues métier et services.
- La gestion des clients et des coordonnées.
- La gestion des devis et factures déjà existante.
- Le workflow de facturation existant.
- Les paiements partiels.
- Les factures d'acompte et les échéanciers.
- Le suivi des règlements.
- Les documents PDF.
- Les événements, notifications et alertes.
- Le CRM et l'historique client.
- La gestion des interventions et de l'agenda.

Ne pas recréer un module existant lorsqu'il peut être étendu correctement.

---

# 1. AUDIT PRÉALABLE OBLIGATOIRE

Avant toute modification, effectuer un audit approfondi du cycle commercial existant dans Aurion V1 et du code qui sera repris dans V2.

Analyser notamment :

- La création des devis.
- La création des factures.
- La modification des documents.
- Les lignes de devis et de factures.
- Le calcul des prix.
- Les remises.
- Les taxes et TVA.
- Les acomptes.
- Les factures d'acompte.
- Les paiements partiels.
- Les échéanciers.
- Les factures soldées.
- Les factures impayées.
- Les factures envoyées.
- Les relances.
- Les documents PDF.
- Les signatures et validations éventuelles.
- Les relations entre clients, devis, factures et interventions.
- Les statuts.
- Les routes backend.
- Les migrations SQL.
- Les contrôles de permissions.
- Les événements et alertes existants.
- Les interfaces frontend.
- Les éventuelles incohérences entre calculs frontend et backend.

Examiner en particulier le workflow existant dans `invoice-workflow.ts`, le moteur `pricing.ts`, les routes commerciales et les mécanismes de paiements et échéances.

L'audit doit permettre d'établir précisément :

1. Ce qui fonctionne déjà.
2. Ce qui doit être conservé.
3. Ce qui doit être amélioré.
4. Ce qui est incomplet.
5. Ce qui manque.
6. Ce qui est potentiellement redondant.
7. Ce qui doit être connecté à un autre module.
8. Les risques de régression.

Ne pas supprimer une fonctionnalité existante simplement parce qu'une autre approche paraît plus simple.

---

# 2. CENTRALISATION DU CYCLE COMMERCIAL

Créer une logique commerciale unifiée.

Les devis, factures, acomptes, règlements, interventions et relances doivent être liés entre eux.

Chaque document ou opération commerciale doit pouvoir retrouver son origine.

Exemple :

```
Client
└── Devis DEV-001
    ├── Version 1
    ├── Version 2
    ├── Acceptation du client
    ├── Acompte
    ├── Intervention
    ├── Facture FAC-001
    │   ├── Paiement 1
    │   ├── Paiement 2
    │   └── Solde
    └── Documents associés
```

Aurion doit pouvoir afficher clairement le parcours commercial complet d'un client et d'une prestation.

Les relations doivent être explicites et traçables en base.

Ne jamais reconstituer les liens uniquement à partir du nom du client, du montant ou d'une date.

---

# 3. GESTION AVANCÉE DES DEVIS

## 3.1 Création de devis

Permettre de créer un devis :

- Depuis une fiche client.
- Depuis un prospect.
- Depuis une intervention.
- Depuis le catalogue métier.
- Depuis une prestation enregistrée.
- Depuis un modèle de devis.
- Depuis une ancienne prestation.
- Depuis une facture ou un document existant, lorsque cette conversion est autorisée.
- Depuis une proposition générée par Aurion.

La création doit préremplir les informations disponibles sans imposer de ressaisie inutile.

Informations du devis :

- Numéro de devis unique.
- Client.
- Contact.
- Adresse de facturation.
- Adresse de prestation/intervention.
- Date de création.
- Date de validité.
- Activité professionnelle.
- Description générale.
- Lignes de prestation.
- Quantités.
- Unités.
- Prix unitaires.
- Remises.
- Frais de déplacement.
- Matériel.
- Pièces.
- Main-d'œuvre.
- Taxes.
- Total HT.
- Total TVA, lorsque applicable.
- Total TTC.
- Conditions de paiement.
- Conditions commerciales.
- Acompte éventuel.
- Délai d'exécution estimé.
- Notes internes.
- Notes visibles par le client.
- Pièces jointes.

Les notes internes ne doivent jamais apparaître dans les documents client.

---

## 3.2 Lignes de devis intelligentes

Chaque ligne doit pouvoir correspondre à :

- Une prestation.
- Un service.
- Un produit.
- Une pièce.
- Un consommable.
- Une main-d'œuvre.
- Un déplacement.
- Un forfait.
- Une remise.
- Un frais supplémentaire.
- Une ligne personnalisée.

Les lignes de devis doivent être connectées au catalogue métier et au moteur de calcul économique.

Pour chaque ligne, lorsque les informations sont disponibles, Aurion doit pouvoir prendre en compte :

- Le prix de vente.
- Le coût d'achat.
- Le coût des pièces.
- Le temps de travail.
- Le coût de la main-d'œuvre.
- Les frais.
- La marge.
- La rentabilité.
- Les taxes.
- La quantité.
- Les unités.

L'utilisateur doit rester libre de modifier manuellement les lignes.

Une modification manuelle ne doit pas être écrasée par une mise à jour automatique du catalogue.

---

## 3.3 Calculs du devis

Tous les calculs doivent provenir du moteur économique centralisé.

Aurion doit calculer :

- Sous-total des prestations.
- Sous-total des pièces.
- Sous-total de la main-d'œuvre.
- Frais de déplacement.
- Remises par ligne.
- Remises globales.
- Frais supplémentaires.
- Total HT.
- TVA par taux applicable.
- Total TTC.
- Acompte demandé.
- Montant restant à facturer.
- Marge estimée.
- Coût total estimé.
- Rentabilité estimée.

Les calculs doivent être fiables, sans erreurs d'arrondi.

Les montants doivent être gérés avec les méthodes financières sécurisées déjà utilisées dans le moteur de calcul Aurion.

Aucune formule financière sensible ne doit dépendre exclusivement du frontend.

---

# 4. VERSIONNAGE ET HISTORIQUE DES DEVIS

Un devis envoyé ne doit pas être modifié silencieusement.

Lorsqu'un devis est modifié après son envoi, Aurion doit pouvoir créer une nouvelle version.

Exemple :

- Devis DEV-2026-001 — V1.
- Devis DEV-2026-001 — V2.
- Devis DEV-2026-001 — V3.

Chaque version doit conserver :

- Les lignes.
- Les montants.
- Les conditions.
- La date de création.
- L'auteur.
- Les modifications apportées.
- Le statut de la version.
- La raison de modification, si renseignée.
- Les documents PDF correspondants.
- La date d'envoi.
- Les preuves de validation éventuelles.

L'historique doit être consultable.

Aurion doit identifier la version actuellement active.

Si une version précédente a été acceptée, une nouvelle version doit déclencher une procédure explicite permettant de clarifier la situation de l'engagement antérieur.

Ne pas remplacer une version déjà acceptée sans conserver les preuves et les conséquences commerciales de l'ancienne version.

---

# 5. CONDITIONS COMMERCIALES ET VALIDITÉ

Permettre de définir :

- Durée de validité du devis.
- Conditions de règlement.
- Acompte obligatoire ou facultatif.
- Pourcentage ou montant fixe d'acompte.
- Délai de paiement.
- Date de début prévisionnelle.
- Date de réalisation estimée.
- Conditions de livraison.
- Conditions de prestation.
- Conditions d'annulation.
- Conditions de modification.
- Conditions de garantie.
- Mentions commerciales.
- Mentions légales applicables.

Les paramètres par défaut peuvent être configurés dans les réglages de l'entreprise.

Ils doivent cependant rester modifiables pour un devis spécifique.

Aurion doit vérifier la cohérence des conditions commerciales et signaler les informations manquantes ou potentiellement contradictoires.

---

# 6. VALIDATION ET ACCEPTATION CLIENT

Mettre en place une véritable gestion de l'acceptation des devis.

Statuts possibles, à harmoniser avec les statuts existants :

- Brouillon.
- En préparation.
- Prêt à envoyer.
- Envoyé.
- Consulté, lorsque cette information est réellement disponible.
- En attente de réponse.
- Accepté.
- Refusé.
- Expiré.
- Annulé.
- Remplacé par une nouvelle version.

Ne pas prétendre qu'un document a été consulté lorsque le système ne dispose d'aucune preuve technique de consultation.

## Modes de validation

Prévoir, selon les fonctionnalités disponibles :

- Acceptation manuelle par l'utilisateur Aurion.
- Acceptation par signature.
- Acceptation depuis un lien sécurisé client.
- Acceptation par confirmation électronique.
- Acceptation accompagnée d'une date et d'une preuve.
- Enregistrement d'un document externe attestant l'acceptation.

Conserver :

- La version du devis acceptée.
- La date et l'heure.
- Le mode de validation.
- L'identité du validateur lorsque vérifiable.
- Les informations techniques nécessaires à la traçabilité.
- Le document de preuve.

Une acceptation ne doit pas être simulée par une simple modification de statut sans conserver de trace de l'action.

---

# 7. CONVERSION DE DEVIS EN ENGAGEMENT COMMERCIAL

Après acceptation du devis, permettre sa conversion vers les opérations nécessaires.

Selon la nature de l'activité :

- Création d'une intervention.
- Création d'une prestation à planifier.
- Création d'un ordre de travail.
- Création d'une facture d'acompte.
- Création d'une facture.
- Création d'un contrat.
- Création d'un échéancier.
- Réservation d'une date dans l'agenda.

Cette conversion doit être guidée.

Aurion doit proposer les opérations pertinentes, et non générer systématiquement toutes les entités.

Exemple :

Un devis accepté pour une réparation ponctuelle pourra générer une intervention et, si nécessaire, une facture d'acompte.

Un devis accepté pour une prestation immédiate pourra directement ouvrir la création de facture.

Un devis pour un chantier de plusieurs jours pourra générer un ordre de travail et des opérations de planification.

L'utilisateur doit pouvoir contrôler les opérations créées.

Éviter les doublons lors d'une conversion répétée.

---

# 8. ACOMPTES ET FACTURES D'ACOMPTE

Étendre le système existant pour une gestion complète des acomptes.

Lorsqu'un acompte est prévu sur un devis accepté, Aurion doit pouvoir :

- Calculer automatiquement le montant.
- Utiliser un pourcentage ou un montant fixe.
- Générer la facture d'acompte appropriée.
- Associer cette facture au devis d'origine.
- Enregistrer le règlement de l'acompte.
- Générer un reçu lorsque nécessaire.
- Suivre le montant restant.
- Déclencher les alertes nécessaires.
- Préparer la facture finale avec prise en compte de l'acompte déjà facturé et payé.

L'acompte doit être correctement distingué :

- Du montant du devis.
- Du montant facturé.
- Du montant payé.
- Du montant restant dû.

Ne pas confondre acompte demandé, acompte facturé et acompte encaissé.

L'acompte doit être lié au document commercial d'origine.

---

# 9. FACTURATION COMPLÈTE

## 9.1 Création de factures

Permettre de créer des factures :

- Depuis un devis accepté.
- Depuis une intervention terminée.
- Depuis une prestation.
- Depuis une fiche client.
- Depuis une commande.
- Depuis un contrat.
- Depuis une création manuelle autorisée.

Les factures doivent reprendre automatiquement les informations disponibles.

Une facture doit comporter toutes les informations nécessaires selon le contexte légal applicable :

- Numéro unique.
- Date d'émission.
- Date de prestation ou période.
- Identité de l'entreprise.
- Informations client.
- Adresse de facturation.
- Adresse de prestation, lorsque pertinente.
- Description précise des prestations.
- Quantités.
- Unités.
- Prix unitaires.
- Remises.
- Frais.
- Total HT.
- Taxes.
- Total TTC.
- Conditions et échéance de paiement.
- Mentions réglementaires applicables.
- Références au devis.
- Références aux acomptes.
- Informations de paiement.
- Mentions particulières liées au régime fiscal de l'entreprise.

Ne pas inventer de mentions légales.

Les mentions doivent dépendre du profil de l'entreprise, de sa situation fiscale et du type de document.

---

## 9.2 Facturation de prestations réalisées

Lorsqu'une intervention est terminée, Aurion doit proposer la facturation à partir des données de l'intervention.

Reprendre :

- Prestations prévues.
- Prestations réellement réalisées.
- Temps passé.
- Pièces utilisées.
- Matériel.
- Frais de déplacement.
- Modifications validées.
- Suppléments.
- Remises convenues.
- Acomptes déjà facturés.
- Paiements reçus.

Aurion doit comparer, si pertinent, les données du devis et les données réelles.

Il doit signaler les différences de montant.

Aucune modification financière importante ne doit être appliquée sans validation de l'utilisateur.

---

# 10. FACTURES DE SOLDE ET ACOMPTES DÉJÀ FACTURÉS

La facture finale doit être calculée correctement lorsque des factures d'acompte existent.

Le système doit identifier :

- Le montant total de la prestation.
- Le total déjà facturé.
- Le total des acomptes facturés.
- Le montant des acomptes payés.
- Les paiements imputés.
- Le total restant à facturer.
- Le total restant à encaisser.

Ne pas déduire deux fois un même acompte.

Ne pas confondre un acompte facturé avec un paiement encaissé.

Conserver une traçabilité complète des documents de facturation liés à une même opération.

---

# 11. PAIEMENTS PARTIELS ET ÉCHÉANCIERS

## IMPORTANT : LE SYSTÈME EXISTE DÉJÀ EN PARTIE

Aurion V1 dispose déjà d'une infrastructure de paiement partiel et d'échéanciers.

Le travail doit impérativement étendre cette infrastructure.

Ne pas recréer une seconde table, un second système de paiement ou un autre workflow parallèle.

Auditer et conserver les mécanismes existants, notamment :

- `invoice_payments`.
- `invoice_installments`.
- `quotes.amount_paid`.
- `payment_status`.
- `calculateInvoicePayment()`.
- `allocateInstallmentPayments()`.
- Les routes de paiement et d'échéancier déjà existantes.

Améliorer si nécessaire :

- Enregistrement des paiements.
- Répartition des paiements.
- Paiements partiels.
- Plusieurs règlements sur une facture.
- Paiements associés à un échéancier.
- Montant restant dû.
- Échéances réglées.
- Échéances partiellement réglées.
- Échéances en retard.
- Historique.
- Annulation ou correction d'un règlement avec traçabilité.
- Recalcul fiable du statut de paiement.

Un paiement enregistré ne doit jamais être dupliqué à cause d'un double clic, d'un rechargement de page ou d'une requête répétée.

---

# 12. REÇUS DE PAIEMENT ET JUSTIFICATIFS

Après un règlement, permettre la création d'un justificatif approprié.

Selon le contexte :

- Reçu de paiement.
- Reçu d'acompte.
- Justificatif de règlement partiel.
- Justificatif de règlement total.
- Relevé des paiements d'une facture.
- Historique de règlement.

Le justificatif doit présenter :

- Le client.
- La facture concernée.
- La date du paiement.
- Le montant reçu.
- Le mode de paiement.
- Le montant restant dû après ce paiement.
- La référence de transaction, si disponible.
- L'identité de l'entreprise.
- Le numéro du document.

Les PDF doivent être propres, professionnels, cohérents avec l'identité visuelle d'Aurion et de l'entreprise.

Le justificatif ne doit pas être présenté comme une facture lorsqu'il ne s'agit pas d'une facture.

---

# 13. MODES DE RÈGLEMENT

Permettre de gérer les moyens de règlement adaptés à l'entreprise :

- Espèces.
- Carte bancaire.
- Virement bancaire.
- Chèque.
- Paiement en ligne.
- Autres moyens personnalisés.

Le moyen de règlement doit être enregistré avec chaque paiement.

Les informations sensibles ne doivent pas être stockées sans nécessité.

Si une intégration de paiement en ligne est prévue, elle doit utiliser une architecture sécurisée et un prestataire approprié.

Ne jamais prétendre qu'un paiement a été réalisé sans confirmation du prestataire ou validation explicite de l'utilisateur.

---

# 14. SUIVI DES FACTURES ET STATUTS

Harmoniser les statuts commerciaux et financiers sans casser le workflow existant.

Distinguer clairement :

### Statut du document

- Brouillon.
- Validé.
- Envoyé.
- Annulé.
- Archivé.

### Statut de paiement

- Non réglé.
- Partiellement réglé.
- Réglé.
- En retard.
- Litige ou paiement suspendu, si ce statut est réellement nécessaire.

Le statut de document ne doit pas être confondu avec le statut de paiement.

Une facture envoyée et non réglée reste une facture envoyée.

Une facture partiellement réglée reste une facture émise, avec un état de paiement distinct.

Une facture totalement réglée ne doit pas être modifiée ou supprimée pour masquer son historique.

L'utilisateur doit comprendre immédiatement la situation de chaque facture.

---

# 15. RELANCES AUTOMATIQUES

Étendre le système de relance existant.

Les relances doivent tenir compte :

- De la date d'émission.
- De la date d'échéance.
- Du montant restant.
- Des paiements partiels.
- Des échéanciers.
- Du statut de la facture.
- Des relances déjà effectuées.
- D'un litige ou d'une suspension.
- Des préférences de communication client.
- Des conditions commerciales.

Prévoir une progression cohérente des relances :

- Relance 1.
- Relance 2.
- Relance 3.
- Relance 4.
- Procédure supplémentaire après la quatrième relance, lorsque configurée et juridiquement appropriée.

Les relances doivent être adaptées au contexte et ne doivent jamais partir pour une facture soldée.

Si un paiement partiel a été enregistré, les relances doivent concerner le solde réellement restant dû.

Si une facture est en litige, Aurion doit suspendre les relances automatiques selon les règles applicables.

Les relances doivent être :

- Traçables.
- Datées.
- Identifiées.
- Consultables.
- Dédupliquées.
- Configurables.
- Prévisualisables.

Ne pas envoyer deux relances identiques pour la même échéance.

Ne pas déclencher une relance sans que les conditions prévues soient réunies.

---

# 16. FRAIS DE RETARD ET PÉNALITÉS

Le système doit pouvoir gérer les pénalités et frais de retard lorsque ceux-ci sont applicables.

Toutefois :

- Ne jamais appliquer automatiquement une pénalité non applicable à la situation de l'entreprise.
- Vérifier le type de client.
- Vérifier les conditions contractuelles.
- Vérifier le cadre réglementaire.
- Vérifier les mentions présentes sur la facture.
- Vérifier la date d'échéance.
- Vérifier le montant réellement dû.
- Vérifier les exceptions.

Les règles doivent être issues du référentiel fiscal et réglementaire versionné du prompt technique n° 4.

Aurion doit pouvoir proposer une application de pénalités, expliquer le calcul et demander validation lorsque nécessaire.

Ne pas ajouter de frais arbitraires.

---

# 17. DOCUMENTS PDF ET ARCHIVAGE

Améliorer l'ensemble des documents commerciaux générés.

Documents concernés :

- Devis.
- Versions de devis.
- Devis acceptés.
- Factures.
- Factures d'acompte.
- Factures de solde.
- Reçus.
- Justificatifs de paiement.
- Relevés d'échéances.
- Relances.
- Documents commerciaux annexes.

Les PDF doivent :

- Avoir une présentation professionnelle.
- Être lisibles sur ordinateur et smartphone.
- Respecter les règles de mise en page.
- Afficher correctement les informations de l'entreprise.
- Afficher les informations client.
- Présenter les montants clairement.
- Afficher les mentions légales pertinentes.
- Être cohérents avec les couleurs et l'identité de l'entreprise.
- Utiliser une pagination correcte.
- Éviter les lignes coupées.
- Éviter les montants tronqués.
- Éviter les chevauchements.
- Supporter les documents longs.
- Conserver un historique des versions.

Chaque document final envoyé ou validé doit être conservé conformément aux règles de conservation et d'archivage définies dans Aurion.

La modification d'un document source ne doit pas modifier rétroactivement le PDF d'une facture déjà émise.

---

# 18. ENVOI DES DOCUMENTS

Permettre l'envoi de devis, factures, reçus et relances selon les moyens de communication disponibles.

L'envoi doit être connecté au système de communication d'Aurion.

Fonctionnalités :

- Prévisualisation du document.
- Choix du destinataire.
- Vérification de l'adresse.
- Objet du message.
- Message personnalisé.
- Pièces jointes.
- Historique des envois.
- Date d'envoi.
- Statut.
- Erreurs d'envoi.
- Nouvelle tentative contrôlée.
- Confirmation de l'envoi.

Ne jamais marquer un document comme envoyé si l'envoi a échoué.

Lorsque le système ne peut pas envoyer de mail, proposer une solution de secours sans inventer une transmission.

La disponibilité des intégrations dépend de la configuration réelle du compte et de l'infrastructure.

---

# 19. TABLEAU DE BORD COMMERCIAL

Créer une vision synthétique de l'activité commerciale.

Indicateurs possibles :

- Devis en brouillon.
- Devis à envoyer.
- Devis en attente.
- Devis acceptés.
- Devis refusés.
- Devis expirés.
- Taux d'acceptation.
- Montant des devis en attente.
- Montant des devis acceptés.
- Factures émises.
- Factures à régler.
- Factures partiellement réglées.
- Factures en retard.
- Total des créances.
- Total encaissé.
- Montant restant à encaisser.
- Montant des acomptes.
- Nombre de relances.
- Délai moyen de paiement.
- Chiffre d'affaires facturé.
- Chiffre d'affaires encaissé.

Ne pas confondre chiffre d'affaires facturé et chiffre d'affaires encaissé.

Ne pas confondre les montants de devis et les montants réellement facturés.

Ne pas afficher des indicateurs redondants avec les tableaux de bord comptables sans cohérence de définition.

Chaque indicateur doit être calculé à partir d'une source identifiable.

---

# 20. VUE COMMERCIALE CENTRALISÉE

Créer une vue de gestion commerciale accessible et pratique.

L'utilisateur doit pouvoir consulter :

- Les devis.
- Les factures.
- Les paiements.
- Les acomptes.
- Les échéanciers.
- Les relances.
- Les clients.
- Les prestations.
- Les interventions.
- Les documents.

Prévoir :

- Recherche.
- Filtres.
- Tri.
- Dates.
- Statuts.
- Montants.
- Clients.
- Retards.
- Actions rapides.
- Export lorsque pertinent.

La vue doit être compréhensible sans afficher toutes les informations simultanément.

Les filtres et recherches doivent être performants.

Les actions doivent être contextuelles.

---

# 21. INTÉGRATION AU CRM

Toutes les opérations commerciales doivent alimenter la fiche client.

Depuis la fiche client, retrouver :

- Les devis.
- Leurs versions.
- Les validations.
- Les factures.
- Les acomptes.
- Les paiements.
- Les reçus.
- Les retards.
- Les relances.
- Les prestations.
- Les interventions.
- Les contrats.
- Les documents.
- Les notes commerciales.
- Les tâches de suivi.

La chronologie client doit refléter les événements commerciaux.

Exemples :

- Devis créé.
- Devis envoyé.
- Devis modifié.
- Devis accepté.
- Acompte demandé.
- Acompte reçu.
- Intervention planifiée.
- Facture créée.
- Facture envoyée.
- Paiement partiel reçu.
- Relance effectuée.
- Facture soldée.

Ne pas dupliquer les données sources dans le CRM.

Utiliser des références vers les entités et événements existants.

---

# 22. INTÉGRATION À L'AGENDA ET AUX INTERVENTIONS

Le cycle commercial doit communiquer avec l'agenda.

Lorsqu'un devis est accepté :

- Proposer une planification.
- Vérifier les disponibilités.
- Tenir compte de la durée estimée.
- Tenir compte des déplacements, si pertinent.
- Prévoir les délais.
- Permettre la réservation d'une date.
- Créer les tâches nécessaires.
- Alerter si une intervention reste non planifiée.

Lorsqu'une intervention est terminée :

- Proposer la facturation.
- Vérifier les prestations réellement effectuées.
- Vérifier les pièces utilisées.
- Vérifier les écarts avec le devis.
- Vérifier les acomptes.
- Préparer la facture.

Ne pas créer automatiquement une intervention lorsqu'elle n'est pas pertinente.

---

# 23. CONTRATS ET PRESTATIONS RÉCURRENTES

Préparer l'architecture pour permettre la gestion de :

- Contrats de maintenance.
- Prestations récurrentes.
- Abonnements.
- Facturation périodique.
- Renouvellements.
- Échéances contractuelles.
- Reconduction.
- Résiliation.
- Prestations programmées.

Si une infrastructure de contrats ou de tâches récurrentes existe déjà, l'étendre.

Ne pas créer une fonctionnalité isolée sans lien avec la facturation, l'agenda et le CRM.

La facturation récurrente devra pouvoir être contrôlée avant émission selon les paramètres de l'entreprise et les obligations applicables.

---

# 24. FUTURE EXTENSION VERS LE PORTAIL CLIENT

Préparer le cycle commercial pour une future interface client.

Sans rendre obligatoire la réalisation complète du portail dans ce bloc, définir des contrats techniques compatibles avec les fonctionnalités futures :

- Consultation de devis.
- Acceptation.
- Refus.
- Demande de modification.
- Consultation de factures.
- Consultation de paiements.
- Téléchargement de documents.
- Prise de rendez-vous.
- Suivi des prestations.
- Paiement en ligne, si intégration sécurisée disponible.

Le portail devra respecter les règles de sécurité et d'isolation des données.

Un client ne doit jamais accéder aux documents d'un autre client.

---

# 25. INTÉGRATION AU SYSTÈME D'ÉVÉNEMENTS ET D'ALERTES

Connecter le cycle commercial au socle transversal d'événements, d'alertes, de validations et de notifications du prompt technique n° 5.

Événements à prévoir, selon les opérations existantes :

- Devis créé.
- Devis modifié.
- Devis prêt à envoyer.
- Devis envoyé.
- Devis proche de son expiration.
- Devis expiré.
- Devis accepté.
- Devis refusé.
- Acompte requis.
- Acompte en retard.
- Facture créée.
- Facture envoyée.
- Facture arrivée à échéance.
- Facture impayée.
- Paiement partiel reçu.
- Paiement complet reçu.
- Échéance en retard.
- Relance à effectuer.
- Échec d'envoi.
- Intervention facturable.
- Facturation non finalisée.

Chaque événement doit générer uniquement les alertes réellement utiles.

Les alertes doivent pouvoir être résolues, ignorées, reportées ou associées à une tâche, selon leur nature.

Éviter les notifications inutiles et répétitives.

---

# 26. INTELLIGENCE COMMERCIALE AURION

Aurion doit pouvoir analyser les informations commerciales disponibles et proposer des actions utiles.

Exemples :

- Devis non relancé.
- Devis proche de son expiration.
- Client n'ayant pas répondu.
- Facture échue.
- Facture partiellement payée.
- Intervention terminée mais non facturée.
- Acompte manquant.
- Facturation incohérente.
- Marge trop faible.
- Prix inférieur au seuil économique.
- Client récurrent à fidéliser.
- Prestations souvent vendues ensemble.
- Service sous-facturé.
- Temps réel supérieur au temps estimé.
- Retards de paiement récurrents.

Chaque proposition doit :

1. Être basée sur des données vérifiables.
2. Expliquer son origine.
3. Présenter son niveau de confiance si elle repose sur une estimation.
4. Proposer une action.
5. Laisser l'utilisateur décider.

Ne jamais effectuer une modification financière importante sans autorisation.

Ne pas confondre une recommandation IA avec une règle comptable ou réglementaire.

---

# 27. SÉCURITÉ, PERMISSIONS ET TRAÇABILITÉ

Toutes les opérations commerciales doivent respecter :

- Isolation des entreprises.
- Permissions utilisateur.
- Permissions des collaborateurs.
- Permissions du rôle comptable existant.
- Vérification de propriété des documents.
- Vérification de propriété des paiements.
- Protection des PDF.
- Protection des données client.
- Contrôles d'accès backend.
- Validation des données.
- Journalisation des actions sensibles.

Les opérations sensibles doivent être auditées :

- Modification d'un devis envoyé.
- Acceptation.
- Refus.
- Annulation.
- Création de facture.
- Modification d'une facture non finalisée.
- Enregistrement de paiement.
- Correction de paiement.
- Annulation de paiement.
- Remise.
- Modification d'un échéancier.
- Application de frais.
- Archivage.

Ne jamais considérer la sécurité frontend comme suffisante.

Toutes les permissions doivent être vérifiées côté serveur.

---

# 28. UX/UI — ERGONOMIE ET SIMPLICITÉ

L'interface commerciale doit être professionnelle, moderne, simple et rapide.

Respecter l'identité d'Aurion :

- Fond clair légèrement bleuté.
- Texte bleu foncé.
- Interface propre.
- Peu de surcharge.
- Hiérarchie visuelle claire.
- Responsive desktop, tablette et mobile.
- Accessibilité.
- Boutons et actions explicites.
- Formulaires cohérents.
- Feedback immédiat.
- Confirmations contextualisées.
- Aucun popup inutile.

L'utilisateur doit pouvoir créer un devis rapidement.

Le parcours de création doit être logique :

**Client → Prestations → Tarification → Conditions → Vérification → Aperçu → Envoi.**

Les informations avancées doivent être accessibles sans alourdir le parcours principal.

Les erreurs doivent être expliquées clairement.

Les modifications doivent être sauvegardées de manière fiable, avec indication de l'état de sauvegarde.

Ne jamais utiliser des alertes JavaScript natives.

---

# 29. FIABILITÉ TECHNIQUE

Garantir :

- Calculs backend fiables.
- Validation des entrées.
- Transactions SQL adaptées.
- Cohérence entre devis, factures et paiements.
- Idempotence.
- Prévention des doublons.
- Gestion concurrente.
- Gestion des erreurs.
- Retry contrôlé.
- Historique.
- Migrations versionnées.
- Indexation appropriée.
- Performance des listes.
- Pagination.
- Isolation des données.
- Compatibilité avec les architectures futures.

Lorsqu'une opération touche plusieurs entités, garantir autant que possible une transaction cohérente.

Éviter les situations dans lesquelles :

- Un devis est accepté deux fois.
- Une facture est générée deux fois.
- Un paiement est enregistré deux fois.
- Une relance est envoyée deux fois.
- Un acompte est déduit deux fois.
- Un solde est incorrect.
- Un PDF ne correspond plus au document émis.
- Un document est supprimé alors qu'il est référencé.

---

# 30. TESTS OBLIGATOIRES

Créer ou compléter des tests couvrant l'intégralité du cycle commercial.

## Devis

- Création.
- Modification.
- Calculs.
- Remises.
- TVA.
- Versionnage.
- Expiration.
- Acceptation.
- Refus.
- Annulation.
- Nouvelle version.
- Conservation historique.

## Factures

- Création manuelle.
- Création depuis devis.
- Création depuis intervention.
- Validation.
- Envoi.
- Annulation autorisée.
- Archivage.
- Numérotation.
- PDF.
- Mentions applicables.

## Acomptes

- Acompte en pourcentage.
- Acompte fixe.
- Facture d'acompte.
- Acompte payé.
- Acompte non payé.
- Plusieurs acomptes.
- Déduction sur facture finale.
- Absence de double déduction.

## Paiements

- Paiement intégral.
- Paiement partiel.
- Plusieurs paiements.
- Paiement en retard.
- Paiement par échéancier.
- Répartition.
- Correction.
- Annulation.
- Solde.
- Idempotence.
- Statut recalculé.

## Relances

- Relance à échéance.
- Relance en retard.
- Relance après paiement partiel.
- Relance après paiement total.
- Facture en litige.
- Relance déjà effectuée.
- Déduplication.
- Erreur d'envoi.
- Suspension.
- Reprise.

## Intégrations

- CRM.
- Agenda.
- Interventions.
- Catalogue métier.
- Moteur économique.
- Notifications.
- Tâches.
- Documents.
- Comptabilité.
- Référentiel réglementaire.

## Sécurité

- Accès entreprise.
- Accès client.
- Accès comptable.
- Permissions.
- Tentative d'accès à une facture étrangère.
- Tentative d'accès à un devis étranger.
- Paiements.
- Documents.
- Routes backend.

## Régression

Tester les fonctionnalités existantes afin de garantir leur maintien.

Les tests doivent couvrir les cas normaux, les cas limites, les erreurs, les tentatives répétées et les opérations concurrentes.

---

# 31. LIVRABLES ATTENDUS

À la fin de ce bloc, fournir :

1. Un audit précis de l'existant.
2. La liste des fonctionnalités conservées.
3. La liste des fonctionnalités étendues.
4. La liste des fonctionnalités nouvelles.
5. L'architecture du cycle commercial unifié.
6. Les relations entre les entités.
7. Les modifications backend.
8. Les modifications frontend.
9. Les migrations SQL nécessaires.
10. Les API et routes nécessaires.
11. Les contrats de données.
12. Les règles de calcul.
13. Le workflow des devis.
14. Le workflow des factures.
15. Le workflow des paiements.
16. Le workflow des relances.
17. Le workflow des acomptes.
18. Le workflow des échéanciers.
19. Le workflow d'archivage.
20. Le système d'événements associé.
21. Les tests réalisés.
22. Les résultats détaillés.
23. Les risques et limitations.
24. Les fonctionnalités dépendantes d'une intégration externe.
25. La confirmation de l'absence de régression sur les fonctionnalités existantes.

---

# 32. CONDITIONS ABSOLUES DE RÉALISATION

- Aurion V1 est une version stable et figée.
- Ne jamais modifier V1.
- Ne jamais modifier la branche `main` de V1.
- Ne jamais remplacer les fonctionnalités existantes par une nouvelle version non vérifiée.
- Ne pas supprimer de fonctionnalité existante sans autorisation explicite.
- Ne pas recréer les systèmes déjà présents.
- Ne pas casser les paiements partiels.
- Ne pas casser les échéanciers.
- Ne pas casser les factures.
- Ne pas casser les devis.
- Ne pas casser le CRM.
- Ne pas casser les calculs.
- Ne pas casser les PDF.
- Ne pas casser l'agenda.
- Ne pas casser les permissions.
- Ne pas dégrader l'interface.
- Ne pas inventer de fonctionnalités déjà opérationnelles.
- Ne pas déclarer un test réussi sans l'avoir réellement exécuté.
- Ne pas déclarer une intégration opérationnelle si elle n'est pas réellement connectée.
- Ne pas effectuer de commit, push ou déploiement sur V1.
- Travailler exclusivement dans le périmètre isolé d'Aurion V2 selon les instructions générales du projet.

Le développement doit suivre une logique d'amélioration progressive, avec vérification de chaque étape et conservation de toutes les fonctionnalités validées.

## CRITÈRE FINAL DE VALIDATION

Le cycle commercial d'Aurion V2 doit être entièrement cohérent, depuis le premier devis jusqu'à l'encaissement final.

L'utilisateur doit pouvoir suivre en permanence :

- Ce qu'il a proposé.
- Ce que le client a accepté.
- Ce qui reste à réaliser.
- Ce qu'il a facturé.
- Ce qu'il a encaissé.
- Ce qui reste à encaisser.
- Ce qu'il doit relancer.
- Ce qui est en retard.
- Ce qui nécessite une action.

Aucune information financière ne doit être ambiguë.

Aucune action commerciale importante ne doit être perdue.

Aucun document émis ne doit être modifié silencieusement.

Aurion doit devenir un véritable outil de gestion commerciale opérationnel, fiable, intelligent et adapté au fonctionnement réel des entreprises.

## Annexe A (intégration 15.4.47) — État du cycle commercial V1 au 21 novembre 2026

Audit initial des capacités existantes, conformément au §1 (à approfondir au démarrage
effectif du chantier), établi à partir du code audité :

**Déjà présent dans le socle V1 (à étendre, pas à recréer — §11 et §32) :**

- **Workflow de facturation** : `backend/src/services/invoice-workflow.ts` gère relances,
  échéanciers et `allocateInstallmentPayments()` ; `calculateInvoicePayment()` est partagé
  entre les routes commerciales (`backend/src/routes/business.ts`) et le webhook de paiement
  (`backend/src/services/payments/webhook.ts`). Les tables `invoice_payments`,
  `invoice_installments` et `quotes.amount_paid`/`payment_status` existent et sont couvertes
  par la batterie (idempotence des webhooks, paiements partiels, échéanciers, statuts).
- **Devis et factures** : modèle unifié `quotes` (document_type), numérotation, statuts
  document et statut paiement distincts, création de fiche client dans la transaction du
  document (batterie bloc11), PDF gérés par le moteur documentaire central.
- **Prix et économie** : `backend/src/services/pricing.ts`, moteurs de rentabilité et
  comptabilité déjà centralisés (les tests bloquent toute comptabilisation du coefficient de
  vente, tout kilométrage refacturé compté deux fois, etc.).
- **Facturation électronique** : services UBL/CII, e-reporting PA — déjà conformes au
  cadre 2026-2027, en dehors du périmètre de cette fiche mais solidaires du même modèle
  documentaire.
- **Facturation récurrente** : `backend/src/services/subscription-invoice.ts` existe déjà —
  point de départ du §23 à étendre vers les contrats récurrents complets.
- **Intégrations cycle** : liens devis↔intervention↔rendez-vous présents (fiche client V1 via
  `clientSummary()`), relances de factures neutralisées après paiement complet (batterie
  bloc1), encaissements reliés à la banque.

**À construire (l'essentiel du chantier) :** centralisation et traçabilité explicite des
liens entre opérations (§2), versionnage des devis avec historique et preuves (§4),
gestion formalisée de l'acceptation (§6), conversion guidée devis → engagement (§7),
factures d'acompte complètes avec déduction unique sur la facture de solde (§8, §10),
facturation depuis les données réelles d'intervention avec comparaison devis/réel (§9.2),
reçus et justificatifs dédiés (§12), modes de règlement paramétrés (§13), progression et
déduplication des relances (§15), pénalités adossées au référentiel réglementaire (§16,
[fiche 03](CONCEPTION-V2-FICHE-EXIGENCE-03-REFERENTIEL-REGLEMENTAIRE.md)), tableau de bord
commercial aux définitions non ambiguës (§19), vue commerciale centralisée (§20),
alimentation CRM et chronologie via le socle événementiel (§21, §25,
[fiches 04 et 05](CONCEPTION-V2-FICHE-EXIGENCE-04-SOCLE-EVENEMENTS-ALERTES-VALIDATIONS.md)),
contrats et prestations récurrentes (§23), contrats techniques prêts pour le portail client
(§24), intelligence commerciale explicable (§26, cohérente avec la
[fiche 01](CONCEPTION-V2-FICHE-EXIGENCE-01-MOTEUR-PROPOSITIONS.md)).
