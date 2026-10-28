# Aurion 15.3.4 — Détections révisables et absorption de données

- Ajout d’un panneau de détections et déductions locales sur chacune des sept étapes du parcours guidé, avec analyse IA facultative et explicite.
- Suggestions assorties d’une source, d’une confiance indicative, d’un champ modifiable, d’une action d’application et d’une suppression individuelle. Les suggestions ne remplacent pas silencieusement les valeurs déjà présentes.
- Étape Identification : ajout d’un import en plusieurs fichiers, d’une prévisualisation des données reconnues et d’un import confirmé vers les fiches entreprise, clients, fournisseurs, produits/pièces, prestations/catalogue et documents historiques.
- Formats : CSV, TSV, XLSX, JSON, XML, ZIP (exports imbriqués limités), SQL en lecture de texte uniquement, PDF, DOCX, ODT, TXT, PNG, JPEG et WEBP. Le format XLS historique est signalé comme non pris en charge directement.
- Rapprochement des doublons, action de création/mise à jour/ignorance choisie par l’utilisateur, édition des fiches candidates et conservation des références au contenu source dans les snapshots des devis/factures importés.
- Garde-fous : limites de taille/nombre de fichiers, aucun SQL exécuté, aucune formalité administrative validée automatiquement, aucun enregistrement d’import avant confirmation, et aucune connexion directe à un logiciel tiers sans API ou export ouvert.
- Aucun nouveau paquet npm et aucune migration SQL ajoutés. Aucune action GitHub/Render effectuée.

- Journal de bord : seules les entrées d’action/alerte non résolues sont remontées ; les lignes d’historique de sauvegarde et d’achèvement restent hors du journal d’actions. Les anciennes alertes d’une formalité sont résolues quand son état est mis à jour, et une entrée de configuration est créée pour les nouvelles organisations si la configuration reste incomplète.
- Lisibilité du journal : espacement explicite entre « Nouvelle information », « Marquer lu » et « Résoudre », avec retour à la ligne adapté aux petits écrans.
- Identité visuelle : l’import manuel PNG/JPEG passe immédiatement dans le même aperçu que le logo généré ; après enregistrement explicite, le bundle ZIP contient l’image principale, des présentations SVG sur fonds clair/sombre/accent, une icône, un favicon et une page d’aperçu. Les variantes d’affichage ne sont pas présentées comme une vectorisation du logo source.
- Documentation ajoutée pour l’activation des clés API IA et la configuration distincte de la lecture Gmail, de l’envoi Gmail OAuth et de la messagerie SMTP.
