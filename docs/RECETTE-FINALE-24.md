# Aurion — recette finale étape 24

Cette recette est volontairement exécutable sur l’instance de recette réelle. Le ZIP ne contient pas les secrets ni une base de production.

## 1. Compilation
Depuis `backend/` :

```powershell
npm install
npm run build
```

Résultat attendu : `tsc -p tsconfig.json` se termine avec le code 0.

## 2. Migrations PostgreSQL

```powershell
$env:DATABASE_URL = "postgresql://..."
npm run db:migrate
```

Contrôler notamment les migrations `034_onboarding_configuration_data.sql`, `035_subscription_payments_readonly.sql` et `036_sav_editable.sql`.

## 3. Recette données
Créer puis modifier/supprimer au minimum : client, fournisseur, fourniture, pièce, prestation, appareil, rendez-vous, devis et SAV. Après chaque opération, revenir sur la section concernée et vérifier l’actualisation sans retour en haut de page.

## 4. Lecture seule / conservation 60 jours
Mettre une souscription en expiration de recette :
- GET des données : autorisé ;
- export ZIP : autorisé pendant la fenêtre de 60 jours ;
- modification/suppression/envoi : refusé ;
- POST `/support/tickets` : autorisé ;
- souscription : autorisée ;
- après `data_read_only_until` : export et consultation protégés.

## 5. Paiement
Configurer Stripe avec des identifiants de test, sélectionner un plan mensuel puis annuel et vérifier qu’aucune reconduction automatique n’est créée. Tester séparément le virement et la confirmation administrateur.

## 6. Onboarding
Tester : champs laissés vides, fermeture sans sauvegarde, sauvegarde plus tard, détection SIRET/SIREN, modification des valeurs détectées, questionnaire puis configuration. Vérifier qu’un module déclaré non pertinent n’apparaît pas dans le menu lorsque la règle métier le permet.

## Limite de cette archive
La recette navigateur + PostgreSQL réel + paiement Stripe réel de test n’a pas été exécutée dans l’environnement de génération du ZIP, faute d’instance Aurion démarrée, de base PostgreSQL de recette et de clés Stripe de test. Elle est donc documentée ici, sans prétendre qu’elle a été exécutée.
