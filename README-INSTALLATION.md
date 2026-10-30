# Aurion 15.3.14

## Pour vos clients : un seul fichier
Envoyez **Aurion-Setup.bat** (il contient l'intégralité d'Aurion). Le client double-clique dessus :
1. Aurion s'extrait dans `%LOCALAPPDATA%\Aurion` (aucun droit administrateur) ;
2. Node.js, une base PostgreSQL **dédiée à Aurion** et, si le téléchargement en ligne aboutit, LibreOffice pour les conversions DOCX/ODT en PDF sont préparés automatiquement ; l’installation de LibreOffice est facultative et Aurion continue en cas d’échec ;
3. une icône **Aurion** est créée sur le Bureau et dans le menu Démarrer ;
4. une fenêtre propose « Lancer Aurion maintenant ? » : un clic sur **Oui** ouvre l'application en plein écran.

Une connexion Internet est nécessaire pendant l'installation. Windows SmartScreen peut afficher un avertissement (« éditeur inconnu ») tant que le fichier n'est pas signé numériquement : « Informations complémentaires » → « Exécuter quand même ».

Le MSI LibreOffice n’est pas embarqué dans l’archive de sources ni dans le fichier de configuration autonome : l’installateur le télécharge directement depuis le dépôt stable officiel, vérifie sa signature Authenticode avant extraction et propose une poursuite sans ce moteur si le téléchargement ou l’installation échoue. La génération PDF native reste disponible selon le modèle ; les conversions de modèles DOCX/ODT nécessitent LibreOffice.

## IA locale

Le setup propose d’installer Ollama (éditeur vérifié, installation par utilisateur sans droits administrateur) et de télécharger Qwen3.5-4B (3,3 à 4 Go). Cette étape est facultative : si elle est refusée ou échoue, Aurion s’installe normalement et l’IA locale reste indisponible jusqu’à l’installation manuelle d’Ollama et de `qwen3.5:4b`. En mode local, aucune requête IA ne bascule vers le cloud. La génération locale de logo demande encore un moteur d’image séparé ; les détails figurent dans `docs/IA-LOCALE.md`.

## Au quotidien
Icône **Aurion** : arrête proprement le serveur et PostgreSQL, les relance, applique les mises à jour de la base, puis ouvre Aurion en plein écran (**F11** pour quitter / rétablir le plein écran).
La messagerie et l'agenda se configurent **dans Aurion** (Paramètres → Messagerie & agenda, ou à la première ouverture), une seule fois.

