// Bloc 24 — Observabilité : journalisation structurée, redaction des champs sensibles,
// identifiant de requête (X-Request-Id), gestionnaires d'erreurs fatales, métriques internes.
//
// Règles du prompt : détecter une panne avant l'utilisateur, sans JAMAIS exposer de données
// personnelles, de secrets ou de contenu de facture dans les journaux/métriques/alertes.
// Le suivi d'erreurs externe (Sentry ou équivalent, décision D6) reste NON CONNECTÉ :
// la couche est prête (hooks fataux + émission vers un adaptateur optionnel) et déclarée
// non opérationnelle tant qu'aucun outil contractuel n'est intégré.
import { config } from '../config.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SERVICE_VERSION = (() => {
  try { return readFileSync(new URL('../../VERSION.txt', import.meta.url), 'utf8').trim() || 'unknown'; }
  catch { return 'unknown'; }
})();

/** Champs sensibles RELEDACTÉS avant toute écriture de journal (liste explicite du prompt). */
export const SENSITIVE_FIELDS = ['password', 'password_hash', 'newpassword', 'currentpassword', 'token', 'accesstoken', 'refreshtoken', 'authorization', 'cookie', 'set-cookie', 'secret', 'apikey', 'api_key', 'webhooksecret', 'signature', 'iban', 'cardnumber', 'cvv', 'encryptionkey', 'client_secret'];

/** Redaction récursive : les champs sensibles deviennent « [REDACTED] » ; les corps ne sont pas journalisés par défaut. */
export function redactValue(value: unknown, depth = 0): unknown {
  return redact(value, depth);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return depth > 4 ? '[TRUNCATED]' : value;
  if (Array.isArray(value)) return value.slice(0, 20).map(v => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_FIELDS.includes(k.toLowerCase())) { out[k] = '[REDACTED]'; continue; }
      out[k] = redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') {
    // Séquences sensibles dans un texte libre : Bearer tokens et clés sk_/AKIA/ghp_.
    return value
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
      .replace(/sk_(live|test)_[A-Za-z0-9]+/g, '[REDACTED]')
      .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]')
      .replace(/ghp_[A-Za-z0-9]{20}/g, '[REDACTED]');
  }
  return value;
}

/** Options pino : JSON structuré avec service/version/environnement ; redaction appliquée. */
export function loggerOptions() {
  return {
    level: config.LOG_LEVEL || (config.NODE_ENV === 'production' ? 'info' : 'info'),
    base: { service: 'aurion-api', version: SERVICE_VERSION, environment: config.NODE_ENV },
    redact: { paths: SENSITIVE_FIELDS.map(f => `req.headers.${f}`).concat(SENSITIVE_FIELDS.map(f => `req.body.${f}`)).concat(SENSITIVE_FIELDS.map(f => `*.${f}`)), censor: '[REDACTED]' },
  };
}

/** Compteurs de métriques internes (aucun identifiant utilisateur ni client). */
const metricsState = { requests: 0, status5xx: 0, status4xx: 0, startedAt: Date.now() };
export function recordRequest(statusCode: number) {
  metricsState.requests++;
  if (statusCode >= 500) metricsState.status5xx++;
  else if (statusCode >= 400) metricsState.status4xx++;
}
export function metricsSnapshot(poolStats: { total: number | null; idle: number | null; waiting: number | null } | null) {
  const uptimeSec = Math.round((Date.now() - metricsState.startedAt) / 1000);
  return {
    service: 'aurion-api',
    version: SERVICE_VERSION,
    environment: config.NODE_ENV,
    uptimeSeconds: uptimeSec,
    requestsTotal: metricsState.requests,
    responses5xx: metricsState.status5xx,
    responses4xx: metricsState.status4xx,
    rate5xxPercent: metricsState.requests ? Math.round(metricsState.status5xx / metricsState.requests * 1000) / 10 : 0,
    postgresPool: poolStats || { total: null, idle: null, waiting: null },
    reminderWorker: 'documented in scheduler (bloc 24: execution visible via logs)',
  };
}
