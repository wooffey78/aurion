# Aurion 15.1 — extensions métier et non-régression

- Migration PostgreSQL `020_aurion_business_extensions.sql`.
- Aurion Guard : coefficient minimal contrôlé côté serveur, par activité et par pièce.
- Catalogue pièces : coefficient de vente, photo facultative et prix calculé.
- Fournisseurs : SIRET/SIREN et interrogation du registre public français.
- Factures : création directe conservée, paiement unique ou fractionné, statut non/partiellement/payé.
- Comptabilité : les écritures de paiement sont créées lors de l'enregistrement d'un paiement.
- Relances : 1ère, 2e, 3e et 4e relance, avec pénalité fixe ou en pourcentage préparée côté serveur.
- Adresse de facturation : client ou dernière adresse d'intervention disponible.
- Préparation Factur-X / données structurées et profil de plateforme, sans prétendre à un agrément logiciel.
- Temps gagné : états serveur running/completed/abandoned et statistiques persistantes.
- Onboarding : route dédiée, « Enregistrer et continuer » et « Configurer plus tard ».
- Contrat de routes 13.0 mis à jour uniquement pour la route `/regulatory`, explicitement supprimée par la migration 013.
- Test automatique d'absence de doublons de routes HTTP.
- Logo documentaire augmenté d'environ 2 % sans changer son ratio.
