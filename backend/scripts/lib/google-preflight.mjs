// Pré-vol Google — diagnostic de configuration + contrôles réels en lecture seule.
//
// Ce module ne journalise et ne retourne aucun secret : les jetons d'accès restent internes
// aux fonctions de contrôle, les erreurs ne reprennent que le code/HTTP de Google, et le
// diagnostic par environnement ne cite que les NOMS de variables manquantes.
//
// Les points de terminaison et fetch sont injectables pour permettre des tests hors réseau.

export const GOOGLE_CALENDAR_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
]);
export const GOOGLE_IDENTITY_SCOPES = Object.freeze(['openid', 'email', 'profile']);
export const GOOGLE_DRIVE_SCOPES = Object.freeze(['https://www.googleapis.com/auth/drive.file']);
export const DEFAULT_GOOGLE_ENDPOINTS = Object.freeze({
  token: 'https://oauth2.googleapis.com/token',
  tokenInfo: 'https://oauth2.googleapis.com/tokeninfo',
  openid: 'https://oauth2.googleapis.com/.well-known/openid-configuration',
  calendar: 'https://www.googleapis.com/calendar/v3',
  drive: 'https://www.googleapis.com/drive/v3',
});
export const DEFAULT_QUOTA_THRESHOLDS = Object.freeze([80, 90, 95, 100]);
export const GOOGLE_CONFIG_KEYS = Object.freeze([
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_DRIVE_REDIRECT_URI',
  'GOOGLE_TOKEN_ENCRYPTION_KEY',
]);

export function envValue(env, key) {
  if (env instanceof Map) return String(env.get(key) ?? '').trim();
  return String(env?.[key] ?? '').trim();
}

function safeUrl(value) {
  try { return new URL(String(value)); } catch { return null; }
}

function isProductionEnvironment(environment) {
  return String(environment || '').trim().toLowerCase() === 'production';
}

export function parseQuotaThresholds(value) {
  const raw = String(value ?? '').split(',').map(part => Number(part.trim()));
  const valid = raw.length === 4
    && raw.every(number => Number.isFinite(number) && number > 0 && number <= 100)
    && raw[0] < raw[1] && raw[1] < raw[2] && raw[2] <= raw[3];
  return valid ? raw : [...DEFAULT_QUOTA_THRESHOLDS];
}

export function quotaLevel(limit, usage, thresholds = DEFAULT_QUOTA_THRESHOLDS) {
  if (limit === null || limit === undefined || usage === null || usage === undefined) return 'unknown';
  const numericLimit = Number(limit);
  const numericUsage = Number(usage);
  if (!Number.isFinite(numericLimit) || !Number.isFinite(numericUsage) || numericLimit <= 0) return 'unknown';
  const percent = (numericUsage / numericLimit) * 100;
  if (percent >= thresholds[3]) return 'full';
  if (percent >= thresholds[2]) return 'critical';
  if (percent >= thresholds[1]) return 'alert';
  if (percent >= thresholds[0]) return 'warning';
  return 'ok';
}

export function formatBytes(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return 'inconnu';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'];
  let number = Math.max(0, Number(value));
  let unit = 0;
  while (number >= 1024 && unit < units.length - 1) { number /= 1024; unit += 1; }
  const rounded = unit === 0 ? String(Math.round(number)) : number.toFixed(1).replace('.', ',');
  return `${rounded} ${units[unit]}`;
}

/**
 * Diagnostique la configuration Google d'un environnement sans afficher de valeur.
 * `environment` sert aux règles de production (HTTPS et APP_BASE_URL obligatoires).
 */