| Besoin | Fichier |
|---|---|
| Fenêtre visible pour comprendre un blocage | `START-AURION-DEBUG.bat` |
| Contrôle étape par étape (OK / KO) | `DIAGNOSE-AURION.bat` |
| Tout arrêter (serveur + PostgreSQL) | `STOP-AURION.bat` |
| Journaux | dossier `logs\` (`aurion.log` en premier) |

## Pour vous (développeur)
- Construire le fichier à distribuer : `tools\Build-Setup.bat` → `dist-setup\Aurion-Setup.bat`. Vos dossiers `branding\` et `assets\aurion-overview.svg` sont intégrés automatiquement.
- Vérifier le contenu et l’extraction réelle du setup (Windows) : `npm run test:setup-package`. Ce contrôle n’exécute pas l’installation complète de Node.js, PostgreSQL et LibreOffice.
- Tester les règles de paiement/échéancier : `npm run test:business`. Tester l’accessibilité des notifications : `npm run test:ui-a11y`.
- Installer depuis les sources (sans le fichier unique) : `INSTALL-DEPUIS-LES-SOURCES.bat`.
- `npm run dev` (dossier racine) reste réservé au développement. `npm run check` compile, vérifie les types et exécute les tests de fumée ciblés. `npm test` lance la suite complète de régression, dont plusieurs anciens tests statiques doivent encore être réconciliés avec les implémentations plus récentes.
- Si vous modifiez `backend/src/services/pricing.ts` : `npm run sync-pricing` régénère la copie navigateur (un test vérifie qu'elles sont identiques).
- Désinstaller : supprimer le dossier `%LOCALAPPDATA%\Aurion` et les deux raccourcis Aurion.


## Documents légaux Aurion (version 1.0)
Les textes CGV, confidentialité, cookies, mentions légales et accessibilité sont rédigés dans `docs/` et synchronisés à la base au démarrage. Les documents ne sont déclarés définitifs que lorsque les paramètres juridiques requis sont renseignés dans l’environnement du service : `AURION_LEGAL_PUBLISHER_NAME`, `AURION_LEGAL_PUBLISHER_FORM`, `AURION_LEGAL_PUBLISHER_SIREN`, `AURION_LEGAL_PUBLISHER_SIRET`, `AURION_LEGAL_PUBLISHER_ADDRESS`, `AURION_LEGAL_PUBLISHER_VAT`, `AURION_LEGAL_DIRECTOR`, `AURION_LEGAL_PUBLISHER_EMAIL`, `AURION_PRIVACY_CONTACT_EMAIL`, `AURION_HOST_NAME`, `AURION_HOST_ADDRESS`, `AURION_HOST_CONTACT`, `AURION_SUBPROCESSORS`, `AURION_ACCESSIBILITY_CONTACT_EMAIL`, `AURION_ACCESSIBILITY_AUDIT_DATE`, `AURION_ACCESSIBILITY_AUDIT_RESULT`. Les valeurs doivent être réelles et vérifiées pour l’entité éditrice et l’hébergement contractuel utilisés.


## Tests d’intégration PostgreSQL portables

Les tests HTTP utilisent `Fastify.inject` et une base PostgreSQL dédiée, notamment pour vérifier l’idempotence Stripe et l’isolation entre organisations. Docker Desktop (Windows/macOS) ou Docker Engine (Linux) suffit :

```powershell
# Depuis la racine du dépôt
npm --prefix backend run db:test:up
$env:DATABASE_URL = "postgresql://aurion_test:aurion_test_local_only@localhost:54329/aurion_test"
$env:NODE_ENV = "test"
$env:JWT_SECRET = "local-integration-secret-at-least-32-characters"
npm run migrate
$env:AURION_INTEGRATION_TESTS = "1"
npm test
npm --prefix backend run db:test:down
```

La suite utilise exclusivement le conteneur de test. Le script `db:reset:test` refuse les environnements `production` et toute base dont le nom ne contient pas `test`, `ci` ou `integration`, et demande `AURION_ALLOW_DATA_RESET=true` avant toute remise à zéro. Ne pointez jamais ces commandes vers la base de production.

## Déploiement web sur Render

Le service web attend une base PostgreSQL **dédiée à Aurion** via `DATABASE_URL`. Le fichier `render.yaml` documente une configuration de service gratuite et ne crée pas de base de données. Ne réutilisez jamais une base appartenant à VYRATY ou à un autre projet.

Avant tout déploiement, configurez dans les variables Render `DATABASE_URL`, `JWT_SECRET` (au moins 32 caractères aléatoires), `CORS_ORIGIN` (l’origine HTTPS exacte de l’application), `APP_BASE_URL` (URL publique exacte) et une `AURION_ENCRYPTION_KEY` persistante. `COOKIE_SECURE=true` et `HOST=0.0.0.0` sont définis pour la production. Si Google Calendar ou SMTP sont activés, configurez également les secrets et les URL de rappel correspondants. Ne commitez jamais de fichier `.env`.

**Limite importante :** le stockage documentaire actuel est local (`backend/storage`). Le système de fichiers d’un service web gratuit Render n’est pas une solution de stockage durable pour des documents clients. Avant toute utilisation réelle ou commerciale, migrer ce stockage vers un stockage objet privé durable et tester une restauration de PostgreSQL.
