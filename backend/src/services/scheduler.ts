import { query, adminQuery, withTenant, logAdminAccess } from '../db.js';
import { config } from '../config.js';
import { sendOrgMail } from './mail.js';
import { AurionError } from './errors.js';
import { signatureForEmail, emailBodyHtml } from './signature.js';
import { issueAndEmailSubscriptionInvoice } from './subscription-invoice.js';
import { renderDocument } from './document-renderer.js';
import { readPrivateObject } from './storage.js';
import { readFile } from 'node:fs/promises';
import { runWorkflowSweep } from './workflows.js';
import { processOutboxQueue } from './events-outbox.js';
import { platformMailerConfigured, sendConfiguredPlatformMail } from './platform-mailer.js';

// 15.4.51 (PROMPT A4) — dé-duplication de l'alerte quotidienne des lettres mortes : une seule
// notification par jour civil même si le worker tourne chaque minute (REMINDER_WORKER_INTERVAL_MS).
let lastDeadLetterAlertDay='';

/** Rappels e-mail J-1 / J+1 envoyés depuis la messagerie configurée dans Aurion. */
export function startReminderWorker(log:any){
  const tick=async()=>{
    try{
      // RLS 074 : ce travail entretient l'ensemble des organisations (expiration d'abonnements, relances,
      // notifications). Les sélections inter-entreprises passent par le pool d'administration journalisé ;
      // chaque opération propre à une organisation s'exécute ensuite dans son contexte tenant exact.
      await logAdminAccess('scheduler.tick', { at: new Date().toISOString() });
      await adminQuery(`update support_tickets set status='resolved',updated_at=now() where status='closed' and closed_until is not null and closed_until<=now()`);
      const subs=await adminQuery(`select organization_id,current_period_end from subscriptions where status='active' and current_period_end is not null and current_period_end<=now() limit 20`);
      for(const s of subs.rows){
        await withTenant(String(s.organization_id),async()=>{
          await query(`update subscriptions set status='expired',data_read_only_until=coalesce(data_read_only_until,current_period_end+interval '60 days'),updated_at=now() where organization_id=$1 and status='active'`,[s.organization_id]);
          await query(`insert into subscription_events(organization_id,kind,detail) values($1,'subscription_expired',$2)`,[s.organization_id,JSON.stringify({automaticRenewal:false})]);
        });
      }
      const invoiceJobs=await adminQuery(`select q.*,c.email client_email,c.name client_name,o.name company_name from quotes q left join clients c on c.id=q.client_id join organizations o on o.id=q.organization_id where q.document_type='invoice' and q.payment_status<>'paid' and q.sent_at is not null and q.reminder_count between 0 and 2 and q.next_reminder_at is not null and q.next_reminder_at<=now() order by q.next_reminder_at limit 50`);
      for(const q of invoiceJobs.rows){
        await withTenant(String(q.organization_id),async()=>{
        // Bloc 1 — re-vérification du statut payé juste avant envoi : un paiement confirmé entre
        // la sélection et l'exécution annule la relance planifiée (aucune relance d'une facture réglée).
        const fresh=(await query('select payment_status from quotes where id=$1 and organization_id=$2',[q.id,q.organization_id])).rows[0];
        if(fresh?.payment_status==='paid'){await query('update quotes set next_reminder_at=null,updated_at=now() where id=$1',[q.id]);return}
        if(!q.client_email){await query('update quotes set next_reminder_at=null,updated_at=now() where id=$1',[q.id]);return}
        const next=Number(q.reminder_count||0)+1;
        try{
          // Bloc 13 — prise de rôle atomique AVANT envoi : l'historique invoice_reminders porte
          // une contrainte unique (quote_id, reminder_number). Deux instances concurrentes ne
          // peuvent pas envoyer deux fois la même relance : la seconde insertion échoue et
          // abandonne sans double e-mail.
          await query('insert into invoice_reminders(organization_id,quote_id,reminder_number,penalty_amount) values($1,$2,$3,0) on conflict do nothing',[q.organization_id,q.id,next]);
          const claimed=(await query('select 1 from invoice_reminders where quote_id=$1 and reminder_number=$2',[q.id,next])).rowCount;
          if(!claimed)return;
          const d=await renderDocument(q.organization_id,q.id,'invoice');const pdf=await readPrivateObject(d.keys.pdf);
          const labels=['1ère relance','2e relance','3e relance'];const label=labels[next-1]||`${next}e relance`;
          const body=`Bonjour ${q.client_name||''},\n\nVeuillez trouver votre facture ${q.number}, ${label.toLowerCase()}.\nMontant de la facture : ${Number(q.total_ttc||0).toFixed(2)} €.`;const sig=await signatureForEmail(q.organization_id,q.activity_id,'invoice');const text=body+sig.text;
          await sendOrgMail(q.organization_id,{to:q.client_email,subject:`Facture ${q.number} · ${label}`,text,html:emailBodyHtml(body,sig.html),attachments:[...(sig.inlineAttachments||[]),{filename:`${q.number}-${next}e-relance.pdf`,content:pdf}]});
          const intervalDays=Math.min(365,Math.max(0,Number(q.reminder_interval_days??0))); const nextAt=next<3&&intervalDays>0?new Date(Date.now()+intervalDays*86400000):null;
          await query('update quotes set reminder_count=$1,last_reminder_at=now(),next_reminder_at=$2,updated_at=now() where id=$3',[next,nextAt,q.id]);
        }catch(e:any){
          // Échec de canal : la réservation d'historique est libérée pour permettre la reprise
          // contrôlée (retry au prochain tick), l'erreur est journalisée, jamais masquée.
          await query('delete from invoice_reminders where organization_id=$1 and quote_id=$2 and reminder_number=$3',[q.organization_id,q.id,next]).catch(()=>{});
          log.warn({err:e,invoiceId:q.id},'automatic invoice reminder failed');
        }
        });
      }
      const jobs=await adminQuery(`select j.*,a.title,a.starts_at,a.ends_at,a.activity_id,c.name client_name,c.email client_email,o.name company_name
        from notification_jobs j join appointments a on a.id=j.appointment_id left join clients c on c.id=a.client_id join organizations o on o.id=j.organization_id
        where j.status='pending' and j.run_at<=now() order by j.run_at limit 20`);
      for(const j of jobs.rows){
        await withTenant(String(j.organization_id),async()=>{
        // Bloc 13 — revendication atomique du job (status pending → sending) : en déploiement
        // multi-instances, un seul worker obtient le job, les autres passent au suivant.
        const claimed=await query("update notification_jobs set status='sending',updated_at=now() where id=$1 and status='pending' returning id",[j.id]);
        if(!claimed.rowCount)return;
        const before=j.kind==='before';
        if(before&&new Date(j.starts_at)<new Date()){await query("update notification_jobs set status='expired',updated_at=now() where id=$1",[j.id]);return}
        if(!before&&Date.now()-new Date(j.run_at).getTime()>7*86400000){await query("update notification_jobs set status='expired',updated_at=now() where id=$1",[j.id]);return}
        if(!j.client_email){await query("update notification_jobs set status='failed',last_error='CLIENT_EMAIL_MISSING',updated_at=now() where id=$1",[j.id]);return}
        try{
          const sig=await signatureForEmail(j.organization_id,j.activity_id,'professional');
          const subject=before?`Rappel : ${j.title}`:`Suivi de votre rendez-vous : ${j.title}`;
          const body=before
            ?`Bonjour ${j.client_name||''},\n\nRappel : votre rendez-vous « ${j.title} » est prévu le ${new Date(j.starts_at).toLocaleString('fr-FR')}.`
            :`Bonjour ${j.client_name||''},\n\nNous revenons vers vous après votre rendez-vous « ${j.title} ».`;
          await sendOrgMail(j.organization_id,{to:j.client_email,subject,text:body+sig.text,html:emailBodyHtml(body,sig.html),attachments:sig.inlineAttachments});
          await query("update notification_jobs set status='sent',updated_at=now() where id=$1",[j.id]);
        }catch(e:any){
          if(e instanceof AurionError&&e.code==='MAIL_NOT_CONFIGURED'){await query("update notification_jobs set status='pending',updated_at=now() where id=$1",[j.id]);return} // on réessaiera dès que la messagerie sera configurée
          const attempts=Number(j.attempts||0)+1;
          await query("update notification_jobs set attempts=$2,last_error=$3,status=case when $2>=3 then 'failed' else 'pending' end,updated_at=now() where id=$1",[j.id,attempts,String(e?.message||e)]);
        }
        });
      }
      // Bloc 13 — balayage des workflows déterministes : idempotent (clé unique par règle et
      // déclencheur), robuste à l'échec d'une règle, jamais bloquant pour les autres traitements.
      try{
        const sweep=await runWorkflowSweep(log);
        if(sweep.executed>0)log.info?.({sweep},'workflow sweep executed');
      }catch(e){log.warn?.({err:String((e as any)?.message||e)},'workflow sweep failed')}
      // 106 (prompt 07) — expiration automatique des devis à la fin de leur validité
      // (quote_validity_days de l'activité, défaut 30). Idempotent : uniquement les devis
      // encore ouverts, créés à partir de la 15.4.49 (aucun état rétroactif sur les données
      // historiques) ; chaque expiration est horodatée et historisée (acteur système null).
      try{
        const expired=await adminQuery(`
          select q.id,q.organization_id,q.status from quotes q join activities a on a.id=q.activity_id
          where q.document_type='quote' and q.accepted_at is null and q.created_at>=make_date(2026,11,21)
            and lower(coalesce(q.status,'')) not in ('accepted','canceled','cancelled','annulé','annule','rejected','refused','expired','void','deleted')
            and (q.created_at + make_interval(days => greatest(1,coalesce(a.quote_validity_days,30)))) < now()
          limit 100`);
        for(const q of expired.rows){
          await withTenant(String(q.organization_id),async()=>{
            const x=await query(`update quotes set status='expired',expired_at=now(),updated_at=now()
              where id=$1 and document_type='quote' and accepted_at is null and expired_at is null
                and lower(coalesce(status,'')) not in ('accepted','canceled','cancelled','annulé','annule','rejected','refused','expired','void','deleted') returning id`,[q.id]);
            if(x.rowCount)await query(`insert into document_status_history(organization_id,document_id,from_status,to_status,reason) values($1,$1,$2,'expired','Expiration automatique à la fin de la période de validité du devis')`,[q.id,q.status||null]);
          });
        }
        if(expired.rows.length)log.info?.({expired:expired.rows.length},'quote expiry sweep executed');
      }catch(e){log.warn?.({err:String((e as any)?.message||e)},'quote expiry sweep failed')}
      // 109 (prompt 05) — balayage de l'outbox : livraison des événements publiés dans les
      // transactions métier (journal de bord), backoff et lettre morte après épuisement.
      try{
        const ob=await processOutboxQueue(log);
        if(ob.claimed>0)log.info?.({outbox:ob},'outbox sweep executed');
      }catch(e){log.warn?.({err:String((e as any)?.message||e)},'outbox sweep failed')}
      // 15.4.51 (PROMPT A4) — alerte quotidienne des lettres mortes : si des événements sont
      // en échec définitif et qu'une adresse d'exploitation est configurée, un résumé unique
      // par jour est envoyé (dé-dupliqué par date : le worker tourne chaque minute). L'alerte
      // ne remplace jamais l'action humaine : le rejeu motivé reste dans la console admin.
      try{
        if(config.AURION_OPS_ALERT_EMAIL&&platformMailerConfigured()){
          const day=new Date().toISOString().slice(0,10);
          const c=(await adminQuery(`select count(*)::int as c from business_events_outbox where status='dead_lettered'`)).rows[0]?.c||0;
          if(c>0&&lastDeadLetterAlertDay!==day){
            lastDeadLetterAlertDay=day;
            const rows=(await adminQuery(`select e.event_type as "type",o.name as "org",e.attempts,left(coalesce(e.last_error,''),160) as "err"
              from business_events_outbox e join organizations o on o.id=e.organization_id
              where e.status='dead_lettered' order by e.created_at desc limit 10`)).rows;
            const lines=rows.map((x:any)=>`- ${x.type} · ${x.org} · ${x.attempts} tentative(s) · ${x.err}`).join('\n');
            await sendConfiguredPlatformMail({
              to: config.AURION_OPS_ALERT_EMAIL,
              subject: `[Aurion] ${c} événement(s) en lettre morte — résumé du ${day}`,
              text: `Supervision Aurion (15.4.51).\n\n${c} événement(s) de l'outbox sont en lettre morte (échec définitif après ${5} tentatives).\n\nDerniers concernés :\n${lines}\n\nAction : console d'administration → Lettres mortes (rejeu motivé) ou investigation base. Ce résumé est envoyé une fois par jour tant que le compteur est non nul.`,
            });
            log.info?.({deadLettered:c},'dead letter daily alert sent');
          }
        }
      }catch(e){log.warn?.({err:String((e as any)?.message||e)},'dead letter alert failed')}
    }catch(e){log.error({err:e},'reminder worker failed')}
  };
  tick();const stop=setInterval(tick,config.REMINDER_WORKER_INTERVAL_MS);
  return { tick, stop }; // tick exposé pour les tests déterministes (Bloc 1)
}
