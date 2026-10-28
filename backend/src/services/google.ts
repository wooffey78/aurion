// googleapis est volumineux (~1 s de chargement) : chargé uniquement quand la connexion Google avancée est utilisée.
let _google:any;
async function G(){ if(!_google) _google=(await import('googleapis')).google; return _google; }
import crypto from 'node:crypto';
import { config } from '../config.js';
import { query } from '../db.js';

const SCOPES=['openid','email','profile','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/calendar'];
function key(){const material=config.GOOGLE_TOKEN_ENCRYPTION_KEY.trim();if(material.length<32)throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY_MISSING');return crypto.createHash('sha256').update(material).digest();}
export function encrypt(value:string){const k=key();const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',k,iv);const enc=Buffer.concat([c.update(value,'utf8'),c.final()]);return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`}
export function decrypt(value:string){const k=key();try{const fields=String(value||'').split('.');if(fields.length!==3||fields.some(x=>!x))return '';const [iv,tag,data]=fields.map(x=>Buffer.from(x,'base64'));const d=crypto.createDecipheriv('aes-256-gcm',k,iv);d.setAuthTag(tag);return Buffer.concat([d.update(data),d.final()]).toString('utf8')}catch{return ''}}
export async function oauthClient(redirectUri:string=config.GOOGLE_REDIRECT_URI){const google=await G();const client:any=new google.auth.OAuth2(config.GOOGLE_CLIENT_ID,config.GOOGLE_CLIENT_SECRET,redirectUri);const transporter=client.transporter;if(transporter&&typeof transporter==='object'){transporter.defaults={...(transporter.defaults||{}),timeout:10_000};}return client}
export async function authorizationUrl(state:string){return (await oauthClient()).generateAuthUrl({access_type:'offline',prompt:'consent',scope:SCOPES,state})}
export async function saveTokens(organizationId:string,tokens:any){const google=await G();const client=await oauthClient();client.setCredentials(tokens);const oauth2=google.oauth2({version:'v2',auth:client});const me=await oauth2.userinfo.get();await query(`insert into google_connections(organization_id,google_email,access_token_enc,refresh_token_enc,expires_at,scopes) values($1,$2,$3,$4,$5,$6) on conflict(organization_id) do update set google_email=excluded.google_email,access_token_enc=coalesce(excluded.access_token_enc,google_connections.access_token_enc),refresh_token_enc=coalesce(excluded.refresh_token_enc,google_connections.refresh_token_enc),expires_at=excluded.expires_at,scopes=excluded.scopes,updated_at=now()`,[organizationId,me.data.email||null,tokens.access_token?encrypt(tokens.access_token):null,tokens.refresh_token?encrypt(tokens.refresh_token):null,tokens.expiry_date?new Date(tokens.expiry_date):null,(tokens.scope||SCOPES.join(' '))]);}
export async function connection(organizationId:string){const r=await query('select * from google_connections where organization_id=$1',[organizationId]);if(!r.rowCount)return null;const row=r.rows[0];const client=await oauthClient();client.setCredentials({access_token:row.access_token_enc?decrypt(row.access_token_enc):undefined,refresh_token:row.refresh_token_enc?decrypt(row.refresh_token_enc):undefined,expiry_date:row.expires_at?new Date(row.expires_at).getTime():undefined});client.on('tokens',async (t:any)=>{try{await query('update google_connections set access_token_enc=coalesce($1,access_token_enc),refresh_token_enc=coalesce($2,refresh_token_enc),expires_at=coalesce($3,expires_at),updated_at=now() where organization_id=$4',[t.access_token?encrypt(t.access_token):null,t.refresh_token?encrypt(t.refresh_token):null,t.expiry_date?new Date(t.expiry_date):null,organizationId])}catch{}});return {row,client}}
type GmailAttachment = { filename:string; content:Buffer; contentType?:string; cid?:string };

async function sendGmailUsingConnection(c:any,to:string,subject:string,body:string,attachment?:GmailAttachment|GmailAttachment[],html?:string){
 if(!c)throw new Error('GOOGLE_NOT_CONNECTED');const google=await G();const gmail=google.gmail({version:'v1',auth:c.client});const from=c.row.google_email||'';
 const safeHeader=(v:string)=>String(v||'').replace(/[\r\n\x00]/g,' ').slice(0,240);
 const attachments=(Array.isArray(attachment)?attachment:(attachment?[attachment]:[])).slice(0,10);
 const text=String(body||''),markup=String(html||'');
 if(!attachments.length&&!markup){const lines=[`From: ${config.MAIL_FROM_NAME} <${from}>`,`To: ${safeHeader(to)}`,`Subject: ${safeHeader(subject)}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','',text];return gmail.users.messages.send({userId:'me',requestBody:{raw:Buffer.from(lines.join('\r\n'),'utf8').toString('base64url')}})}
 if(!attachments.length&&markup){const boundary=`AURION_ALT_${crypto.randomBytes(18).toString('hex')}`;const lines=[`From: ${config.MAIL_FROM_NAME} <${from}>`,`To: ${safeHeader(to)}`,`Subject: ${safeHeader(subject)}`,'MIME-Version: 1.0',`Content-Type: multipart/alternative; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','',text,`--${boundary}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: 8bit','',markup,`--${boundary}--`];return gmail.users.messages.send({userId:'me',requestBody:{raw:Buffer.from(lines.join('\r\n'),'utf8').toString('base64url')}})}
 const mixed=`AURION_MIX_${crypto.randomBytes(18).toString('hex')}`,alt=`AURION_ALT_${crypto.randomBytes(18).toString('hex')}`;
 const parts=[`From: ${config.MAIL_FROM_NAME} <${from}>`,`To: ${safeHeader(to)}`,`Subject: ${safeHeader(subject)}`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${mixed}"`,''];
 if(markup){parts.push(`--${mixed}`,`Content-Type: multipart/alternative; boundary="${alt}"`,'',`--${alt}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','',text,`--${alt}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: 8bit','',markup,`--${alt}--`)}
 else parts.push(`--${mixed}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','',text);
 for(const file of attachments){const filename=safeHeader(file.filename||'document').replace(/["\\]/g,'_');const mime=safeHeader(file.contentType||'application/octet-stream');const cid=String(file.cid||'').replace(/[^A-Za-z0-9_.@-]/g,'').slice(0,120);const base64=Buffer.from(file.content).toString('base64').replace(/.{1,76}/g,'$&\r\n').trimEnd();parts.push('',`--${mixed}`,`Content-Type: ${mime}; name="${filename}"`,'Content-Transfer-Encoding: base64',`Content-Disposition: ${cid?'inline':'attachment'}; filename="${filename}"`,...(cid?[`Content-ID: <${cid}>`]:[]),'',base64)}
 parts.push('',`--${mixed}--`);
 return gmail.users.messages.send({userId:'me',requestBody:{raw:Buffer.from(parts.join('\r\n'),'utf8').toString('base64url')}})
}

export async function gmailSend(organizationId:string,to:string,subject:string,body:string,attachment?:GmailAttachment|GmailAttachment[],html?:string){
 const c=await connection(organizationId);if(!c)throw new Error('GOOGLE_NOT_CONNECTED');return sendGmailUsingConnection(c,to,subject,body,attachment,html);
}

/** Envoi administratif après consentement OAuth distinct (scope Gmail Send uniquement). */
export async function gmailSendAdministrative(organizationId:string,to:string,subject:string,body:string,attachment?:GmailAttachment|GmailAttachment[],html?:string){
 const r=await query('select * from administrative_mail_send_connections where organization_id=$1',[organizationId]);if(!r.rowCount)throw new Error('ADMIN_GMAIL_SEND_NOT_CONNECTED');const row=r.rows[0];
 const redirect=config.APP_BASE_URL?new URL('/administrative-mail/oauth/callback',config.APP_BASE_URL).toString():config.GOOGLE_REDIRECT_URI;const client=await oauthClient(redirect);
 client.setCredentials({access_token:row.access_token_enc?decrypt(row.access_token_enc):undefined,refresh_token:row.refresh_token_enc?decrypt(row.refresh_token_enc):undefined,expiry_date:row.expires_at?new Date(row.expires_at).getTime():undefined});
 client.on('tokens',async(t:any)=>{try{await query(`update administrative_mail_send_connections set access_token_enc=coalesce($1,access_token_enc),refresh_token_enc=coalesce($2,refresh_token_enc),expires_at=coalesce($3,expires_at),updated_at=now() where organization_id=$4`,[t.access_token?encrypt(t.access_token):null,t.refresh_token?encrypt(t.refresh_token):null,t.expiry_date?new Date(t.expiry_date):null,organizationId])}catch{}});
 return sendGmailUsingConnection({row,client},to,subject,body,attachment,html);
}

export async function calendarCreate(organizationId:string,event:any){const c=await connection(organizationId);if(!c)throw new Error('GOOGLE_NOT_CONNECTED');const google=await G();const cal=google.calendar({version:'v3',auth:c.client});const result=await cal.events.insert({calendarId:config.GOOGLE_CALENDAR_ID,requestBody:{summary:event.title,description:event.description||'Créé par Aurion',start:{dateTime:event.startsAt},end:{dateTime:event.endsAt},reminders:{useDefault:false,overrides:[{method:'email',minutes:1440},{method:'popup',minutes:1440}]}}});return result.data.id||null}

export async function validateGoogleConnection(organizationId:string){
  const c=await connection(organizationId); if(!c) return {connected:false,error:'GOOGLE_NOT_CONNECTED'}; const google=await G();
  try{const oauth2=google.oauth2({version:'v2',auth:c.client});const me=await oauth2.userinfo.get();const cal=google.calendar({version:'v3',auth:c.client});const list=await cal.calendarList.list({maxResults:20});return {connected:true,email:me.data.email||c.row.google_email||null,calendars:(list.data.items||[]).map((x:any)=>({id:x.id,name:x.summary,primary:x.primary}))};}
  catch{return {connected:false,email:c.row.google_email||null,error:'GOOGLE_PROVIDER_UNAVAILABLE'}}
}
export async function calendarUpdate(organizationId:string,eventId:string,event:any){const c=await connection(organizationId);if(!c)throw new Error('GOOGLE_NOT_CONNECTED');const google=await G();const cal=google.calendar({version:'v3',auth:c.client});await cal.events.update({calendarId:config.GOOGLE_CALENDAR_ID,eventId,requestBody:{summary:event.title,description:event.description||'Créé par Aurion',start:{dateTime:event.startsAt},end:{dateTime:event.endsAt}}});return eventId}
export async function calendarDelete(organizationId:string,eventId:string){const c=await connection(organizationId);if(!c)throw new Error('GOOGLE_NOT_CONNECTED');const google=await G();const cal=google.calendar({version:'v3',auth:c.client});await cal.events.delete({calendarId:config.GOOGLE_CALENDAR_ID,eventId});return true}
