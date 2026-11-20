# RAPPORT BLOC 5 — Rejeu des décisions, numérotation, documents et envois (contrôle, 14 novembre 2026)

Bloc contrôlé (aucune refonte) conformément au prompt (« ne pas réécrire sans preuve »).

## Vérifications réellement effectuées

1. **Chaîne d'intention** — la file enregistre l'opération EXACTEMENT décidée (méthode + chemin + payload), y compris les actions explicites d'émission/envoi déjà dans la liste blanche : `POST /quotes/:id/invoice` (émission), `/invoices/:id/payments|installments|reminders|payment-link`, `/communications/email/document` hors périmètre (non listée) → statut bloqué honnête si tentée hors connexion ; le brouillon (`/settings/draft`) reste distinct d'une émission.
2. **Numérotation serveur** — le rejeu passe par les ROUTES RÉELLES : la conversion devis→facture exécute la numérotation réglementaire de la migration 067 dans la transaction serveur prévue. Aucun numéro n'est attribué localement ; la réponse synthétique hors connexion ne contient PAS de numéro (seulement un identifiant local), jamais de fausse confirmation.
3. **Prérequis manquants** — erreur serveur explicite (ex. `MAIL_NOT_CONFIGURED`) → opération en état `blocked` avec raison exploitable affichée dans le panneau de synchronisation (Bloc 7) ; reprise automatique possible après correction via « Relancer les opérations en erreur », SANS redemander la confirmation initiale.
4. **Après rejeu** — `syncNow()` rejoue la file PUIS tire les deltas : statuts, documents générés, paramètres et appareils sont actualisés automatiquement ; l'événement `aurion:outbox-applied` déclenche la re-synchronisation des autres écrans ouverts.

## Résultat

Aucun écart bloquant trouvé sur ce bloc au contrôle statique + e2e ; les tests métier « émission hors connexion → numéro officiel → e-mail » sur environnement sandbox e-mail restent au Bloc 17 (aucun service e-mail réel configuré — non exécuté, déclaré).
