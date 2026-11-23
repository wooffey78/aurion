# PROMPT 12 — Dashboard et cockpit de pilotage unifié

Le dashboard est une projection des données métier, pas une base parallèle. Audite les widgets, indicateurs, journal et requêtes existants. Chaque indicateur doit avoir une définition, une source de vérité, une formule centrale, une période, un fuseau, une distinction réel/prévisionnel et une règle d'actualisation.

Construire une vue personnalisable des priorités : activité, chiffre d'affaires émis, encaissé et restant, trésorerie, dépenses, rentabilité, interventions, planning, tâches, devis à suivre, factures en retard, stocks faibles, commandes, pièces ou documents manquants, demandes du comptable, alertes et erreurs de synchronisation.

Un même montant doit être identique au module source et dans le dashboard. Distinguer chiffre d'affaires facturé et encaissé, paiements partiels, recettes et mouvements prévisionnels. Éviter doubles comptes et agrégations approximatives. Toute carte actionnable ouvre le contexte source et vérifie à nouveau les permissions.

Prévoir widgets masquables/réordonnables, filtres de période, raccourcis, états vides, chargement indépendant des sections, conservation de dernières données valides avec date d'actualisation et reprise ciblée en cas d'erreur. Les informations obsolètes/offline doivent être signalées.

Tester calculs contre les écrans sources, périodes, fuseaux, droits, multiappareil, refresh, erreurs partielles, données vides, responsiveness et performances. Ne pas introduire un nouvel indicateur sans formule documentée. Pas d'IA.
