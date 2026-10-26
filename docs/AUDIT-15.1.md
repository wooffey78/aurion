# Audit Aurion 15.1 — avant / après implémentation

## Source de vérité
- Backup travaillé : `Aurion-main.zip` fourni dans la conversation.
- Les anciens ZIP de bibliothèque ne sont pas utilisés.
- Cahier des charges : `aurion prompt final.odt`.
- GitHub, Render et Auth0 : volontairement non traités.

## Audit initial
- Architecture frontend statique + API Fastify + PostgreSQL conservée.
- Design Aurion existant conservé ; aucune refonte de thème globale.
- 118 routes HTTP présentes avant extension, sans doublon `méthode + chemin`.
- Les migrations historiques sont conservées.
- La route `/regulatory` n'est pas réintroduite : sa suppression est déjà matérialisée par la migration 013.
- Les scripts Windows/LibreOffice existants ont été conservés.
- Les mécanismes d'authentification existants n'ont pas été remplacés.

## Extensions implémentées
- Aurion Guard : coefficient minimal par activité, coefficient par pièce, contrôle serveur.
- Paiements : unique/fractionné, statuts non payée / partiellement payée / payée, écriture comptable au paiement.
- Relances : 1ère à 4e, avec pénalité fixe ou pourcentage configurable.
- Facture directe sans devis obligatoire, tout en conservant devis → facture.
- Adresse de facturation client/intervention avec instantané enregistré.
- Fournisseurs : SIRET/SIREN, registre public français, coordonnées enrichies.
- Catalogue : coefficient de vente et photo facultative.
- Facturation électronique : données structurées Factur-X préparatoires + profil de plateforme.
- Temps gagné : sessions persistantes côté serveur, états completed/abandoned et agrégations quotidiennes/hebdomadaires/mensuelles.
- Onboarding : parcours dédié, enregistrement puis poursuite, configuration ultérieure.
- Logo documentaire : agrandi d'environ 2 % sans changement de ratio.
- Tests explicites de non-duplication des routes.

## Vérifications finales
- `npm run typecheck` : OK.
- `npm run build` : OK.
- `npm test` : 18/18 OK.
- Contrôle syntaxique des fichiers JavaScript frontend : OK.
- Contrôle des routes : 128 routes, 128 uniques.
- Archive finale : les répertoires locaux `node_modules`, `dist`, `data`, `logs`, `runtime`, les `.env` et fichiers temporaires seront exclus.

## Limitation d'environnement
La session de construction ne dispose pas d'un binaire PostgreSQL Linux ; la migration 020 a donc été contrôlée statiquement et par compilation, mais n'a pas été exécutée contre un serveur PostgreSQL dans cette session. Elle reste additive et idempotente (`if not exists` / contraintes explicites).
