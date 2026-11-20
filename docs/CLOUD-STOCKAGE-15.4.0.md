# Stockage documentaire cloud — Aurion 15.4.0

Les documents (devis, factures, justificatifs, notes de frais) sont rangés dans le **Google Drive de l'utilisateur**.
Aurion ne facture aucun stockage et ne conserve que des métadonnées (référence métier, identifiant distant, état, empreintes, taille).

## 1. Fonctionnement

| Élément | Implémentation |
|---|---|
| Autorisation | OAuth 2.0 « application Web côté serveur », périmètre unique `https://www.googleapis.com/auth/drive.file` (fichiers créés ou ouverts par Aurion). `about.get` (quota) accepte ce périmètre. Distincte de la connexion à Aurion et de la connexion Gmail/Agenda. |
| `state` | Aléatoire (32 octets), stocké dans `cloud_oauth_states`, valable 10 minutes, supprimé à la première utilisation. Refus de consentement (`error=access_denied`) traité par une page explicite, sans plantage. |
| Jetons | Chiffrés AES-256-GCM avec `GOOGLE_TOKEN_ENCRYPTION_KEY` (hors dépôt). Jamais renvoyés au navigateur, jamais journalisés. Renouvellement automatique ; `invalid_grant` → état « révoqué » + notification. |
| Arborescence | `Aurion — Mon entreprise/` + `01_Administratif` … `09_Archives`. Idempotente : identifiants mémorisés (`cloud_folders`), existence vérifiée, recherche par `appProperties` avant création, verrou consultatif PostgreSQL par entreprise. |
| File locale | IndexedDB (`assets/js/core/cloud-sync.js`) : le fichier est enregistré sur l'appareil avant tout envoi ; reprise au chargement, à l'événement `online` et toutes les 60 s ; temporisation progressive (5 s → 30 min) ; `navigator.locks` empêche deux onglets d'envoyer en même temps ; stockage durable demandé (`navigator.storage.persist`) et espace vérifié. |
| Idempotence | Chaque élément porte un `clientRef` unique. Le serveur rejoue sans doublon ; si la réponse a été perdue, le fichier est retrouvé par `appProperties.aurionClientRef`. |
| Confirmation | « Synchronisé » uniquement si Google renvoie un identifiant, une taille et un MD5 identiques au fichier reçu. La copie locale n'est libérée qu'après cette confirmation. |
| Conflits | Aucun remplacement : chaque version est un nouveau fichier (`_v2`, `_v3`). Une version partie d'une base obsolète est enregistrée `_conflit_AAAAMMJJHHMM` et signalée dans le journal de bord. |
| Factures émises | Verrouillées après archivage : une nouvelle version exige une demande explicite (`allowNewVersion`) et l'original reste intact. |
| Quota | `about.get` : `limit`, `usage`, `usageInDrive`, `usageInDriveTrash`. Sans limite exploitable : « Capacité totale non communiquée ». Lecture à la connexion, à l'ouverture de Paramètres → Stockage (≤ 1 par minute), après un transfert ≥ 5 Mo. Échec : dernière valeur conservée et marquée obsolète. |
| Alertes | Seuils `AURION_CLOUD_QUOTA_THRESHOLDS` (défaut `80,90,95,100`). Une seule notification (`dedupe_key = cloud-quota`) mise à jour ; réouverte seulement si la situation s'aggrave ; résolue quand l'espace redevient normal. Un refus pour quota n'est jamais présenté comme un succès. |
| Fichiers serveur | Le contenu transite en mémoire (≤ 25 Mo) ; aucun fichier temporaire écrit pour les transferts. |
| Déconnexion | Révocation auprès de Google (best effort), effacement des jetons, état « déconnecté ». **Les fichiers du Drive ne sont jamais supprimés.** |
| Suppression de compte / changement de fournisseur | Suppression de l'entreprise : cascade sur `cloud_*` (métadonnées) ; les fichiers restent dans le Drive de l'utilisateur. Changement de fournisseur : non implémenté (Google Drive seul) ; voir le rapport .odt. |

