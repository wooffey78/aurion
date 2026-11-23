# Architecture Render / GitHub — état vérifié (bloc 23)

> Document vérifié le 14 novembre 2026 sur les sources livrées. **Aucun service n'a été
> supprimé, déplacé, recréé ni désactivé** pendant les blocs fonctionnels ; aucune région,
> base, domaine ou secret n'a été modifié.

## Dépôt et CI

- Branche de référence : `main` — le workflow `.github/workflows/aurion-ci.yml` s'exécute sur
  push/PR, avec PostgreSQL de test dédié, rôles migration/runtime séparés, `npm run check`
  (build, typecheck, smoke, lint, navigateur, audit npm) en mode strict `AURION_BASELINE_STRICT=1`.
- Dependabot (npm + GitHub Actions) configuré (`.github/dependabot.yml`).

## Services Render (blueprint `render.yaml`)

| Service | Région | Rôle | URL | Health checks |
|---|---|---|---|---|
| `aurion` (API + front servi par le backend) | **frankfurt** | service de production unique du blueprint (cible commerciale UE) | https://aurion-2hye.onrender.com | `/health` (liveness) · `/health/db` (readiness) |
| `aurion-web` (hors blueprint depuis 15.4.22) | oregon | instance historique de retour arrière — à supprimer dans Render après bascule DNS et fenêtre de retour (`docs/RUNBOOK-PRODUCTION.md`) | cf. tableau de bord Render | idem |

- Le blueprint ne déclare plus que `aurion` : synchroniser `render.yaml` ne touche pas
  `aurion-web` (un service retiré du blueprint n'est jamais détruit par la synchronisation).
- Les services partagent le groupe de sécurité `aurion-commun` (déploiement interne).
- **Déploiement automatique** : activé dans le blueprint depuis la 15.4.35 (`autoDeploy: true`,
  décision éditeur) — chaque push validé sur `main` (donc après la CI verte) déclenche le déploiement
  Render ; les secrets restent saisis dans le tableau de bord et ne figurent jamais dans le dépôt.
- `/health` confirme que le processus répond (liveness) ; `/health/db` confirme la dépendance
  PostgreSQL (readiness) — compatibles Render, rôles documentés dans
  `docs/ARCHITECTURE-PRODUCTION.md`.

## Circulation des données

- L'utilisateur (navigateur) appelle le service `aurion` (Francfort) : authentification JWT +
  cookie de session ; la base PostgreSQL gérée est jointe depuis Francfort
  (DATABASE_URL, rôle applicatif restreint + pool d'administration journalisé).
- Stockage des documents : privé (S3 compatible ou disque local selon `AURION_STORAGE_BACKEND`),
  jamais exposé publiquement.
- **Latence** : pendant la transition, l'instance historique Oregon reste joignable pour
  retour arrière ; la cible commerciale UE est Francfort, alignée sur le stockage OVH région `de`.
- **Reprise après panne** : processus sans état (les données vivent dans PostgreSQL + stockage
  privé) ; un crash provoque un redémarrage Render (bloc 24 : arrêt propre sur erreur fatale).

## Règles de conduite (rappel du cahier des charges)

1. Ne jamais supprimer, déplacer, désactiver ou recréer un service pendant un bloc fonctionnel
   sans nécessité démontrée ET autorisation explicite.
2. Ne jamais changer de région, de base, de domaine ou de secret sans plan de migration/retour.
3. Après chaque déploiement autorisé : vérifier le commit live, le statut, les logs,
   `/health`, `/health/db` et les parcours réels.
4. Le ZIP livré correspond au code source ; le lien entre commit déployé et livraison reste
   à faire par le propriétaire dans Render/GitHub (aucun accès d'agent aux services).
