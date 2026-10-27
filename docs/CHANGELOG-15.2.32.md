# Aurion 15.2.32 — fiabilité, synchronisation et mobile

## Changements
- Remplacement de l’arithmétique monétaire flottante du moteur de tarification par des calculs en centimes entiers (`BigInt`), avec arrondi commercial explicite et contrôle des cumuls de cotisations.
- Le TTC saisi reste la référence du calcul au centime ; le montant de TVA est le différentiel cohérent entre le TTC et le HT arrondi.
- Les brouillons de devis/facture en cours sont enregistrés côté compte par utilisateur et organisation, puis rechargés à l’ouverture du calculateur pour permettre une reprise sur un autre appareil.
- Le brouillon inclut désormais le bénéfice minimum saisi et affiche un état de synchronisation. Les erreurs de synchronisation sont signalées ; elles ne sont pas masquées.
- Détection de prestation déclenchée progressivement après la saisie, avec temporisation pour éviter d’appeler le serveur à chaque frappe, sans perdre l’auto-remplissage appris.
- Actualisation ciblée des données par écran pour limiter les appels réseau ; rafraîchissement prudent au retour dans l’application ou après reconnexion, sans remplacer un formulaire en cours de saisie.
- Amélioration de la gestion du clavier mobile à partir de `visualViewport`, champs plus lisibles (16 px), défilement vers le champ actif, modales adaptatives et prise en compte des zones de sécurité iOS.
- Le bouton biométrique WebAuthn reste accessible sur les navigateurs mobiles compatibles, avec une action explicite de l’utilisateur au lieu d’une tentative silencieuse automatique.
- Cache de l’application incrémenté pour forcer la récupération des ressources actualisées.

## Contrôles
- Les tests unitaires du moteur, les calculs inverses avec plusieurs bases de cotisation et la parité navigateur/serveur sont couverts par les tests automatisés.
- La migration `054_synced_quote_drafts.sql` est exécutée au démarrage du backend, avant l’ouverture du serveur ; elle reste idempotente et verrouillée par PostgreSQL.
- La disponibilité WebAuthn reste dépendante du support du navigateur, du système et de la présence d’une passkey enrôlée.
