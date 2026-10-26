# Aurion 15.2.30 — corrections devis et factures

## 1. Création de devis/factures refusée avec relance à 0 jour
**Cause :** l’ancienne contrainte PostgreSQL imposait encore une valeur minimale de 1 jour, alors que l’interface peut envoyer `0`.
**Correction :** migration `052_fix_reminder_interval_constraint.sql` supprime les contraintes concernées, normalise les valeurs existantes entre 0 et 365 et recrée la contrainte autorisant 0.
**Vérification :** contrat de migration et contrôle statique de la plage 0–365 ; la preuve d’exécution PostgreSQL réelle dépend de l’environnement de déploiement disposant d’une base configurée.

## 2. Rechargement de la liste des documents en erreur
**Cause :** `GET /quotes` lisait `invoice_reminders.created_at`, colonne absente de cette table.
**Correction :** lecture de `invoice_reminders.sent_at` pour `createdAt`.
**Vérification :** requête de route inspectée après correction.

## 3. Édition d’un devis ou d’une facture — désalignement SQL/paramètres
**Cause :** le contrat SQL pouvait dériver du tableau de paramètres, ce qui provoquait l’erreur PostgreSQL de type « bind message supplies N parameters, but prepared statement requires M ».
**Correction :** conservation d’un ordre explicite de 40 paramètres pour le `UPDATE`, suppression de toute duplication de `mileageMode`, et ajout d’un test de comptage des placeholders.
**Vérification :** contrôle statique du nombre de placeholders et du tableau de paramètres.

## 4. Frais kilométriques
**Règle appliquée :**
- mode `margin` : TTC de base inchangé ; le coût kilométrique interne réduit la marge ;
- mode `client_price` : la surcharge kilométrique est facturée en plus du TTC de base, avec TVA, sans pénaliser la marge lorsque les taux internes et clients sont identiques.
**Correction :** `computePricing` expose `baseTtc` et `mileageBilledTtc`, distingue coût interne et montant facturé, et le formulaire reprend le TTC de base lors des éditions.
**Vérification :** cas numériques TVA 0 % et TVA 20 % dans les tests ciblés.

## 5. Numérotation des factures
**Cause :** coexistence des préfixes `FA-` et `FAC-` pouvant créer des séquences parallèles.
**Correction :** nouvelles factures sous `FAC-`, tout en tenant compte des anciens `FA-` lors du calcul du prochain numéro.
**Vérification :** route de conversion et fonction `nextNumber` contrôlées.

## 6. Coefficient Aurion sur les pièces
**Correction :** le coefficient de coût des pièces est appliqué uniquement lorsque la base est `purchase`; le coût fournisseur reste la donnée d’achat et le prix TTC commercial demeure indépendant de ce coefficient.
**Vérification :** tests de marge/coût et comparaison navigateur/serveur.

## 7. Frais kilométriques dans comptabilité/prévisionnel
**Cause :** certains calculs utilisaient le taux kilométrique comme un montant.
**Correction :** coût interne = `mileage_km × mileage_internal_rate`, avec repli sur `mileage_total` lorsque le taux interne n’est pas renseigné en mode marge ; ajout de `mileage_km` au prévisionnel.
**Vérification :** contrôle statique des requêtes et du calcul du prévisionnel.

## 8. Affichage documentaire
**Correction :** la ligne « Frais kilométriques » côté client n’est affichée que lorsque le mode est `client_price`; le tarif client kilométrique est utilisé pour l’affichage.
**Vérification :** contrôle des trois points de rendu natif et du modèle documentaire.

## 9. Paramètres
**Correction :** réorganisation en groupes Entreprise, Fiscalité et cotisations, Facturation et documents, Tarification, Messagerie et agenda, Compte et sécurité, Abonnement ; l’activité précise est saisie une seule fois dans l’identité de l’entreprise puis réutilisée ; détection registre réutilisable et non destructrice, aperçu avant application, détection profil/forme juridique à l’ouverture d’une activité, barre d’enregistrement et indicateur de complétude.
**Vérification :** tests statiques des points de navigation, détection et séparation des adresses.

## Version
`15.2.30` dans `package.json`, `backend/package.json` et `VERSION.txt`.


## Complément §7 — Paramètres
- Regroupement visible des paramètres en Entreprise, Fiscalité & cotisations, Facturation & documents et Tarification, sans supprimer les écrans existants.
- Détection registre réapplicable, badges « Détecté » et conservation des valeurs saisies manuellement.
- Ajout des champs TVA intracommunautaire, date de création, IBAN/BIC et contrôles SIREN/SIRET/TVA/IBAN.
- Ajout des valeurs par défaut kilométriques et TVA achats dans `configuration_data.pricing`, consommées uniquement comme valeurs par défaut des nouveaux documents.
- Preuve ciblée : `backend/tests/step33-cahier-15-2-30-settings.test.mjs`.
