import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { CodeChallengeMethod } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { query, db, applyTenant } from "../db.js";
import { config } from "../config.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import { registerSchema, loginSchema } from "../services/validation.js";
import { signAccessToken } from "../plugins/auth.js";
import { createInitialSubscription, legalDocumentsReadyForContracts, localEvaluationSignupAllowed, recordAcceptances } from "../services/account.js";
import { createRefreshSession, rotateRefreshSession, revokeRefreshSession, revokeAllRefreshSessions, REFRESH_SECONDS, ACCESS_SECONDS } from '../services/native-sessions.js';
import { registrationOptions, verifyRegistration, authenticationOptions, verifyAuthentication, issueWebAuthnSession } from '../services/webauthn.js';

function configuredWebAuthnOrigin(request:any): string | null {
  const configured = [config.APP_BASE_URL, ...config.CORS_ORIGIN.split(',')].map((value:string) => value.trim()).filter(Boolean);
  const allowed = new Set<string>();
  for (const value of configured) { try { allowed.add(new URL(value).origin); } catch { /* configuration validation handles production values */ } }
  if (config.NODE_ENV !== 'production') {
    allowed.add('http://127.0.0.1:4000'); allowed.add('http://localhost:4000');
    allowed.add('http://127.0.0.1:5500'); allowed.add('http://localhost:5500');
  }
  const header = String(request.headers.origin || '').trim();
  // Les navigateurs n'envoient pas systématiquement Origin sur un GET same-origin.
  // En l'absence de cet en-tête, on n'accepte que l'hôte Host exact d'une origine
  // déjà autorisée par configuration — jamais une origine fabriquée depuis X-Forwarded-*.
  if (!header) {
    const requestHost = String(request.headers.host || '').trim().toLowerCase();
    for (const value of allowed) {
      try {
        const candidate = new URL(value);
        if (candidate.host.toLowerCase() === requestHost && (config.NODE_ENV !== 'production' || candidate.protocol === 'https:')) return candidate.origin;
      } catch { /* origine invalide ignorée */ }
    }
    return null;
  }
  try {
    const parsed = new URL(header);
    if (parsed.origin !== header || !allowed.has(parsed.origin)) return null;
    if (config.NODE_ENV === 'production' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch { return null; }
}

export async function authRoutes(app: FastifyInstance) {

const googleLoginConfigured=()=>Boolean(config.GOOGLE_CLIENT_ID&&config.GOOGLE_CLIENT_SECRET&&config.APP_BASE_URL);
const googleLoginRedirect=()=>new URL('/auth/google/callback',config.APP_BASE_URL).toString();
const auth0LoginConfigured=()=>Boolean(config.AUTH0_DOMAIN&&config.AUTH0_CLIENT_ID&&config.AUTH0_CLIENT_SECRET&&config.APP_BASE_URL);
const auth0Issuer=()=>`https://${config.AUTH0_DOMAIN}/`;
const auth0LoginRedirect=()=>config.AUTH0_REDIRECT_URI||new URL('/auth/auth0/callback',config.APP_BASE_URL).toString();
let auth0Jwks:any=null;
let auth0JwksDomain='';
function auth0KeySet(){
 if(!auth0Jwks||auth0JwksDomain!==config.AUTH0_DOMAIN){
  auth0Jwks=createRemoteJWKSet(new URL(`https://${config.AUTH0_DOMAIN}/.well-known/jwks.json`));
  auth0JwksDomain=config.AUTH0_DOMAIN;
 }
 return auth0Jwks;
}
const auth0LoginFailure=(reply:any,reason:'not-linked'|'ambiguous'|'generic'='generic')=>{
 const messages={
  'not-linked':'Aucun compte Aurion existant ne correspond à cette adresse e-mail Auth0 vérifiée. Créez d’abord votre espace avec le formulaire Aurion, puis réessayez avec la même adresse.',
  ambiguous:'Ce compte Aurion possède plusieurs espaces ou correspondances. Pour éviter d’ouvrir le mauvais espace, utilisez votre méthode de connexion Aurion habituelle.',
  generic:'L’authentification Auth0 n’a pas pu être validée. Réessayez ou utilisez votre mot de passe ou une clé d’accès.'
 };
 const message=messages[reason];
 return reply.code(401).type('text/html; charset=utf-8').send(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion Auth0 impossible · Aurion</title><body style="font:16px system-ui;max-width:620px;margin:12vh auto;padding:24px;color:#252d2a"><h1>Connexion Auth0 impossible</h1><p>${message}</p><p><a href="/#/login">Retour à la connexion Aurion</a></p></body></html>`);
};
const googleLoginFailure=(reply:any)=>reply.code(401).type('text/html; charset=utf-8').send('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion Google impossible · Aurion</title><body style="font:16px system-ui;max-width:620px;margin:12vh auto;padding:24px;color:#252d2a"><h1>Connexion Google impossible</h1><p>Votre compte n’a pas pu être authentifié. Réessayez ou utilisez votre mot de passe ou une clé d’accès.</p><p><a href="/#/login">Retour à la connexion Aurion</a></p></body></html>');
async function googleLoginClient(){
 const {google}=await import('googleapis');
 return new google.auth.OAuth2(config.GOOGLE_CLIENT_ID,config.GOOGLE_CLIENT_SECRET,googleLoginRedirect());
}

  app.get('/auth/google/status', async () => ({ configured: googleLoginConfigured() }));
  app.get('/auth/auth0/status', async () => ({ configured: auth0LoginConfigured() }));
  app.get('/auth/auth0/start', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (_request, reply) => {
    if (!auth0LoginConfigured()) return reply.code(503).send({ error: 'AUTH0_NOT_CONFIGURED', message: 'La connexion Auth0 n’est pas configurée sur cette installation.' });
    const state=crypto.randomBytes(32).toString('base64url');
    const nonce=crypto.randomBytes(32).toString('base64url');
    const codeVerifier=crypto.randomBytes(48).toString('base64url');
    const codeChallenge=crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    reply.setCookie('aurion_auth0_login',JSON.stringify({state,nonce,codeVerifier,createdAt:Date.now()}),{
      httpOnly:true,secure:config.COOKIE_SECURE,sameSite:'lax',path:'/auth/auth0/callback',maxAge:600
    });
    const authorize=new URL('/authorize',`https://${config.AUTH0_DOMAIN}`);
    authorize.search=new URLSearchParams({
      response_type:'code',response_mode:'query',client_id:config.AUTH0_CLIENT_ID,
      redirect_uri:auth0LoginRedirect(),scope:'openid profile email',state,nonce,
      code_challenge:codeChallenge,code_challenge_method:'S256'
    }).toString();
    return reply.redirect(authorize.toString());
  });
  app.get('/auth/auth0/callback', { config: { rateLimit: { max: 12, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const clearTransaction=()=>reply.clearCookie('aurion_auth0_login',{path:'/auth/auth0/callback'});
    if(!auth0LoginConfigured()){clearTransaction();return auth0LoginFailure(reply);}
    const saved=request.cookies?.aurion_auth0_login;
    let transaction:any=null;
    try{transaction=saved?JSON.parse(saved):null}catch{transaction=null;}
    const params=request.query as any;
    const state=String(params?.state||''),code=String(params?.code||'');
    const age=Number(transaction?.createdAt||0);
    if(!transaction?.state||!transaction?.nonce||!transaction?.codeVerifier||!state||!code||state!==transaction.state||String(params?.error||'')||!Number.isFinite(age)||Date.now()-age<0||Date.now()-age>10*60*1000){
      clearTransaction();return auth0LoginFailure(reply);
    }
    try{
      const tokenResponse=await fetch(`https://${config.AUTH0_DOMAIN}/oauth/token`,{
        method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},
        body:new URLSearchParams({grant_type:'authorization_code',client_id:config.AUTH0_CLIENT_ID,client_secret:config.AUTH0_CLIENT_SECRET,code,redirect_uri:auth0LoginRedirect(),code_verifier:transaction.codeVerifier}),
        signal:AbortSignal.timeout(10000)
      });
      if(!tokenResponse.ok)throw new Error('AUTH0_TOKEN_EXCHANGE_FAILED');
      const tokenPayload:any=await tokenResponse.json();
      if(typeof tokenPayload?.id_token!=='string'||tokenPayload.id_token.length<20)throw new Error('AUTH0_ID_TOKEN_MISSING');
      const verified=await jwtVerify(tokenPayload.id_token,auth0KeySet(),{issuer:auth0Issuer(),audience:config.AUTH0_CLIENT_ID,algorithms:['RS256'],maxTokenAge:600});
      const identity:any=verified.payload;
      const audience=Array.isArray(identity.aud)?identity.aud:[identity.aud];
      if((audience.length>1&&identity.azp!==config.AUTH0_CLIENT_ID)||identity.nonce!==transaction.nonce||typeof identity.sub!=='string'||!identity.sub||typeof identity.email!=='string'||!identity.email||identity.email_verified!==true){
        clearTransaction();return auth0LoginFailure(reply);
      }
      // Auth0 n'ouvre pas silencieusement un espace ni un compte Aurion. L'adresse doit être
      // vérifiée par Auth0 et correspondre à un compte Aurion déjà créé. La session finale reste
      // un jeton Aurion, soumis aux mêmes règles de révocation et d'isolation tenant que les autres logins.
      const rows=await query<{id:string,email:string,session_version:number,organization_id:string,role:string,membership_count:number,matching_accounts:number}>(
        `with matched_users as (
           select u.id,u.email,u.session_version,count(*) over()::int as matching_accounts
           from users u where lower(u.email)=lower($1)
         )
         select u.id,u.email,u.session_version,om.organization_id,om.role,
                count(*) over(partition by u.id)::int as membership_count,u.matching_accounts
         from matched_users u join organization_members om on om.user_id=u.id
         order by case when om.role='owner' then 0 else 1 end
         limit 2`,
        [identity.email]
      );
      const user=rows.rows[0];
      clearTransaction();
      if(!user)return auth0LoginFailure(reply,'not-linked');
      if(Number(user.matching_accounts)>1||Number(user.membership_count)>1)return auth0LoginFailure(reply,'ambiguous');
      const sessionVersion=Number(user.session_version||0);
      const accessToken=await signAccessToken({userId:user.id,organizationId:user.organization_id,role:user.role,sv:sessionVersion});
      const refresh=await createRefreshSession({userId:user.id,organizationId:user.organization_id,role:user.role,sessionVersion},request);
      app.setSession(reply,accessToken);
      app.setRefreshSession(reply,refresh.token);
      return reply.redirect(new URL('/#/dashboard',config.APP_BASE_URL).toString());
    }catch(error:any){
      request.log.warn({code:String(error?.code||error?.name||'AUTH0_CALLBACK_FAILED')},'Auth0 login failed');
      clearTransaction();return auth0LoginFailure(reply);
    }
  });
  // Décision éditeur 15.4.40 : les documents contractuels en préparation ne sont JAMAIS
  // bloquants. Le statut reste exposé à titre d'information (recette locale, observabilité),
  // mais la création d'espace est disponible dans tous les cas. Les CGV et la politique de
  // confidentialité continuent d'être acceptées explicitement à l'inscription (case obligatoire,
  // recordAcceptances) : seule la publication formelle des documents reste un chantier éditeur.
  app.get('/auth/registration-status', async () => {
    const published = await legalDocumentsReadyForContracts();
    const localEvaluation = !published && localEvaluationSignupAllowed();
    return { available: true, localEvaluation, reason: null };
  });

  app.get('/auth/google/start', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    if (!googleLoginConfigured()) return reply.code(503).send({ error: 'GOOGLE_LOGIN_NOT_CONFIGURED', message: 'La connexion Google n’est pas configurée.' });
    const state=crypto.randomBytes(32).toString('base64url');
    const codeVerifier=crypto.randomBytes(48).toString('base64url');
    const codeChallenge=crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    reply.setCookie('aurion_google_login', JSON.stringify({state,codeVerifier}), {
      httpOnly:true, secure:config.COOKIE_SECURE, sameSite:'lax', path:'/auth/google/callback', maxAge:600
    });
    try {
      const oauth=await googleLoginClient();
      const url=oauth.generateAuthUrl({
        access_type:'online', prompt:'select_account', state,
        scope:['openid','email','profile'], code_challenge:codeChallenge, code_challenge_method:CodeChallengeMethod.S256
      });
      return reply.redirect(url);
    } catch {
      reply.clearCookie('aurion_google_login',{path:'/auth/google/callback'});
      return reply.code(503).send({error:'GOOGLE_LOGIN_UNAVAILABLE',message:'La connexion Google est temporairement indisponible.'});
    }
  });

  app.get('/auth/google/callback', { config: { rateLimit: { max: 12, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const fail=()=>{reply.clearCookie('aurion_google_login',{path:'/auth/google/callback'});return googleLoginFailure(reply)};
    if (!googleLoginConfigured()) return fail();
    const saved=request.cookies?.aurion_google_login;
    let transaction:any=null;
    try { transaction=saved?JSON.parse(saved):null; } catch { transaction=null; }
    const queryArgs=request.query as any;
    const state=String(queryArgs?.state||''),code=String(queryArgs?.code||'');
    if(!transaction?.state||!transaction?.codeVerifier||!state||!code||state!==transaction.state||String(queryArgs?.error||''))return fail();
    try {
      const oauth=await googleLoginClient();
      const tokenResult=await oauth.getToken({code,codeVerifier:transaction.codeVerifier});
      const idToken=tokenResult.tokens?.id_token;
      if(!idToken)return fail();
      const ticket=await oauth.verifyIdToken({idToken,audience:config.GOOGLE_CLIENT_ID});
      const identity=ticket.getPayload();
      if(!identity?.sub||!identity.email||identity.email_verified!==true)return fail();
      const rows=await query<{id:string,email:string,session_version:number,organization_id:string,role:string,membership_count:number,matching_accounts:number}>(
        `with matched_users as (
           select u.id,u.email,u.session_version,count(*) over()::int as matching_accounts
           from users u where lower(u.email)=lower($1)
         )
         select u.id,u.email,u.session_version,om.organization_id,om.role,
                count(*) over(partition by u.id)::int as membership_count,u.matching_accounts
         from matched_users u join organization_members om on om.user_id=u.id
         order by case when om.role='owner' then 0 else 1 end
         limit 2`,
        [identity.email]
      );
      const user=rows.rows[0];
      // Refuse ambiguous account or organization matching rather than selecting one arbitrarily.
      if(!user)return fail();
      if(Number(user.matching_accounts)>1)return fail();
      if(Number(user.membership_count)>1)return fail();
      reply.clearCookie('aurion_google_login',{path:'/auth/google/callback'});
      const sessionVersion=Number(user.session_version||0);
      const accessToken=await signAccessToken({userId:user.id,organizationId:user.organization_id,role:user.role,sv:sessionVersion});
      const refresh=await createRefreshSession({userId:user.id,organizationId:user.organization_id,role:user.role,sessionVersion},request);
      app.setSession(reply,accessToken);
      app.setRefreshSession(reply,refresh.token);
      const origin=new URL(config.APP_BASE_URL).origin;
      return reply.redirect(origin+'/#/dashboard');
    } catch {
      return fail();
    }
  });
  app.get('/auth/vip-invite/validate', { config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const token=String((request.query as any)?.token||'');
    if(token.length<20)return reply.code(400).send({error:'INVITE_INVALID',message:'Invitation invalide.'});
    const row=(await query('select email,expires_at,accepted_at from admin_guest_invites where token_hash=$1',[crypto.createHash('sha256').update(token).digest('hex')])).rows[0];
    if(!row||row.accepted_at||new Date(row.expires_at).getTime()<=Date.now())return reply.code(400).send({error:'INVITE_INVALID',message:'Cette invitation est invalide ou expirée.'});
    return {valid:true,email:row.email,expiresAt:row.expires_at};
  });
  app.post('/auth/vip-invite/accept', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body=request.body as any;const token=String(body?.token||'');const password=String(body?.password||'');const fullName=String(body?.fullName||'').trim();
    if(token.length<20||password.length<12||!body?.acceptLegal)return reply.code(400).send({error:'INVALID_INPUT',message:'Le lien, le mot de passe et l’acceptation des documents légaux sont obligatoires.'});
    // Décision éditeur 15.4.40 : aucune porte légale bloquante à la création de compte.
    const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
    const row=(await query('select * from admin_guest_invites where token_hash=$1 and accepted_at is null and expires_at>now()',[tokenHash])).rows[0];
    if(!row)return reply.code(400).send({error:'INVITE_INVALID',message:'Cette invitation est invalide ou expirée.'});
    // Bloc 17 — VIP sur compte EXISTANT : rattacher le droit permanent sans doublon ni erreur
    // ACCOUNT_EXISTS. Le lien (token vérifié ci-dessus) autorise le rattachement ; l'utilisateur
    // se connecte ensuite normalement avec ses identifiants, et l'action est journalisée.
    const existing=(await query('select id from users where lower(email)=lower($1) limit 1',[row.email])).rows[0];
    if(existing){
      const already=(await query('select 1 from vip_guest_accounts where user_id=$1 limit 1',[existing.id])).rows[0];
      if(!already)await query('insert into vip_guest_accounts(user_id,invited_by,invite_id) values($1,$2,$3)',[existing.id,row.invited_by,row.id]);
      await query('update admin_guest_invites set accepted_at=now(),accepted_user_id=$1 where id=$2',[existing.id,row.id]);
      return {ok:true,vip:true,existingAccount:true,user:{id:existing.id,email:row.email},message:'Le droit VIP permanent est rattaché à votre compte existant. Connectez-vous avec vos identifiants habituels.'};
    }
    const { hashPassword }=await import('../services/passwords.js');
    const id=crypto.randomUUID(),orgId=crypto.randomUUID(),passwordHash=await hashPassword(password),client=await db.connect();
    try{
      await client.query('begin');
      await client.query("insert into organizations(id,name,activity) values($1,$2,$3)",[orgId,'Espace VIP Aurion','À configurer']);
      await client.query('insert into users(id,email,password_hash,full_name) values($1,$2,$3,nullif($4,\'\'))',[id,row.email,passwordHash,fullName]);
      await client.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')",[orgId,id]);
      // RLS 074 : écritures initiales dans le contexte de la nouvelle organisation.
      await applyTenant(client, orgId);
      await client.query("insert into activities(organization_id,code,name,description,urssaf_rate,vat_rate) values($1,'principale','Activité principale','À configurer',null,20) on conflict do nothing",[orgId]);
      await client.query('insert into vip_guest_accounts(user_id,invited_by,invite_id) values($1,$2,$3)',[id,row.invited_by,row.id]);
      await client.query('update admin_guest_invites set accepted_at=now(),accepted_user_id=$1 where id=$2',[id,row.id]);
      await recordAcceptances(client,id,request.ip);
      await client.query('commit');
    }catch(e){await client.query('rollback');throw e}finally{client.release()}
    const identity={userId:id,organizationId:orgId,role:'owner',email:row.email};
    const tokenOut=await signAccessToken(identity);app.setSession(reply,tokenOut);
    return {ok:true,accessToken:tokenOut,user:{id,email:row.email,fullName},organizationId:orgId,vip:true};
  });
  app.get("/auth/me", { preHandler: app.requireAuth }, async (request) => ({
    userId: request.auth!.userId,
    organizationId: request.auth!.organizationId,
    role: request.auth!.role,
  }));

  app.post(
    "/auth/register",
    {
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          additionalProperties: false,
          properties: {
            email: { type: "string", maxLength: 254 },
            password: { type: "string", minLength: 12, maxLength: 256 },
            acceptLegal: { type: "boolean" },
            fullName: { type: "string", maxLength: 160 },
          },
        },
      },
    },
    async (request, reply) => {
      if ((request.body as any)?.acceptLegal !== true) {
        return reply.code(400).send({ error: "LEGAL_NOT_ACCEPTED", message: "Vous devez accepter les CGV et la politique de confidentialité pour créer un compte." });
      }
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_INPUT" });
      }
      // Décision éditeur 15.4.40 : les documents contractuels non publiés ne bloquent plus
      // la création d'espace (l'acceptation des CGV/confidentialité reste exigée ci-dessus).

      const email = parsed.data.email.toLowerCase();
      const id = crypto.randomUUID();
      const orgId = crypto.randomUUID();
      const passwordHash = await hashPassword(parsed.data.password);
      const client = await db.connect();

      try {
        await client.query("begin");
        await client.query(
          "insert into organizations(id,name,activity) values($1,$2,$3)",
          [orgId, "Nouvelle entreprise", "À configurer"],
        );
        await client.query(
          "insert into users(id,email,password_hash) values($1,$2,$3)",
          [id, email, passwordHash],
        );
        await client.query(
          "insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')",
          [orgId, id],
        );
        // RLS 074 : l'organisation vient d'être créée ; les écritures métier initiales (activité,
        // abonnement d'essai) s'exécutent dans le contexte de CETTE organisation.
        await applyTenant(client, orgId);
        await client.query(
          "insert into activities(organization_id,code,name,description,urssaf_rate,vat_rate) values($1,'principale','Activité principale','À configurer',null,20) on conflict do nothing",
          [orgId],
        );
        // Facturation absente (installation locale auto-hébergée) : aucune période d'essai n'est
        // imposée (abonnement 'active', dates d'essai nulles, migration 091). L'instance reste en
        // accès complet ; l'essai ne démarre que si le paiement est réellement configuré.
        // Point de création unique, partagé avec subscriptionState() : les deux chemins ne
        // peuvent plus diverger sur le schéma ni sur la règle d'essai.
        await createInitialSubscription(client, orgId);
        if ((request.body as any)?.fullName) await client.query("update users set full_name=$1 where id=$2", [String((request.body as any).fullName).trim(), id]);
        await recordAcceptances(client, id, request.ip);
        await client.query("commit");
      } catch (error: any) {
        await client.query("rollback");
        if (error?.code === "23505") {
          return reply.code(409).send({ error: "ACCOUNT_EXISTS" });
        }
        throw error;
      } finally {
        client.release();
      }

      const token = await signAccessToken({
        userId: id,
        organizationId: orgId,
        role: "owner",
      });
      app.setSession(reply, token);
      const refresh=await createRefreshSession({userId:id,organizationId:orgId,role:'owner',sessionVersion:0},request);
      app.setRefreshSession(reply,refresh.token);

      return reply.code(201).send({
        user: { id, email },
        organization: { id: orgId },
        accessToken: token,
        expiresIn: ACCESS_SECONDS,
      });
    },
  );

  app.post(
    "/auth/login",
    {
      config: { rateLimit: { max: 8, timeWindow: "15 minutes" } },
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          additionalProperties: false,
          properties: {
            email: { type: "string", maxLength: 254 },
            password: { type: "string", minLength: 1, maxLength: 256 },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_INPUT" });
      }

      const r = await query<{
        id: string;
        email: string;
        password_hash: string;
        organization_id: string;
        role: string;
        session_version: number;
      }>(
        `select u.id,u.email,u.password_hash,u.session_version,om.organization_id,om.role
         from users u
         join organization_members om on om.user_id=u.id
         where lower(u.email)=lower($1)
         limit 1`,
        [parsed.data.email],
      );

      const row = r.rows[0];
      if (!row || !(await verifyPassword(row.password_hash, parsed.data.password))) {
        return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
      }

      const token = await signAccessToken({
        userId: row.id,
        organizationId: row.organization_id,
        role: row.role,
        sv: Number(row.session_version || 0),
      });
      app.setSession(reply, token);
      const refresh=await createRefreshSession({userId:row.id,organizationId:row.organization_id,role:row.role,sessionVersion:Number(row.session_version||0)},request);
      app.setRefreshSession(reply,refresh.token);

      return { user:{id:row.id,email:row.email}, organizationId:row.organization_id, accessToken:token, expiresIn:ACCESS_SECONDS };
    },
  );

  app.get('/auth/webauthn/credentials', { preHandler: app.requireAuth }, async (request) => {
    const rows=await query<{id:string,created_at:string,last_used_at:string|null,transports:string[]}>(
      'select id,created_at,last_used_at,transports from webauthn_credentials where user_id=$1 order by created_at desc',
      [request.auth!.userId]
    );
    return { credentials: rows.rows.map(row=>({id:row.id,createdAt:row.created_at,lastUsedAt:row.last_used_at,transports:row.transports||[]})) };
  });

  app.delete('/auth/webauthn/credentials/:id', { preHandler: app.requireAuth }, async (request, reply) => {
    const id=String((request.params as any)?.id||'');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return reply.code(400).send({error:'INVALID_CREDENTIAL_ID'});
    const removed=await query('delete from webauthn_credentials where id=$1 and user_id=$2 returning id',[id,request.auth!.userId]);
    if(!removed.rowCount)return reply.code(404).send({error:'PASSKEY_NOT_FOUND',message:'Cette clé d’accès est introuvable ou appartient à un autre compte.'});
    return {ok:true};
  });

  app.get('/auth/webauthn/register/options', { preHandler: app.requireAuth }, async (request, reply) => {
    const origin = configuredWebAuthnOrigin(request);
    if (!origin) return reply.code(403).send({ error: 'ORIGIN_NOT_ALLOWED' });
    return registrationOptions(request.auth!.userId, origin);
  });
  app.post('/auth/webauthn/register/verify', { preHandler: app.requireAuth }, async (request, reply) => {
    const origin = configuredWebAuthnOrigin(request);
    if (!origin) return reply.code(403).send({ error: 'ORIGIN_NOT_ALLOWED' });
    try { return await verifyRegistration(request.auth!.userId, request.body, origin); }
    catch { return reply.code(400).send({ error: 'WEBAUTHN_REGISTRATION_FAILED', message: 'L’enregistrement biométrique n’a pas pu être validé. Réessayez ou utilisez votre mot de passe.' }); }
  });
  app.get('/auth/webauthn/authenticate/options', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const origin = configuredWebAuthnOrigin(request);
    if (!origin) return reply.code(403).send({ error: 'ORIGIN_NOT_ALLOWED' });
    return authenticationOptions(origin);
  });
  app.post('/auth/webauthn/authenticate/verify', async (request, reply) => {
    const origin = configuredWebAuthnOrigin(request);
    if (!origin) return reply.code(403).send({ error: 'ORIGIN_NOT_ALLOWED' });
    try { const identity=await verifyAuthentication(request.body, origin); return await issueWebAuthnSession(app,reply,request,identity); }
    catch { return reply.code(401).send({error:'WEBAUTHN_AUTHENTICATION_FAILED',message:'La connexion biométrique n’a pas pu être validée.'}); }
  });

  app.post('/auth/refresh', async (request, reply) => {
    const raw=request.cookies?.aurion_refresh;
    if(!raw) return reply.code(401).send({error:'UNAUTHENTICATED'});
    const rotated=await rotateRefreshSession(raw,request);
    if(!rotated) return reply.code(401).send({error:'UNAUTHENTICATED'});
    const token=await signAccessToken(rotated.identity);
    app.setSession(reply,token); app.setRefreshSession(reply,rotated.token);
    return {accessToken:token,expiresIn:ACCESS_SECONDS,organizationId:rotated.identity.organizationId};
  });

  app.post('/auth/logout', async (request, reply) => { await revokeRefreshSession(request.cookies?.aurion_refresh||''); app.clearSession(reply); app.clearRefreshSession(reply); return {ok:true}; });
}
