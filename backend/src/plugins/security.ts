import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import { config } from "../config.js";

export default fp(async app=>{
  const prod=config.NODE_ENV==="production";
  await app.register(helmet,{
    // CSP stricte : uniquement des scripts / styles servis par Aurion ; blob: autorisé pour l'aperçu PDF ; jamais intégrable dans un iframe tiers.
    contentSecurityPolicy:{useDefaults:false,directives:{
      defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:","blob:"],
      fontSrc:["'self'","data:"],connectSrc:["'self'"],objectSrc:["'self'","blob:"],frameSrc:["'self'","blob:"],
      frameAncestors:["'none'"],baseUri:["'self'"],formAction:["'self'"],
      ...(prod?{upgradeInsecureRequests:[]}:{})
    }},
    referrerPolicy:{policy:"no-referrer"},
    crossOriginEmbedderPolicy:false
  });
  app.addHook("onSend",async(_req,reply)=>{reply.header("Permissions-Policy","camera=(), microphone=(), geolocation=(), payment=()");});
  await app.register(cors,{origin:config.CORS_ORIGIN.split(",").map(v=>v.trim()).filter(Boolean),credentials:true});
  await app.register(rateLimit,{global:true,max:config.RATE_LIMIT_MAX,timeWindow:"1 minute"});
  await app.register(sensible);
});