export function diagnoseGoogleConfiguration(env, { environment = 'local' } = {}) {
  const label = String(environment || 'local').trim() || 'local';
  // Google est « activé » par les identifiants OAuth, pas par les URI par défaut du modèle
  // .env.example : un opérateur qui laisse GOOGLE_CLIENT_ID vide ne doit pas voir un faux
  // « incomplet » à cause des deux URI de retour préremplies.
  const present = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter(key => envValue(env, key));
  const liveMissing = [];
  if (!envValue(env, 'GOOGLE_PREFLIGHT_REFRESH_TOKEN')) liveMissing.push('GOOGLE_PREFLIGHT_REFRESH_TOKEN');

  if (!present.length) {
    return {
      state: 'disabled',
      environment: label,
      missing: [],
      warnings: [],
      liveMissing,
      configured: false,
      liveReady: false,
    };
  }

  const missing = [];
  const warnings = [];
  const production = isProductionEnvironment(label);

  const clientId = envValue(env, 'GOOGLE_CLIENT_ID');
  if (!clientId) missing.push('GOOGLE_CLIENT_ID');
  else if (!/\.apps\.googleusercontent\.com$/i.test(clientId)) {
    missing.push('GOOGLE_CLIENT_ID (format …apps.googleusercontent.com)');
  }

  if (!envValue(env, 'GOOGLE_CLIENT_SECRET')) missing.push('GOOGLE_CLIENT_SECRET');

  const encryptionKey = envValue(env, 'GOOGLE_TOKEN_ENCRYPTION_KEY');
  if (encryptionKey.length < 32) missing.push('GOOGLE_TOKEN_ENCRYPTION_KEY (32 caractères minimum)');

  const appBase = envValue(env, 'APP_BASE_URL');
  const appBaseUrl = appBase ? safeUrl(appBase) : null;
  if (appBase && !appBaseUrl) missing.push('APP_BASE_URL (URL invalide)');
  if (!appBase && production) missing.push('APP_BASE_URL (requis pour valider les URI Google)');

  const calendarRedirect = envValue(env, 'GOOGLE_REDIRECT_URI');
  if (!calendarRedirect) missing.push('GOOGLE_REDIRECT_URI');
  else {
    const redirect = safeUrl(calendarRedirect);
    if (!redirect) missing.push('GOOGLE_REDIRECT_URI (URL invalide)');
    else {
      if (redirect.pathname !== '/integrations/google/callback') {
        missing.push('GOOGLE_REDIRECT_URI (chemin /integrations/google/callback)');
      }
      if (redirect.username || redirect.password || redirect.search || redirect.hash) {
        missing.push('GOOGLE_REDIRECT_URI (sans identifiants, paramètres ni fragment)');
      }
      if (production && redirect.protocol !== 'https:') missing.push('GOOGLE_REDIRECT_URI HTTPS');
      if (appBaseUrl && redirect.origin !== appBaseUrl.origin) {
        missing.push('GOOGLE_REDIRECT_URI (origine différente de APP_BASE_URL)');
      }
    }
  }

  let driveRedirect = envValue(env, 'GOOGLE_DRIVE_REDIRECT_URI');
  let driveDerived = false;
  if (!driveRedirect && appBaseUrl) {
    try {
      driveRedirect = new URL('/cloud/google/callback', appBaseUrl).toString();
      driveDerived = true;
    } catch {
      missing.push('GOOGLE_DRIVE_REDIRECT_URI (dérivation depuis APP_BASE_URL impossible)');
    }
  }
  if (!driveRedirect && !appBaseUrl) {
    // L'application locale retombe sur http://127.0.0.1:PORT/cloud/google/callback ; le
    // diagnostic ne signale donc pas cette absence comme un manque bloquant hors production.
    if (production) missing.push('GOOGLE_DRIVE_REDIRECT_URI (ou APP_BASE_URL en production)');
  } else if (driveRedirect) {
    const drive = safeUrl(driveRedirect);
    if (!drive) missing.push('GOOGLE_DRIVE_REDIRECT_URI (URL invalide)');
    else {
      if (drive.pathname !== '/cloud/google/callback') {
        missing.push('GOOGLE_DRIVE_REDIRECT_URI (chemin /cloud/google/callback)');
      }
      if (drive.username || drive.password || drive.search || drive.hash) {
        missing.push('GOOGLE_DRIVE_REDIRECT_URI (sans identifiants, paramètres ni fragment)');
      }
      if (production && drive.protocol !== 'https:') missing.push('GOOGLE_DRIVE_REDIRECT_URI HTTPS');
      if (appBaseUrl && drive.origin !== appBaseUrl.origin) {
        missing.push('GOOGLE_DRIVE_REDIRECT_URI (origine différente de APP_BASE_URL)');
      }
      if (driveDerived) warnings.push('GOOGLE_DRIVE_REDIRECT_URI dérivée de APP_BASE_URL');
    }
  }

  if (!envValue(env, 'GOOGLE_CALENDAR_ID')) {
    warnings.push('GOOGLE_CALENDAR_ID vide : la valeur primary est utilisée');
  }

  const thresholdsRaw = envValue(env, 'AURION_CLOUD_QUOTA_THRESHOLDS');
  if (thresholdsRaw && String(parseQuotaThresholds(thresholdsRaw).join(',')) !== thresholdsRaw.replace(/\s+/g, '')) {
    warnings.push('AURION_CLOUD_QUOTA_THRESHOLDS invalide : 80,90,95,100 utilisés');
  }

  return {
    state: missing.length ? 'incomplete' : 'configured',
    environment: label,
    missing,
    warnings,
    liveMissing,
    configured: missing.length === 0,
    liveReady: missing.length === 0 && liveMissing.length === 0,
    driveDerived,
  };
}

