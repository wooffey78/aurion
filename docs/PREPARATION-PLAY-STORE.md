# Préparation à une publication Android / Google Play

État au 29 octobre 2026 : Aurion fournit une application Web progressive (PWA), un manifeste, un service worker et des consignes d’installation Android. Ce dépôt ne contient pas encore d’application Android signée ni de paquet Android App Bundle (`.aab`). La présence d’une PWA ne constitue pas une publication Play Store.

## Voie Android envisagée

Une Trusted Web Activity (TWA) peut envelopper l’application Web dans une application Android plein écran. Elle exige une origine HTTPS que l’éditeur contrôle et une association Digital Asset Links vérifiable entre le site et l’application. Le guide Android officiel détaille la génération avec Bubblewrap et la vérification du lien : [Trusted Web Activities — guide Android](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2).

## Éléments nécessaires avant de produire un paquet de publication

- Choisir et réserver une origine de production HTTPS stable, puis configurer le backend, les cookies, CORS, les sauvegardes et les callbacks OAuth sur cette origine.
- Choisir définitivement un identifiant de paquet Android unique ; le nom du paquet Play ne peut pas être librement remplacé après création de l’application.
- Générer le projet Android/TWA, les icônes et captures d’écran, vérifier `assetlinks.json` avec le certificat de signature et construire un `.aab` reproductible.
- Configurer Play App Signing et conserver séparément la clé d’envoi, les accès de publication et la procédure de récupération. Ne jamais inclure ces clés dans le ZIP source.
- Préparer la fiche Play, le contact de support, les déclarations de contenu et de données, la politique de confidentialité, la classification, les tests sur appareils et la stratégie de déploiement progressif.
- Vérifier dans Play Console les exigences de test applicables au type de compte développeur, les exigences actuelles de niveau d’API et les formulaires qui s’appliquent à Aurion avant chaque envoi.

Google Play utilise les Android App Bundles et exige une application signée ; Play Console guide aussi l’éditeur à travers la fiche, les déclarations et les étapes de prépublication. Voir [Créer et configurer une application Play](https://support.google.com/googleplay/android-developer/answer/9859152) et [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756).

## État commercial vérifié dans ce dépôt

- PWA installable, interface en français, service worker versionné et icône Web existants.
- Les clés d’API, accès OAuth, données de compte Play, domaine de production et clés de signature doivent être fournis et gérés par l’éditeur dans ses environnements privés.
- Une version Android n’a pas été construite ou signée dans cette archive. La disponibilité d’un compte Play, d’un domaine et de certificats de publication est nécessaire pour produire et valider l’artefact final.
- Avant toute publication, effectuer les recettes réelles de connexion, facturation, notifications, flux e-mail, sauvegardes/restaurations et contrôles Android sur un domaine et des comptes dédiés.
