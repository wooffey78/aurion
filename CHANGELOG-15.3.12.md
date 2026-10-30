# Aurion 15.3.12

## IA locale et suivi assisté

- Choix et intégration de Qwen3.5-4B via Ollama comme modèle texte/vision local, pour l’analyse du parcours, des documents texte/images, des imports et des réponses administratives entrantes.
- Le mode local n’envoie aucune requête IA vers un fournisseur cloud en cas d’erreur ou d’absence du modèle. La classification locale existante reste disponible pour le courrier.
- Ajout d’un résumé à la demande du journal, des démarches administratives et des e-mails administratifs préparés. L’assistant ne modifie aucun état et n’envoie aucun message.
- En mode local, la génération de logo distante est bloquée. Le candidat d’image locale est documenté séparément ; le rendu du bundle reste inchangé.
- Le mode cloud hébergé reste distinct et explicite dans `render.yaml`.

Voir [`docs/IA-LOCALE.md`](docs/IA-LOCALE.md) pour les références de licence, versions, installation, confidentialité et limites.