/** Texte lisible pour un environnement ; ne contient aucune valeur. */
export function formatGoogleConfiguration(diagnostic) {
  if (!diagnostic) return 'diagnostic indisponible';
  if (diagnostic.state === 'disabled') return 'désactivé (aucune variable Google)';
  if (diagnostic.state === 'incomplete') {
    const missing = diagnostic.missing.length ? diagnostic.missing.join(' ; ') : 'variable non précisée';
    return `incomplet — manquant : ${missing}`;
  }
  return diagnostic.warnings.length
    ? `configuré — ${diagnostic.warnings.join(' ; ')}`
    : 'configuré';
}

export function normalizeScopes(value) {
  const values = Array.isArray(value) ? value : [value];
  const set = new Set();
  for (const entry of values) {
    for (const scope of String(entry ?? '').split(/\s+/)) if (scope.trim()) set.add(scope.trim());
  }
  return [...set];
}

export function missingScopes(granted, required) {
  const present = new Set(normalizeScopes(granted));
  return required.filter(scope => !present.has(scope));
}

/**
 * Échange un refresh token contre un access token. Le token d'accès n'est retourné qu'à
 * l'appelant interne ; il n'est jamais inclus dans un message d'erreur.
 */
export async function refreshGoogleAccessToken({
  clientId,
  clientSecret,
  refreshToken,
  fetchImpl = globalThis.fetch,
  tokenUrl = DEFAULT_GOOGLE_ENDPOINTS.token,
  timeoutMs = 15_000,
} = {}) {
  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, code: 'CONFIG', message: 'client OAuth ou refresh token manquant pour le contrôle réel' };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, code: 'CONFIG', message: 'implémentation fetch indisponible' };
  }
  let response;
  try {
    response = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, code: 'NETWORK', message: 'Google ne répond pas (délai dépassé ou réseau indisponible)' };
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = String(data?.error || `HTTP_${response.status}`);
    let message;
    if (code === 'invalid_grant') message = 'refresh token refusé (expiré, révoqué ou lié à un autre client OAuth) — régénérez GOOGLE_PREFLIGHT_REFRESH_TOKEN';
    else if (code === 'invalid_client' || response.status === 401) message = 'client OAuth refusé — vérifiez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET';
    else if (response.status === 403) message = 'Google a refusé la demande (403) — vérifiez les API activées et le compte de test';
    else message = `Google a refusé le rafraîchissement (HTTP ${response.status})`;
    return { ok: false, status: response.status, code, message };
  }
  if (!data?.access_token) {
    return { ok: false, status: response.status, code: 'NO_ACCESS_TOKEN', message: 'Google n’a pas retourné de jeton d’accès' };
  }
  return {
    ok: true,
    accessToken: String(data.access_token),
    expiresIn: Number.isFinite(Number(data.expires_in)) ? Number(data.expires_in) : null,
    scope: data.scope ? String(data.scope) : null,
  };
}

async function tokenInfoScope(accessToken, { fetchImpl, tokenInfoUrl, timeoutMs }) {
  if (!accessToken || typeof fetchImpl !== 'function') return null;
  try {
    const url = new URL(tokenInfoUrl);
    url.searchParams.set('access_token', accessToken);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data?.scope ? String(data.scope) : null;
  } catch {
    return null;
  }
}

