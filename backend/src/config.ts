import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { z } from 'zod';
const schema=z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),
 // Render and other PaaS reverse-proxies must bind to all interfaces; local development stays loopback-only.
 HOST:z.string().default(process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'), PORT:z.coerce.number().int().min(1).max(65535).default(4000),
 DATABASE_URL:z.string().min(1), CORS_ORIGIN:z.string().default('http://127.0.0.1:4000,http://localhost:4000,http://127.0.0.1:5500,http://localhost:5500'),
 JWT_ISSUER:z.string().default('aurion'), JWT_AUDIENCE:z.string().default('aurion-web'), JWT_SECRET:z.string().min(32),
 COOKIE_SECURE:z.enum(['true','false']).default('false').transform(v=>v==='true'),
 GOOGLE_CLIENT_ID:z.string().default(''), GOOGLE_CLIENT_SECRET:z.string().default(''), GOOGLE_REDIRECT_URI:z.string().default(''),
 GOOGLE_TOKEN_ENCRYPTION_KEY:z.string().default(''), GOOGLE_CALENDAR_ID:z.string().default('primary'),
 MAIL_FROM_NAME:z.string().default('Aurion'), AURION_ENCRYPTION_KEY:z.string().default(''), AURION_ENCRYPTION_KEY_VERSION:z.string().trim().min(1).default('k1'), AURION_ENCRYPTION_KEY_PREVIOUS:z.string().default(''), AURION_ENCRYPTION_KEY_PREVIOUS_VERSION:z.string().default(''), AURION_ENCRYPTION_LEGACY_JWT_KEY:z.enum(['true','false']).default('false').transform(v=>v==='true'), APP_BASE_URL:z.string().default(''), PLATFORM_SMTP_HOST:z.string().default(''), PLATFORM_SMTP_PORT:z.coerce.number().int().default(465), PLATFORM_SMTP_SECURITY:z.enum(['ssl','starttls','none']).default('ssl'), PLATFORM_SMTP_USER:z.string().default(''), PLATFORM_SMTP_PASS:z.string().default(''), PLATFORM_SMTP_FROM:z.string().default(''), RATE_LIMIT_MAX:z.coerce.number().int().min(60).default(1500), BILLING_VAT_RATE_BPS:z.coerce.number().int().min(0).max(100000).default(2000), STRIPE_SECRET_KEY:z.string().default(''), STRIPE_WEBHOOK_SECRET:z.string().default(''), BANK_TRANSFER_IBAN:z.string().default(''), BANK_TRANSFER_BIC:z.string().default(''), BANK_TRANSFER_HOLDER:z.string().default('Aurion'),
 REMINDER_WORKER_INTERVAL_MS:z.coerce.number().int().min(10000).default(60000), AURION_SUPPORT_EMAIL:z.string().email().default('support@example.invalid')
});
const parsed=schema.parse(process.env);
if(parsed.NODE_ENV==='production'){
 if(!parsed.COOKIE_SECURE)throw new Error('COOKIE_SECURE=true est obligatoire en production.');
 if(!process.env.AURION_ENCRYPTION_KEY?.trim() || parsed.AURION_ENCRYPTION_KEY.trim().length<32)throw new Error('AURION_ENCRYPTION_KEY doit être défini avec au moins 32 caractères en production.');
 if(!process.env.AURION_ENCRYPTION_KEY_VERSION?.trim())throw new Error('AURION_ENCRYPTION_KEY_VERSION doit être défini en production.');
 if(!process.env.APP_BASE_URL?.trim())throw new Error('APP_BASE_URL doit être défini en production.');
 if(!process.env.CORS_ORIGIN?.trim())throw new Error('CORS_ORIGIN doit être défini en production.');
 let baseUrl: URL;
 try { baseUrl = new URL(parsed.APP_BASE_URL); }
 catch { throw new Error('APP_BASE_URL doit être une URL HTTPS publique valide en production.'); }
 if(baseUrl.protocol!=='https:' || baseUrl.username || baseUrl.password || baseUrl.pathname!=='/' || baseUrl.search || baseUrl.hash)throw new Error('APP_BASE_URL doit être une origine HTTPS publique (sans chemin, paramètres ni fragment) en production.');
 const origins=parsed.CORS_ORIGIN.split(',').map(value=>value.trim()).filter(Boolean);
 if(!origins.length || origins.some(value=>{try{const url=new URL(value);return url.protocol!=='https:'||Boolean(url.username)||Boolean(url.password)||url.pathname!=='/'||Boolean(url.search)||Boolean(url.hash)||['localhost','127.0.0.1','::1'].includes(url.hostname)}catch{return true}}))throw new Error('CORS_ORIGIN doit contenir uniquement des origines HTTPS publiques, sans chemin ni paramètres, en production.');
 if(parsed.GOOGLE_CLIENT_ID){
  let redirect: URL;
  try { redirect = new URL(parsed.GOOGLE_REDIRECT_URI); } catch { throw new Error('GOOGLE_REDIRECT_URI HTTPS doit être défini lorsque Google est activé.'); }
  if(redirect.protocol!=='https:' || redirect.username || redirect.password || redirect.origin!==baseUrl.origin || redirect.pathname!=='/integrations/google/callback' || redirect.search || redirect.hash)throw new Error('GOOGLE_REDIRECT_URI doit correspondre à APP_BASE_URL/integrations/google/callback en production.');
  if(!process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() || parsed.GOOGLE_TOKEN_ENCRYPTION_KEY.trim().length<32)throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY doit être défini avec au moins 32 caractères lorsque Google est activé en production.');
 }
 if(!process.env.AURION_SUPPORT_EMAIL?.trim())throw new Error('AURION_SUPPORT_EMAIL doit être défini en production.');
 if(parsed.AURION_ENCRYPTION_LEGACY_JWT_KEY)console.warn('[AURION] Déchiffrement transitoire des secrets v1 avec la clé JWT explicitement activé ; ré-encryptez les secrets avant de désactiver ce mode.')
}
if(parsed.GOOGLE_CLIENT_ID && !parsed.GOOGLE_CLIENT_SECRET)throw new Error('GOOGLE_CLIENT_SECRET manquant.');
export const config=parsed;
