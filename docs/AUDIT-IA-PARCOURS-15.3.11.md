# Aurion 15.3.11 — audit du ZIP, des fonctions IA et du parcours

Date de l’audit : 30 octobre 2026. Base examinée : `aurion-main-final-15.3.10.zip`, version déclarée `15.3.10`, 422 fichiers après extraction. SHA-256 de l’archive fournie : `D72E7849A5103292E1064199AD17FC2C693B8BAD9D5EF47CF86EB13BB3D1E828`.

L’archive ne contient pas de dossier `.git`. Je ne peux donc pas établir sa branche, son commit, ses remotes ni son historique. Les constats ci-dessous décrivent les fichiers réellement présents dans le ZIP, et non le dépôt distant ni une version publiée sur Render.

## Résultat de lecture rapide

| Point | Résultat établi dans le ZIP |
|---|---|
| Application | Aurion 15.3.10, interface JavaScript/PWA, API Node.js/Fastify/TypeScript et base PostgreSQL. L’archive comprend aussi un installateur Windows qui prépare un serveur et une base locaux. |
| LLM locaux déjà retenus | Aucun trouvé dans le code, les manifests, les fichiers d’installation et la documentation de l’archive. Les échanges Aurion consultés dans Codex ne donnent pas non plus d’identifiant de modèle, de moteur, de révision ou de licence. Aucun LLM n’est donc inventé ou installé dans cette livraison. |
| Modèles de génération d’images | Aucun poids ni pipeline local intégré au ZIP. Les fonctions présentes appellent encore OpenAI, Gemini, Anthropic ou xAI selon la fonction et le choix de l’utilisateur. |
| FLUX.1 [schnell] | Candidat ORANGE : la fiche Hugging Face affiche Apache-2.0, mais l’accès aux fichiers exige d’accepter des conditions que l’environnement de l’audit ne peut pas afficher sans compte connecté. La fiche contient aussi une rubrique « Out-of-Scope Use ». Révision et empreintes des poids non figées. |
| Stable Diffusion 3.5 | Candidat ORANGE sous conditions : inscription commerciale, obligations d’attribution et seuil contractuel. Pas de poids, de notice ni de mécanisme de désactivation dans l’archive. L’incidence juridique du seuil et des installations clientes doit être validée par un juriste. |
| Diffusers | Absent des dépendances et du code. La version 0.41.0 reste un candidat du document d’audit antérieur, pas une dépendance validée ou verrouillée dans Aurion. |
| ComfyUI | Absent du code et du package. Ne pas incorporer son code GPL-3.0 dans le produit propriétaire. |
| Composants VERT | Aucun. Les SHA des poids, les conditions d’accès FLUX, les encodeurs et la chaîne Windows/CUDA ne sont pas vérifiés pour une livraison Aurion. |

## Cartographie de l’IA présente

| Fonction actuelle | Fichiers et comportement observés | État pour une IA 100 % locale |
|---|---|---|
| Suggestions pendant l’accueil | `backend/src/routes/ai-assistance.ts` appelle l’API OpenAI (`gpt-4.1`). L’interface ne propose actuellement l’analyse générique que sur l’étape activité, sur clic. Des règles locales produisent aussi des contrôles simples. | À remplacer par un LLM local retenu et audité. Garder les règles métier et validations dans du code déterministe. |
| Extraction de documents administratifs | Les fichiers PDF, images et textes sont envoyés à l’API OpenAI après l’action de l’utilisateur ; les suggestions doivent être relues. | Données sensibles : extraction locale à concevoir. Aucune transmission distante ne doit rester cachée dans un mode local. |
| Import d’exports | Préclassement local disponible. L’utilisateur peut donner son accord pour l’analyse OpenAI de certains fichiers compatibles ; l’aperçu exige une sélection avant écriture. | Garder l’aperçu et l’application sélective ; remplacer l’analyse distante par le moteur local après validation du modèle et du worker. |
| Identité visuelle | `backend/src/routes/ai-assistance.ts` utilise les API OpenAI, Gemini, xAI ou Anthropic. La création SVG/PNG et l’édition transitent par le backend. | Aucun générateur d’image local n’est câblé. FLUX/SD et leurs encodeurs restent des candidats à auditer. |
| Bundle de marque | `backend/src/routes/journey.ts` et `backend/src/services/brand-assets.ts` assemblent le logo et ses déclinaisons. | Le moteur, les fichiers et le rendu final du bundle n’ont pas été modifiés dans 15.3.11. La migration devra conserver ce contrat de sortie. |
| Réponses e-mail administratives entrantes | Synchronisation Gmail ciblée et manuelle ; catégorisation par règles de mots-clés dans `classifyMessage()` de `backend/src/routes/journey.ts`. Le rapprochement avec une démarche est confirmé par l’utilisateur. | Ce n’est pas une interprétation LLM aujourd’hui. Pour une aide locale, résumer le message, extraire demande/pièce/échéance et citer les passages sources, puis laisser le statut au contrôle de l’utilisateur. |
| E-mails sortants | Brouillon modifiable, sélection manuelle des pièces, envoi Gmail distinct. L’interface demande une confirmation avant un envoi réel. | Aucune interprétation IA générale des messages sortants n’est présente. Une future IA peut expliquer le contenu ou relever une réponse manquante, mais ne doit ni envoyer ni joindre des pièces sans confirmation. |
| Journal de bord | Les événements et états sont conservés dans PostgreSQL ; les descriptions viennent des actions métier. | Pas d’analyse sémantique du journal par un LLM. L’IA locale peut proposer une synthèse et une prochaine action, sans modifier les états comptables ou administratifs. |
| Calculs métier | Calculs financiers et contrôles de saisie assurés dans l’application. | À conserver déterministes ; aucun modèle ne doit décider d’un prix, d’une taxe ou d’un état légal. |

