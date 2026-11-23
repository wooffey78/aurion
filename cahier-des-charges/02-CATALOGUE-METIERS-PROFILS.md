# PROMPT 02 — Catalogue des métiers et profils professionnels

Audite le catalogue d'activités et les 30 profils déjà présents dans Aurion. Le but est de construire un référentiel métier exhaustif, extensible, versionné et cohérent, sans remplacer les profils existants qui fonctionnent.

Pour chaque activité, définir : identifiants, libellés, synonymes, codes NAF/APE éventuels, prestations typiques, unités, ressources, outils/consommables, paramètres de tarification, contraintes opérationnelles, champs spécifiques, documents utiles, indicateurs pertinents et règles fiscales applicables. Séparer les données communes des extensions sectorielles. Une entreprise peut exercer plusieurs activités ; prévoir activité principale, secondaires et prestations réellement proposées.

Les profils servent à préconfigurer Aurion, jamais à imposer une règle juridique ou fiscale sans validation. Distinguer valeurs par défaut, valeurs proposées et valeurs confirmées. Permettre l'évolution du catalogue sans modifier rétroactivement les dossiers historiques. Chaque profil doit avoir une version, une provenance, une date d'effet et des tests.

Rendre les paramètres accessibles aux modules Devis, Interventions, Agenda, Stock, Achats, Comptabilité et Dashboard par des contrats communs, sans copies divergentes. Ajouter une interface d'administration du référentiel uniquement si elle s'intègre aux droits existants.

Préserver les sélections manuelles et les personnalisations d'entreprise lors d'une mise à jour de profil. Tester activités multiples, codes inconnus, synonymes, migration de version, paramétrage incomplet, personnalisation et régression des 30 profils. Pas d'IA, pas de génération d'entreprise, pas de refonte prématurée. Aucun push ou déploiement sans accord.
