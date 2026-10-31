# Aurion 15.3.20 — blocs 5 à 8 : sécurisation et intégrité des exports

Base immuable : `eba2a831d9a37a194bef266cf6c57985d7c29787`.

- Bloc 5 : neutralisation des préfixes de formule CSV sur les champs textuels uniquement ; les montants numériques négatifs restent des nombres.
- Bloc 6 : borne de l'année du rapport comptable inclus dans le ZIP à 1900–2100 et traçabilité de son inclusion.
- Bloc 7 : compteurs d'inclusion et omissions des PDF clients/devis/factures/fournisseurs, documents stockés, modèles et documents générés ; avertissements dans le manifeste et journaux.
- Bloc 8 : rejet des chemins d'archive absolus ou traversants et indicateur `storedInArchive` fondé sur l'inclusion effective du fichier.

Portage spécifique 15.3.20 : conservation du format d'export existant (identité légale, signature, adresses d'intervention, journal, documents, modèles, documents générés). Aucun ancien parcours onboarding/formalités ou bundle d'identité visuelle supprimé en 15.3.20 n'est réintroduit.

Validation : contrôles statiques ciblés préparés ; le test de contrat dédié, le build TypeScript complet et les tests historiques ne sont pas déclarés exécutés dans cette livraison.