function calendarError(status) {
  if (status === 401) return 'jeton refusé (401) — le refresh token est invalide ou révoqué';
  if (status === 403) return 'Calendar API a refusé (403) — scope calendar manquant ou API Calendar désactivée';
  if (status === 404) return 'Calendar API introuvable (404) — activez Google Calendar API dans le projet OAuth';
  if (status === 429) return 'Calendar API limite les requêtes (429) — réessayez plus tard';
  if (status >= 500) return `Calendar API indisponible (HTTP ${status})`;
  return `Calendar API a répondu HTTP ${status}`;
}

/** Liste les calendriers du compte, sans exposer leur identifiant dans les messages. */
export async function listGoogleCalendars({
  accessToken,
  fetchImpl = globalThis.fetch,
  calendarBaseUrl = DEFAULT_GOOGLE_ENDPOINTS.calendar,
  timeoutMs = 15_000,
} = {}) {
  if (!accessToken) return { ok: false, message: 'aucun jeton d’accès Calendar disponible' };
  let response;
  try {
    const url = new URL(`${String(calendarBaseUrl).replace(/\/+$/, '')}/users/me/calendarList`);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('fields', 'items(id,summary,primary,accessRole,timeZone)');
    response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, code: 'NETWORK', message: 'Calendar API ne répond pas (réseau ou délai dépassé)' };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, code: `HTTP_${response.status}`, message: calendarError(response.status) };
  }
  const data = await response.json().catch(() => null);
  const calendars = (Array.isArray(data?.items) ? data.items : []).map(item => ({
    id: String(item?.id || ''),
    summary: String(item?.summary || '(sans nom)'),
    primary: item?.primary === true,
    accessRole: String(item?.accessRole || ''),
    timeZone: String(item?.timeZone || ''),
  })).filter(item => item.id);
  return { ok: true, calendars };
}

function driveError(status) {
  if (status === 401) return 'jeton Drive refusé (401) — le refresh token est invalide ou révoqué';
  if (status === 403) return 'Drive API a refusé (403) — scope drive.file manquant ou API Drive désactivée';
  if (status === 404) return 'Drive API introuvable (404) — activez Google Drive API dans le projet OAuth';
  if (status === 429) return 'Drive API limite les requêtes (429) — réessayez plus tard';
  if (status >= 500) return `Drive API indisponible (HTTP ${status})`;
  return `Drive API a répondu HTTP ${status}`;
}

/** Lit le quota de stockage Drive réel (about.get), sans données de compte. */
export async function readGoogleDriveQuota({
  accessToken,
  fetchImpl = globalThis.fetch,
  driveBaseUrl = DEFAULT_GOOGLE_ENDPOINTS.drive,
  thresholds = DEFAULT_QUOTA_THRESHOLDS,
  timeoutMs = 15_000,
} = {}) {
  if (!accessToken) return { ok: false, message: 'aucun jeton d’accès Drive disponible' };
  let response;
  try {
    const url = new URL(`${String(driveBaseUrl).replace(/\/+$/, '')}/about`);
    url.searchParams.set('fields', 'storageQuota(limit,usage,usageInDrive,usageInDriveTrash)');
    response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, code: 'NETWORK', message: 'Drive API ne répond pas (réseau ou délai dépassé)' };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, code: `HTTP_${response.status}`, message: driveError(response.status) };
  }
  const data = await response.json().catch(() => null);
  const number = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const quota = data?.storageQuota || {};
  const limit = number(quota.limit);
  const usage = number(quota.usage);
  const percent = limit && usage !== null ? Math.round((usage / limit) * 1000) / 10 : null;
  return {
    ok: true,
    quota: {
      limit,
      usage,
      usageInDrive: number(quota.usageInDrive),
      usageInDriveTrash: number(quota.usageInDriveTrash),
      percent,
      level: quotaLevel(limit, usage, thresholds),
      thresholds,
    },
  };
}

function refreshDetail(refresh) {
  if (refresh.expiresIn) return `jeton rafraîchi, valide environ ${refresh.expiresIn} s`;
  return 'jeton rafraîchi';
}

function scopeDetail(scope, missingFunctional, missingIdentity) {
  const functional = missingFunctional.length
    ? `fonctionnels manquants : ${missingFunctional.join(', ')}`
    : 'fonctionnels présents';
  const identity = missingIdentity.length
    ? `identité manquante : ${missingIdentity.join(', ')}`
    : 'identité présente';
  return `${functional} ; ${identity} (${normalizeScopes(scope).length} scope(s) accordé(s))`;
}

