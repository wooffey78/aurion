const REQUIRED = [
  'DATABASE_URL',
  'JWT_SECRET',
  'AURION_ENCRYPTION_KEY',
  'AURION_ENCRYPTION_KEY_VERSION',
  'APP_BASE_URL',
  'CORS_ORIGIN',
  'AURION_SUPPORT_EMAIL',
];

function isHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && url.pathname === '/'
      && !url.search
      && !url.hash
      && !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function missingProductionBackendConfig(env = process.env) {
  const missing = [];
  const need = key => { if (!String(env[key] || '').trim()) missing.push(key); };

  if (env.NODE_ENV !== 'production') missing.push('NODE_ENV=production');
  if (env.COOKIE_SECURE !== 'true') missing.push('COOKIE_SECURE=true');
  for (const key of REQUIRED) need(key);

  if (env.RENDER_SERVICE_ID) {
    need('AURION_MIGRATION_DATABASE_URL');
    need('AURION_RUNTIME_DB_ROLE');
    if (String(env.AURION_STORAGE_BACKEND || '').trim().toLowerCase() !== 's3') missing.push('AURION_STORAGE_BACKEND=s3');
    for (const key of ['AURION_S3_BUCKET', 'AURION_S3_ACCESS_KEY', 'AURION_S3_SECRET_KEY']) need(key);
  }

  if (String(env.AURION_ENCRYPTION_KEY || '').trim().length < 32) missing.push('AURION_ENCRYPTION_KEY (32 caractères minimum)');
  if (Boolean(env.STRIPE_SECRET_KEY) !== Boolean(env.STRIPE_WEBHOOK_SECRET)) missing.push('STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET (à définir ensemble)');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(env.AURION_SUPPORT_EMAIL || ''))) missing.push('AURION_SUPPORT_EMAIL (adresse valide)');
  if (!isHttpsOrigin(env.APP_BASE_URL)) missing.push('APP_BASE_URL (origine HTTPS publique)');

  const origins = String(env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!origins.length || origins.some(origin => !isHttpsOrigin(origin))) missing.push('CORS_ORIGIN (origines HTTPS publiques)');

  if (env.GOOGLE_CLIENT_ID) {
    if (!env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
    if (String(env.GOOGLE_TOKEN_ENCRYPTION_KEY || '').trim().length < 32) missing.push('GOOGLE_TOKEN_ENCRYPTION_KEY (32 caractères minimum)');
    try {
      const expected = new URL('/integrations/google/callback', env.APP_BASE_URL).href;
      if (new URL(env.GOOGLE_REDIRECT_URI).href !== expected) missing.push('GOOGLE_REDIRECT_URI (doit correspondre à APP_BASE_URL)');
    } catch {
      missing.push('GOOGLE_REDIRECT_URI (URL HTTPS valide)');
    }
  }
  return [...new Set(missing)];
}

export function hasProductionBackendConfig(env = process.env) {
  return missingProductionBackendConfig(env).length === 0;
}