Le code de génération de logo ne place pas les clés dans le navigateur, mais appelle bien des domaines externes depuis le backend. L’archive inclut `CONFIGURATION-ASSISTANTS-IA.md`, qui documente `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` et `XAI_API_KEY`. Cela confirme les fournisseurs configurables, pas l’état réel des secrets sur Render.

## Parcours livré en 15.3.11

Le premier écran demande désormais le prénom, le nom et les téléphones fixe/mobile, puis configure la messagerie professionnelle avec le composant déjà utilisé dans Paramètres. Les autorisations de lecture Gmail et d’envoi restent séparées : la lecture des réponses administratives apparaît dans la partie dossier, au moment où elle devient utile.

Le compte devient la source unique du nom complet et des téléphones. La nouvelle migration additive `backend/migrations/069_user_contact_phones.sql` stocke les deux numéros. Le parcours les écrit via l’API Compte ; l’écran Compte & sécurité permet aussi de les modifier. La configuration de la signature préremplit les champs à partir du compte, et l’étape finale du parcours reprend les mêmes valeurs. Les coordonnées déjà enregistrées dans une signature gardent la priorité.

Les informations légales de l’entreprise continuent d’être enregistrées dans la fiche d’organisation lors de l’étape d’identification ; l’activité et le thème visuel restent enregistrés par leurs services existants. Les étapes du parcours, le suivi de documents, les statuts de formalité et le journal de bord gardent leurs identifiants et leurs formats déjà stockés.

## Architecture locale recommandée et limites

Le fichier `render.yaml` décrit un service web sur Render. Le setup Windows, lui, installe et démarre localement Node.js et PostgreSQL. Un processus de génération locale ne peut pas tourner sur le service Render décrit dans cette archive comme s’il était sur le PC du client.

Pour les installations Windows, la voie la plus cohérente est un worker local séparé du serveur Aurion, lié exclusivement à `127.0.0.1`, démarré par le lanceur Aurion, authentifié par un jeton de session aléatoire et sans accès réseau externe pour l’inférence. Le backend local peut l’appeler sans faire transiter les documents par Render. Le mode PWA hébergé sur Render devrait signaler que le worker local n’est pas installé ; il ne doit jamais basculer automatiquement vers un fournisseur cloud. La compatibilité d’un pont navigateur vers localhost et les contrôles d’origine doivent être décidés et sécurisés avant de relier le mode Render à un worker local.

La livraison 15.3.11 améliore le parcours de configuration et documente la cible, mais ne prétend pas avoir migré l’inférence. Pour terminer cette migration, il manque encore un LLM local identifié et validé pour les tâches de texte, les empreintes de révision des poids, le modèle de génération d’image retenu, la machine Windows cible et son GPU/VRAM, les licences de ses encodeurs et le choix explicite des modes d’installation pris en charge. Rien dans le ZIP ou les échanges Aurion consultés ne permet d’établir ces choix aujourd’hui.

## Audit préliminaire des composants IA proposés

