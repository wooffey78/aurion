# PROMPT 13 — Automatisations et workflows déterministes (sans IA)

Créer un moteur de workflows réutilisant les événements, alertes, permissions, validations, calculs et API existants. Toute « intelligence » repose sur des règles explicites : déclencheur, conditions, temporisation, actions, validation humaine, résultat et journal. Interdiction d'utiliser LLM, IA générative, agents IA ou prédictions non explicables.

Permettre des règles configurables avec déclencheurs par événement/calendrier/seuil, conditions composables, filtres entreprise/objet, actions internes, demande de validation, notification et tâches. Prévoir versionnage, activation/désactivation, simulation à blanc, journal d'exécution et droits d'administration.

Les workflows doivent être idempotents, protégés contre boucles et doublons et respecter les transitions métier. Exiger confirmation pour action externe ou irréversible. Ne jamais marquer une démarche comme accomplie sans preuve observable. Distinguer demandé, en attente, exécuté, échoué, annulé et confirmé par un tiers.

Exemples : relancer une facture uniquement si elle est encore due ; proposer un réapprovisionnement en tenant compte des commandes ouvertes ; créer une tâche si une pièce comptable manque ; rappeler une échéance ; préparer la facturation après fin d'intervention. Les workflows ne doivent pas reprogrammer en parallèle les fonctions déjà offertes par les modules.

Prévoir retry contrôlé, reprise, idempotency key, historique, audit, observabilité et tests de concurrence, déclenchement répété, événement tardif, permission, échec canal, désactivation, modification de règle et offline. Pas d'action non autorisée ni d'IA.
