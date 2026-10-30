# Audit de préparation à la commercialisation — Aurion 15.3.14

**État constaté le 30 octobre 2026 — version 15.3.14 examinée; correctif documentaire et garde-fou préparés dans le dépôt pour 15.3.15.**

## Décision

**Aurion n’est pas prêt pour une commercialisation publique avec des données et documents clients réels.** Une démonstration ou un pilote fermé sur données fictives est possible. La mise en vente doit attendre la résolution des blocages P0 ci-dessous, la finalisation des informations légales et la validation du périmètre client (professionnels uniquement ou consommateurs également).

Ce constat porte sur la préparation commerciale, pas sur le pourcentage de fonctionnalités codées. Les notes ci-dessous évaluent l’existence de preuves dans le dépôt et la production; elles ne remplacent pas une recette complète, un audit de sécurité ou un avis juridique.

## Estimation

**Préparation commerciale estimée : 39 %, arrondie à environ 40 %.** Ce chiffre est une estimation pondérée, avec une incertitude d’au moins ±10 points, et non une mesure de qualité logicielle.

| Domaine | Poids | Niveau constaté | Contribution |
| --- | ---: | ---: | ---: |
| Parcours et fonctions cœur | 25 % | 75 % | 18,75 |
| Hébergement et durabilité des données | 15 % | 20 % | 3,00 |
| Authentification, sécurité et preuves de contrôle | 15 % | 45 % | 6,75 |
| Facturation et paiement | 10 % | 40 % | 4,00 |
| Contrats et protection des données | 15 % | 15 % | 2,25 |
| Courriels et assistance | 5 % | 30 % | 1,50 |
| Accessibilité | 5 % | 10 % | 0,50 |
| Facturation électronique réglementaire | 10 % | 20 % | 2,00 |
| **Total estimé** | **100 %** |  | **38,75 %** |

Les fonctions sont étendues et la version examinée est la 15.3.14. Toutefois, leur couverture complète n’a pas été vérifiée par une recette de bout en bout dans cet audit. Le chiffre ne signifie donc pas que « 60 % du code manque ».

## Constats déterminants

### P0 — à résoudre avant tout pilote avec de vraies données

1. **Pièces jointes non durables sur Render gratuit.** Les téléversements sont stockés sous `backend/storage/private` sur le disque du service. La documentation du dépôt indique que le système de fichiers local gratuit de Render ne garantit pas la persistance entre redémarrages ou redéploiements. Des justificatifs, pièces jointes, logos ou autres fichiers peuvent être perdus. Un stockage objet privé durable, des règles de rétention et un essai de restauration sont nécessaires.
2. **Textes juridiques brouillons en production.** La base Neon de production indique `is_draft=true` pour les cinq documents actuels : CGV, confidentialité, cookies, mentions légales et accessibilité. Pourtant, l’inscription accepte ces textes et enregistre l’acceptation des CGV et de la politique de confidentialité. Il faut empêcher l’acceptation de textes brouillons; le correctif du projet en cours ajoute ce verrou.
3. **Identité légale et périmètre des prestataires non établis.** Les textes ne peuvent pas être définitifs sans la raison sociale/forme, les identifiants d’immatriculation, l’adresse, les coordonnées, le responsable de publication, les coordonnées exactes des hébergeurs et la liste exacte des prestataires, lieux de traitement et transferts. Le dépôt utilise des variables de configuration à compléter. Ne pas remplacer ces champs par des suppositions.
4. **Durées et suppression des données non démontrées.** Le code place l’espace en lecture seule après l’expiration et conserve un délai technique de 60 jours supplémentaires. L’audit du dépôt n’a pas trouvé de preuve d’une purge complète, vérifiable et coordonnée de la base, des fichiers et des sauvegardes à la fin de ce délai. L’inaccessibilité d’un compte ne vaut pas suppression. Il faut définir les durées, les implémenter et les vérifier.
5. **Périmètre client à fixer.** Les CGV sont orientées professionnels, mais le formulaire d’inscription ne demande pas de confirmer la qualité professionnelle. Si Aurion vise uniquement les professionnels, le parcours doit l’indiquer clairement et recueillir cette déclaration. Si des consommateurs sont admis, il faut un contrat adapté à la vente à distance aux consommateurs, les informations précontractuelles, les règles de rétractation, la médiation et les modalités de résiliation applicables. Aucun numéro de médiateur ne doit être inventé.

### P1 — à traiter avant l’ouverture commerciale

