import crypto from 'node:crypto';
import { query } from '../db.js';

// 15.4.70 — jeton d'accès long (12 h) : une journée de travail ne doit plus être interrompue
// par une déconnexion après quelques minutes d'inactivité. Le refresh token (30 jours) reste
// la seule source de reconnexion ; la révocation (mot de passe, déconnexion globale) s'applique
// toujours immédiatement via session_version.
export const ACCESS_SECONDS = 60 * 60 * 12;
export const REFRESH_SECONDS = 60 * 60 * 24 * 30;

export type SessionIdentity={userId:string;organizationId:string;role:string;sessionVersion:number};

const hashToken=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');

export async function createRefreshSession(identity:SessionIdentity, request:any){
  const raw=crypto.randomBytes(48).toString('base64url');
  const id=crypto.randomUUID();
  const expires=new Date(Date.now()+REFRESH_SECONDS*1000);
  await query(`insert into native_sessions(id,user_id,organization_id,session_version,refresh_token_hash,expires_at,ip_address,user_agent)
    values($1,$2,$3,$4,$5,$6,$7,$8)`,[id,identity.userId,identity.organizationId,identity.sessionVersion,hashToken(raw),expires,request.ip||null,String(request.headers?.['user-agent']||'').slice(0,500)||null]);
  return {id,token:raw,expiresAt:expires};
}

export async function rotateRefreshSession(raw:string, request:any){
  const h=hashToken(raw);
  // 15.4.67 — les sessions dont la fenêtre de grâce est expirée sont closes (routine interne
  // de la rotation : aucun lien avec la révocation explicite d'une déconnexion).
  await query(`update native_sessions set revoked_at=now() where revoked_at is null and grace_until is not null and grace_until<now()`);
  const r=await query<any>(`select s.*,u.email,u.session_version,om.role
    from native_sessions s join users u on u.id=s.user_id
    join organization_members om on om.user_id=u.id and om.organization_id=s.organization_id
    where s.refresh_token_hash=$1 and s.revoked_at is null and s.expires_at>now() and s.session_version=u.session_version limit 1`,[h]);
  const old=r.rows[0]; if(!old) return null;
  // 15.4.67 — fenêtre de grâce : le jeton fraîchement roté reste utilisable 60 s au lieu d'être
  // révoqué immédiatement. Deux onglets (ou deux requêtes) qui rafraîchissent en parallèle
  // avec le MÊME cookie ne se révoquent plus en chaîne — c'était la cause des déconnexions
  // aléatoires « votre session a expiré ». Passé la fenêtre, le jeton ancien est invalide.
  await query(`update native_sessions set last_used_at=now(),grace_until=now()+interval '300 seconds' where id=$1`,[old.id]);
  const identity={userId:old.user_id,organizationId:old.organizationId,role:old.role,sessionVersion:Number(old.session_version||0)};
  return {identity,...await createRefreshSession(identity,request)};
}

export async function revokeRefreshSession(raw:string){
  if(!raw)return;
  await query('update native_sessions set revoked_at=now(),last_used_at=now() where refresh_token_hash=$1 and revoked_at is null',[hashToken(raw)]);
}

export async function revokeAllRefreshSessions(userId:string){
  await query('update native_sessions set revoked_at=now(),last_used_at=now() where user_id=$1 and revoked_at is null',[userId]);
}
