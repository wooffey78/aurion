# Aurion 12.0 — correctifs

## PostgreSQL
- Réutilisation de l'instance existante ; **un service déjà démarré n'est jamais arrêté ni redémarré**.
- Critère de réussite : `pg_isready` puis connexion réelle (`select 1`), plus `Start-Service`.
- Mot de passe `postgres` demandé une fois (ou mode réparation explicite). Plus de `trust` automatique.
- Mode réparation : `pg_hba.conf` écrit **sans BOM** (cause probable de l'échec de V11.6 sous PowerShell 5.1), `pg_ctl reload` au lieu d'un redémarrage, restauration garantie (`finally`).
- Le serveur attend PostgreSQL (20 tentatives) avant `listen()` ; `/health/db` renvoie 503 si la base est injoignable.

## Démarrage
- `$pid` (variable en lecture seule) supprimé : il faisait échouer le lanceur à chaque démarrage.
- Recompilation automatique (VERSION.txt, dates des sources). `node dist\server.js` lancé directement, sorties dans `logs\`.
- Plus d'élévation du lanceur ; UAC seulement pour démarrer le service.
- Erreurs visibles (boîte de dialogue), scripts en UTF-8 avec BOM, `psql -w` et natifs isolés du piège stderr.
- `npm test` non bloquant à l'installation.

## Code
- **Le build TypeScript échouait (122 erreurs)** : `noUncheckedIndexedAccess` désactivé, types `adm-zip`/`pdfkit` ajoutés.
- Migration 005 invalide (apostrophes) corrigée ; migration 004 ne supprime plus les prestations de l'utilisateur.
- Migrations suivies (`schema_migrations`), verrou, connexion dédiée par transaction.
- Chemins de stockage unifiés (`services/storage.ts`, anti-traversée) : logo, modèles, PDF/DOCX/ODT.
- LibreOffice réellement détecté ; repli PDF intégré si absent ; cache des documents invalidé après modification du devis.
- Chemins (`.env`, migrations, storage) indépendants du dossier courant.

## Frontend ↔ backend
- Appels API relatifs (même origine) : fin des problèmes CORS/cookie `localhost` vs `127.0.0.1`.
- Le serveur ne sert plus que `index.html`, `assets/`, `branding/` (`/backend/.env` → 404).
- Session de 8 h, glissante ; un 401 renvoie vers la connexion au lieu d'un écran vide.
- Comptabilité mensuelle (`month`), modale « Modifier l'activité » corrigée, cache-busting `?v=12.0`.
