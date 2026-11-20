# Aurion 15.4.34 — consolidation cumulative

Base : `aurion-15.4.33-consolidee` (source 15.4.33), sans remplacement par les branches 15.4.0/15.4.1.

## Améliorations portées

- Stockage S3 : prise en charge optionnelle de l’adressage path-style pour Neon Object Storage via `AURION_S3_FORCE_PATH_STYLE=true`. L’adressage virtual-host OVH reste le défaut. Le contrôle de type binaire des logos conservé dans 15.4.33 n’a pas été remplacé.
- Administration : bouton « Tout réessayer » pour les seules sections en échec, y compris la section des demandes de rétractation lorsqu’elle est en erreur. Les sections déjà chargées ne sont pas rechargées inutilement.
- E-mails : conversion devis/facture et envoi des PDF annoncent le statut retourné par le serveur ; l’interface n’affirme plus qu’un e-mail a été envoyé sans confirmation. Les confirmations génériques de formulaires et la file hors ligne restent distinctes.
- Render : le pré-vol fournit la liste des noms de variables absentes/invalides sans afficher leurs valeurs, au démarrage et lors de la pré-migration. Le contrôle bloquant `hasProductionBackendConfig` conserve son comportement booléen.
- CI : extraction des fonctions de comparaison de baseline dans un module partagé, avec tests dédiés.
- Contrats : tests mis à jour pour la logique actuelle 15.4.34 (indicateurs, dialogues, sécurité de déploiement, stockage, e-mails et administration). Les assertions 15.4.1 relatives à d’anciens libellés et calculs ont été remplacées : elles échouaient précisément parce que la version 15.4.33 avait déjà corrigé ces écarts.
- Version : root, backend, fichiers VERSION et lockfiles alignés sur `15.4.34` (les lockfiles 15.4.33 d’entrée étaient incohérents : 15.4.29 et 15.4.20).

## Conservations explicites

- Les documents juridiques version 4.0 et leur garde de publication sont conservés ; les documents 2.3 de l’ancienne branche ne les remplacent pas.
- Les migrations historiques ne sont pas réécrites ; la migration 087 d’invitation VIP est conservée. Les migrations 074/075 de la branche 15.4.1 ne sont pas copiées à leurs anciens numéros.
- Les modules métier 15.4.23 (RLS, facture électronique, e-reporting, banque, fiscalité, export comptable, observabilité, sauvegarde/restauration) sont déjà présents dans la base 15.4.33 et sont conservés.
- Les fonctions Capacitor, réplication hors ligne et migrations 084–086 de 15.4.33 sont conservées.
- Les APK/TWA, éléments Play Store et publications de store ne sont pas intégrés. Aucun nouveau système de paiement n’est ajouté.

## Limites à ne pas confondre avec une validation de production

- Le support path-style est testé au niveau de construction d’URL ; il ne prouve pas l’existence d’un bucket Neon provisionné ni une recette réseau réelle.
- Le diagnostic Render n’expose que les noms des variables et continue à fermer le service lorsque la configuration est incomplète.
- La suppression effective de compte n’est pas prétendue : l’ancien flux de demande 15.4.1 est manuel et ne réalise pas un effacement complet.
- Aucun déploiement Render ni publication GitHub n’est inclus dans cette archive locale.

## Vérifications exécutées

- Smoke : 118/118 tests réussis.
- Métier/finances : 42/42 tests réussis.
- Frontend : 45 fichiers syntaxiquement vérifiés ; imports/exports contrôlés.
- Suite backend complète : 28 échecs hérités identiques à la base 15.4.33 dans le même environnement ; aucune nouvelle défaillance détectée. Les dépendances, `backend/dist` et une base PostgreSQL doivent être présents pour la validation complète.
