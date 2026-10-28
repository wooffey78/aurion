# Aurion 15.3.1 — rapport du correctif de compilation

## Base de travail
- Archive de départ : `aurion-15.3.0-guided-journey.zip` fournie dans la session.
- Version de départ : 15.3.0.
- Correction : version 15.3.1.

## Défaut corrigé
Dans `backend/src/routes/journey.ts`, le type fourni par les définitions Gmail autorise `msg.id` à être `string | null | undefined`. L'appel `gmail.users.messages.get` exige une chaîne ou une valeur absente, et non `null`. Le code valide maintenant explicitement le type et la présence de l'identifiant, puis réutilise `messageId` pour l'appel Gmail, l'enregistrement et la clé de déduplication. Cela évite également l'échec de surcharge qui provoquait ensuite les erreurs en cascade sur `meta.data`.

## Tests et limites
- Test de contrat de régression ajouté pour la garde de l'identifiant et ses usages.
- Tests ciblés : **15/15 réussis** (`guided-journey-15.3.contract.test.mjs`, `step14-invoice-independent-edit.test.mjs`, `step31-journal-priority.test.mjs`, `home-delete-mobile-controls.test.mjs`).
- Le contrôle `npm ci --offline` n'a pas abouti car les paquets requis ne sont pas tous dans le cache npm. Par conséquent, aucun succès du build TypeScript complet n'est revendiqué dans ce rapport. Le build doit être confirmé avec `npm ci` puis `npm run build` sur la machine équipée d'un accès au registre ou d'un cache de dépendances complet.

## Opérations distantes
Aucun push GitHub, aucune fusion et aucun déploiement Render n'ont été effectués. Aucune base ou aucun secret distant n'a été modifié.
