# PROMPT 06 — CRM, clients, contacts, adresses et historique

Audite les entités et routes clients, notamment les adresses multiples et les liens interventions existants. Le CRM est la source de vérité de l'identité et des coordonnées client ; les autres modules utilisent des références stables et ne recréent pas leurs propres fiches.

Prendre en charge particuliers/entreprises, contacts, plusieurs téléphones/e-mails, adresses de facturation et d'intervention, préférences de contact, consentements, notes, catégories, historique, documents, échanges, devis, factures, paiements, interventions et rendez-vous. Prévoir fusion de doublons uniquement contrôlée et auditée, jamais automatique sans décision humaine.

Les formulaires devis/facture doivent reprendre les informations de la fiche client sélectionnée. Si l'utilisateur corrige une valeur dans un document, déterminer explicitement si elle est locale à ce document ou doit modifier la fiche client. Ne jamais réécrire une correction manuelle par une synchronisation tardive.

Conserver les instantanés légalement requis dans les documents émis. Les modifications de la fiche courante ne doivent pas réécrire les anciennes factures/devis. Les suppressions doivent tenir compte des obligations de conservation et liens métier ; privilégier désactivation/archivage lorsque nécessaire.

Créer une fiche client unifiée et des vues/contextes dans les autres modules. Tester multi-adresses, homonymes, doublons, client existant/nouveau, données manquantes, modifications concurrentes, RGPD, historique et propagation. Pas d'IA, pas de fonctionnalités de prospection artificielle.
