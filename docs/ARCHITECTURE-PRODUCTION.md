# Architecture cible de production

## Principe

Aurion doit être un SaaS multi-tenant. Une entreprise ne doit jamais pouvoir accéder aux données d'une autre entreprise.

```text
Navigateur / PWA
      │ HTTPS
      ▼
Reverse proxy / WAF
      │
      ├── Frontend statique
      │
      └── API
           ├── Auth / sessions / WebAuthn
           ├── Organizations / RBAC
           ├── Documents
           ├── Modules
           ├── Billing
           ├── Facturation électronique — réception PA (webhook signé, bloc 3)
           ├── Facturation électronique — émission structurée + transmission (UBL/CII, bloc 4)
           ├── E-reporting — déclarations de données de transaction et de paiement (bloc 5)
           └── Audit
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
   PostgreSQL (RLS multi-tenant)   Object storage privé
```

## Frontend

Le frontend livré est en JavaScript vanilla servi directement par le backend Fastify (`assets/`, sans étape de build) ; il fonctionne en PWA (service worker). Aucune dépendance à React/Vite ou à un bundler n’est présente dans le code livré ; une migration ultérieure resterait possible sans changer l’API.

## API

À construire avec une technologie maintenue et une validation stricte des schémas. Toutes les opérations doivent vérifier l'identité, l'organisation et la permission côté serveur.

## Multi-tenant

Chaque donnée métier doit être liée à `organization_id`. Les requêtes doivent appliquer cette contrainte côté serveur, idéalement renforcée par des politiques PostgreSQL adaptées.

## Facturation électronique — réception (bloc 3)

Aurion est un logiciel de gestion connecté à la **plateforme agréée (PA)** choisie par l'entrepreneur ; il n'est pas une PA et ne transmet rien à l'administration fiscale. **Réception (bloc 3)** : les factures fournisseurs transitent par un webhook signé (`POST /pa/webhook/:token`, adaptateur isolé dans `backend/src/services/pa/`) avec idempotence, détection de doublons, archivage de l'original dans le stockage privé, rapprochement fournisseur, journal d'événements et reprise. **Émission (bloc 4)** : les factures émises sont générées en UBL 2.1 et CII D16B (profil Factur-X BASIC) avec les quatre mentions obligatoires du 1er septembre 2026 (SIREN client, catégorie d'opération LB/PS/LBPS, option TVA sur les débits, adresse de livraison si différente), validées puis archivées avant transmission signée via la PA (adaptateur `services/pa/outgoing/`, accusés signés obligatoires, idempotence, reprises, journal — `routes/pa-outgoing.ts`). À la livraison 15.4.3, **aucune PA réelle n'est connectée** : réception et transmission ne sont pas déclarées opérationnelles en production ; les tests valident les contrats génériques documentés dans `docs/PLATEFORME-AGREEE.md` ; **E-reporting (bloc 5)** : les déclarations de données de transaction et de paiement (B2C domestique et B2B international selon les déclarations utilisateur, B2B domestique exclu vers l'émission) sont construites par période mensuelle/trimestrielle avec rapport d'écarts bloquant, scellées puis transmises via la même PA avec accusés signés obligatoires et corrections sans réécriture de l'originale (`services/electronic-ereporting.ts`, `routes/pa-ereporting.ts` ; doctrine et matrice dans `docs/PLATEFORME-AGREEE.md` § 10).

## Documents

Le navigateur ne doit pas décider seul qu'un fichier est sûr. Le serveur doit :

1. limiter la taille ;
2. vérifier extension et type déclaré ;
3. détecter le type réel ;
4. renommer avec un identifiant aléatoire ;
5. stocker hors webroot ;
6. scanner antivirus ;
7. neutraliser les contenus actifs lorsque nécessaire ;
8. journaliser le résultat ;
9. appliquer une politique de rétention ;
10. délivrer les fichiers via des URLs temporaires autorisées.

## Authentification

Production : session serveur ou jeton court correctement protégé, MFA/passkeys WebAuthn, limitation des tentatives, récupération de compte, révocation des sessions, rotation et protection CSRF selon architecture.

La biométrie du téléphone ne doit jamais être collectée par Aurion. WebAuthn permet à l'appareil de prouver la possession d'un authentificateur sans transmettre l'empreinte.

## Génération automatique de contenu

Le service n'embarque aucune fonction de génération automatique de contenu ; celles qui avaient existé ont été retirées en version 15.4.0 (aucune route, aucun service, aucune variable associée dans le dépôt). Ce paragraphe est conservé à titre de garde-fou pour toute réintroduction éventuelle : les clés API des fournisseurs devraient rester côté serveur, le navigateur ne devrait jamais recevoir une clé permanente, et chaque appel devrait être lié à l'organisation, au compte, au plan et aux quotas.
