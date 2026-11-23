import type { FastifyInstance } from 'fastify';
import { listAccountDeletionRequests, processAccountDeletion, rejectAccountDeletion } from '../services/account-deletion.js';
import crypto from 'node:crypto';
import { adminQuery as query, logAdminAccess } from '../db.js';
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
  app.addHook('preHandler',async(request,reply)=>{if(!(await isAdmin(request.auth!.userId)))return reply.code(403).send({error:'FORBIDDEN',message:'Compte administrateur requis.'})});
  // RLS 074 : la console franchit explicitement l'isolation inter-entreprises ; chaque accès est journalisé.
  app.addHook('preHandler',async(request)=>{await logAdminAccess('admin.http',{method:request.method,path:request.url.split('?')[0],userId:request.auth?.userId})});
  app.get('/admin/me',async r=>({admin:true,userId:r.auth!.userId}));
  // 15.4.51 (PROMPT A4) — supervision transverse des lettres mortes de l'outbox : liste des
  // événements en échec définitif toutes organisations confondues, pour l'exploitation.
  // Lecture seule : le rejeu organisant reste celui de /journal/outbox/:id/replay (motif requis).
  app.get('/admin/outbox/dead-lettered',async()=>{
    const rows=(await query(
      `select e.id,e.event_type as "eventType",e.organization_id as "organizationId",o.name as "organizationName",
              e.attempts,e.last_error as "lastError",e.created_at as "createdAt",e.processed_at as "processedAt"
       from business_events_outbox e join organizations o on o.id=e.organization_id
       where e.status='dead_lettered'
       order by e.created_at desc limit 200`,[])).rows;
    return { deadLettered: rows.length, events: rows };
  });
  app.get('/admin/stats',async()=>{
    const totals=(await query(`
      with org_access as (
        select o.id,
          bool_or(pa.user_id is not null) as has_admin,
          bool_or(vg.user_id is not null) as has_vip
        from organizations o
        left join organization_members om on om.organization_id=o.id
        left join platform_admins pa on pa.user_id=om.user_id
        left join vip_guest_accounts vg on vg.user_id=om.user_id
        group by o.id
      ), classified as (
        select o.id,oa.has_admin,oa.has_vip,s.status,s.plan_code,
          s.trial_started_at,s.trial_ends_at,s.current_period_end,s.cancel_at_period_end,
          case
            when oa.has_admin or oa.has_vip then 'free'
            when s.organization_id is null then 'other'
            when s.status='no_billing' then 'no_billing'
            when s.status='trialing' and s.trial_ends_at>now() then 'trial'
            when s.status='active' and (s.current_period_end is null or s.current_period_end>=now()) then 'subscribed'
            when s.status in ('canceled','expired','past_due')
              or (s.status='trialing' and s.trial_ends_at<=now())
              or (s.status='active' and s.current_period_end<now()) then 'expired'
            else 'other'
          end as category
        from organizations o
        join org_access oa on oa.id=o.id
        left join subscriptions s on s.organization_id=o.id
      )
      select
        (select count(*)::int from users) as users,
        count(*)::int as organizations,
        count(*) filter(where category='free')::int as free,
        count(*) filter(where category='trial')::int as trial,
        count(*) filter(where category='subscribed')::int as subscribed,
        count(*) filter(where category='expired')::int as expired,
        count(*) filter(where category='no_billing')::int as no_billing,
        count(*) filter(where category='other')::int as other,
        count(*) filter(where category='subscribed' and plan_code='monthly')::int as monthly,
        count(*) filter(where category='subscribed' and plan_code='yearly')::int as yearly,
        count(*) filter(where category='subscribed' and cancel_at_period_end=true)::int as cancel_scheduled,
        count(*) filter(where category='free' and has_admin and not has_vip)::int as admin_only,
        count(*) filter(where category='free' and has_vip and not has_admin)::int as vip_only,
        count(*) filter(where category='free' and has_admin and has_vip)::int as admin_and_vip
      from classified
    `)).rows[0];

    const conversion=(await query(`
      with free_orgs as (
        select distinct om.organization_id
        from organization_members om
        where exists(select 1 from platform_admins pa where pa.user_id=om.user_id)
           or exists(select 1 from vip_guest_accounts vg where vg.user_id=om.user_id)
      ), cohort as (
        select s.organization_id,s.trial_started_at,s.trial_ends_at,s.status,s.plan_code,
          (s.trial_ends_at<=now() or s.status<>'trialing') as completed,
          (s.status='active' and s.plan_code is not null) or exists(
            select 1 from subscription_events e
            where e.organization_id=s.organization_id
              and e.kind in ('activated','payment_succeeded')
              and e.created_at>=s.trial_started_at
          ) as converted
        from subscriptions s
        where s.trial_started_at is not null
          and not exists(select 1 from free_orgs f where f.organization_id=s.organization_id)
      )
      select count(*) filter(where completed)::int as completed,
             count(*) filter(where completed and converted)::int as converted
      from cohort
    `)).rows[0];

    // Les tendances sont des créations d'organisations, et non des événements de facturation.
    const series=(await query(`
      select date_trunc('month',created_at)::date as month,count(*)::int as organizations
      from organizations
      where created_at>=date_trunc('month',now())-interval '6 months'
        and created_at<date_trunc('month',now())
      group by 1 order by 1
    `)).rows;
    const averageRows=(await query(`
      select
        (select coalesce(avg(n),0) from (
          select d::date bucket,count(o.id)::int n
          from generate_series(date_trunc('month',now())-interval '6 months',date_trunc('month',now())-interval '1 month',interval '1 month') d
          left join organizations o on date_trunc('month',o.created_at)=d
          group by d
        ) monthly) as month,
        (select coalesce(avg(n),0) from (
          select d::date bucket,count(o.id)::int n
          from generate_series(current_date-interval '7 weeks',current_date,interval '1 week') d
          left join organizations o on o.created_at>=d and o.created_at<d+interval '1 week'
          group by d
        ) weekly) as week,
        (select coalesce(avg(n),0) from (
          select d::date bucket,count(o.id)::int n
          from generate_series(current_date-interval '29 days',current_date,interval '1 day') d
          left join organizations o on o.created_at>=d and o.created_at<d+interval '1 day'
          group by d
        ) daily) as day
    `)).rows[0];
    const last=series.length?Number(series[series.length-1].organizations):0;
    const previous=series.length>1?Number(series[series.length-2].organizations):0;
    const predictedMonth=Math.max(0,Math.round(last+(last-previous)));
    const completed=Number(conversion.completed||0),converted=Number(conversion.converted||0);
    return {
      users:Number(totals.users||0),organizations:Number(totals.organizations||0),
      free:Number(totals.free||0),freeBreakdown:{adminOnly:Number(totals.admin_only||0),vipOnly:Number(totals.vip_only||0),adminAndVip:Number(totals.admin_and_vip||0)},
      trial:Number(totals.trial||0),monthly:Number(totals.monthly||0),yearly:Number(totals.yearly||0),
      totalPaid:Number(totals.subscribed||0),expired:Number(totals.expired||0),noBilling:Number(totals.no_billing||0),other:Number(totals.other||0),
      cancelScheduled:Number(totals.cancel_scheduled||0),
      conversionRate:completed?Number((converted/completed*100).toFixed(1)):0,
      conversionCohort:{completed,converted},
      averages:{month:Number(averageRows.month||0),week:Number(averageRows.week||0),day:Number(averageRows.day||0)},
      predictions:{nextMonth:predictedMonth,nextYear:Math.max(0,predictedMonth*12)},
      series:series.map(row=>({month:row.month,organizations:Number(row.organizations||0)})),
      note:'Les moyennes et estimations portent sur les créations d’entreprises (organisations), pas sur les événements de paiement ni sur les comptes utilisateurs. Estimation linéaire indicative à partir des deux derniers mois complets.'
    };
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
  // Console « demandes de suppression de compte » : liste paginée + historique d'audit,
  // traitement effectif idempotent et rejet motivé, réservés à l'administrateur plateforme.
  app.get('/admin/account-deletions',async r=>{
    const q=(r.query as any)||{};
    return await listAccountDeletionRequests(Number(q.page)||1,Number(q.pageSize)||25);
  });
  app.post('/admin/account-deletions/:id/process',async(request,reply)=>{
    const id=String((request.params as any).id||'');
    if(!/^[0-9a-f-]{36}$/i.test(id))return reply.code(400).send({error:'INVALID_INPUT'});
    const outcome=await processAccountDeletion(id,request.auth!.userId);
    return {ok:true,...outcome};
  });
  app.post('/admin/account-deletions/:id/reject',async(request,reply)=>{
    const id=String((request.params as any).id||'');
    if(!/^[0-9a-f-]{36}$/i.test(id))return reply.code(400).send({error:'INVALID_INPUT'});
    const reason=String((request.body as any)?.reason||'').trim();
    if(reason.length<3)return reply.code(400).send({error:'INVALID_INPUT',message:'Un motif de rejet est requis (3 caractères minimum).'});
    const outcome=await rejectAccountDeletion(id,request.auth!.userId,reason);
    return {ok:true,...outcome};
  });
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
    invites:(await query(`select i.id,i.email,i.created_at,i.expires_at,i.accepted_at,i.email_sent_at,i.email_error_code,u.id accepted_user_id,u.full_name accepted_name from admin_guest_invites i left join users u on u.id=i.accepted_user_id order by i.created_at desc limit 500`)).rows,
    guests:(await query(`select v.user_id,u.email,u.full_name,u.created_at,v.created_at vip_created_at from vip_guest_accounts v join users u on u.id=v.user_id order by v.created_at desc limit 500`)).rows
  }));

  app.post('/admin/guests/invite',async(request,reply)=>{
    const email=String((request.body as any)?.email||'').trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return reply.code(400).send({error:'INVALID_INPUT',message:'Adresse e-mail invalide.'});
    // Bloc 12 — un compte DÉJÀ EXISTANT reçoit l'entitlement VIP permanent directement sur son
    // compte : aucun doublon de compte, aucun rôle platform_admin, aucun droit inter-tenant
    // (vip_guest_accounts ne confère que l'exemption de facturation via subscriptionState()).
    // Traçage complet via les structures existantes : invitation créée puis acceptée immédiatement.
    const existingAccount=(await query('select id from users where lower(email)=lower($1) limit 1',[email])).rows[0];
    if(existingAccount){
      await query('insert into vip_guest_accounts(user_id,invited_by) values($1,$2) on conflict (user_id) do nothing',[existingAccount.id,request.auth!.userId]);
      const grant=(await query('insert into admin_guest_invites(invited_by,email,token_hash,expires_at) values($1,$2,$3,now()) returning id',[request.auth!.userId,email,hashToken('granted-existing-'+crypto.randomUUID())])).rows[0];
      await query('update admin_guest_invites set accepted_at=now(),accepted_user_id=$1 where id=$2',[existingAccount.id,grant.id]);
      return {ok:true,existingAccount:true,inviteId:grant.id,email};
    }
    await query('update admin_guest_invites set expires_at=now()-interval \'1 second\' where lower(email)=lower($1) and accepted_at is null and expires_at>now()',[email]);
    const token=crypto.randomBytes(32).toString('base64url');
    const invite=(await query('insert into admin_guest_invites(invited_by,email,token_hash,expires_at) values($1,$2,$3,now()+interval \'7 days\') returning id,expires_at',[request.auth!.userId,email,hashToken(token)])).rows[0];
    const link=`${publicBaseUrl(request)}/#/invite?token=${encodeURIComponent(token)}`;
    let emailSent=false,emailError:string|null=null;
    try{
      const {sendPlatformMail}=await import('../services/platform-mailer.js');
      await sendPlatformMail(request.auth!.userId,{to:email,subject:'Invitation VIP Aurion',text:`Vous êtes invité à créer gratuitement votre compte VIP Aurion.\n\nCréez votre compte via ce lien (valable 7 jours) :\n${link}\n\nLe compte VIP bénéficie des mêmes accès qu’un compte utilisateur, gratuitement et sans limite de durée.`} as any);
      emailSent=true;
      await query('update admin_guest_invites set email_sent_at=now(),email_error_code=null where id=$1',[invite.id]);
    }catch(error:any){
      emailError=String(error?.code||error?.message||'MAIL_DELIVERY_FAILED').replace(/[^A-Z0-9_:-]/gi,'_').slice(0,80);
      await query('update admin_guest_invites set email_error_code=$2 where id=$1',[invite.id,emailError]);
    }
    return {ok:true,inviteId:invite.id,email,expiresAt:invite.expires_at,inviteUrl:link,emailSent,emailError};
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

  // V2 — export d'exploitation du journal des propositions de métiers (audit/traçabilité).
  // Console d'administration uniquement (RLS franchie explicitement et journalisée par les
  // hooks ci-dessus) ; filtre facultatif par organisation ; export plafonné et daté.
  app.get('/admin/profile-proposal-journal.csv',async(request,reply)=>{
    const orgId=String((request.query as any)?.organizationId||'').trim();
    const sql=`select p.created_at,p.kind,p.organization_id,p.activity_id,p.profile_code,p.confidence,p.reasons,p.proposal,a.name activity_name
      from profile_proposal_events p left join activities a on a.id=p.activity_id
      ${orgId?'where p.organization_id=$1':''} order by p.created_at desc limit 5000`;
    const rows=(await query(sql,orgId?[orgId]:[])).rows as any[];
    const cell=(v:any)=>`"${String(v===null||v===undefined?'':v).replaceAll('"','""')}"`;
    const lines=rows.map(r=>[
      r.created_at instanceof Date?r.created_at.toISOString():r.created_at,
      r.kind,r.organization_id,r.activity_name||r.activity_id,r.profile_code||'',r.confidence||'',
      Array.isArray(r.reasons)?r.reasons.map((x:any)=>typeof x==='string'?x:(x?.reason||'')).join(' | '):'',
      r.proposal?JSON.stringify(r.proposal):'',
    ].map(cell).join(';'));
    reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="aurion-journal-propositions-metiers.csv"');
    // BOM UTF-8 : ouverture directe dans un tableur avec les accents corrects.
    return '\uFEFF'+['date;evenement;organisation;activite;metier;confiance;raisons;contenu_propose',...lines].join('\r\n');
  });
}
