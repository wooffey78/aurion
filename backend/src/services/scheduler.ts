import { query } from '../db.js';
import { config } from '../config.js';
import { sendOrgMail } from './mail.js';
import { AurionError } from './errors.js';
import { signatureForEmail, emailBodyHtml } from './signature.js';
import { issueAndEmailSubscriptionInvoice } from './subscription-invoice.js';
import { renderDocument, fileFromKey } from './document-renderer.js';
import { readFile } from 'node:fs/promises';

/** Rappels e-mail J-1 / J+1 envoyés depuis la messagerie configurée dans Aurion. */
export function startReminderWorker(log:any){
  const tick=async()=>{
    try{
      await query(`update support_tickets set status='resolved',updated_at=now() where status='closed' and closed_until is not null and closed_until<=now()`);
      const subs=await query(`select organization_id,current_period_end from subscriptions where status='active' and current_period_end is not null and current_period_end<=now() limit 20`);
      for(const s of subs.rows){
        await query(`update subscriptions set status='expired',data_read_only_until=coalesce(data_read_only_until,current_period_end+interval '60 days'),updated_at=now() where organization_id=$1 and status='active'`,[s.organization_id]);
        await query(`insert into subscription_events(organization_id,kind,detail) values($1,'subscription_expired',$2)`,[s.organization_id,JSON.stringify({automaticRenewal:false})]);
      }
      const invoiceJobs=await query(`select q.*,c.email client_email,c.name client_name,o.name company_name from quotes q left join clients c on c.id=q.client_id join organizations o on o.id=q.organization_id where q.document_type='invoice' and q.payment_status<>'paid' and q.sent_at is not null and q.reminder_count between 0 and 2 and q.next_reminder_at is not null and q.next_reminder_at<=now() order by q.next_reminder_at limit 50`);
      for(const q of invoiceJobs.rows){
        if(!q.client_email){await query('update quotes set next_reminder_at=null,updated_at=now() where id=$1',[q.id]);continue}
        const next=Number(q.reminder_count||0)+1;
        try{
          const d=await renderDocument(q.organization_id,q.id,'invoice');const pdf=await readFile(fileFromKey(d.keys.pdf));
          const labels=['1ère relance','2e relance','3e relance'];const label=labels[next-1]||`${next}e relance`;
          const body=`Bonjour ${q.client_name||''},\n\nVeuillez trouver votre facture ${q.number}, ${label.toLowerCase()}.\nMontant de la facture : ${Number(q.total_ttc||0).toFixed(2)} €.`;const sig=await signatureForEmail(q.organization_id,q.activity_id,'invoice');const text=body+sig.text;
          await sendOrgMail(q.organization_id,{to:q.client_email,subject:`Facture ${q.number} · ${label}`,text,html:emailBodyHtml(body,sig.html),attachments:[...(sig.inlineAttachments||[]),{filename:`${q.number}-${next}e-relance.pdf`,content:pdf}]});
          await query('insert into invoice_reminders(organization_id,quote_id,reminder_number,penalty_amount) values($1,$2,$3,0)',[q.organization_id,q.id,next]);
          const intervalDays=Math.min(365,Math.max(0,Number(q.reminder_interval_days??0))); const nextAt=next<3&&intervalDays>0?new Date(Date.now()+intervalDays*86400000):null;
          await query('update quotes set reminder_count=$1,last_reminder_at=now(),next_reminder_at=$2,updated_at=now() where id=$3',[next,nextAt,q.id]);
        }catch(e:any){log.warn({err:e,invoiceId:q.id},'automatic invoice reminder failed')}
      }
      const jobs=await query(`select j.*,a.title,a.starts_at,a.ends_at,a.activity_id,c.name client_name,c.email client_email,o.name company_name
        from notification_jobs j join appointments a on a.id=j.appointment_id left join clients c on c.id=a.client_id join organizations o on o.id=j.organization_id
        where j.status='pending' and j.run_at<=now() order by j.run_at limit 20`);
      for(const j of jobs.rows){
        const before=j.kind==='before';
        if(before&&new Date(j.starts_at)<new Date()){await query("update notification_jobs set status='expired',updated_at=now() where id=$1",[j.id]);continue}
        if(!before&&Date.now()-new Date(j.run_at).getTime()>7*86400000){await query("update notification_jobs set status='expired',updated_at=now() where id=$1",[j.id]);continue}
        if(!j.client_email){await query("update notification_jobs set status='failed',last_error='CLIENT_EMAIL_MISSING',updated_at=now() where id=$1",[j.id]);continue}
        try{
          const sig=await signatureForEmail(j.organization_id,j.activity_id,'professional');
          const subject=before?`Rappel : ${j.title}`:`Suivi de votre rendez-vous : ${j.title}`;
          const body=before
            ?`Bonjour ${j.client_name||''},\n\nRappel : votre rendez-vous « ${j.title} » est prévu le ${new Date(j.starts_at).toLocaleString('fr-FR')}.`
            :`Bonjour ${j.client_name||''},\n\nNous revenons vers vous après votre rendez-vous « ${j.title} ».`;
          await sendOrgMail(j.organization_id,{to:j.client_email,subject,text:body+sig.text,html:emailBodyHtml(body,sig.html),attachments:sig.inlineAttachments});
          await query("update notification_jobs set status='sent',updated_at=now() where id=$1",[j.id]);
        }catch(e:any){
          if(e instanceof AurionError&&e.code==='MAIL_NOT_CONFIGURED')continue; // on réessaiera dès que la messagerie sera configurée
          const attempts=Number(j.attempts||0)+1;
          await query("update notification_jobs set attempts=$2,last_error=$3,status=case when $2>=3 then 'failed' else 'pending' end,updated_at=now() where id=$1",[j.id,attempts,String(e?.message||e)]);
        }
      }
    }catch(e){log.error({err:e},'reminder worker failed')}
  };
  tick();return setInterval(tick,config.REMINDER_WORKER_INTERVAL_MS);
}
