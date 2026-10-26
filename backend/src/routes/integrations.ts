import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { query } from '../db.js';
import { authorizationUrl, saveTokens, validateGoogleConnection } from '../services/google.js';
import { sendOrgMail, mailConfigured } from '../services/mail.js';
import { AurionError } from '../services/errors.js';
import { loadAppointment, syncAppointment } from '../services/calendar.js';
import { signatureFor } from '../services/signature.js';
import { renderDocument, fileFromKey } from '../services/document-renderer.js';
import { createInvoiceWarranty } from '../services/warranty.js';

export async function integrationRoutes(app:FastifyInstance){
  app.get('/integrations/google/status',{preHandler:app.requireAuth},async r=>{return {...await validateGoogleConnection(r.auth!.organizationId),configured:!!process.env.GOOGLE_CLIENT_ID,calendarId:process.env.GOOGLE_CALENDAR_ID||'primary'}});
  app.get('/integrations/google/start',{preHandler:app.requireAuth},async r=>{if(!process.env.GOOGLE_CLIENT_ID)return {configured:false};const state=crypto.randomBytes(32).toString('base64url');await query('insert into google_oauth_states(state,organization_id,expires_at) values($1,$2,now()+interval \'10 minutes\')',[state,r.auth!.organizationId]);return {configured:true,url:await authorizationUrl(state)}});
  app.get('/integrations/google/callback',async(r,reply)=>{const q:any=r.query;const s=await query('select organization_id from google_oauth_states where state=$1 and expires_at>now()',[q.state]);if(!s.rowCount)return reply.code(400).send('Lien Google expiré.');const client=await (await import('../services/google.js')).oauthClient();const {tokens}=await client.getToken(String(q.code));await saveTokens(s.rows[0].organization_id,tokens);await query('delete from google_oauth_states where state=$1',[q.state]);return reply.type('text/html; charset=utf-8').send('<!doctype html><meta charset="utf-8"><title>Aurion</title><body style="font-family:system-ui;background:#050a16;color:#edf7ff;display:grid;place-items:center;height:100vh"><div><h2>Google connecté à Aurion.</h2><p>Vous pouvez fermer cette fenêtre.</p></div></body>')});
  app.delete('/integrations/google',{preHandler:app.requireAuth},async r=>{await query('delete from google_connections where organization_id=$1',[r.auth!.organizationId]);return {ok:true}});
  app.post('/communications/email/document',{preHandler:app.requireAuth},async(r,reply)=>{
    const b:any=r.body;
    if(!b?.documentId||!['quote','invoice'].includes(b.type))return reply.code(400).send({error:'INVALID_INPUT'});
    const type=b.type as 'quote'|'invoice', org=r.auth!.organizationId;
    if(!(await mailConfigured(org)))throw new AurionError('MAIL_NOT_CONFIGURED','La messagerie n’est pas configurée. Ouvrez Paramètres → Messagerie & agenda pour renseigner votre adresse e-mail (une seule fois).');
    const d=await renderDocument(org,b.documentId,type);
    if(!d.row.client_email)return reply.code(400).send({error:'CLIENT_EMAIL_MISSING'});
    const pdf=await import('node:fs/promises').then(fs=>fs.readFile(fileFromKey(d.keys.pdf)));
    const label=type==='invoice'?'facture':'devis';
    await sendOrgMail(org,{to:d.row.client_email,subject:`${type==='invoice'?'Facture':'Devis'} ${d.row.number}`,text:(b.message||`Bonjour ${d.row.client_name||''},\n\nVeuillez trouver votre ${label} ${d.row.number} en pièce jointe.`)+await signatureFor(org,d.row.activity_id),attachments:[{filename:`${d.row.number}.pdf`,content:pdf}]});
    await query('update quotes set sent_at=now(),updated_at=now() where id=$1 and organization_id=$2',[b.documentId,org]);
    if(type==='invoice') await createInvoiceWarranty(org,b.documentId,d.row as any);
    if(type==='invoice' && d.row.client_id){
      await query(`update client_time_sessions set duration_seconds=accumulated_seconds+greatest(0,extract(epoch from(now()-started_at))::int),accumulated_seconds=accumulated_seconds+greatest(0,extract(epoch from(now()-started_at))::int),ended_at=now(),paused_at=null,status='completed' where organization_id=$1 and user_id=$2 and client_id=$3 and ended_at is null and status='running'`,[org,r.auth!.userId,d.row.client_id]);
      await query(`update client_time_sessions set ended_at=now(),paused_at=null,status='completed' where organization_id=$1 and user_id=$2 and client_id=$3 and ended_at is null and status='paused'`,[org,r.auth!.userId,d.row.client_id]);
    }
    return {ok:true};
  });
  app.post('/communications/calendar',{preHandler:app.requireAuth},async(r,reply)=>{const b:any=r.body;if(!b?.appointmentId)return reply.code(400).send({error:'INVALID_INPUT'});const a=await loadAppointment(r.auth!.organizationId,b.appointmentId);if(!a)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true,calendar:await syncAppointment(r.auth!.organizationId,a,'create')}});
  app.patch('/communications/calendar/:appointmentId',{preHandler:app.requireAuth},async(r,reply)=>{const a=await loadAppointment(r.auth!.organizationId,(r.params as any).appointmentId);if(!a)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true,calendar:await syncAppointment(r.auth!.organizationId,a,'update')}});
  app.delete('/communications/calendar/:appointmentId',{preHandler:app.requireAuth},async(r,reply)=>{const a=await loadAppointment(r.auth!.organizationId,(r.params as any).appointmentId);if(!a)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true,calendar:await syncAppointment(r.auth!.organizationId,a,'cancel')}});
}
