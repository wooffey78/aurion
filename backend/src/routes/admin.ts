import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { query, db } from '../db.js';
import { config } from '../config.js';
import { isAdmin, status as setTicketStatus, STATUS_LABELS } from './support.js';

function publicBaseUrl(request:any){
  if(config.APP_BASE_URL) return config.APP_BASE_URL.replace(/\/$/,'');
  const proto=String(request.headers['x-forwarded-proto']||'http').split(',')[0];
  const host=String(request.headers.host||'localhost');
  return `${proto}://${host}`;
}
const hashToken=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');

export async function adminRoutes(app:FastifyInstance){
  app.addHook('preHandler',app.requireAuth);
  app.addHook('preHandler',async(request,reply)=>{
    // /admin/me is an authenticated capability probe used by every dashboard session.
    // Return a non-admin result from that route instead of generating an expected 403.
    if(request.url.split('?')[0]==='/admin/me')return;
    if(!(await isAdmin(request.auth!.userId)))return reply.code(403).send({error:'FORBIDDEN',message:'Compte administrateur requis.'});
  });
  app.get('/admin/me',async r=>{
    const admin=await isAdmin(r.auth!.userId);
    return admin?{admin:true,userId:r.auth!.userId}:{admin:false};
  });
  app.get('/admin/stats',async()=>{
    const users=Number((await query('select count(*)::int n from users')).rows[0].n);
    const free=Number((await query(`select count(*)::int n from subscriptions where status in ('expired','canceled') or (status='trialing' and trial_ends_at<=now())`)).rows[0].n);
    const monthly=Number((await query(`select count(*)::int n from subscriptions where status='active' and plan_code='monthly'`)).rows[0].n);
    const yearly=Number((await query(`select count(*)::int n from subscriptions where status='active' and plan_code='yearly'`)).rows[0].n);
    const totalPaid=monthly+yearly;
    const trials=Number((await query(`select count(*)::int n from subscriptions where status='trialing'`)).rows[0].n);
    const paidEvents=Number((await query(`select count(distinct organization_id)::int n from subscription_events where kind in ('activated','payment_succeeded')`)).rows[0].n);
    const conversion=trials+totalPaid?totalPaid/(trials+totalPaid)*100:0;
    const series=(await query(`select date_trunc('month',created_at)::date month,count(distinct organization_id)::int n from subscription_events where kind in ('activated','payment_succeeded') and created_at>=now()-interval '6 months' group by 1 order by 1`)).rows;
    const last=series.length?Number(series[series.length-1].n):0,prev=series.length>1?Number(series[series.length-2].n):0,growth=last-prev;
    const predictedMonth=Math.max(0,Math.round(last+growth)),predictedYear=Math.max(0,Math.round((last+growth)*12));
    const averages=(await query(`select
      (select coalesce(avg(n),0) from (select date_trunc('month',d)::date bucket,count(u.id)::int n from generate_series(date_trunc('month',now())-interval '5 months',date_trunc('month',now()),interval '1 month') d left join users u on date_trunc('month',u.created_at)=date_trunc('month',d) group by 1)x) month,
      (select coalesce(avg(n),0) from (select d::date bucket,count(u.id)::int n from generate_series(current_date-interval '7 weeks',current_date,interval '1 week') d left join users u on u.created_at>=d and u.created_at<d+interval '1 week' group by 1)x) week,
      (select coalesce(avg(n),0) from (select d::date bucket,count(u.id)::int n from generate_series(current_date-interval '29 days',current_date,interval '1 day') d left join users u on u.created_at>=d and u.created_at<d+interval '1 day' group by 1)x) day`)).rows[0];
    return {users,free,monthly,yearly,totalPaid,trial:trials,conversionRate:Number(conversion.toFixed(1)),averages:{month:Number(averages.month||0),week:Number(averages.week||0),day:Number(averages.day||0)},predictions:{nextMonth:predictedMonth,nextYear:predictedYear},note:'Estimations simples fondées sur la tendance des créations des 6 derniers mois; elles ne constituent pas une prévision statistique.'};
  });
  app.get('/admin/billing/pending',async()=>({requests:(await query(`select b.*,o.name organization_name from billing_payment_requests b join organizations o on o.id=b.organization_id where b.status='pending' order by b.created_at desc limit 200`)).rows}));
  app.post('/admin/billing/:id/confirm',async(request,reply)=>{
    const id=(request.params as any).id; const r=(await query(`select b.*,p.billing_interval from billing_payment_requests b join plans p on p.code=b.plan_code where b.id=$1 and b.status='pending'`,[id])).rows[0]; if(!r)return reply.code(404).send({error:'NOT_FOUND'});
    const start=new Date(); const end=new Date(start); if(r.billing_interval==='year')end.setFullYear(end.getFullYear()+1);else end.setMonth(end.getMonth()+1);
    await query(`update subscriptions set status='active',plan_code=$2,current_period_start=$3,current_period_end=$4,cancel_at_period_end=false,canceled_at=null,data_read_only_until=$4+interval '60 days',payment_method='bank_transfer',billing_reference=$5,updated_at=now() where organization_id=$1`,[r.organization_id,r.plan_code,start,end,r.reference]);
    await query(`update billing_payment_requests set status='paid',paid_at=now() where id=$1`,[id]);
    await query(`insert into subscription_events(organization_id,kind,detail) values($1,'payment_succeeded',$2)`,[r.organization_id,JSON.stringify({method:'bank_transfer',planCode:r.plan_code,reference:r.reference})]);
    return {ok:true};
  });
  app.get('/admin/tickets',async()=> (await query(`select t.*,u.email user_email,o.name organization_name,
      coalesce((select json_agg(m order by m.created_at) from (select sm.id,sm.author_type,sm.message,sm.created_at,u2.email author_email from support_messages sm left join users u2 on u2.id=sm.author_user_id where sm.ticket_id=t.id) m),'[]') messages
      from support_tickets t join users u on u.id=t.user_id join organizations o on o.id=t.organization_id order by t.created_at desc limit 300`)).rows);
  app.get('/admin/withdrawals',async()=>({requests:(await query(`select id,first_name,last_name,email,contract_reference,contract_date,declaration_text,submitted_at,status,receipt_delivery_status,receipt_sent_at,receipt_error_code,processed_at from contract_withdrawal_requests order by submitted_at desc limit 200`)).rows}));
  app.post('/admin/withdrawals/:id/status',async(request,reply)=>{
    const id=String((request.params as any).id||''),status=String((request.body as any)?.status||'');
    if(!['reviewing','processed','rejected'].includes(status))return reply.code(400).send({error:'INVALID_INPUT'});
    const result=await query(`update contract_withdrawal_requests set status=$2,processed_at=case when $2 in ('processed','rejected') then now() else processed_at end,updated_at=now() where id=$1 returning id,status,processed_at`,[id,status]);
    if(!result.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    return {ok:true,request:result.rows[0]};
  });
  app.post('/admin/withdrawals/:id/resend-receipt',async(request,reply)=>{
    const id=String((request.params as any).id||''),item=(await query('select * from contract_withdrawal_requests where id=$1',[id])).rows[0];
    if(!item)return reply.code(404).send({error:'NOT_FOUND'});
    try{
      const {sendConfiguredPlatformMail}=await import('../services/platform-mailer.js');
      await sendConfiguredPlatformMail({to:item.email,subject:'Aurion — accusé de réception de votre déclaration de rétractation',text:`Bonjour ${item.first_name} ${item.last_name},\n\nAurion accuse réception de votre déclaration de rétractation.\n\nDéclaration :\n${item.declaration_text}\n\nDate et heure d’envoi : ${new Date(item.submitted_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})} (heure de Paris).\nRéférence : ${item.id}\n\nCette confirmation constate la réception de votre déclaration et ne préjuge pas de son éligibilité ni du remboursement.\n\nAurion`});
      await query("update contract_withdrawal_requests set receipt_sent_at=now(),receipt_delivery_status='sent',receipt_error_code=null,updated_at=now() where id=$1",[id]);
      return {ok:true};
    }catch(error:any){
      const code=String(error?.code||error?.message||'MAIL_DELIVERY_FAILED').replace(/[^A-Z0-9_:-]/gi,'_').slice(0,80);
      await query("update contract_withdrawal_requests set receipt_delivery_status='failed',receipt_error_code=$2,updated_at=now() where id=$1",[id,code]);
      return reply.code(503).send({error:'RECEIPT_DELIVERY_FAILED',code});
    }
  });
  app.delete('/admin/tickets/:id',async(r,reply)=>{const id=(r.params as any).id;const x=await query('delete from support_tickets where id=$1 returning id',[id]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true};});
  app.post('/admin/tickets/:id/status',async(r,reply)=>{
    const id=(r.params as any).id,next=String((r.body as any)?.status||'');
    if(!Object.keys(STATUS_LABELS).includes(next))return reply.code(400).send({error:'INVALID_INPUT'});
    const t=(await query('select * from support_tickets where id=$1',[id])).rows[0];if(!t)return reply.code(404).send({error:'NOT_FOUND'});
    await setTicketStatus(id,next,r.auth!.userId,'Statut modifié par l’administrateur.');
    await query('insert into support_messages(ticket_id,author_user_id,author_type,message) values($1,$2,\'admin\',$3)',[id,r.auth!.userId,`Statut mis à jour : ${STATUS_LABELS[next as keyof typeof STATUS_LABELS]}.`]);
    try{const u=(await query('select email from users where id=$1',[t.user_id])).rows[0];if(u?.email){const {sendPlatformMail}=await import('../services/platform-mailer.js');await sendPlatformMail(r.auth!.userId,{to:u.email,subject:`Mise à jour du ticket ${t.number}`,text:`Votre ticket ${t.number} est maintenant : ${STATUS_LABELS[next as keyof typeof STATUS_LABELS]}.`} as any)}}catch{}
    return {ok:true,status:next};
  });
  app.post('/admin/tickets/:id/messages',async(r,reply)=>{
    const id=(r.params as any).id,msg=String((r.body as any)?.message||'').trim();if(!msg)return reply.code(400).send({error:'INVALID_INPUT'});
    const t=(await query('select * from support_tickets where id=$1',[id])).rows[0];if(!t)return reply.code(404).send({error:'NOT_FOUND'});
    await query('insert into support_messages(ticket_id,author_user_id,author_type,message) values($1,$2,\'admin\',$3)',[id,r.auth!.userId,msg]);
    await query('update support_tickets set updated_at=now() where id=$1',[id]);
    try{const u=(await query('select email from users where id=$1',[t.user_id])).rows[0];if(u?.email)await import('../services/platform-mailer.js').then(m=>m.sendPlatformMail(r.auth!.userId,{to:u.email,subject:`Réponse Aurion · ${t.number}`,text:msg} as any))}catch{}
    return {ok:true};
  });

  app.get('/admin/guests',async()=>({
    invites:(await query(`select i.id,i.email,i.created_at,i.expires_at,i.accepted_at,u.id accepted_user_id,u.full_name accepted_name from admin_guest_invites i left join users u on u.id=i.accepted_user_id order by i.created_at desc limit 500`)).rows,
    guests:(await query(`select v.user_id,u.email,u.full_name,u.created_at,v.created_at vip_created_at from vip_guest_accounts v join users u on u.id=v.user_id order by v.created_at desc limit 500`)).rows
  }));

  app.post('/admin/guests/invite',async(request,reply)=>{
    const email=String((request.body as any)?.email||'').trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return reply.code(400).send({error:'INVALID_INPUT',message:'Adresse e-mail invalide.'});
    if((await query('select 1 from users where lower(email)=lower($1) limit 1',[email])).rowCount)return reply.code(409).send({error:'ACCOUNT_EXISTS',message:'Un compte existe déjà avec cette adresse e-mail.'});
    await query('update admin_guest_invites set expires_at=now()-interval \'1 second\' where lower(email)=lower($1) and accepted_at is null and expires_at>now()',[email]);
    const token=crypto.randomBytes(32).toString('base64url');
    const invite=(await query('insert into admin_guest_invites(invited_by,email,token_hash,expires_at) values($1,$2,$3,now()+interval \'7 days\') returning id,expires_at',[request.auth!.userId,email,hashToken(token)])).rows[0];
    const link=`${publicBaseUrl(request)}/#/invite?token=${encodeURIComponent(token)}`;
    try{
      const {sendPlatformMail}=await import('../services/platform-mailer.js');
      await sendPlatformMail(request.auth!.userId,{to:email,subject:'Invitation VIP Aurion',text:`Vous êtes invité à créer gratuitement votre compte VIP Aurion.\n\nCréez votre compte via ce lien (valable 7 jours) :\n${link}\n\nLe compte VIP bénéficie des mêmes accès qu’un compte utilisateur, gratuitement et sans limite de durée.`} as any);
    }catch(err){await query('delete from admin_guest_invites where id=$1',[invite.id]);throw err;}
    return {ok:true,inviteId:invite.id,email,expiresAt:invite.expires_at};
  });

  app.get('/admin/guests.pdf',async(request,reply)=>{
    const rows=(await query(`select u.email,u.full_name,u.created_at,v.created_at vip_created_at from vip_guest_accounts v join users u on u.id=v.user_id order by v.created_at desc`)).rows;
    const PDFDocument=(await import('pdfkit')).default;
    const buffer:Buffer=await new Promise((resolve,reject)=>{
      const doc=new PDFDocument({size:'A4',margin:48,info:{Title:'Liste des comptes invités VIP Aurion',Author:'Aurion'}});
      const chunks:Buffer[]=[];doc.on('data',(b:Buffer)=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#0f172a').text('AURION · COMPTES INVITÉS VIP');doc.moveDown(.5).font('Helvetica').fontSize(10).fillColor('#64748b').text(`Généré le ${new Date().toLocaleString('fr-FR')} · ${rows.length} compte(s)`);doc.moveDown();
      rows.forEach((g:any,i:number)=>{if(doc.y>760)doc.addPage();doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(`${i+1}. ${g.full_name||'Invité'}`);doc.font('Helvetica').fontSize(10).fillColor('#334155').text(`${g.email} · créé le ${new Date(g.vip_created_at||g.created_at).toLocaleString('fr-FR')}`);doc.moveDown(.7)});
      doc.end();
    });
    reply.header('Content-Type','application/pdf').header('Content-Disposition','attachment; filename="aurion-invites-vip.pdf"').send(buffer);
  });
}