/**
 * Exécute le contrôle réel complet : refresh, scopes, calendriers, quota Drive.
 * `requireDrive` force l'échec si le quota Drive ne peut pas être testé.
 */
export async function runGoogleLivePreflight(env, {
  fetchImpl = globalThis.fetch,
  endpoints = DEFAULT_GOOGLE_ENDPOINTS,
  timeoutMs = 15_000,
  requireDrive = false,
  environment = 'local',
} = {}) {
  const resolvedEndpoints = { ...DEFAULT_GOOGLE_ENDPOINTS, ...(endpoints || {}) };
  const configuration = diagnoseGoogleConfiguration(env, { environment });
  if (configuration.state !== 'configured') {
    return {
      ok: false,
      configuration,
      checks: [{
        id: 'configuration',
        label: 'Google — configuration',
        state: configuration.state === 'disabled' ? 'NON CONFIGURÉ' : 'ÉCHEC',
        detail: formatGoogleConfiguration(configuration),
      }],
    };
  }

  const clientId = envValue(env, 'GOOGLE_CLIENT_ID');
  const clientSecret = envValue(env, 'GOOGLE_CLIENT_SECRET');
  const refreshToken = envValue(env, 'GOOGLE_PREFLIGHT_REFRESH_TOKEN');
  if (!refreshToken) {
    return {
      ok: false,
      configuration,
      checks: [{
        id: 'refresh',
        label: 'Google — rafraîchissement du jeton',
        state: 'NON TESTÉ',
        detail: 'GOOGLE_PREFLIGHT_REFRESH_TOKEN absent — contrôle réel non exécuté',
      }],
    };
  }

  const checks = [];
  const refresh = await refreshGoogleAccessToken({
    clientId,
    clientSecret,
    refreshToken,
    fetchImpl,
    tokenUrl: resolvedEndpoints.token,
    timeoutMs,
  });
  if (!refresh.ok) {
    return {
      ok: false,
      configuration,
      checks: [{
        id: 'refresh',
        label: 'Google — rafraîchissement du jeton',
        state: 'ÉCHEC',
        detail: refresh.message,
      }],
    };
  }
  checks.push({
    id: 'refresh',
    label: 'Google — rafraîchissement du jeton',
    state: 'OK',
    detail: refreshDetail(refresh),
  });

  let scope = refresh.scope;
  let scopeSource = 'refresh';
  if (!scope) {
    scope = await tokenInfoScope(refresh.accessToken, {
      fetchImpl,
      tokenInfoUrl: resolvedEndpoints.tokenInfo,
      timeoutMs,
    });
    scopeSource = scope ? 'tokeninfo' : 'indisponible';
  }
  if (!scope) {
    checks.push({
      id: 'scopes',
      label: 'Google — scopes',
      state: 'ÉCHEC',
      detail: 'scopes non communiqués par Google (ni dans le refresh, ni dans tokeninfo) — impossible de vérifier les autorisations',
    });
    return { ok: false, configuration, checks };
  }

  const missingCalendar = missingScopes(scope, GOOGLE_CALENDAR_SCOPES);
  const missingIdentity = missingScopes(scope, GOOGLE_IDENTITY_SCOPES);
  checks.push({
    id: 'scopes',
    label: 'Google — scopes',
    state: missingCalendar.length ? 'ÉCHEC' : 'OK',
    detail: `${scopeDetail(scope, missingCalendar, missingIdentity)}${scopeSource === 'tokeninfo' ? ' ; lus via tokeninfo' : ''}`,
  });

  let calendars = null;
  if (missingCalendar.length) {
    checks.push({
      id: 'calendars',
      label: 'Google — calendriers',
      state: 'NON TESTÉ',
      detail: 'scope gmail.send/calendar manquant — liste non interrogée',
    });
  } else {
    const listed = await listGoogleCalendars({
      accessToken: refresh.accessToken,
      fetchImpl,
      calendarBaseUrl: resolvedEndpoints.calendar,
      timeoutMs,
    });
    if (!listed.ok) {
      checks.push({
        id: 'calendars',
        label: 'Google — calendriers',
        state: 'ÉCHEC',
        detail: listed.message,
      });
    } else {
      calendars = listed.calendars;
      checks.push({
        id: 'calendars',
        label: 'Google — calendriers',
        state: calendars.length ? 'OK' : 'ATTENTION',
        detail: `${calendars.length} calendrier(s) accessible(s)`,
      });
      const configured = envValue(env, 'GOOGLE_CALENDAR_ID') || 'primary';
      const found = configured === 'primary'
        ? calendars.some(calendar => calendar.primary)
        : calendars.some(calendar => calendar.id === configured);
      checks.push({
        id: 'calendar-target',
        label: 'Google — calendrier cible',
        state: found ? 'OK' : 'ÉCHEC',
        detail: configured === 'primary'
          ? (found ? 'calendrier principal présent' : 'aucun calendrier marqué principal dans la liste')
          : (found ? 'GOOGLE_CALENDAR_ID présent dans la liste' : 'GOOGLE_CALENDAR_ID absent de la liste des calendriers accessibles'),
      });
    }
  }

  const separateDriveToken = envValue(env, 'GOOGLE_PREFLIGHT_DRIVE_REFRESH_TOKEN');
  let driveAccessToken = refresh.accessToken;
  let driveScope = scope;
  if (separateDriveToken) {
    const driveRefresh = await refreshGoogleAccessToken({
      clientId,
      clientSecret,
      refreshToken: separateDriveToken,
      fetchImpl,
      tokenUrl: resolvedEndpoints.token,
      timeoutMs,
    });
    if (!driveRefresh.ok) {
      checks.push({
        id: 'drive',
        label: 'Google — quota Drive',
        state: 'ÉCHEC',
        detail: `jeton Drive distinct : ${driveRefresh.message}`,
      });
      return { ok: checks.every(check => check.state !== 'ÉCHEC'), configuration, checks, calendars };
    }
    driveAccessToken = driveRefresh.accessToken;
    driveScope = driveRefresh.scope || await tokenInfoScope(driveAccessToken, {
      fetchImpl,
      tokenInfoUrl: resolvedEndpoints.tokenInfo,
      timeoutMs,
    });
  }

  const missingDrive = driveScope ? missingScopes(driveScope, GOOGLE_DRIVE_SCOPES) : GOOGLE_DRIVE_SCOPES;
  if (missingDrive.length) {
    checks.push({
      id: 'drive',
      label: 'Google — quota Drive',
      state: requireDrive ? 'ÉCHEC' : 'NON TESTÉ',
      detail: !driveScope
        ? 'scopes du jeton Drive non communiqués par Google — quota non vérifiable'
        : separateDriveToken
          ? 'le jeton Drive ne porte pas le scope drive.file'
          : 'le jeton principal ne porte pas drive.file — fournissez GOOGLE_PREFLIGHT_DRIVE_REFRESH_TOKEN pour tester le quota',
    });
  } else {
    const quotaRead = await readGoogleDriveQuota({
      accessToken: driveAccessToken,
      fetchImpl,
      driveBaseUrl: resolvedEndpoints.drive,
      thresholds: parseQuotaThresholds(envValue(env, 'AURION_CLOUD_QUOTA_THRESHOLDS')),
      timeoutMs,
    });
    if (!quotaRead.ok) {
      checks.push({
        id: 'drive',
        label: 'Google — quota Drive',
        state: 'ÉCHEC',
        detail: quotaRead.message,
      });
    } else {
      const quota = quotaRead.quota;
      const percentage = quota.percent === null ? 'illimité ou inconnu' : `${String(quota.percent).replace('.', ',')} %`;
      const detail = `${percentage} (${formatBytes(quota.usage)} utilisés / ${formatBytes(quota.limit)}) — niveau ${quota.level}`;
      checks.push({
        id: 'drive',
        label: 'Google — quota Drive',
        state: quota.level === 'full' ? 'ÉCHEC' : quota.level === 'unknown' ? 'ATTENTION' : quota.level === 'ok' ? 'OK' : 'ATTENTION',
        detail,
      });
    }
  }

  return {
    ok: checks.every(check => check.state !== 'ÉCHEC'),
    configuration,
    checks,
    calendars,
  };
}
