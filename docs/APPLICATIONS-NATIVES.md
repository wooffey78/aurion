# Applications natives Android / iOS — état réel (Bloc 8, 14 novembre 2026)

> Honnêteté d'abord : **le projet Android est maintenant RÉEL et présent dans l'arborescence** (`android/`, généré par Capacitor 6, interface EMBARQUÉE dans le paquet — pas une enveloppe URL). **Le build signé (AAB/APK) n'a pas été exécuté ici** (pas d'Android SDK) et **iOS n'a pas pu être généré** (macOS/Xcode/CocoaPods requis) — procédure exacte ci-dessous, à exécuter sur la machine de l'éditeur. Seuls des builds réellement exécutés pourront être déclarés validés.

## 1. Ce qui est PRÊT et VÉRIFIÉ dans l'arborescence (15.4.29)

1. **`android/`** — projet natif Capacitor 6 complet : `app/build.gradle`, wrapper Gradle, package `fr.aurion.app` (appId et custom URL scheme), interface web **embarquée** dans `android/app/src/main/assets/public/` (index.html, css, js — le frontend démarre même sans réseau pour la coquille ; les DONNÉES viennent de la réplication locale, Blocs 2-6).
2. **`capacitor.config.json`** — webDir `dist-web`, `androidScheme: https`, `cleartext: false`, **aucune URL codée en dur** (le domaine OVH est posé au build par l'éditeur ou injecté nativement).
3. **`tools/build-web-dist.mjs`** — reconstruction reproductible de `dist-web/` depuis les assets servis par le backend, avec injection facultative `--api-url=https://…` du domaine canonique AVANT `config.js` (priorité `window.AURION_API_URL`). Aucune URL Render.
4. **Pont SQLite chiffré** — `assets/js/core/local-store.js` expose l'adaptateur à driver injecté ; l'enveloppe fournit `window.AURION_SQLITE_DRIVER` (compatible CapacitorSQLite : `exec`/`query`), SQLCipher + clé protégée Android Keystore / iOS Keychain. Sans driver : IndexedDB (testé 7/7).
5. **Réplication, file, rejeu, documents** (Blocs 2-6) fonctionnent tels quels dans la WebView.

## 2. Procédure build Android (machine éditeur, non exécutée ici)

1. Installer Android Studio (SDK 34) puis `npm install` (dépendances Capacitor déjà dans `package.json`).
2. `node tools/build-web-dist.mjs --api-url=https://VOTRE-DOMAINE-OVH` puis `npx cap sync android`.
3. Ouvrir `android/` dans Android Studio → Build > Generate Signed Bundle (keystore éditeur) → **AAB** pour Play Store.
4. Recette : `docs/RECETTE-BETA-PRIVEE.md` sur appareil réel (A1-A6, B1-B8) + cas avion du Bloc 17.

## 3. Procédure iOS (macOS requis, non exécutable ici)

1. Sur macOS : `npm install`, puis `npm i -D @capacitor/ios` et `npx cap add ios` (le gabarit de configuration est déjà correct).
2. `node tools/build-web-dist.mjs --api-url=https://VOTRE-DOMAINE-OVH && npx cap sync ios`.
3. Ouvrir `ios/App/App.xcworkspace` dans Xcode → équipe de signature éditeur → archive **IPA**.
4. Pont SQLite : `@capacitor-community/sqlite` + Keychain (voir §1.4).

## 4. Vérifications AVANT toute déclaration « validée »

- Cas avion complet sur appareil réel (création → rejeu automatique → numérotation serveur → documents) déjà automatisé sur navigateur — à rejouer sur WebView Android.
- SQLite chiffré : persistance après redémarrage forcé, séparation A/B conservée, changement de compte.
- File de fichiers (`aurion-cloud-queue`) et notifications/permissions (Bloc 10) sur appareils réels.
- Safe areas iOS, retour Android, clavier, deep links OAuth (Bloc 11).

## 5. Reste du prompt maître pour les natives

- Builds signés réels (machine éditeur), `ios/` à générer (macOS), comptes développeur (décision éditeur), Blocs 9-10 (SQLite branché réel, push/photo/background).
