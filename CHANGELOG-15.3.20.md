# Aurion 15.3.20 — recentrage sur les entreprises existantes

## Périmètre produit

- Aurion s'adresse désormais exclusivement aux entreprises déjà immatriculées.
- Retire l'ancien parcours de création d'entreprise et le suivi des formalités administratives de l'application.
- Retire le studio d'identité visuelle, la génération de logo et le bundle de marque par entreprise.
- Conserve le parcours d'accueil guidé pour la première configuration d'une entreprise existante : informations de l'entreprise, activité, SIRET/SIREN et choix des modules Aurion.
- Demande le nom et prénom lors de la création du compte.
- Conserve la détection officielle par SIRET/SIREN dans la configuration initiale et les paramètres.
- Conserve la recherche d'entreprise par nom sous forme d'un outil distinct du tableau de bord, absent des paramètres et du configurateur initial.
- Conserve l'import des données d'une entreprise existante et améliore la fusion : les valeurs manuelles restent prioritaires et l'utilisateur confirme les compléments proposés.
- Conserve le report des données de registre vers les champs prévus de la fiche entreprise.
- Les anciennes tables et données historiques administratives/identité ne sont pas supprimées par cette version. Les routes et écrans associés ne sont plus exposés dans l'application.

## Qualité d'usage

- Améliore l'annonce de la navigation du tableau de bord aux lecteurs d'écran, l'état de la page active et le déplacement du focus au changement de vue.
- Renforce le contraste des boutons d'action principaux et la taille minimale des cibles tactiles.
- Clarifie les états de messagerie et d'agenda : synchronisation Google, invitation iCalendar, notification client envoyée/ignorée/en échec.
- Le parcours Google Agenda ne signale plus une création réussie si le fournisseur ne retourne pas d'identifiant d'événement.
- Corrige l'ouverture du flux OAuth Google afin de réserver la fenêtre avant la requête asynchrone.
- Préserve les mécanismes responsive et clavier virtuel déjà présents, sans réécriture générale des écrans métiers.

## Tests et documentation

- Réconcilie les contrats de routes avec le périmètre entreprise existante.
- Supprime l'appel au test runtime du bundle d'identité visuelle, qui n'existe plus.
- Met à jour le contrôle du blueprint Render : service Frankfurt existant, plan Starter, stockage S3 privé et contrôle de santé /health/db.
- Ajoute des contrats ciblés pour la première configuration entreprise, la recherche par nom séparée, la messagerie/agenda et l'accessibilité.
- Met à jour les manifestes à 15.3.20.

## Limites de livraison

- Les documents juridiques restent des brouillons et ne sont pas autorisés à être publiés ni utilisés pour ouvrir les ventes.
- L'infrastructure Frankfurt, Neon, le bucket OVH S3, les sauvegardes/restaurations, SMTP/Brevo, Stripe, domaine et DNS doivent être provisionnés et vérifiés avant bascule.
- Aucun déploiement Render ni migration de données de production n'est effectué par ce changement de branche.
- La CI GitHub observée a terminé les jobs en échec avant l'apparition de la moindre étape ; aucun résultat de compilation ou de suite de tests n'est donc revendiqué à partir de ces exécutions.
