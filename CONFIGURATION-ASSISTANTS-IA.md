# Configuration des assistants IA — Aurion 15.3.6

## Activation côté serveur

Les clés API ne doivent jamais être placées dans le navigateur ni dans un dépôt public. Dans l’environnement privé du backend (par exemple Render > service Aurion > Environment), renseignez uniquement les fournisseurs que vous souhaitez activer :

- `OPENAI_API_KEY` : génération de logo ChatGPT et extraction des champs des documents administratifs.
- `GEMINI_API_KEY` : génération et édition de logo via Gemini.
- `ANTHROPIC_API_KEY` : rendu vectoriel SVG via Claude ; le backend le convertit ensuite en PNG dans le navigateur pour l’aperçu et l’enregistrement.
- `XAI_API_KEY` : génération et édition via Grok.

Redémarrez/redéployez le backend après ajout de variables. Aucune clé réelle n’est incluse dans cette archive. Les appels API sont facturés et soumis aux limites du fournisseur ; ils ne sont pas couverts automatiquement par l’abonnement web ChatGPT, Gemini, Claude ou Grok.

## Confidentialité des documents

Le document est d’abord téléversé vers le stockage Aurion existant. Lorsque l’utilisateur lance l’extraction, le contenu nécessaire est ensuite transmis à l’API OpenAI configurée pour produire des suggestions. Ne téléversez pas de documents sensibles sans base légale et autorisation appropriées. Les propositions doivent être contrôlées avant application. L’IA ne valide pas les formalités et n’envoie ni ne dépose un document administratif automatiquement.

## Limite de l’intégration

La génération par API et son retour dans Aurion sont intégrés ; ceci ne constitue pas à lui seul un plug-in MCP officiellement publié dans les interfaces ChatGPT, Gemini, Claude ou Grok. Un plug-in/MCP distant nécessite une configuration et une autorisation séparées par plateforme, une adresse HTTPS publique, une authentification/autorisation par utilisateur ou organisation et une revue de sécurité. Aurion conserve ses propres connexions de session pour les actions présentées dans son interface.

## Guide détaillé

À l’étape 4 du parcours de création, le diagnostic affiche si chaque variable serveur est présente. Il ne montre aucune clé et n’effectue aucun appel API facturable ; vérifiez aussi le quota, la facturation et les droits modèle sur le compte fournisseur.

Consultez [`docs/CONFIGURATION-MESSAGERIE-ET-IA.md`](docs/CONFIGURATION-MESSAGERIE-ET-IA.md) pour configurer les API fournisseurs, les autorisations Gmail lecture/envoi et la messagerie SMTP étape par étape.
