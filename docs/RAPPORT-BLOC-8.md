# RAPPORT BLOC 8 — Applications Android et iOS avec Capacitor (14 novembre 2026)

## Ce qui est fait réellement dans cette livraison

1. **Projet Android natif RÉEL** : `android/` généré avec Capacitor 6 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android` ajoutés aux dépendances, versions verrouillées dans `package-lock.json`) — `appId fr.aurion.app`, scheme `fr.aurion.app`, wrapper Gradle, arborescence `app/src/main` complète.
2. **Interface EMBARQUÉE, pas une enveloppe URL** : le frontend est empaqueté dans `android/app/src/main/assets/public/` (876 Ko, régénérable par `tools/build-web-dist.mjs`) ; `capacitor.config.json` : `webDir dist-web`, `androidScheme https`, `cleartext false`, **aucune URL codée en dur** — le domaine canonique OVH est injecté au build (`--api-url`) ou nativement au démarrage ; la coquille démarre sans réseau et les données viennent de la réplication locale (Blocs 2-6).
3. **Script de build reproductible** : `tools/build-web-dist.mjs` (copie des assets servis par le backend + injection facultative de l'URL canonique avant `config.js`).
4. **iOS** : la configuration est prête (même gabarit) mais `cap add ios` exige macOS/Xcode/CocoaPods — **non exécutable ici**, procédure exacte dans `docs/APPLICATIONS-NATIVES.md` §3. Déclaré NON EXÉCUTÉ, jamais réussi.

## Ce qui reste (déclaré, non exécuté)

- Build signé Android (AAB) : Android SDK requis — machine éditeur. La commande exacte est documentée.
- Génération `ios/` + archive IPA : macOS requis.
- Recette WebView réelle (cas avion du navigateur à rejouer sur appareil), icônes/splash définitifs (décision éditeur), comptes développeur (décision éditeur).

## Non-régression

La génération n'a touché aucun fichier du moteur : dépendances ajoutées au `package.json` racine uniquement ; `npm run check` et `npm test` relancés sur l'arbre final (voir rapport 15.4.29).
