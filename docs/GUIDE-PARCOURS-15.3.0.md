# Aurion 15.3.0 — guide du parcours utilisateur

## Accès et reprise

Les nouveaux espaces créés à partir de cette version sont inscrits au parcours guidé. Lors de la première entrée, Aurion propose l’étape 1. Les espaces existants ne sont pas enrôlés rétroactivement ; si leur configuration est marquée incomplète, une note de suivi apparaît dans le journal de bord existant.

Le tableau de bord reste accessible pendant tout le parcours. Les réponses sont sauvegardées côté serveur à chaque étape validée et lors de l’enregistrement du brouillon. L’étape courante est conservée pour permettre la reprise ultérieure. La fin du tutoriel signifie uniquement que l’utilisateur a déclaré le guide terminé ; elle ne certifie pas à elle seule que la configuration de l’entreprise est entièrement valide.

## Les sept étapes

1. **Situation** — indiquer si l’entreprise existe déjà ou doit être créée.
2. **Identification** — pour l’entreprise existante, saisir le SIREN/SIRET et vérifier les résultats disponibles ; les données manuelles restent possibles. Les divergences avec des valeurs existantes ne doivent pas être écrasées silencieusement.
3. **Activité et profil métier** — préciser l’activité en réutilisant le catalogue et les profils métier déjà présents.
4. **Identité visuelle** — étape facultative utilisant le nom et les informations déjà saisies. Le parcours ne prétend pas créer des variantes de logo non produites ; le bundle comprend les ressources réellement disponibles.
5. **Création administrative** — suivre les formalités pertinentes, noter les prérequis et pièces manquantes, téléverser les documents, préparer les courriels et lancer la lecture Gmail facultative.
6. **Configuration finale** — compléter les paramètres réutilisant les formulaires existants.
7. **Récapitulatif** — réviser ce qui est fait et ce qui reste, puis terminer le guide ou revenir au tableau de bord.

Les étapes facultatives peuvent être passées et les données déjà saisies peuvent être modifiées dans les paramètres habituels. Une formalité reste « à vérifier » tant qu’aucune source officielle n’a été contrôlée ; Aurion ne déduit pas qu’une obligation existe seulement parce qu’un organisme existe.

## Courriels et réponses administratives

L’utilisateur doit relire et confirmer chaque envoi. La confirmation Gmail d’envoi signifie que le fournisseur a accepté le courriel, pas que l’administration a reçu ou validé une formalité. Les réponses détectées sont des correspondances candidates ; elles ne modifient pas automatiquement le statut administratif. Un message de confiance faible reste libellé comme potentiellement lié et doit être confirmé ou ignoré.

Les autorisations de lecture et d’envoi Gmail sont proposées par deux actions distinctes et conservent des jetons séparés. La connexion de lecture Gmail est facultative et distincte de l’authentification Aurion. Elle peut être révoquée depuis l’interface ; les métadonnées et événements historiques du dossier sont conservés. La synchronisation n’est pas appelée à chaque chargement du tableau de bord.

## Journal de bord

Tous les nouveaux événements sont présentés dans le journal de bord de la page d’accueil. Chaque événement peut contenir un lien pour reprendre l’étape concernée, être marqué lu/non lu ou être résolu. Les événements historiques ne sont pas supprimés par cette évolution.

## Adresses d’intervention des clients

Une fiche client conserve une seule adresse de facturation et peut avoir plusieurs adresses d’intervention. L’utilisateur peut libeller une adresse, en choisir une par défaut et sélectionner l’adresse lors de la préparation d’un devis/facture. Le document enregistre un instantané de l’adresse choisie afin que les changements apportés plus tard à la fiche client ne réécrivent pas les documents déjà préparés.

## Limites connues

- Les intégrations de production ne sont pas réputées opérationnelles avant configuration OAuth, installation des dépendances et tests réels.
- La connexion administrative et la détection des réponses ne prennent en charge que Gmail.
- La validation du contenu d’un fichier ne vaut pas analyse antivirus ; celle-ci n’est pas disponible dans cette version.
- Le parcours administratif fournit un système de suivi, mais n’invente pas de catalogue exhaustif de formalités légales ; les sources, obligations et échéances doivent être confirmées.
