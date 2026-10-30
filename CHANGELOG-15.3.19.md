# Aurion 15.3.19 — préparation locale à la commercialisation

- Ajoute un parcours public de rétractation avec horodatage, référence, accusé par e-mail et suivi administratif. Les ventes B2C restent fermées tant que l’e-mail durable n’est pas configuré et testé.
- Ajoute une route de gestion administrative pour l’état des demandes de rétractation et le renvoi d’accusé.
- Rend explicite l’état `prepared_not_transmitted` des données de facture électronique; aucun acheminement PA/e-reporting n’est annoncé.
- Prépare le stockage privé OVH Object Storage S3, la migration des fichiers et met à jour le blueprint pour le service Render Frankfurt `aurion` déjà existant, sans créer un troisième service.
- Met à jour le dossier juridique préparatoire à partir des informations déclarées et de l’architecture commerciale choisie. Les documents restent des brouillons à vérifier, sans approbation juridique.
- Prépare les migrations 070–072 pour demandes de rétractation, état de facture, et prix affichés avec un taux de TVA configuré à zéro.
- Laisse les documents non publiés et les fonctions commerciales bloquées tant que les faits, fournisseurs, TVA et textes ne sont pas validés.
- Autorise la création d’un espace d’évaluation uniquement en développement local, avec un avertissement explicite et sans enregistrer d’acceptation de brouillon; le garde-fou production et le blocage des paiements sont conservés.
- Renforce l’installation Ollama Windows : attente bornée de l’installateur, démarrage/contrôle du service local, modèle configurable, téléchargement borné avec journaux distincts, et poursuite d’Aurion si l’IA échoue.
- Aligne l’origine canonique Render sur Francfort et refuse une configuration backend incomplète au lieu de créer une boucle de redirection. La configuration de production exige une DB de migration, le rôle runtime et le stockage S3 privé.
- Audite les deux services Render et le projet Neon; les migrations 070–072 ont été préparées et vérifiées sur une branche temporaire, sans application à la production.

Le code TypeScript a compilé et les scripts PowerShell/Node ont passé l’analyse syntaxique. L’installation Ollama complète et les parcours applicatifs ne sont pas testés sur le poste d’origine. La bascule Frankfurt, l’upgrade payant et le stockage restent à faire; le service Oregon est encore actif.
