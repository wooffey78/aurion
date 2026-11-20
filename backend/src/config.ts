import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { z } from 'zod';
const schema=z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),
 // Render and other PaaS reverse-proxies must bind to all interfaces; local development stays loopback-only.
 HOST:z.string().default(process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'), PORT:z.coerce.number().int().min(1).max(65535).default(4000),
 DATABASE_URL:z.string().min(1),
 // Pool d'administration inter-entreprises (RLS 074) : rôle SQL membre de « aurion_admin ».
 // Facultatif : sans cette URL, la console d'administration et les travaux planifiés inter-entreprises
 // refusent explicitement (503) au lieu de renvoyer des données vides ; l'isolation reste active.
 AURION_ADMIN_DATABASE_URL:z.string().default(''),
 CORS_ORIGIN:z.string().default('http://127.0.0.1:4000,http://localhost:4000,http://127.0.0.1:5500,http://localhost:5500'),
 JWT_ISSUER:z.string().default('aurion'), JWT_AUDIENCE:z.string().default('aurion-web'), JWT_SECRET:z.string().min(32),
 COOKIE_SECURE:z.enum(['true','false']).default('false').transform(v=>v==='true'),
 GOOGLE_CLIENT_ID:z.string().default(''), GOOGLE_CLIENT_SECRET:z.string().default(''), GOOGLE_REDIRECT_URI:z.string().default(''),
 GOOGLE_TOKEN_ENCRYPTION_KEY:z.string().default(''), GOOGLE_CALENDAR_ID:z.string().default('primary'),
 // Auth0 — connexion SSO OIDC serveur (le compte Aurion existant est résolu par e-mail vérifié).
 AUTH0_DOMAIN:z.string().trim().default(''), AUTH0_CLIENT_ID:z.string().trim().default(''), AUTH0_CLIENT_SECRET:z.string().default(''), AUTH0_REDIRECT_URI:z.string().trim().default(''),
 // Stockage documentaire cloud (15.4.0) : retour OAuth distinct de la messagerie et seuils d'alerte de quota centralisés.
 GOOGLE_DRIVE_REDIRECT_URI:z.string().default(''), AURION_CLOUD_QUOTA_THRESHOLDS:z.string().regex(/^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$/).default('80,90,95,100'),
 MAIL_FROM_NAME:z.string().default('Aurion'), AURION_ENCRYPTION_KEY:z.string().default(''), AURION_ENCRYPTION_KEY_VERSION:z.string().trim().min(1).default('k1'), AURION_ENCRYPTION_KEY_PREVIOUS:z.string().default(''), AURION_ENCRYPTION_KEY_PREVIOUS_VERSION:z.string().default(''), AURION_ENCRYPTION_LEGACY_JWT_KEY:z.enum(['true','false']).default('false').transform(v=>v==='true'), APP_BASE_URL:z.string().default(''), PLATFORM_SMTP_HOST:z.string().default(''), PLATFORM_SMTP_PORT:z.coerce.number().int().default(465), PLATFORM_SMTP_SECURITY:z.enum(['ssl','starttls','none']).default('ssl'), PLATFORM_SMTP_USER:z.string().default(''), PLATFORM_SMTP_PASS:z.string().default(''), PLATFORM_SMTP_FROM:z.string().default(''), RATE_LIMIT_MAX:z.coerce.number().int().min(60).default(1500), LOG_LEVEL:z.enum(['fatal','error','warn','info','debug','trace']).default('info'), BILLING_VAT_RATE_BPS:z.coerce.number().int().min(0).max(100000).default(0), STRIPE_SECRET_KEY:z.string().default(''), STRIPE_WEBHOOK_SECRET:z.string().default(''), BANK_TRANSFER_IBAN:z.string().default(''), BANK_TRANSFER_BIC:z.string().default(''), BANK_TRANSFER_HOLDER:z.string().default('Aurion'),
 REMINDER_WORKER_INTERVAL_MS:z.coerce.number().int().min(10000).default(60000), AURION_SUPPORT_EMAIL:z.string().email().default('support@example.invalid'),
 // Bloc 3 — réception des factures fournisseurs via la plateforme agréée (PA) choisie par
 // l'entrepreneur. AURION_PA_PROVIDER identifie l'adaptateur (voir services/pa/) ; sans
 // configuration, la réception refuse explicitement (503) et aucune donnée n'est acceptée.
 AURION_PA_PROVIDER:z.string().trim().toLowerCase().max(60).default(''),
 AURION_PA_WEBHOOK_SECRET:z.string().default(''),
 // Bloc 13 — paiement client (décision D3 non tranchée) : sans AURION_PAY_PROVIDER, la fonction
 // est désactivée explicitement (503). Le secret du webhook (≥ 32 caractères) et l'URL de
 // l'API du prestataire ne sont jamais journalisés ; aucune clé dans le code.
 AURION_PAY_PROVIDER:z.string().trim().toLowerCase().max(60).default(''),
 AURION_PAY_API_BASE:z.string().url().default(''),
 AURION_PAY_API_KEY:z.string().default(''),
 AURION_PAY_WEBHOOK_SECRET:z.string().default(''),
 AURION_PA_MAX_FILE_BYTES:z.coerce.number().int().min(1024).max(20*1024*1024).default(10*1024*1024),
 // Bloc 4 — émission : délai d'attente d'un accusé PA (une tentative sans accusé dans ce délai
 // reste « issue non confirmée » ; la reprise réutilise le même identifiant d'idempotence).
 AURION_PA_OUT_TIMEOUT_MS:z.coerce.number().int().min(1000).max(120000).default(15000),
 AURION_STORAGE_BACKEND:z.enum(['local','s3']).default('local'), AURION_S3_ENDPOINT:z.string().default('https://s3.de.io.cloud.ovh.net'), AURION_S3_REGION:z.string().default('de'), AURION_S3_BUCKET:z.string().default(''), AURION_S3_ACCESS_KEY:z.string().default(''), AURION_S3_SECRET_KEY:z.string().default('')
});
const parsed=schema.parse(process.env);
if(parsed.NODE_ENV==='production'){
 if(Boolean(parsed.STRIPE_SECRET_KEY)!==Boolean(parsed.STRIPE_WEBHOOK_SECRET))throw new Error('STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET doivent être définis ensemble en production.');
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
  if(parsed.GOOGLE_DRIVE_REDIRECT_URI.trim()){
   let drive: URL;
   try { drive = new URL(parsed.GOOGLE_DRIVE_REDIRECT_URI); } catch { throw new Error('GOOGLE_DRIVE_REDIRECT_URI doit être une URL HTTPS valide.'); }
   if(drive.protocol!=='https:' || drive.origin!==baseUrl.origin || drive.pathname!=='/cloud/google/callback' || drive.search || drive.hash || drive.username || drive.password)throw new Error('GOOGLE_DRIVE_REDIRECT_URI doit correspondre exactement à APP_BASE_URL + /cloud/google/callback en production.');
  }
  if(!process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() || parsed.GOOGLE_TOKEN_ENCRYPTION_KEY.trim().length<32)throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY doit être défini avec au moins 32 caractères lorsque Google est activé en production.');
 }
 if(!process.env.AURION_SUPPORT_EMAIL?.trim())throw new Error('AURION_SUPPORT_EMAIL doit être défini en production.');
 if(parsed.AURION_PA_PROVIDER){
  if(parsed.AURION_PA_WEBHOOK_SECRET.trim().length<32)throw new Error('AURION_PA_WEBHOOK_SECRET doit être défini avec au moins 32 caractères lorsque AURION_PA_PROVIDER est configuré en production.');
  if(parsed.AURION_PA_MAX_FILE_BYTES<1024)throw new Error('AURION_PA_MAX_FILE_BYTES invalide.');
 }
 if(parsed.AURION_STORAGE_BACKEND!=='s3')throw new Error('AURION_STORAGE_BACKEND=s3 est obligatoire en production pour éviter la perte des fichiers au redémarrage.');
 if(!parsed.AURION_S3_BUCKET.trim()||!parsed.AURION_S3_ACCESS_KEY.trim()||!parsed.AURION_S3_SECRET_KEY)throw new Error('La configuration du stockage privé OVH S3 est incomplète en production.');
 if(parsed.AURION_ENCRYPTION_LEGACY_JWT_KEY)console.warn('[AURION] Déchiffrement transitoire des secrets v1 avec la clé JWT explicitement activé ; ré-encryptez les secrets avant de désactiver ce mode.')
}
if(parsed.GOOGLE_CLIENT_ID && !parsed.GOOGLE_CLIENT_SECRET)throw new Error('GOOGLE_CLIENT_SECRET manquant.');
// Auth0 est facultatif. Une configuration partielle est refusée plutôt que d'afficher
// un bouton SSO qui ne peut pas aboutir.
const auth0Parts=[parsed.AUTH0_DOMAIN,parsed.AUTH0_CLIENT_ID,parsed.AUTH0_CLIENT_SECRET];
const auth0Any=auth0Parts.some(Boolean), auth0All=auth0Parts.every(Boolean);
if(auth0Any&&!auth0All)throw new Error('AUTH0_DOMAIN, AUTH0_CLIENT_ID et AUTH0_CLIENT_SECRET doivent être définis ensemble.');
if(auth0All){
 if(parsed.AUTH0_DOMAIN.includes('://')||parsed.AUTH0_DOMAIN.includes('/')||parsed.AUTH0_DOMAIN.includes('?')||parsed.AUTH0_DOMAIN.includes('#'))throw new Error('AUTH0_DOMAIN doit contenir uniquement le nom d’hôte Auth0, sans protocole ni chemin.');
 let auth0Domain:URL;
 try{auth0Domain=new URL(`https://${parsed.AUTH0_DOMAIN}`)}catch{throw new Error('AUTH0_DOMAIN invalide.');}
 if(auth0Domain.hostname!==parsed.AUTH0_DOMAIN||auth0Domain.protocol!=='https:'||auth0Domain.port||auth0Domain.pathname!=='/')throw new Error('AUTH0_DOMAIN doit être un nom d’hôte HTTPS Auth0 valide.');
 const redirectValue=parsed.AUTH0_REDIRECT_URI|| (parsed.APP_BASE_URL?new URL('/auth/auth0/callback',parsed.APP_BASE_URL).toString():'');
 let auth0Redirect:URL;
 try{auth0Redirect=new URL(redirectValue)}catch{throw new Error('AUTH0_REDIRECT_URI doit être une URL absolue /auth/auth0/callback.');}
 const expectedOrigin=parsed.APP_BASE_URL?new URL(parsed.APP_BASE_URL).origin:null;
 if(auth0Redirect.pathname!=='/auth/auth0/callback'||auth0Redirect.search||auth0Redirect.hash||auth0Redirect.username||auth0Redirect.password||!expectedOrigin||auth0Redirect.origin!==expectedOrigin||(parsed.NODE_ENV==='production'&&auth0Redirect.protocol!=='https:'))throw new Error('AUTH0_REDIRECT_URI doit correspondre exactement à APP_BASE_URL/auth/auth0/callback.');
}

