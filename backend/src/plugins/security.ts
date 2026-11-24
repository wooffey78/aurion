import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import { config } from "../config.js";

export default fp(async app=>{
  const prod=config.NODE_ENV==="production";
  await app.register(helmet,{
    // CSP stricte : uniquement des scripts / styles servis par Aurion ; blob: autorisé pour l'aperçu PDF.
    // 15.4.61 — frame-ancestors passe de 'none' à 'self' : l'aperçu « taille réelle » des modèles
    // (<embed>/<iframe> du PDF dans la fenêtre modale, même origine) était bloqué par 'none'
    // (« aurion-…onrender.com n'autorise pas la connexion »). 'self' autorise uniquement
    // l'intégration par Aurion lui-même et continue de bloquer tout iframe tiers.
    contentSecurityPolicy:{useDefaults:false,directives:{
      defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'","data:","blob:"],
      fontSrc:["'self'","data:"],connectSrc:["'self'"],objectSrc:["'self'","blob:"],frameSrc:["'self'","blob:"],
      frameAncestors:["'self'"],baseUri:["'self'"],formAction:["'self'"],
      ...(prod?{upgradeInsecureRequests:[]}:{})
    }},
    referrerPolicy:{policy:"no-referrer"},
    crossOriginEmbedderPolicy:false
  });
  // 15.4.55 — HSTS explicite en production (max-age 1 an, sous-domaines inclus) : helmet ne
  // l'émettait implicitement qu'avec ses réglages par défaut, non utilisés ici (useDefaults:false
  // sur la CSP). Le garde est désormais garanti et auditable ; hors production (tests HTTP en
  // clair) il reste désactivé volontairement.
  app.addHook("onSend",async(_req,reply)=>{
    reply.header("Permissions-Policy","camera=(), microphone=(), geolocation=(), payment=()");
    if(prod)reply.header("Strict-Transport-Security","max-age=31536000; includeSubDomains");
  });
  await app.register(cors,{origin:config.CORS_ORIGIN.split(",").map(v=>v.trim()).filter(Boolean),credentials:true});
  await app.register(rateLimit,{global:true,max:config.RATE_LIMIT_MAX,timeWindow:"1 minute"});
  await app.register(sensible);
});