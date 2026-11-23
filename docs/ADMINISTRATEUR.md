# Compte administrateur Aurion

Le compte administrateur est un compte de plateforme distinct des abonnements utilisateurs. Il n'a pas besoin d'abonnement et donne accès à la section **Administration** du tableau de bord.

## 1. Configurer l'adresse qui reçoit les tickets

Dans `backend/.env` :

```env
AURION_SUPPORT_EMAIL=votre-adresse-administrateur@example.com
PLATFORM_SMTP_HOST=smtp.votre-fournisseur.fr
PLATFORM_SMTP_PORT=465
PLATFORM_SMTP_SECURITY=ssl
PLATFORM_SMTP_USER=votre-compte-smtp
PLATFORM_SMTP_PASS=votre-mot-de-passe-smtp
PLATFORM_SMTP_FROM=votre-adresse-administrateur@example.com
```

Le SMTP de plateforme sert aux tickets, notifications administrateur et factures d'abonnement. Ne mettez jamais ces secrets dans le frontend.

## 2. Créer le compte administrateur

Depuis `backend` :

```bash
npm run db:migrate
npm run admin:create
```

La commande demande l'e-mail et le mot de passe. Elle crée une organisation technique d'administration, un utilisateur propriétaire et l'entrée `platform_admins`. Si l'utilisateur existe déjà, elle lui ajoute simplement le rôle administrateur de plateforme.

Pour fournir directement les valeurs :

```bash
npm run admin:create -- admin@example.com "MotDePasseTresLongEtUnique"
```

Utilisez de préférence la saisie interactive afin de ne pas laisser le mot de passe dans l'historique du terminal.

## 3. Se connecter

1. Démarrez Aurion normalement.
2. Ouvrez la page de connexion habituelle.
3. Connectez-vous avec l'e-mail et le mot de passe créés.
4. La section **Administration** apparaît automatiquement dans la sidebar.

Le compte n'est pas soumis à l'abonnement.

## 4. Administration disponible

Le tableau de bord administrateur affiche :
- utilisateurs gratuits, essais en cours, abonnements mensuels et annuels ;
- total utilisateurs ;
- moyennes de nouveaux utilisateurs par mois/semaine/jour ;
- taux de conversion essai → payant ;
- estimations d'inscriptions payantes à partir de la tendance des six derniers mois ;
- tickets avec historique de conversation ;
- changement de statut et réponse directe à l'utilisateur.

Les estimations sont indicatives : elles reposent sur les données historiques disponibles et ne constituent pas une prévision statistique garantie.

## 5. Statuts des tickets

- **Ouvert**
- **En cours**
- **En attente utilisateur**
- **En attente fournisseur**
- **Fermé** : fenêtre de réouverture de 7 jours.
- **Clos** : le ticket ne peut plus être rouvert.
- **Doublons** : le second ticket est rattaché au plus ancien.

Après 7 jours en **Fermé**, Aurion passe automatiquement le ticket en **Clos** via le worker serveur.

## 6. Messagerie des tickets

Un nouveau ticket est enregistré dans Aurion et envoyé à `AURION_SUPPORT_EMAIL`. Les réponses et changements de statut sont également notifiés par e-mail lorsque le SMTP de plateforme est configuré.
