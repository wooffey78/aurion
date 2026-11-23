# PROMPT 16 — Gestion documentaire centralisée, stockage et intégrité

Audite tous les uploads, téléchargements, références, fichiers générés, stockages temporaires/persistants, permissions, sauvegardes et caches offline. Centraliser le modèle documentaire : une identité de document, métadonnées, versions, liens vers objets métier et emplacement physique. Les modules ne conservent pas des dépôts concurrents.

Fonctions : catégories et tags déterministes, recherche, filtres, prévisualisation sûre, partage contrôlé, versions, archivage, récupération, historique, association à plusieurs objets sans duplication physique et accès conditionnel hors ligne. Conserver source, auteur, date, empreinte SHA-256, type MIME détecté et statut de validation. Un document émis/validé est historisé et immuable, avec une nouvelle version distincte si le cas le permet.

Sécurité des fichiers : limite de taille, validation contenu/MIME/extension, noms sûrs, protection traversal, isolation entreprise, refus exécutables et formats dangereux, scan antivirus si réellement disponible, autorisation côté serveur. Ne jamais garder de document permanent uniquement sur disque éphémère.

Définir sauvegarde et restauration testées, rétention par catégorie et obligations, suppression logique/corbeille, restauration et suppression physique après contrôle des références. Offline : fichiers récents par défaut 90 jours plus documents actifs/ouverts/épinglés ; anciens fichiers sur demande. Distinguer cache local et archive serveur.

Tester intégrité, upload interrompu, grande taille, MIME faux, accès inter-tenant, partage révoqué, version, restauration, suppression référencée, doublon, offline, migration et performance. Aucune IA.