6. **Facturation électronique française.** Le projet sait préparer des données de facture Factur-X, mais l’examen du code n’a identifié ni inscription comme plateforme agréée ni connexion à une plateforme agréée partenaire assurant l’acheminement, le cycle de vie et l’e-reporting. Aurion ne doit pas être présenté comme assurant la conformité à la réforme. Depuis le 1er septembre 2026, les entreprises doivent pouvoir recevoir des factures électroniques via une plateforme agréée; l’obligation d’émission s’applique aux PME et micro-entreprises à partir du 1er septembre 2027. Il faut intégrer un partenaire agréé ou désactiver toute promesse de conformité.
7. **Paiement réellement activé non confirmé.** La base contient des plans actifs à 14,00 € TTC par mois et 151,20 € TTC par an, avec 60 jours d’essai. Le code ouvre un paiement ponctuel Stripe (`mode=payment`) ou un virement selon les variables configurées; il n’implémente pas de prélèvement récurrent automatique après l’essai. L’activation des moyens de paiement et le parcours de remboursement n’ont pas été vérifiés en production. Les textes doivent rester alignés sur le paiement ponctuel et sur le prix affiché au moment de la commande.
8. **Courriels sortants non garantis.** Aurion s’appuie sur la configuration de messagerie ou les services disponibles dans l’environnement; une livraison de réinitialisation, validation ou notification n’a pas été prouvée. Render gratuit bloque les sorties SMTP courantes sur les ports 25, 465 et 587. La disponibilité de Brevo ou d’un relais sur un autre port dépend de la configuration et d’un essai réel; elle ne peut pas être affirmée à partir du dépôt seul.
9. **IA et données de messagerie.** Le mode local Ollama n’est disponible que si le moteur et le modèle sont installés et accessibles; l’échec ne déclenche pas de repli cloud dans le service local examiné. L’application déployée est configurée en mode géré dans le blueprint Render, mais le fournisseur réel, ses lieux de traitement, ses durées et ses garanties ne sont pas établis par les fichiers vérifiés. Les contenus de courriels ou documents envoyés à un modèle peuvent contenir des données personnelles. Il faut vérifier la configuration effective, documenter chaque prestataire, limiter les données transmises et présenter l’analyse IA comme une aide à contrôler.
10. **Sauvegardes et restauration.** La requête en lecture seule sur le planning Neon de la branche de production a renvoyé un planning vide. Aucun calendrier de snapshots n’est donc configuré par ce mécanisme pour la branche interrogée. La portée des fichiers, les garanties de rétention du plan Neon et un test de restauration ne sont pas établis. Mettre en place une stratégie de sauvegarde documentée pour la base et les fichiers, puis exécuter un test de reprise.
11. **Sécurité indépendante non auditée.** Le code comprend notamment des mots de passe hachés avec Argon2id, des sessions sécurisées et une connexion par clé d’accès. Le dépôt ne fournit pas de preuve de test d’intrusion indépendant, d’exercice de réponse à incident, de test de restauration ni d’essai documenté de cloisonnement multi-organisation couvrant tous les parcours.
12. **Accessibilité non évaluée.** Aucun audit RGAA complet et valide n’a été trouvé. La page ne peut pas déclarer une conformité. Si Aurion est assujetti, la déclaration doit être fondée sur une évaluation effective et préciser le résultat, les non-conformités, les exemptions et les voies de contact/recours. L’assujettissement exact dépend notamment de la nature de l’offre et de la taille de l’entreprise; il doit être qualifié.

## Documents intégrés au projet

Les pages CGU/CGV, confidentialité et annexe de sous-traitance, cookies, mentions légales et accessibilité sont préparées dans `docs/` et reproduites dans `legal/`. Elles décrivent les fonctions et les limites constatées. Elles restent **des projets à compléter et valider**, et l’application doit continuer à les afficher comme brouillons tant que les champs et validations ne sont pas terminés. La présence d’un texte dans le dépôt ne signifie pas qu’il est publié ou juridiquement validé.

Le correctif préparé pour 15.3.15 conserve les documents avec marqueurs de projet ou champs incomplets à l’état brouillon, conserve les versions 1.0 déjà enregistrées en créant une version 2.0 distincte, et bloque les nouvelles inscriptions ainsi que l’acceptation d’invitations tant que les quatre documents nécessaires ne sont pas publiés. Ce garde-fou n’est pas encore dans la version 15.3.14 en production.

## Ordre recommandé avant une vente

1. Fixer le marché : B2B uniquement ou B2B/B2C; faire correspondre le formulaire, les conditions et le parcours de commande.
2. Renseigner et vérifier l’identité de l’éditeur, l’hébergeur contractuel, les coordonnées de contact, les sous-traitants, leurs lieux, les transferts et les durées.
3. Migrer les fichiers vers un stockage objet privé durable; mettre en place sauvegardes et restaurations vérifiées pour fichiers et base.
4. Définir et exécuter la purge de bout en bout; tenir un registre de traitements et une procédure d’incident/notification.
5. Vérifier réellement le courriel sortant, la configuration de paiement, l’assistance et les remboursements.
6. Décider de la stratégie de facture électronique : partenaire plateforme agréée, interface et statut, ou avertissement clair qu’Aurion ne gère pas cette transmission.
7. Auditer l’accessibilité et la sécurité; effectuer une recette métier complète sur les rôles, les organisations, la facturation, l’export et les échecs de fournisseurs.
8. Faire relire les documents par un avocat ou juriste français compétent, remplir les valeurs manquantes, publier les versions validées et vérifier l’enregistrement des acceptations.

## Sources officielles consultées le 30 octobre 2026

- [Mentions obligatoires d’un site internet professionnel — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F37351)
- [Conditions générales de vente — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F33527)
- [Retards de paiement, pénalités et indemnité de recouvrement — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F23211)
- [Médiation de la consommation — Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F33338)
- [Facturation électronique entre entreprises — Ministère de l’Économie](https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises)
- [Sous-traitance et article 28 du RGPD — CNIL](https://www.cnil.fr/fr/securite-gerer-la-sous-traitance)
- [Règles relatives aux cookies et traceurs — CNIL](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi)
- [Déclaration d’accessibilité — RGAA](https://accessibilite.numerique.gouv.fr/obligations/declaration-accessibilite/)
- [Mentions et pages obligatoires — RGAA](https://accessibilite.numerique.gouv.fr/obligations/mentions-et-pages-obligatoires/)
