# PROMPT 05 — Moteur central d'événements, alertes et validations

Concevoir une couche transversale qui reçoit les événements métier des modules et orchestre notifications, tâches, validations, échéances et actions contrôlées. Auditer avant toute création : réutiliser les événements, journaux, notifications et tâches existants.

Définir un contrat d'événement versionné : identifiant, type, entreprise, objet source, acteur, date, données utiles minimales, corrélation, idempotency key et résultat de traitement. Définir les abonnés, conditions, priorités, destinataires, canaux disponibles, déduplication, expiration, acquittement et historique.

Gérer la livraison au moins une fois sans effet métier multiple : idempotence, outbox transactionnelle, reprise après erreur, backoff, dead-letter/rejeu contrôlé et observabilité. Empêcher les boucles événement→action→même événement. Distinguer événement survenu, notification créée, notification envoyée, action demandée et action confirmée.

Les opérations sensibles (émission, paiement, suppression, partage externe, clôture) nécessitent les permissions et confirmations appropriées. La disparition de la cause résout/actualise l'alerte active mais ne détruit pas sa trace historique.

Tous les modules (CRM, commerce, interventions, agenda, stock, finance, documents, comptable, portail, automatisations et dashboard) doivent s'appuyer sur cette couche. Tester doublons, concurrence, retry, ordre, événement ancien, événement invalide, panne de canal, permissions, hors ligne et reprise. Aucun faux succès, aucune IA.
