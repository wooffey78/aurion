# IA locale d’Aurion 15.3.19

## Modèle retenu pour le texte et la vision

- **Qwen3.5-4B Q4_K_M**, servi localement par **Ollama** (`qwen3.5:4b-q4_K_M`). La fiche officielle Qwen indique Apache-2.0 ; Ollama publie le modèle quantifié autour de 3,3–4,0 Go. Sources : [Qwen3.5-4B Q4_K_M](https://huggingface.co/Qwen/Qwen3.5-4B Q4_K_M), [fiche Ollama et variantes](https://ollama.com/library/qwen3.5).
- Aurion en mode local utilise le modèle pour les suggestions du parcours, l’extraction dans les documents texte et images, le préclassement des imports, la catégorie des e-mails entrants que les règles ne reconnaissent pas et le résumé des démarches/journal.
- L’inférence texte et images passe au serveur Ollama de la machine Aurion, limité à `127.0.0.1:11434`. L’absence d’Ollama ou du modèle ne déclenche aucun repli vers une API cloud. Les règles locales de classement des e-mails restent le secours sans IA.
- Le statut de l’IA indique si le modèle est présent et son empreinte de registre Ollama (`digest`) lorsqu’elle est publiée par le moteur. Le tag recommandé est `qwen3.5:4b-q4_K_M`; pour un audit reproductible, conserver également cette empreinte avec la version d’Ollama installée.

Le setup Windows vérifie la signature de l’installateur officiel, attend uniquement son processus (pas le service Ollama persistant), démarre `ollama serve` en arrière-plan si nécessaire, vérifie `http://127.0.0.1:11434/api/tags`, puis lance le téléchargement du modèle avec une limite de 90 minutes. Les journaux de service et de modèle sont séparés sous `logs/`. En cas de refus, d’erreur ou de dépassement du délai, l’étape reste facultative et Aurion poursuit son installation. Relancer manuellement `ollama pull qwen3.5:4b-q4_K_M` après avoir démarré Ollama. Le backend Aurion local écoute par défaut en développement et sélectionne le mode local. En production Render, le mode est explicitement `managed`, car Render ne peut pas joindre le moteur Ollama de l’ordinateur du client.

## Portée et garde-fous

- Les champs extraits, les catégories d’e-mail et les priorités du résumé sont des propositions. Ils ne changent aucun statut juridique ou administratif, ne déposent aucun document et n’envoient aucun e-mail.
- Le résumé du journal est déclenché par l’utilisateur et limité à son organisation. Il s’appuie sur les événements et démarches enregistrés, ainsi que sur le brouillon d’e-mail administratif associé lorsqu’il existe. Les pièces jointes et liens du message entrant ne sont pas ouverts.
- En mode local, les PDF ne sont pas transmis à un service distant mais leur extraction IA est désactivée : fournir un TXT/DOCX ou une image. Les fichiers PDF restent disponibles pour les traitements Aurion habituels.
- La génération d’images de logo reste indépendante du LLM texte. Aucun fournisseur distant de logo n’est appelé en mode local. Le logo existant peut être importé, et le générateur du bundle Aurion reste inchangé.

## Candidat local pour l’image

**FLUX.2 Klein 4B** est le candidat de génération/édition d’images à raccorder séparément : [fiche officielle](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B), Apache-2.0 affiché par l’éditeur, révision observée `5e67da950fce4a097bc150c22958a05716994cea`, dépôt d’environ 23,7 Go. [Diffusers 0.42.0](https://github.com/huggingface/diffusers/releases) est la version actuelle de la chaîne d’inférence identifiée dans l’audit, mais cette intégration n’est pas activée dans 15.3.12 : elle demande un worker Python/CUDA facultatif et une vérification du GPU, de la mémoire et des pilotes de la machine. Le rendu et les fichiers du bundle ne changent pas.

## Mode géré

Le service hébergé Render conserve le mode `managed` et les fournisseurs configurés pour ce service. Les opérations de texte n’utilisent un fournisseur géré que si la clé correspondante existe. Pour les données de journal et les courriers, n’utiliser le résumé géré qu’après validation de la politique de confidentialité et information de l’utilisateur. Les installations locales en mode `local` n’ont aucun fallback distant.
