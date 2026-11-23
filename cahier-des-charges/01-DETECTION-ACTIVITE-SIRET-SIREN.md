# PROMPT 01 — Détection de l'entreprise et de l'activité

Tu interviens sur Aurion V2, destiné aux entreprises déjà existantes. Audite d'abord le mécanisme réel de recherche SIRET/SIREN, les référentiels INSEE/Registre, les profils métiers, les routes et les formulaires existants. Réutilise ce qui fonctionne.

## Objectifs
- Permettre la recherche explicite d'une entreprise par SIRET/SIREN et l'identification des établissements et activités connus.
- Présenter les informations récupérées avec leur source, date de consultation, niveau de confiance et limites.
- Détecter les divergences entre entreprise, établissement principal et établissements secondaires.
- Proposer les codes NAF/APE et les activités compatibles avec le catalogue métiers Aurion, sans en faire une vérité métier automatique.
- Permettre à l'utilisateur de confirmer, corriger ou ignorer chaque proposition.
- Protéger systématiquement les valeurs déjà saisies ou validées manuellement.

## Règles
La détection ne se déclenche que sur une action explicite de l'utilisateur (clic sur Rechercher/Analyser), jamais à chaque frappe. Aucun champ manuel confirmé ne doit être écrasé silencieusement. Distinguer donnée officielle, donnée proposée, donnée saisie et donnée validée. En cas de résultat ambigu, afficher les choix et demander une décision.

## Intégration
La fiche entreprise doit rester l'unique source de vérité des identifiants légaux. Les modules métiers consomment cette fiche par identifiant stable. La provenance et l'historique des modifications sont conservés. Ajouter une API/service réutilisable et des tests des cas sans résultat, entreprise radiée, multi-établissements, activité secondaire, homonymie, données incomplètes, erreur réseau et modification manuelle.

Ne crée pas de parcours de création juridique d'entreprise. N'intègre aucune IA. Aucun changement de production ou de dépôt distant sans autorisation expresse. Livrer audit, fichiers modifiés, migrations additives si nécessaires, tests exécutés et limites réelles.
