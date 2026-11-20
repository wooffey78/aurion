import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { query } from '../db.js';
import { sendPlatformMail } from '../services/platform-mailer.js';
import { config } from '../config.js';

const CATEGORIES=['SAV','Facturation','Remboursement','Problème sur le site','Compte et connexion','Devis et factures','Documents et modèles','Messagerie et agenda','Installation / application','Sécurité et confidentialité','Bug ou erreur','Suggestion d’amélioration','Autre'];
const STATUS_LABELS={open:'Ouvert',in_progress:'En cours',waiting_user:'En attente utilisateur',waiting_provider:'En attente fournisseur',closed:'Fermé',resolved:'Clos',duplicate:'Doublons',email_failed:'Ouvert'};
const SLA:{[k:string]:number}={ 'SAV':2,'Facturation':2,'Remboursement':3,'Problème sur le site':1,'Compte et connexion':2,'Devis et factures':1,'Documents et modèles':2,'Messagerie et agenda':2,'Installation / application':3,'Sécurité et confidentialité':1,'Bug ou erreur':1,'Suggestion d’amélioration':5,'Autre':3 };
function supportAddress(){ return config.AURION_SUPPORT_EMAIL; }
async function nextNumber(_org:string){const r=await query(`select nextval('aurion_support_ticket_seq') n`);return `AURION-SUP-${String(r.rows[0].n).padStart(6,'0')}`}
async function isAdmin(userId:string){return !!(await query("select 1 from users u left join platform_admins pa on pa.user_id=u.id where u.id=$1 and (pa.user_id is not null )",[userId])).rowCount}
async function addMessage(ticketId:string,userId:string,type:'user'|'admin'|'system',message:string){await query('insert into support_messages(ticket_id,author_user_id,author_type,message) values($1,$2,$3,$4)',[ticketId,userId,type,message])}
async function status(ticketId:string,next:string,userId:string,note?:string){
 const cur=(await query('select status from support_tickets where id=$1',[ticketId])).rows[0]?.status;
 if(cur===next)return;
 await query('update support_tickets set status=$1,updated_at=now(),closed_at=case when $2 in (\'closed\',\'resolved\') then now() else closed_at end,closed_until=case when $2=\'closed\' then now()+interval \'7 days\' else closed_until end where id=$3',[next,next,ticketId]);
 await query('insert into support_status_events(ticket_id,old_status,new_status,author_user_id,note) values($1,$2,$3,$4,$5)',[ticketId,cur,next,userId,note||null]);
}
async function ticketPdf(org:string,id:string){
 const PDFDocument=(await import('pdfkit')).default;
 const t=(await query(`select t.*,u.email user_email,u.full_name,o.name organization_name from support_tickets t join users u on u.id=t.user_id join organizations o on o.id=t.organization_id where t.id=$1 and t.organization_id=$2`,[id,org])).rows[0];
 if(!t)throw new Error('NOT_FOUND');
 const messages=(await query(`select sm.*,u.email author_email from support_messages sm left join users u on u.id=sm.author_user_id where sm.ticket_id=$1 order by sm.created_at`,[id])).rows;
 return await new Promise<Buffer>((resolve,reject)=>{const doc=new PDFDocument({size:'A4',margin:48,info:{Title:`Ticket ${t.number}`,Author:'Aurion'}});const chunks:Buffer[]=[];doc.on('data',(b:Buffer)=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);doc.font('Helvetica-Bold').fontSize(20).text('AURION · SUPPORT');doc.moveDown(.5).fontSize(15).text(`Ticket ${t.number}`);doc.font('Helvetica').fontSize(10).fillColor('#475569').text(`Catégorie : ${t.category}`);doc.text(`Statut : ${STATUS_LABELS[t.status as keyof typeof STATUS_LABELS]||t.status}`);doc.text(`Créé le : ${new Date(t.created_at).toLocaleString('fr-FR')}`);doc.moveDown();doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Demande initiale');doc.font('Helvetica').fontSize(10).text(t.message,{width:499});doc.moveDown();messages.forEach((m:any)=>{doc.font('Helvetica-Bold').fontSize(10).text(`${m.author_type==='admin'?'Aurion':m.author_type==='system'?'Système':'Utilisateur'} · ${new Date(m.created_at).toLocaleString('fr-FR')}`);doc.font('Helvetica').fontSize(10).text(m.message,{width:499});doc.moveDown(.7)});doc.end();});
}

export async function supportRoutes(app:FastifyInstance){
 app.addHook('preHandler',app.requireAuth);
 app.get('/support/categories',async()=>({categories:CATEGORIES,slaDays:SLA,statuses:Object.entries(STATUS_LABELS).map(([value,label])=>({value,label}))}));
 app.get('/support/tickets',async r=>{
   const org=r.auth!.organizationId;
   return (await query(`select t.id,t.number,t.category,t.message,t.status,t.created_at,t.updated_at,t.duplicate_of,
      coalesce((select json_agg(m order by m.created_at) from (select sm.id,sm.author_type,sm.message,sm.created_at,u.email author_email from support_messages sm left join users u on u.id=sm.author_user_id where sm.ticket_id=t.id) m),'[]') messages
      from support_tickets t where t.organization_id=$1 order by t.created_at desc limit 100`,[org])).rows;
 });
 app.get('/support/tickets/:id',async r=>{
   const id=(r.params as any).id,org=r.auth!.organizationId;
   const t=(await query('select * from support_tickets where id=$1 and organization_id=$2',[id,org])).rows[0];
   if(!t)return {error:'NOT_FOUND'};
   return {ticket:t,messages:(await query(`select sm.id,sm.author_type,sm.message,sm.created_at,u.email author_email from support_messages sm left join users u on u.id=sm.author_user_id where sm.ticket_id=$1 order by sm.created_at`,[id])).rows};
 });
 app.get('/support/tickets/:id/pdf',async(r,reply)=>{const id=(r.params as any).id;try{const b=await ticketPdf(r.auth!.organizationId,id);return reply.header('Content-Type','application/pdf').header('Content-Disposition',`attachment; filename=ticket-${id}.pdf`).send(b)}catch(e:any){return reply.code(e?.message==='NOT_FOUND'?404:500).send({error:e?.message||'PDF_ERROR'})}});
 app.post('/support/tickets',{config:{rateLimit:{max:5,timeWindow:'15 minutes'}}},async(r,reply)=>{
   const b:any=r.body||{},category=String(b.category||''),message=String(b.message||'').trim(),org=r.auth!.organizationId;
   if(!CATEGORIES.includes(category)||message.length<5||message.length>10000)return reply.code(400).send({error:'INVALID_INPUT'});
   const user=(await query('select email,full_name from users where id=$1',[r.auth!.userId])).rows[0];if(!user?.email)return reply.code(400).send({error:'INVALID_INPUT'});
   const dup=(await query(`select id,number from support_tickets where organization_id=$1 and user_id=$2 and category=$3 and status in ('open','in_progress','waiting_user','waiting_provider','closed') order by created_at asc limit 1`,[org,r.auth!.userId,category])).rows[0];
   const number=await nextNumber(org),id=crypto.randomUUID();
   const initialStatus=dup?'duplicate':'open';
   await query('insert into support_tickets(id,organization_id,user_id,number,category,message,status,duplicate_of) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,org,r.auth!.userId,number,category,message,initialStatus,dup?.id||null]);
   await addMessage(id,r.auth!.userId,'user',message);
   if(dup)await addMessage(id,r.auth!.userId,'system',`Ce ticket est un doublon du ticket ${dup.number}. Aurion conserve le ticket le plus ancien.`);
   else await addMessage(id,r.auth!.userId,'system',`Demande reçue. Délai indicatif de première prise en charge : ${SLA[category]} jour(s) ouvré(s).`);
   const orgRow=(await query('select name from organizations where id=$1',[org])).rows[0];
   const text=`Ticket ${number}
Adresse utilisateur : ${user.email}
Entreprise : ${orgRow?.name||''}
Catégorie : ${category}
Date : ${new Date().toISOString()}
Statut : ${STATUS_LABELS[initialStatus as keyof typeof STATUS_LABELS]}
Version Aurion : 15.1
Environnement : ${process.env.NODE_ENV||'development'}

${message}${dup?`\n\nDoublon du ticket ${dup.number}.`:''}`;
   try{await sendPlatformMail(r.auth!.userId,{to:supportAddress(),subject:`Aurion ${number} · ${category}`,text} as any)}catch(e:any){await query('update support_tickets set status=$1,updated_at=now() where id=$2',['email_failed',id])}
   try{await sendPlatformMail(r.auth!.userId,{to:user.email,subject:`Aurion · ticket ${number} reçu`,text:`Bonjour ${user.full_name||''},\n\nVotre ticket ${number} a bien été reçu par l’administrateur Aurion.\nCatégorie : ${category}\nStatut : ${STATUS_LABELS[initialStatus as keyof typeof STATUS_LABELS]}\nDélai indicatif de première prise en charge : ${SLA[category]} jour(s) ouvré(s).\n\nVous pouvez suivre et compléter votre ticket depuis Aurion.\n\nAurion`} as any)}catch{}
   return reply.code(201).send({id,number,status:initialStatus,slaDays:SLA[category],duplicateOf:dup?.number||null});
 });
 app.delete('/support/tickets/:id',async(r,reply)=>{const id=(r.params as any).id,org=r.auth!.organizationId;const x=await query('delete from support_tickets where id=$1 and organization_id=$2 and user_id=$3 returning id',[id,org,r.auth!.userId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true};});
 app.patch('/support/tickets/:id',async(r,reply)=>{
   const id=(r.params as any).id,org=r.auth!.organizationId,b:any=r.body||{},t=(await query('select * from support_tickets where id=$1 and organization_id=$2',[id,org])).rows[0];
   if(!t)return reply.code(404).send({error:'NOT_FOUND'});if(t.user_id!==r.auth!.userId)return reply.code(403).send({error:'FORBIDDEN'});
   if(['resolved','duplicate'].includes(t.status))return reply.code(409).send({error:'TICKET_CLOSED'});
   const category=String(b.category??t.category),message=String(b.message??t.message).trim();
   if(!CATEGORIES.includes(category)||message.length<5||message.length>10000)return reply.code(400).send({error:'INVALID_INPUT'});
   await query('update support_tickets set category=$1,message=$2,updated_at=now() where id=$3',[category,message,id]);
   await addMessage(id,r.auth!.userId,'system','Le ticket a été modifié par l’utilisateur.');
   return {ok:true};
 });
 app.post('/support/tickets/:id/messages',async(r,reply)=>{
   const id=(r.params as any).id,org=r.auth!.organizationId,message=String((r.body as any)?.message||'').trim();
   if(message.length<1||message.length>10000)return reply.code(400).send({error:'INVALID_INPUT'});
   const t=(await query('select * from support_tickets where id=$1 and organization_id=$2',[id,org])).rows[0];if(!t)return reply.code(404).send({error:'NOT_FOUND'});
   if(t.user_id!==r.auth!.userId)return reply.code(403).send({error:'FORBIDDEN'});
   if(t.status==='resolved'||t.status==='duplicate')return reply.code(409).send({error:'TICKET_CLOSED',message:'Ce ticket est clos. Ouvrez un nouveau ticket.'});
   await addMessage(id,r.auth!.userId,'user',message);
   if(t.status==='closed')await status(id,'open',r.auth!.userId,'Ticket rouvert par l’utilisateur.');
   else await query('update support_tickets set status=case when status=\'waiting_user\' then \'open\' else status end,updated_at=now() where id=$1',[id]);
   try{await sendPlatformMail(r.auth!.userId,{to:supportAddress(),subject:`Réponse ticket ${t.number}`,text:`Ticket ${t.number}\n\n${message}`} as any)}catch{}
   return {ok:true};
 });
}
export {isAdmin,status,STATUS_LABELS};