## 2. Configuration Google Cloud (manuelle — le code seul ne suffit pas)

1. Google Cloud Console → projet dédié Aurion (un projet distinct par environnement : développement, tests, production).
2. *APIs & Services → Library* : activer **Google Drive API**.
3. *Google Auth Platform* : écran de consentement (nom, logo, e-mail de support, domaines autorisés, liens vers politique de confidentialité et CGU).
4. *Data Access* : ajouter le périmètre `.../auth/drive.file` (non sensible selon Google à la date de rédaction — **À CONFIRMER** lors de la soumission ; une vérification de l'application peut être exigée pour la publication).
5. *Clients* → client OAuth **Web application** ; URI de redirection autorisées exactes :
   - `https://<ORIGINE>/cloud/google/callback` (stockage documentaire)
   - `https://<ORIGINE>/integrations/google/callback` (messagerie/agenda, existant)
   - `https://<ORIGINE>/auth/google/callback` (connexion avec Google, si utilisée)
   Pour les deux services Render, déclarer les URI des deux origines.
6. Passer l'application en « Production » dans l'écran de consentement (sinon les jetons de test expirent au bout de 7 jours).

## 3. Variables d'environnement (sans valeurs réelles)

| Variable | Rôle |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Client OAuth Web (partagé avec la messagerie). |
| `GOOGLE_DRIVE_REDIRECT_URI` | `https://<ORIGINE>/cloud/google/callback` (en production : même origine que `APP_BASE_URL`, vérifié au démarrage). |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | ≥ 32 caractères aléatoires, persistante (la perdre rend les jetons illisibles → reconnexion nécessaire). |
| `AURION_CLOUD_QUOTA_THRESHOLDS` | `80,90,95,100` par défaut. |
| `APP_BASE_URL` | Origine publique HTTPS (sert aussi de base à l'URI de retour si la variable précédente est vide). |

Variables réservées aux tests (ignorées en production) : `AURION_GOOGLE_API_BASE_FOR_TESTS`, `AURION_GOOGLE_TOKEN_URL_FOR_TESTS`, `AURION_GOOGLE_REVOKE_URL_FOR_TESTS`.

## 4. Routes

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/cloud/status` | session |
| GET | `/cloud/google/start?returnTo=/dashboard\|/onboarding` | session, 10/10 min |
| GET | `/cloud/google/callback` | public, protégé par `state` à usage unique |
| DELETE | `/cloud/connection` | session |
| POST | `/cloud/quota/refresh` | session |
| POST | `/cloud/folders/ensure` | session |
| GET | `/cloud/documents` | session (filtrée par entreprise) |
| POST | `/cloud/documents` (multipart) | session, type réel vérifié, 25 Mo max |
| POST | `/cloud/business/:kind/:id` | session (PDF de devis/facture généré puis archivé) |
| GET | `/cloud/documents/:id/content` | session (entreprise propriétaire uniquement) |

## 5. Tests

- `backend/tests/cloud-storage.contract.test.mjs` (statique).
- `backend/tests/cloud-storage.integration.test.mjs` : double local de Google (`tests/helpers/fake-google.mjs`) + PostgreSQL réel : chiffrement, arborescence unique, rejouabilité, reprise après réponse perdue, jeton expiré/révoqué, seuils et saturation, conflits, facture verrouillée, cloisonnement, déconnexion. Nécessite `npm run build` et `DATABASE_URL`.
- Le parcours OAuth **réel** avec Google n'a pas été exécuté (aucun identifiant) : à valider manuellement (voir rapport .odt).

## 6. Retour arrière

La migration `073` est additive. En cas de retour à 15.3.20 : redéployer l'ancien commit ; les tables `cloud_*`, `expense_reports`, la colonne `users.job_title` et les colonnes `user_id/organization_id` de `contract_withdrawal_requests` sont simplement ignorées. Ne pas les supprimer (les fichiers des utilisateurs restent dans leur Drive ; les métadonnées permettront de reprendre).
