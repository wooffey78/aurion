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

export function hasProductionBackendConfig(env = process.env) {
  if (env.NODE_ENV !== 'production' || env.COOKIE_SECURE !== 'true') return false;
  if (REQUIRED.some(key => !String(env[key] || '').trim())) return false;
  if (env.RENDER_SERVICE_ID) {
    if (!String(env.AURION_MIGRATION_DATABASE_URL || '').trim() || !String(env.AURION_RUNTIME_DB_ROLE || '').trim()) return false;
    if (String(env.AURION_STORAGE_BACKEND || '').trim().toLowerCase() !== 's3') return false;
    if (['AURION_S3_BUCKET', 'AURION_S3_ACCESS_KEY', 'AURION_S3_SECRET_KEY'].some(key => !String(env[key] || '').trim())) return false;
  }
  if (String(env.AURION_ENCRYPTION_KEY).trim().length < 32) return false;
  if (Boolean(env.STRIPE_SECRET_KEY) !== Boolean(env.STRIPE_WEBHOOK_SECRET)) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.AURION_SUPPORT_EMAIL)) return false;
  if (!isHttpsOrigin(env.APP_BASE_URL)) return false;
  const origins = String(env.CORS_ORIGIN).split(',').map(value => value.trim()).filter(Boolean);
  if (!origins.length || origins.some(origin => !isHttpsOrigin(origin))) return false;

  if (env.GOOGLE_CLIENT_ID) {
    if (!env.GOOGLE_CLIENT_SECRET) return false;
    if (String(env.GOOGLE_TOKEN_ENCRYPTION_KEY || '').trim().length < 32) return false;
    try {
      const expected = new URL('/integrations/google/callback', env.APP_BASE_URL).href;
      if (new URL(env.GOOGLE_REDIRECT_URI).href !== expected) return false;
    } catch {
      return false;
    }
  }
  return true;
}
