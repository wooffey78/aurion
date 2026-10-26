import type PDFKit from 'pdfkit';
import crypto from 'node:crypto';
import { query } from '../db.js';
import { sendPlatformMail } from './platform-mailer.js';
import { readFile } from 'node:fs/promises';

const pdfkit=async()=>(await import('pdfkit')).default as unknown as typeof PDFKit;
const eur=(c:number)=>`${(c/100).toFixed(2).replace('.',',')} €`;
export function addMonths(d:Date,n:number){const x=new Date(d);x.setMonth(x.getMonth()+n);return x}
async function nextNumber(org:string){const y=new Date().getFullYear();const r=await query(`select coalesce(max(substring(number from '([0-9]+)$')::int),0)+1 n from subscription_invoices where organization_id=$1 and number like $2`,[org,`ABO-${y}-%`]);return `ABO-${y}-${String(r.rows[0].n).padStart(4,'0')}`}
export async function createSubscriptionInvoice(org:string,periodStart:Date,periodEnd:Date){
 const s=(await query(`select s.*,p.name plan_name,p.price_ht_cents,p.billing_interval,o.name company_name,o.siret from subscriptions s join plans p on p.code=s.plan_code join organizations o on o.id=s.organization_id where s.organization_id=$1`,[org])).rows[0];
 if(!s)return null;
 const exists=(await query('select * from subscription_invoices where organization_id=$1 and period_start=$2',[org,periodStart])).rows[0];if(exists)return exists;
 const vat=20,total=Math.round(Number(s.price_ht_cents)*(1+vat/100)),number=await nextNumber(org),id=crypto.randomUUID();
 await query(`insert into subscription_invoices(id,organization_id,subscription_id,number,period_start,period_end,amount_ht_cents,vat_rate,total_ttc_cents) values($1,$2,$2,$3,$4,$5,$6,$7,$8)`,[id,org,number,periodStart,periodEnd,Number(s.price_ht_cents),vat,total]);
 const PDFDocument=await pdfkit();
 const buffer:Buffer=await new Promise((resolve,reject)=>{const doc=new PDFDocument({size:'A4',margin:56,info:{Title:`Facture abonnement ${number}`,Author:'Aurion'}});const chunks:Buffer[]=[];doc.on('data',(c:Buffer)=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
 doc.fillColor('#0b1220').font('Helvetica-Bold').fontSize(22).text('AURION');doc.fillColor('#0f172a').fontSize(20).text('FACTURE',56,110);doc.fontSize(11).font('Helvetica').text(number,56,140);doc.text(`Période : ${periodStart.toLocaleDateString('fr-FR')} – ${periodEnd.toLocaleDateString('fr-FR')}`,56,158);doc.moveDown(2);
 doc.font('Helvetica-Bold').fontSize(12).text(s.company_name||'Compte Aurion');if(s.siret)doc.font('Helvetica').fontSize(9).text(`SIRET : ${s.siret}`);
 doc.moveDown(2);doc.font('Helvetica-Bold').fontSize(11).text('Abonnement Aurion');doc.font('Helvetica').fontSize(10).text(`${s.plan_name} · abonnement ${s.billing_interval==='year'?'annuel':'mensuel'}`);
 doc.moveDown();doc.text(`Montant HT : ${eur(Number(s.price_ht_cents))}`);doc.text(`TVA (${vat} %) : ${eur(total-Number(s.price_ht_cents))}`);doc.font('Helvetica-Bold').fontSize(15).text(`TOTAL TTC : ${eur(total)}`);doc.moveDown(3);doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('Facture d’abonnement générée au format documentaire Aurion.');doc.end();});
 return {id,number,buffer,email:null as string|null,priceHtCents:Number(s.price_ht_cents),totalTtcCents:total};
}
export async function issueAndEmailSubscriptionInvoice(org:string,periodStart:Date,periodEnd:Date){
 const inv=await createSubscriptionInvoice(org,periodStart,periodEnd);if(!inv)return null;
 const u=(await query(`select u.email from users u join organization_members om on om.user_id=u.id where om.organization_id=$1 order by case when om.role='owner' then 0 else 1 end limit 1`,[org])).rows[0];
 if(u?.email){try{await sendPlatformMail((await query('select user_id from organization_members where organization_id=$1 order by case when role=\'owner\' then 0 else 1 end limit 1',[org])).rows[0].user_id,{to:u.email,subject:`Facture Aurion ${inv.number}`,text:`Veuillez trouver votre facture d’abonnement Aurion ${inv.number} en pièce jointe.`,attachments:[{filename:`${inv.number}.pdf`,content:inv.buffer}]});await query('update subscription_invoices set emailed_at=now() where id=$1',[inv.id])}catch{}}
 return inv;
}
