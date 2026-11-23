# PROMPT 14 — Portail client sécurisé

Audite les données CRM, devis, factures, paiements, documents, rendez-vous et mécanismes de partage. Le portail doit être une vue à droits limités des données Aurion existantes, non une base client indépendante.

Définir association sûre entre identité de connexion et client/contacts autorisés. Un client ne doit voir que ses propres informations, les documents explicitement partagés et les actions autorisées. Prévoir invitation vérifiée, activation, révocation, expiration, récupération de compte, journal d'accès et protection contre énumération.

Fonctions possibles selon disponibilité réelle : consultation/acceptation/refus devis, factures, état des paiements, pièces/documents partagés, demandes de rendez-vous, suivi intervention, coordonnées et échanges. Chaque action appelle le service métier propriétaire et respecte les validations, numérotations et statuts d'Aurion.

Le partage d'un document est explicite, révocable et historisé. Ne pas exposer par défaut les notes internes, marges, coûts, données comptables, pièces d'autres clients ou documents non partagés. Les paiements en ligne n'apparaissent que si un prestataire opérationnel est configuré ; ne jamais simuler une transaction.

Prévoir expérience responsive/accessibilité, notifications et traçabilité. Tester isolation tenant/client, permissions, liens expirés, révoqués, accès direct API, actions répétées, document retiré, client multi-contact et fuite de données. Pas d'IA, pas de succès simulé.
