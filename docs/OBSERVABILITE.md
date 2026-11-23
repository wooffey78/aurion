# Observabilité — journalisation, erreurs fatales, métriques (bloc 24)

## Journalisation structurée

- Fastify/pino en JSON avec champs `service` (aurion-api), `version` (VERSION.txt),
  `environment` (NODE_ENV) ; niveau configurable par `LOG_LEVEL` (fatal/error/warn/info/debug/trace).
- **Chaque requête porte un identifiant unique** renvoyé dans l'en-tête de réponse
  `X-Request-Id` et présent dans les journaux (`reqId`) : un ticket de support est relié à
  ses journaux sans exposer de donnée personnelle.
- Les corps de requêtes ne sont pas journalisés par défaut.

## Redaction (testée)

- Liste explicite de champs sensibles retirés avant écriture : password, token,
  access/refresh token, authorization, cookie, secret, apiKey, webhook secret, signature,
  IBAN, numéro de carte, CVV, clé de chiffrement.
- Motifs de clés réelles dans les textes libres également masqués : `Bearer …`,
  `sk_live_/sk_test_…`, `AKIA…`, `ghp_…`.
- Implémentation : `backend/src/services/observability.ts` (`redact`/`redactValue`) ;
  les erreurs de secrets n'exposent que des codes (`SECRET_*`).

## Erreurs fatales

- `unhandledRejection` et `uncaughtException` : journalisation structurée (niveau fatal)
  puis **arrêt propre** du processus — Render redémarre ; jamais de poursuite en état
  incertain. Les réponses d'erreur au client restent génériques (code, sans pile d'appels).

## Métriques internes

- `GET /internal/metrics` (réservé à l'administration) : requêtes totales, taux 5xx/4xx,
  disponibilité du pool PostgreSQL (total/idle/waiting), version, uptime.
  **Aucune métrique ne contient d'identifiant utilisateur ni d'identifiant client.**
- Latence par route : disponible dans les journaux pino (`responseTime` par reqId).

## Disponibilité externe

- `/health` = liveness (le processus répond) ; `/health/db` = readiness (PostgreSQL répond).
- Surveillance EXTERNE (deux régions, 1 minute, alertes) : **non opérationnelle** tant
  qu'aucun service de surveillance contractuel n'est choisi (décision D6 en attente).

## Suivi d'erreurs externe (décision D6) — NON CONNECTÉ

- La couche est prête (hooks fataux + redaction), aucun outil (Sentry ou équivalent) n'est
  intégré : aucune clé de tracking ne doit être introduite sans décision D6 et contrat
  (hébergé dans l'UE de préférence, sous-traitance documentée dans `GET /transparency`).

## Alertes (seuils documentés, à brancher à la décision D6)

| Alerte | Seuil suggéré | Runbook |
|---|---|---|
| Indisponibilité | /health en échec 2× de suite | vérifier Render → restart, logs fataux |
| Hausse des 5xx | > 5 % sur 5 min | logs reqId, /internal/metrics, dernière migration |
| Tâche planifiée en échec | `status='failed'` sur notification_jobs | vérifier SMTP (CLIENT_EMAIL_MISSING) |
| File de synchronisation bloquée | brouillons > 1 h | vérifier /settings/draft et la session |
| Quota de stockage | 80/90/95/100 % (bloc cloud) | Paramètres → Stockage |
| Certificat TLS | < 14 jours | géré par Render (renouvellement auto) |
| Échec de sauvegarde | webhook Stripe en erreur | vérifier STRIPE_WEBHOOK_SECRET |

Déduplication : les alertes métier (journal de bord, bloc 10) sont dédupliquées par
`dedupe_key` — le bruit est évité à la source.

## Rétention et cloisonnement

- Durées de rétention des journaux : **à faire valider juridiquement** (Render conserve ses
  logs selon l'offre) ; aucune donnée client dans les alertes.
- Les journaux/métriques ne portent un identifiant d'organisation qu'à des fins de diagnostic ;
  aucun tableau de bord ne permet de voir les données d'une autre organisation (bloc 2).
- Traçabilité des incidents : fiche avec horodatage de détection, durée, cause, correction et
  action préventive, reliée au journal d'événements (bloc 20).
