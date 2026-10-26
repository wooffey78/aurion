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
           ├── IA / outils
           ├── Billing
           └── Audit
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
   PostgreSQL Redis   Object storage privé
```

## Frontend

Le frontend de production peut rester React/Vite si souhaité. La version v3 fournie ici est volontairement sans build pour fonctionner immédiatement dans htdocs/Live Server.

## API

À construire avec une technologie maintenue et une validation stricte des schémas. Toutes les opérations doivent vérifier l'identité, l'organisation et la permission côté serveur.

## Multi-tenant

Chaque donnée métier doit être liée à `organization_id`. Les requêtes doivent appliquer cette contrainte côté serveur, idéalement renforcée par des politiques PostgreSQL adaptées.

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

## IA

Les clés API des fournisseurs doivent rester côté serveur. Le navigateur ne doit jamais recevoir une clé permanente. Chaque appel doit être lié à l'organisation, au compte, au plan et aux quotas.
