# Aurion 15.2.31 — préparation d’exploitation

- Le serveur écoute par défaut sur `0.0.0.0` en production (PaaS/reverse proxy) et reste limité à `127.0.0.1` en développement local. Une variable `HOST` explicitement définie garde la priorité.
- L’endpoint public `/health/db` ne renvoie plus les messages bruts du pilote PostgreSQL ; il journalise le détail côté serveur et retourne un code d’erreur générique.
- Les messages d’échec de démarrage ne reproduisent plus les exceptions brutes du pilote dans les journaux.
- Cache statique renouvelé vers 15.2.31-r15 pour éviter de servir les anciennes ressources après mise à jour.
- Ajout d’une configuration Blueprint Render gratuite pour le web uniquement ; aucune base n’est créée automatiquement.
- Ajout d’un exemple d’environnement local, d’un `.gitignore`, d’une documentation Render, d’un README racine et d’un pipeline CI.
- La commande racine `npm test` compile d’abord le backend, afin que les tests qui chargent `backend/dist` fonctionnent aussi depuis un checkout propre.

## Points non résolus par ce patch

- Le stockage des pièces jointes est encore sur le système de fichiers local ; il doit migrer vers un stockage objet privé durable avant un usage commercial sur une instance Render éphémère.
- Les résultats de build/tests nécessitent une installation complète des dépendances. Le réseau de cet environnement de préparation ne permettait pas de joindre le registre npm, donc cette validation n’a pas pu être exécutée ici.
- Aucun déploiement externe ne doit être considéré comme fait tant que le dépôt cible et le service Render effectifs n’ont pas été retrouvés et vérifiés.
