# Aurion 15.2.40 — catalogue métier, identité visuelle et modes de connexion

## 1. Référence et principes de conservation
- Base de travail : commit production `e3dd5e4e4606065ab24efd27ef94252a0244c8a5`.
- Refonte travaillée sur une branche dédiée ; aucune mise en production avant compilation, suite de tests PostgreSQL et contrôle Render.
- Les routes métier existantes restent la voie d'accès aux données. Aucune formule de devis/facture ni migration de calcul n'est remplacée par du calcul client.
- Les documents déjà émis ne sont pas réécrits par une modification du catalogue.

## 2. Catalogue métier
- Présentation plus structurée en cartes de catégories, compteurs, recherche globale et filtres avec état accessible.
- Ajout d'un panneau de consultation explicite, avec fermeture au clic/Escape et retour du focus.
- Actions d'ajout, modification, suppression confirmée et prix fournisseurs conservées via les API existantes.
- Les articles gardent la gestion existante des références, variantes, stock, valeurs de vente et prix fournisseurs.
- Export JSON versionné `aurion-catalogue` avec métadonnées d'activité et schéma version 1.
- Import JSON additif : limite 5 Mio et 1 000 éléments ; les noms déjà présents sont ignorés, aucune donnée n'est remplacée ou supprimée ; chaque insertion passe par la route existante.
- Les prix fournisseurs d'un export sont réassociés au fournisseur existant par son nom ; une ligne de fournisseur inconnue n'en crée pas automatiquement un nouveau.

## 3. Identité visuelle et accessibilité
- Palette graphite / gris neutre / vert sauge discret, sans fond quadrillé ni halo bleu dominant.
- Cartes et contrôles de catalogue adaptés au mobile ; passage à une colonne sur petit écran.
- Focus clavier visible, recherche avec retour `aria-live`, filtres avec `aria-pressed`, libellés de consultation explicites.
- Styles de réduction du mouvement respectés.

## 4. Connexion et sécurité
- WebAuthn / clés d'accès proposées sur les navigateurs compatibles en contexte sécurisé, et non seulement sur téléphone.
- Le texte décrit une « clé d'accès » plutôt que de promettre une biométrie matérielle : selon le dispositif, le déverrouillage local peut utiliser empreinte, visage ou code de l'appareil.
- La page Compte permet de lister les clés et de supprimer une clé appartenant à l'utilisateur connecté.
- Connexion Google OpenID Connect séparée de Gmail/Calendar : scopes `openid email profile`, vérification `state`, PKCE, vérification serveur du jeton d'identité, e-mail vérifié, compte Aurion existant uniquement.
- Google n'est pas configuré automatiquement. Le bouton est masqué tant que les variables de configuration nécessaires ne sont pas présentes. La console Google doit autoriser `APP_BASE_URL/auth/google/callback` en plus du callback Gmail/Calendar existant.
- Le mode mot de passe reste indépendant et accessible si les autres méthodes ne sont pas configurées.

## 5. Versionnement
- `VERSION.txt`, manifestes npm et lockfile alignés sur `15.2.40`.
- Nom du cache de shell PWA incrémenté pour forcer la relecture des ressources de l'interface.

## 6. Contrôles obligatoires avant fusion / commercialisation
1. Build et typecheck TypeScript sur le SHA de la PR.
2. Suite complète avec PostgreSQL jetable : migrations, tests unitaires, contrats et intégration.
3. Vérification du catalogue sur des activités et profils métiers réels : consultation, ajout, modification, suppression, prix fournisseur, export/import, doublons, import malformé, activité sans catalogue.
4. Vérification responsive à 320 px, tablette et bureau ; clavier seul ; lecteur d'écran pour recherche, dialogue et filtres.
5. Vérification des clés d'accès sur Windows/macOS/mobile, y compris annulation, mauvaise signature, suppression et reconnexion par mot de passe.
6. Google OAuth réel seulement après ajout du redirect URI dans Google Cloud Console : succès, refus, state invalide, e-mail non vérifié et compte Aurion inconnu.
7. Fusion seulement si CI verte ; attendre ensuite que `aurion-web` soit `live` sur le SHA fusionné, `/health/db` en HTTP 200 et journaux d'erreur sans nouvelle régression.
8. Mesures de performance de la route tableau de bord (au moins 20 échantillons comparables pour médiane/p95) avant d'affirmer un gain.
9. Le service Render secondaire demeure bloqué par l'erreur TypeScript `Buffer` dans `backend/src/services/webauthn.ts` ; son rôle et son pipeline doivent être établis avant modification.

## 7. État à la création de ce changelog
Les fichiers sont en cours sur `feat/catalogue-professional-auth-20261027`. Aucun pourcentage de finalisation ne doit assimiler une fonctionnalité codée à une recette réelle ; le statut final sera recalculé après CI, fusion et contrôle du SHA Render.
