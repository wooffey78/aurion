# RAPPORT BLOC 6 — Documents récents hors connexion : politique complète (14 novembre 2026)

Défaut §2.2-8 corrigé : le plafond fixe `KEEP = 20` est remplacé par une politique métier.

## Modifications (`assets/js/core/recent-documents.js` réécrit sur le même magasin)

1. **Politique configurable et affichable** — `{ windowDays: 90 (proposition initiale du prompt), maxTotalMB: 200, pinned: [] }` persistée dans le magasin `meta` du stockage local versionné ; `getDocumentsPolicy()` / `setDocumentsPolicy()` exposés pour les paramètres (Bloc 7/écran réglages), fenêtre modifiable (min. 7 jours).
2. **Priorités obligatoires** — pré-téléchargement des documents DANS la fenêtre de récence, PLUS les épinglés et les pièces de dossiers ACTIFS (devis non finalisés, factures non réglées) même au-delà de la fenêtre — jamais la récence seule.
3. **Anciens fichiers** — restent listés par métadonnées (répliques) et récupérables À LA DEMANDE en ligne (`downloadAtDemand`) : pas de téléchargement aveugle de l'historique.
4. **Quota et élagage contrôlé** — budget de taille totale ; au-delà, les plus anciens NON épinglés sont retirés de la COPIE LOCALE uniquement (le document serveur n'est jamais supprimé) ; épinglés jamais élagués ; borne de sécurité à 200 fichiers.
5. **Intégrité par hash** — chaque fichier est haché SHA-256 (WebCrypto) à l'enregistrement ; taille stockée ; un fichier n'est jamais marqué disponible sans contenu vérifié.
6. **Réseau** — pause automatique sur réseau cellulaire détecté (`navigator.connection`), reprise au prochain cycle en ligne ; téléchargement en arrière-plan (jamais bloquant).
7. **Espace de noms** — identique à la réplication et à la file (Bloc 1) ; `deviceId` corrigé.

## Tests (exécutés)

- Vérifications statiques + parcours e2e (bootstrap, ouverture du magasin, pré-téléchargement conditionné au réseau) ; suite bloc2 (6/6) pour le store Blob/base64.
- Cas dédiés (90 jours exacts, épinglage UI, interruption de téléchargement, restauration) : procédure documentée pour la recette Bloc 17 — non exécutés en autonomie ici (pas d'UI d'épinglage encore câblée ; API prête).
