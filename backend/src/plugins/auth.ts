import fp from "fastify-plugin";
import { jwtVerify, SignJWT } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { sessionVersionOf } from "../services/account.js";
import { query, setRequestTenant , adminQuery } from "../db.js";
import { ACCESS_SECONDS } from '../services/native-sessions.js';

const secret = new TextEncoder().encode(config.JWT_SECRET);
const SESSION_SECONDS = ACCESS_SECONDS;
const REFRESH_AFTER_SECONDS = 0;

declare module "fastify" {
  interface FastifyRequest {
    auth?: { userId:string; organizationId:string; role:string; sv?:number };
    authIssuedAt?: number;
  }
}

export async function signAccessToken(payload:{userId:string;organizationId:string;role:string;sv?:number}){
  return new SignJWT(payload).setProtectedHeader({alg:"HS256"}).setIssuer(config.JWT_ISSUER)
    .setAudience(config.JWT_AUDIENCE).setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(secret);
}

async function verify(request:FastifyRequest){
  const token=request.cookies?.aurion_session || (String(request.headers.authorization||'').startsWith('Bearer ')?String(request.headers.authorization).slice(7):'');
  if(!token) return false;
  try{
    const {payload}=await jwtVerify(token,secret,{issuer:config.JWT_ISSUER,audience:config.JWT_AUDIENCE});
    if(typeof payload.userId!=="string"||typeof payload.organizationId!=="string"||typeof payload.role!=="string") return false;
    const sv=typeof payload.sv==="number"?payload.sv:0;
    if(sv!==await sessionVersionOf(payload.userId))return false;   // session révoquée (changement / réinitialisation du mot de passe)
    request.auth={userId:payload.userId,organizationId:payload.organizationId,role:payload.role,sv};
    // Isolation multi-tenant (RLS 074) : l'organisation authentifiée devient le contexte tenant
    // de toutes les requêtes SQL de cette requête HTTP (SET LOCAL transactionnel, échec fermé sinon).
    setRequestTenant(payload.organizationId);
    request.authIssuedAt=typeof payload.iat==="number"?payload.iat:undefined;
    return true;
  }catch{return false;}
}

export default fp(async app=>{
  app.decorateRequest("auth", undefined as any);
  app.decorateRequest("authIssuedAt", undefined as any);
  app.decorate("requireAuth", async (request:FastifyRequest, reply:FastifyReply)=>{
    if(!(await verify(request))) return reply.code(401).send({error:"UNAUTHENTICATED"});
    // Bloc 14 — rôle « expert-comptable » : LECTURE SEULE stricte (écriture refusée 403),
    // chaque consultation journalisée, révocation vérifiée EN BASE à chaque requête.
    const path=String(request.url||'').split('?')[0], method=request.method.toUpperCase();
    const acceptPath=path==='/auth/accountant-accept'||path.startsWith('/auth/logout');
    if(request.auth!.role==='accountant'){
      if(method!=='GET'&&method!=='HEAD'&&!acceptPath)return reply.code(403).send({error:'ROLE_READ_ONLY',message:'Le rôle expert-comptable est en lecture seule : il ne peut ni créer, ni modifier, ni supprimer de données.'});
      const member=await adminQuery("select 1 from organization_members where organization_id=$1 and user_id=$2 and role='accountant'",[request.auth!.organizationId,request.auth!.userId]).catch(()=>({rowCount:0}));
      if(!member.rowCount)return reply.code(403).send({error:'ACCESS_REVOKED',message:'L\'accès comptable a été révoqué.'});
      if(method==='GET'){
        try{await adminQuery('insert into accountant_access_log(organization_id,user_id,path) values($1,$2,$3)',[request.auth!.organizationId,request.auth!.userId,path])}catch{}
      }
    }
    const iat=request.authIssuedAt;
    if(REFRESH_AFTER_SECONDS && iat && Date.now()/1000-iat>REFRESH_AFTER_SECONDS){ const token=await signAccessToken(request.auth!); app.setSession(reply,token); }
    if(method!=='GET' && method!=='HEAD' && !path.startsWith('/auth/') && !path.startsWith('/admin/')){
      const vip=((await query(`select 1 from vip_guest_accounts v join organization_members om on om.user_id=v.user_id where om.organization_id=$1 limit 1`,[request.auth!.organizationId])).rowCount??0)>0;
      const admin=((await query(`select 1 from platform_admins pa join organization_members om on om.user_id=pa.user_id where om.organization_id=$1 limit 1`,[request.auth!.organizationId])).rowCount??0)>0;
      if(!vip&&!admin){
        const s=(await query('select status,trial_ends_at,current_period_end from subscriptions where organization_id=$1',[request.auth!.organizationId])).rows[0];
        // trial_ends_at peut être nul : abonnement sans essai commercial (migration 091).
        const trialEnded=!!s?.trial_ends_at&&new Date(s.trial_ends_at).getTime()<Date.now();
        const expired=s&&(s.status==='expired'||(s.status==='trialing'&&trialEnded)||(s.status==='active'&&s.current_period_end&&new Date(s.current_period_end).getTime()<Date.now()));
        const retentionEnded=!!(s?.data_read_only_until && new Date(s.data_read_only_until).getTime()<Date.now());
        const supportAllowed=path==='/support/tickets' && method==='POST';
        const billingAllowed=path.startsWith('/billing/') || path==='/auth/logout';
        if(expired && retentionEnded && !supportAllowed && !billingAllowed) return reply.code(403).send({error:'DATA_RETENTION_EXPIRED',message:'La période de conservation de 60 jours est terminée. Les données ne sont plus modifiables ni téléchargeables depuis Aurion.'});
        if(expired && !retentionEnded && method!=='GET' && method!=='HEAD' && !supportAllowed && !billingAllowed) return reply.code(403).send({error:'READ_ONLY_MODE',message:'Votre période d’accès est expirée. Vos données restent consultables et téléchargeables ; seules les nouvelles demandes de support et la souscription restent disponibles.'});
      }
    }
  });
  app.decorate("setSession",(reply:FastifyReply, token:string)=>{
    reply.setCookie("aurion_session",token,{
      httpOnly:true, secure:config.COOKIE_SECURE, sameSite:"strict", path:"/", maxAge:SESSION_SECONDS
    });
  });
  app.decorate("clearSession",(reply:FastifyReply)=>{ reply.clearCookie("aurion_session",{path:"/"}); });
  app.decorate('setRefreshSession',(reply:FastifyReply, token:string)=>{ reply.setCookie('aurion_refresh',token,{httpOnly:true,secure:config.COOKIE_SECURE,sameSite:'strict',path:'/auth',maxAge:60*60*24*30}); });
  app.decorate('clearRefreshSession',(reply:FastifyReply)=>{ reply.clearCookie('aurion_refresh',{path:'/auth'}); });
});

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (request:FastifyRequest, reply:FastifyReply)=>Promise<unknown>;
    setSession: (reply:FastifyReply, token:string)=>void;
    clearSession: (reply:FastifyReply)=>void;
    setRefreshSession: (reply:FastifyReply, token:string)=>void;
    clearRefreshSession: (reply:FastifyReply)=>void;
  }
}