// Hors production : un provider déclaré sans secret serait une réception muette non signée ; refus explicite.
if(parsed.AURION_PA_PROVIDER && !parsed.AURION_PA_WEBHOOK_SECRET)throw new Error('AURION_PA_WEBHOOK_SECRET doit être défini lorsque AURION_PA_PROVIDER est configuré.');
// Bloc 13 — secret de webhook de paiement obligatoire dès que le prestataire est configuré
// (y compris hors production : les webhooks de test sont également signés).
if(parsed.AURION_PAY_PROVIDER && parsed.AURION_PAY_WEBHOOK_SECRET.trim().length<32)throw new Error('AURION_PAY_WEBHOOK_SECRET doit être défini avec au moins 32 caractères lorsque AURION_PAY_PROVIDER est configuré.');
if(parsed.AURION_PAY_PROVIDER && !parsed.AURION_PAY_WEBHOOK_SECRET)throw new Error('AURION_PAY_WEBHOOK_SECRET doit être défini lorsque AURION_PAY_PROVIDER est configuré.');
if(parsed.AURION_PAY_PROVIDER && !parsed.AURION_PAY_API_BASE)throw new Error('AURION_PAY_API_BASE doit être défini lorsque AURION_PAY_PROVIDER est configuré.');
export const config=parsed;
