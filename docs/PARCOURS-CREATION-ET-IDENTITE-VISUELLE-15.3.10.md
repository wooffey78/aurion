# Parcours guidé et identité visuelle — Aurion 15.3.10

## Parcours par situation

Les identifiants stockés restent 1 à 7 afin de reprendre les brouillons existants. Seule la séquence visible dépend de `businessStatus` :

| Situation | Étapes visibles |
| --- | --- |
| `existing` | 1 → 2 → 3 → 4 → 5 → 6 → 7 |
| `to_create` | 1 → 3 → 4 → 5 → 6 → 7 |
| `unknown` | 1 → 2 → 3 → 4 → 5 → 6 → 7 |

Une route centrale calcule la séquence, les ordinal/progression et les destinations précédent/suivant/passer. Si un ancien brouillon ou un paramètre URL vise l’étape 2 alors que le statut est `to_create`, Aurion reprend à l’étape 3. Les autres données enregistrées ne sont pas déplacées.

Le statut `existing` conserve la recherche publique et l’absorption d’exports, déclenchées explicitement. `to_create` et `unknown` ne montrent pas ces fonctions. Le statut `unknown` peut être conservé pendant tout le parcours.

Pour `to_create` et `unknown`, l’étape 3 prépare une fiche projet. L’activité, les prestations, la clientèle, la zone, les modalités, le calendrier et les ressources estimées sont stockés dans le brouillon. Ces hypothèses ne remplacent pas les champs légaux de l’organisation. L’étape administrative distingue une préparation de création d’un suivi d’entreprise existante et conserve les statuts « à vérifier ».

À la finalisation, une entreprise existante est contrôlée avec ses informations légales. Un projet à créer peut être finalisé dans Aurion sans raison sociale ni forme juridique définitive ; le parcours reste signalé incomplet s’il n’a pas d’activité renseignée. Une situation inconnue reste incomplète.

## Politique d’assistance

- L’analyse IA générique n’est proposée que sur le profil d’activité et reste déclenchée par un clic.
- L’identification d’une entreprise existante utilise la recherche publique déjà intégrée, à la demande de l’utilisateur.
- Le naming produit un prompt contrôlable, modifiable et copiable. Les assistants externes sont ouverts à leurs URL enregistrées ; Aurion n’annonce aucun envoi ni préremplissage automatique.
- Le projet ne possède pas de génération native de texte structurée et vérifiable pour le naming. Il n’affiche donc pas de faux candidats générés.
- La génération d’image du logo reste une action séparée et explicite, utilisant la capacité réelle du backend. Une absence de fournisseur configuré ne produit pas d’image fictive.
- Les clés API restent côté serveur. Le prompt de naming ne vérifie pas l’existence d’une société, la disponibilité d’une marque ou d’un domaine.

## Nom de marque et raison sociale

Le champ de nom retenu appartient au brouillon de l’étape 4. Il s’enregistre comme nom commercial/de marque, ou comme nom provisoire de projet selon le statut. La case de confirmation autorise l’utilisation dans le brief du logo. Aucun chemin de ce parcours ne copie le nom dans `organizations.name`.

Le choix « conserver le nom actuel » ne force pas de nouveau naming. Les modes initiaux, mot imposé et libre génèrent des prompts distincts. Les champs de modes inactifs restent dans l’interface avec leurs brouillons conservés ; ils ne sont pas injectés dans un prompt d’un autre mode.

## Directions de logo

Les valeurs historiques `accessible`, `premium`, `expert`, `friendly`, `institutional`, `sans`, `serif`, `round` et `square` gardent leur sens. Les nouvelles préférences pilotent le prompt : clientèle, ton, personnalité, typo, palette, style graphique, composition, usage d’un symbole, clichés à éviter, complexité et usages. Une composition « symbole seul » exclut tout texte ; un monogramme ne peut utiliser que les initiales fournies.

Le logo importé ou généré garde l’aperçu et la confirmation d’enregistrement manuelle existants. Le bundle de marque conserve ses déclinaisons produites par le serveur.

## Interface globale

Le fond global est un ton bleu clair plus profond. Les curseurs SVG sombres comprennent une flèche, une main et un curseur de texte avec un contour clair. Les barres de défilement ont une largeur de 14 px, une piste bleutée et un curseur contrasté. Les contrôles du parcours se replient en une colonne aux petites largeurs ; les zones prompt et formulaires autorisent le retour à la ligne.