| Candidat | Résultat actuel | Reste à établir avant intégration |
|---|---|---|
| FLUX.1 [schnell] | ORANGE. La fiche officielle affiche Apache-2.0 et 12B/BF16, mais indique que l’accès aux fichiers nécessite l’acceptation des conditions. La fiche décrit aussi des « Out-of-Scope Use », absents du texte Apache standard ; ne pas trancher seul l’effet juridique de cet écart. | Lecture humaine et archivage des conditions Hugging Face, SHA de tous les poids, licence des encodeurs, compatibilité Windows, VRAM mesurée, test hors ligne. N’utiliser que les poids officiels et des fichiers sûrs. |
| Stable Diffusion 3.5 Large, Large Turbo, Medium | ORANGE sous conditions. L’accord officiel daté du 5 juillet 2024 couvre les usages commerciaux, impose l’inscription et prévoit la fin des licences si l’entité et ses affiliés dépassent 1 000 000 USD de revenu annuel. La distribution exige également une copie de l’accord, le fichier Notice et la mention « Powered by Stability AI ». | Lire et archiver la licence de chaque révision exacte, s’inscrire avant usage commercial, valider seuil/affiliés/clients existants avec un juriste, auditer les encodeurs et créer un mécanisme d’arrêt indépendant de FLUX. Au-delà du seuil, ne pas activer sans licence Enterprise obtenue. |
| Diffusers 0.41.0 | Candidat, pas intégré. Le code actuel n’a pas de worker Python, d’environnement virtuel ni de verrou de dépendances. | Confirmer la version et son écosystème sur Windows ; figer Torch, Transformers, Accelerate, safetensors, huggingface-hub et les paquets réellement testés ; auditer les notices et les bibliothèques CUDA/NVIDIA redistribuées. |
| ComfyUI | Non retenu comme code incorporé. Le dépôt officiel affiche GPL-3.0. | Si un connecteur est un jour étudié, l’isoler comme logiciel installé séparément par l’utilisateur, ne pas incorporer ni modifier son code dans Aurion et réauditer le scénario de distribution. |
| LLM pour texte | Gris / absent. Aucun identifiant trouvé dans le code, la configuration, le README, les scripts ou les échanges Aurion consultés. | Ne pas choisir ou télécharger un modèle à la place de l’utilisateur. Pour chaque modèle proposé : dépôt officiel, SHA, licence des poids et moteur distincte, conditions, empreintes et mesures matérielles. |

La page officielle Stability AI décrit la Community License et la couverture de SD 3.5 ; son accord emploie un titre de page « Professional Membership Agreement » tout en désignant dans le texte le « Community License Agreement ». L’accord dit « less than USD $1,000,000 » dans l’introduction et « more than USD $1,000,000 » pour la résiliation : le cas exactement égal à 1 000 000 USD doit être soumis à un juriste. Ce tableau est une préparation d’ingénierie, pas un avis juridique.

## Ordre de migration recommandé

1. Confirmer le mode Windows local et définir ce qui reste disponible dans le mode Render. Aucun modèle ne doit pouvoir envoyer ses données au cloud en cas d’échec local.
2. Choisir et auditer un LLM local texte. Le registre du modèle doit contenir ID officiel, SHA, fichiers attendus, empreintes, licences et accord utilisateur ; téléchargement uniquement après consentement explicite.
3. Extraire un contrat `AiGateway` unique : état, diagnostic, modèles installés, texte, vision documentaire, résumé, annulation et erreurs typées. Les entrées e-mail/journal doivent provenir d’une sélection de données connue, être bornées et traitées comme des données non fiables.
4. Migrer d’abord les suggestions de préparation d’entreprise et la synthèse du journal. Chaque proposition cite les faits ou passages sources et reste à valider ; l’IA ne modifie jamais les données de l’entreprise sans action d’acceptation.
5. Migrer la lecture des e-mails entrants puis l’aide aux e-mails sortants. Les demandes, pièces, dates et contradictions sont montrées avec un extrait source. L’IA ne suit pas les liens des messages, n’ouvre pas de pièce jointe automatiquement et ne change pas seule le statut d’une formalité. L’envoi demeure manuel et confirmé.
6. Ajouter le worker d’image après licence, empreinte et test matériel validés. Conserver strictement le contrat serveur de génération des variantes du bundle actuel, puis comparer les fichiers générés avant de remplacer le moteur.
7. Supprimer les SDK, variables et appels distants seulement après migration de chaque usage et contrôle réseau sans accès Internet. Documenter les fonctions qui restent indisponibles quand le worker est arrêté.

## Validations humaines restantes

- Juriste : portée de la rubrique FLUX « Out-of-Scope Use » par rapport à Apache-2.0 ; conditions Hugging Face ; seuil et définition des revenus Stability, affiliés compris ; effet d’une résiliation sur les installations clientes ; licences et redistributions de bibliothèques NVIDIA.
- Produit : confirmer les modes d’exploitation inclus (installation Windows locale, site Render, ou les deux) et la politique de téléchargement des poids.
- Technique : indiquer les modèles LLM déjà choisis s’ils existent hors des sources examinées, fournir la machine de référence et établir les mesures GPU/VRAM, durées et fonctionnement hors ligne.

## Sources primaires consultées

- FLUX.1 [schnell] — fiche, accès conditionné, licence affichée et rubrique d’usage : <https://huggingface.co/black-forest-labs/FLUX.1-schnell>
- Dépôt officiel FLUX et licences : <https://github.com/black-forest-labs/flux> ; <https://github.com/black-forest-labs/flux/tree/main/model_licenses>
- Stability AI Community License Agreement : <https://stability.ai/community-license-agreement>
- Portail des licences Stability AI : <https://stability.ai/license>
- Licence Diffusers : <https://github.com/huggingface/diffusers/blob/main/LICENSE>
- ComfyUI et sa licence : <https://github.com/Comfy-Org/ComfyUI/blob/master/LICENSE>
