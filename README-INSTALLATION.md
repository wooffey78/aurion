# Aurion 15.4.0

**Périmètre produit :** Aurion est destiné aux entreprises déjà immatriculées. La première connexion sert à renseigner et vérifier les informations d’une entreprise existante (détection SIRET/SIREN) et à configurer les modules de gestion. Il n’existe plus de parcours de création d’entreprise, de formalités de création ni de studio de création d’identité visuelle. La recherche d’entreprise par nom reste un outil distinct dans le tableau de bord.

## Pour vos clients : un seul fichier
Envoyez **Aurion-Setup.bat** (il contient l'intégralité d'Aurion). Le client double-clique dessus :
1. Aurion s'extrait dans `%LOCALAPPDATA%\Aurion` (aucun droit administrateur) ;
2. Node.js, une base PostgreSQL **dédiée à Aurion** et, si le téléchargement en ligne aboutit, LibreOffice pour les conversions DOCX/ODT en PDF sont préparés automatiquement ; l’installation de LibreOffice est facultative et Aurion continue en cas d’échec ;
3. une icône **Aurion** est créée sur le Bureau et dans le menu Démarrer ;
4. une fenêtre propose « Lancer Aurion maintenant ? » : un clic sur **Oui** ouvre l'application en plein écran.

Une connexion Internet est nécessaire pendant l'installation. Windows SmartScreen peut afficher un avertissement (« éditeur inconnu ») tant que le fichier n'est pas signé numériquement : « Informations complémentaires » → « Exécuter quand même ».

Le MSI LibreOffice n’est pas embarqué dans l’archive de sources ni dans le fichier de configuration autonome : l’installateur le télécharge directement depuis le dépôt stable officiel, vérifie sa signature Authenticode avant extraction et propose une poursuite sans ce moteur si le téléchargement ou l’installation échoue. La génération PDF native reste disponible selon le modèle ; les conversions de modèles DOCX/ODT nécessitent LibreOffice.

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
- `npm run dev` (dossier racine) reste réservé au développement. `npm run check` compile, vérifie les types et exécute les tests de fumée ciblés. `npm test` lance la suite complète de régression. `npm run test:company-config` exécute uniquement les contrats ciblés du parcours entreprise, de la recherche séparée et de la fusion des données de registre.
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

## Déploiement Web commercial

Le blueprint 15.4.0 décrit les services Render existants `aurion` (Francfort) et `aurion-web` (Oregon), plan `starter`, déploiement automatique désactivé; il ne migre pas à lui seul le service ni ses variables si celui-ci n’est pas géré par un Blueprint. Il attend une base PostgreSQL **dédiée à Aurion** via `DATABASE_URL`; il ne crée pas Neon, le bucket OVH, Brevo ni Stripe. Ne réutilisez jamais une base appartenant à VYRATY ou à un autre projet. Pour l’ordre de configuration, voir `docs/PLAN-BASCULE-FRANKFURT-15.3.20.md`.

Avant tout déploiement, configurez dans les variables Render `DATABASE_URL`, `AURION_MIGRATION_DATABASE_URL`, `AURION_RUNTIME_DB_ROLE`, `JWT_SECRET` (au moins 32 caractères aléatoires), `CORS_ORIGIN` (l’origine HTTPS exacte de l’application), `APP_BASE_URL` (URL publique exacte) et une `AURION_ENCRYPTION_KEY` persistante. `COOKIE_SECURE=true` et `HOST=0.0.0.0` sont définis pour la production. En production Render, le stockage S3 privé doit aussi être complet. Si Google Calendar ou SMTP sont activés, configurez également les secrets et les URL de rappel correspondants. Ne commitez jamais de fichier `.env`.

**Stockage commercial :** en production, Aurion 15.4.0 exige `AURION_STORAGE_BACKEND=s3` et un bucket privé OVHcloud à Francfort. La cible n’est pas encore configurée : migrer et vérifier les fichiers du service Oregon, activer les sauvegardes indépendantes et tester une restauration base + fichiers avant les données réelles.
