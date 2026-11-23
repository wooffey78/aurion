# AURION — Paquet global de cadrage V2 (18 prompts + prompt général)

## Contenu
- `PROMPTS/` : 18 prompts fonctionnels numérotés, de l'identification métier à l'infrastructure, en passant par l'e-invoicing.
- `PROMPT-GENERAL/` : prompt transversal d'harmonisation, sources de vérité, synchronisation, statuts, calculs, événements, droits, offline et tests.
- `TOOLS/Build-Aurion-15.4.41-Global.ps1` : script Windows PowerShell 5.1 qui télécharge le code de la révision GitHub épinglée, contrôle le commit et la version, incorpore les documents et produit le ZIP source final.
- `SOURCE-REFERENCE/Aurion-15.4.39-reference.zip` : archive locale historique récupérée dans la bibliothèque. Elle est fournie uniquement comme référence de secours et **n'est PAS la base finale**.

## Base de code demandée
Dépôt : `wooffey78/aurion`
Branche contrôlée : `main`
Commit contrôlé au moment de la préparation : `bb7a21fc316df0e2c590a5f6e84c7d6ea5182fd8`
Version attendue : `15.4.41`

Le dépôt GitHub a été inspecté. `main` pointait sur le commit ci-dessus. Le workflow CI associé à ce commit s'est terminé en échec et n'a produit que l'artefact de rapport d'intégration, pas l'archive source complète prévue par la CI. L'archive locale `15.4.39` est donc antérieure et ne doit pas être présentée comme le code actuel.

Pour éviter de fournir un faux ZIP 15.4.41, le script `Build-Aurion-15.4.41-Global.ps1` récupère le code complet directement depuis GitHub sur ton PC, vérifie que `main` correspond toujours au commit épinglé et que `VERSION.txt` et `backend/VERSION.txt` indiquent `15.4.41`, puis copie les prompts dans le dépôt extrait et crée un ZIP final. Si la branche a avancé ou si la version ne correspond plus, le script s'arrête plutôt que de produire un paquet ambigu.

## Générer le ZIP source final sur Windows
1. Extraire ce paquet dans un dossier de travail.
2. Ouvrir PowerShell 5.1 ou plus récent dans le dossier extrait.
3. Exécuter : `powershell -ExecutionPolicy Bypass -File .\TOOLS\Build-Aurion-15.4.41-Global.ps1`
4. Le ZIP final est créé dans `OUTPUT\Aurion-15.4.41-GLOBAL-18-PROMPTS.zip`.

Le script n'effectue aucun push, commit, fusion, déploiement, modification Render, changement de base ou modification de secret. Il ne touche pas au dépôt distant. Il ne fait qu'une lecture publique du dépôt et une création locale.

## Avertissement de périmètre
Ces prompts sont des spécifications de travail. Leur inclusion dans un ZIP ne signifie pas que les fonctionnalités sont déjà développées ou validées. Le bloc 17 et le bloc 18 sont inclus dans le cadrage global demandé ; leur activation et leurs éventuelles intégrations externes restent conditionnées à un audit, des prérequis et une autorisation. Aucun élément IA n'est autorisé dans le périmètre actuel.
