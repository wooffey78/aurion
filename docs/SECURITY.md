# Modèle de sécurité Aurion

## Niveau développement local

Aurion utilise une authentification serveur avec cookie HttpOnly. Les données métier principales ne sont pas conservées comme source de vérité dans `localStorage`.

Ne mettez toutefois pas de données professionnelles sensibles dans cet environnement de développement.

## Mesures présentes

### Identité
- mots de passe hachés côté serveur avec Argon2id ;
- cookie HttpOnly ;
- JWT à durée courte ;
- limitation des tentatives ;
- aucun mot de passe dans le navigateur.

### Autorisation
- rôles owner/admin/member ;
- contrôle de l'organisation côté serveur ;
- requêtes métier filtrées par `organization_id`.

### Fichiers
- liste blanche de types ;
- taille maximale ;
- noms de stockage aléatoires ;
- stockage privé local ;
- statut initial `quarantined`.

### Web
- CORS configurable ;
- Helmet ;
- rate limiting ;
- validation serveur.

## État des mesures de sécurité (contrôle du 13 novembre 2026)

Quatre états : **implémentée et testée**, **implémentée partiellement**, **absente**, **non vérifiée**.
Preuve = emplacement dans le code ou test exécuté.

### Implémentées et testées
- Cookies `HttpOnly` + `Secure` + `SameSite=strict` en production (`plugins/auth.ts` ; `config.ts` refuse `COOKIE_SECURE=false` en production ; test `config-production.test.mjs`).
- RLS PostgreSQL multi-tenant, échec fermé, 65 tables (migrations 074 et 075 ; tests `tenant-isolation.rls.test.mjs` et `pa-inbox.integration.test.mjs` — voir `docs/SECURITE-RLS.md`).
- Rotation/révocation des sessions : version de session (`sessionVersionOf`), révocation globale (`/account/logout-all`), script `secrets:rotate`.
- Récupération de compte : `/auth/forgot-password` + jetons à usage unique expirant (`password_reset_tokens` ; tests `mail.test.mjs`).
- Passkeys WebAuthn (routes `/auth/webauthn/*`, jamais de collecte biométrique ; tests `webauthn` du smoke).
- Filtres `organization_id` applicatifs sur toutes les routes métier (contrats `routes.contract.test.mjs`).
- CSP stricte sans `unsafe-inline` (`plugins/security.ts` ; vérifiée par le parcours navigateur E2E).
- Inspection du type réel des fichiers : `detectMime` (cloud) et vérification du type réel du logo (PNG/JPEG/WebP, SVG refusé).
- Stockage privé : local hors webroot ou S3 (obligatoire en production, `config.ts`), clés aléatoires, téléchargement après autorisation.
- Journal d'accès administratif inter-entreprises (`platform_admin_access_log`, migration 074).
- Webhook plateforme agréée (bloc 3) : signature HMAC-SHA256 à temps constant avec tolérance anti-rejeu (±300 s), corps brut préservé, jeton d'URL résolu sur le pool d'administration journalisé, charge utile des appels non signés jamais conservée, limiteur de débit, rotation de jeton (`services/pa/`, `routes/pa.ts` ; tests `pa-adapter.contract.test.mjs` et `pa-inbox.integration.test.mjs`).
- Transmission électronique sortante (bloc 4) : flux d'émission signé HMAC (miroir du webhook), accusés PA signés obligatoires — une facture n'est jamais marquée transmise sans accusé authentifié —, idempotence par identifiant stable (aucun doublon côté PA lors des reprises), document et accusé archivés avec SHA-256 scellé, secret du point d'entrée chiffré AES-256-GCM au repos, URL HTTPS publique imposée en production (`services/electronic-outgoing.ts`, `services/pa/outgoing/` ; tests `einvoice-formats.test.mjs` et `einvoice-outgoing.integration.test.mjs`).
- E-reporting (bloc 5) : déclarations de données de transaction et de paiement préparées, scellées (SHA-256) puis transmises via le même contrat signé que l'émission ; seuls des accusés PA signés règlent l'état (jamais « transmise » sur une réponse douteuse), intégrité du flux revérifiée avant chaque envoi, corrections sans réécriture de l'originale, rapport d'écarts bloquant tant que des données déclaratives manquent — aucune donnée inventée ; les trois nouvelles tables portent la politique RLS `tenant_isolation` (`services/electronic-ereporting.ts`, `services/electronic-ereporting-matrix.ts` ; tests `ereporting-matrix.test.mjs` et `ereporting.integration.test.mjs`).
- Tests E2E navigateur complets (inscription → parcours → tableau de bord → reconnexion) : `frontend-browser.e2e.mjs`.

### Implémentées partiellement
- Antivirus : aucun scan antivirus intégré ; les fichiers restent en quarantaine initiale et le type réel est vérifié.
- Audit : journal de bord utilisateur et journal administratif existent ; pas encore d'export d'audit consolidé.
- Protection CSRF : cookies SameSite=strict + en-têtes Bearer ; pas de jeton CSRF dédié (state des flux OAuth à usage unique).

### Absentes (décisions assumées)
- Vérification d'adresse e-mail : flux retiré (migration 062, 15.2.50) ; toute réactivation doit être progressive et sans verrouillage de comptes existants (voir bloc 17 du cahier des charges).
- Génération automatique de contenu : absente (aucune route `/ai/*`, aucun service de traitement automatique de contenu associé).

### Non vérifiées (à exécuter avant mise en production)
- Sauvegarde et restauration réelles de la base (procédure à tester sur copie).
- Monitoring, alertes et page de statut en production.
- Audit de sécurité indépendant.
- Connexion OAuth Google réelle (sandbox contractuel).
- Connexion d'une plateforme agréée réelle (adaptateurs `generic` testés seulement ; réception et transmission ne sont pas déclarées opérationnelles en production — voir `docs/PLATEFORME-AGREEE.md`).
- Validation XSD/Schematron officielle des documents UBL/CII émis (la validation interne couvre XML bien formé, mentions et règles arithmétiques EN 16931 ; la validation de schéma complet est réalisée par la PA à la réception) ; assemblage Factur-X PDF/A-3 non livré (voir `docs/PLATEFORME-AGREEE.md` § 9).

« Parfaitement sécurisé » ne peut pas être garanti par cette archive seule : la sécurité de production dépend aussi de l'infrastructure, des secrets, des dépendances, des procédures et des audits.
