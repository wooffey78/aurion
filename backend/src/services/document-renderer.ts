import AdmZip from 'adm-zip';
import { promises as fs, existsSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { query } from '../db.js';
import { fileFromKey, privateRoot, STORAGE_BASE } from './storage.js';
import { buildPdf, buildDocx, buildOdt, starterModel, formatEuro, formatQty, type DocModel } from './document-layout.js';
export { starterModel, buildDocx, buildOdt };
import { profileFor, defaultCgvFor } from './profiles.js';
import { getTheme } from './theme.js';
import { computeMentions, mentionLines } from './mentions.js';
import { companyDisplayName } from './company.js';
export { fileFromKey } from './storage.js';

const execFileAsync=promisify(execFile);
const esc=(s:any)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const money=(n:any)=>Number(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const dateFr=(d:any)=>new Date(d||Date.now()).toLocaleDateString('fr-FR');

export type DocData=Record<string,string>;

function storageRoot(org:string){return privateRoot(org)}
async function activeTemplate(org:string,activity:string,type:'quote'|'invoice'){const r=await query(`select * from document_templates where organization_id=$1 and (activity_id=$2 or activity_id is null) and document_type=$3 and active=true order by (activity_id is null),created_at desc limit 1`,[org,activity,type]);return r.rows[0]||null}

const withBreaks=(s:string,tag:string)=>s.replace(/\r?\n/g,tag==='w:t'?'</w:t><w:br/><w:t xml:space="preserve">':'<text:line-break/>');

/** Données d'un devis / d'une facture : variables de modèles (DOCX/ODT personnalisés) + modèle de mise en page client. */
export async function documentData(organizationId:string,quoteId:string){
 const r=await query(`select q.*,c.name client_name,c.email client_email,c.phone client_phone,c.address client_address,
 o.name company_name,o.activity company_activity,o.custom_activity company_custom_activity,o.siret,o.siren,o.legal_form organization_legal_form,o.address company_address,o.postal_code company_postal_code,o.city company_city,o.website company_website,o.logo_key,o.updated_at organization_updated_at,a.name activity_name,a.description activity_description,a.legal_form,a.payment_terms,a.insurance_info,a.mediator_info,a.legal_notes,a.quote_validity_days,a.vat_rate activity_vat_rate2,a.updated_at activity_updated_at,a.code activity_code,(select profile_code from activity_profile_overrides where activity_id=q.activity_id) profile_override,a.cgv_text activity_cgv,(select coalesce(sum(penalty_amount),0) from invoice_reminders ir where ir.quote_id=q.id) total_penalty_amount
 from quotes q left join clients c on c.id=q.client_id join organizations o on o.id=q.organization_id left join activities a on a.id=q.activity_id
 where q.id=$1 and q.organization_id=$2`,[quoteId,organizationId]);
 if(!r.rowCount) throw new Error('NOT_FOUND');
 const x=r.rows[0];
 const items=(await query('select label,quantity from quote_items where quote_id=$1 order by position',[quoteId])).rows.map((i:any)=>({label:String(i.label),quantity:formatQty(i.quantity)}));
 const profile=profileFor(x.activity_name||x.company_activity||'',x.activity_description||'',x.profile_override);
 const isInvoice=x.document_type==='invoice';
 const displayName=await companyDisplayName(organizationId,x.activity_id);
 const effectiveCompanyActivity=x.company_custom_activity||x.activity_description||x.activity_name||x.company_activity||'';
 let theme=await getTheme(organizationId);
 const styleRow=(await query('select quote_template_style,invoice_template_style from document_themes where organization_id=$1',[organizationId])).rows[0];
 const selectedStyle=isInvoice?(styleRow?.invoice_template_style||'aurion-classic'):(styleRow?.quote_template_style||'aurion-classic');
 if(selectedStyle==='aurion-minimal') theme={...theme,radius:'square',font:'sans',dark:'#162033'};
 if(selectedStyle==='aurion-signature') theme={...theme,radius:'round',font:'serif',dark:'#241b2f'};
 const effectiveLegalForm=x.legal_form||x.organization_legal_form||'';
 const mentions=computeMentions({kind:isInvoice?'invoice':'quote',profileCode:profile.code,company:{name:displayName,siret:x.siret,siren:x.siren},activity:{legal_form:effectiveLegalForm,payment_terms:x.payment_terms,insurance_info:x.insurance_info,mediator_info:x.mediator_info,legal_notes:x.legal_notes,quote_validity_days:x.quote_validity_days,vat_rate:x.vat_rate??x.activity_vat_rate2}});
 const title=isInvoice?'FACTURE':'DEVIS'; const reminderLabel=isInvoice&&Number(x.reminder_count||0)>0?`${title} · ${Number(x.reminder_count)>=4?'4e':Number(x.reminder_count)===3?'3e':Number(x.reminder_count)===2?'2e':'1ère'} relance`:title;
 let logo:DocModel['company']['logo']=null;
 if(x.logo_key){try{const f=fileFromKey(x.logo_key);const e=path.extname(f).toLowerCase();if(existsSync(f)&&['.png','.jpg','.jpeg'].includes(e))logo={data:readFileSync(f),type:e==='.png'?'png':'jpg'}}catch{}}
 const cgv=x.cgv_snapshot||x.activity_cgv||defaultCgvFor(profile.code,profile.title);
 const model:DocModel={
  kind:isInvoice?'invoice':'quote',title:isInvoice?profile.doc.invoiceTitle:profile.doc.quoteTitle,reminderLabel,number:x.number||'',date:dateFr(x.created_at),
  company:{name:displayName,activity:effectiveCompanyActivity,siret:x.siret||'',address:x.company_address||'',postalCode:x.company_postal_code||'',city:x.company_city||'',website:x.company_website||'',logo},
  client:{name:x.client_name||'',address:x.billing_address_snapshot||x.client_address||''},
  interventionLabel:profile.doc.interventionLabel,intervention:x.intervention||'',
  itemsLabel:profile.doc.itemsLabel,quantityLabel:profile.doc.quantityLabel,items,
  warranty:x.warranty_text||'',reminderPenalty:Number(x.total_penalty_amount||0)>0?money(x.total_penalty_amount):'',mileage:{km:formatQty(x.mileage_km),rate:formatEuro(x.mileage_client_rate??x.mileage_rate),total:formatEuro(x.mileage_total),visible:x.mileage_mode==='client_price'},totalTtc:formatEuro(Number(x.total_ttc||0)+Number(x.total_penalty_amount||0)),cgv,theme,legal:mentionLines(mentions),
 };
 const itemsText=items.map(i=>`${i.quantity} × ${i.label}`).join('\n');
 return {row:x,model,mentions,values:{COMPANY_NAME:displayName,LEGAL_FORM:effectiveLegalForm,PAYMENT_TERMS:(mentions.find(m=>m.key==='payment')?.text)||'',VALIDITY:(mentions.find(m=>m.key==='validity')?.text)||'',VAT_NOTICE:(mentions.find(m=>m.key==='vat')?.text)||'',INSURANCE:(mentions.find(m=>m.key==='insurance')?.text)||'',MEDIATOR:(mentions.find(m=>m.key==='mediator')?.text)||'',COMPANY_ACTIVITY:effectiveCompanyActivity,COMPANY_ADDRESS:x.company_address||'',COMPANY_POSTAL_CODE:x.company_postal_code||'',COMPANY_CITY:x.company_city||'',COMPANY_WEBSITE:x.company_website||'',SIRET:x.siret||'',SIREN:x.siren||'',DOCUMENT_TITLE:title,DOCUMENT_NUMBER:x.number||'',DATE:dateFr(x.created_at),CLIENT_NAME:x.client_name||'',CLIENT_EMAIL:x.client_email||'',CLIENT_PHONE:x.client_phone||'',CLIENT_ADDRESS:x.billing_address_snapshot||x.client_address||'',INTERVENTION:x.intervention||'',PRODUCT:x.product||itemsText.replace(/\n/g,' ; '),ITEMS:itemsText,PART_COST_HT:money(x.part_cost),SHIPPING_HT:money(x.shipping_cost),MILEAGE_KM:formatQty(x.mileage_km),MILEAGE_RATE:money(x.mileage_client_rate??x.mileage_rate),MILEAGE_TOTAL:money(x.mileage_total),LABOR_HT:money(x.margin??x.labor_cost),TOTAL_HT:money(x.total_ht),VAT_RATE:Number(x.vat_rate||0).toLocaleString('fr-FR'),VAT:money(x.total_tva),TOTAL_TTC:money(Number(x.total_ttc||0)+Number(x.total_penalty_amount||0)),LATE_PENALTY:Number(x.total_penalty_amount||0)>0?money(x.total_penalty_amount):'',URSSAF_RATE:Number(x.urssaf_rate||0).toLocaleString('fr-FR'),WARRANTY:x.warranty_text||'',CGV:cgv,STATUS:(Number(x.reminder_count||0)>0?`Relance ${Number(x.reminder_count)>=4?'4e':Number(x.reminder_count)===3?'3e':Number(x.reminder_count)===2?'2e':'1ère'} envoyée`:'Facture envoyée')+(Number(x.total_penalty_amount||0)>0?` · Majorations cumulées : ${money(x.total_penalty_amount)}`:''),LEGAL_NOTES:mentions.filter(m=>m.text).map(m=>m.text).join('\n'),LOGO_PATH:x.logo_key?fileFromKey(x.logo_key):''}};
}

function replaceAcrossTextNodes(xml:string,values:DocData,tag:string){
 const re=tag==='w:t'?/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g:/<(text:span|text:p)([^>]*)>([\s\S]*?)<\/(?:text:span|text:p)>/g;
 const nodes:{start:number,end:number,text:string,open:string,close:string}[]=[];let m:RegExpExecArray|null;while((m=re.exec(xml))){const full=m[0],open=full.slice(0,full.indexOf('>')+1),close=full.slice(full.lastIndexOf('</')),text=(tag==='w:t'?m[2]:m[3])||'';nodes.push({start:m.index,end:m.index+full.length,text,open,close})}
 let out=xml;for(const [k,val] of Object.entries(values)){const raw=`{{${k}}}`;for(let i=0;i<nodes.length;i++){let combined='',end=i;for(let j=i;j<nodes.length;j++){combined+=nodes[j]!.text;const pos=combined.indexOf(raw);if(pos>=0){const before=combined.slice(0,pos),after=combined.slice(pos+raw.length);nodes[i]!.text=before+withBreaks(esc(val),tag)+after;for(let z=i+1;z<=j;z++)nodes[z]!.text='';break}end=j;if(combined.length>raw.length+500)break}}}
 // Rebuild from right to left so offsets remain stable.
 for(let i=nodes.length-1;i>=0;i--){const n=nodes[i]!;out=out.slice(0,n.start)+n.open+n.text+n.close+out.slice(n.end)}return out
}
function replaceXml(xml:string,values:DocData){let out=xml;for(const [k,v] of Object.entries(values)){const raw=`{{${k}}}`;out=out.split(raw).join(esc(v));}return out}
function replacePlainXml(xml:string,values:DocData){let out=replaceAcrossTextNodes(xml,values,'text');for(const [k,v] of Object.entries(values)){const raw=`{{${k}}}`;out=out.split(raw).join(withBreaks(v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),'text'));}return out}

function tagAwareReplace(xml:string,values:DocData){return replaceAcrossTextNodes(xml,values,'w:t')}

async function templateDocx(templatePath:string,values:DocData,out:string){
 const zip=new AdmZip(templatePath);
 for(const e of zip.getEntries()){
   if(!e.entryName.endsWith('.xml')) continue;
   const txt=e.getData().toString('utf8');
   if(txt.includes('{{')) e.setData(Buffer.from(tagAwareReplace(txt,values),'utf8'));
 }
 await fs.writeFile(out,zip.toBuffer());
}

async function templateOdt(templatePath:string,values:DocData,out:string){
 const zip=new AdmZip(templatePath); const e=zip.getEntry('content.xml');
 if(!e) throw new Error('ODT_TEMPLATE_INVALID');
 e.setData(Buffer.from(replacePlainXml(e.getData().toString('utf8'),values),'utf8'));
 await fs.writeFile(out,zip.toBuffer());
}

export const TEMPLATE_FIELDS=['LEGAL_FORM','COMPANY_ADDRESS','COMPANY_POSTAL_CODE','COMPANY_CITY','COMPANY_WEBSITE','PAYMENT_TERMS','VALIDITY','VAT_NOTICE','INSURANCE','MEDIATOR','COMPANY_NAME','COMPANY_ACTIVITY','SIRET','SIREN','DOCUMENT_TITLE','DOCUMENT_NUMBER','DATE','CLIENT_NAME','CLIENT_EMAIL','CLIENT_PHONE','CLIENT_ADDRESS','INTERVENTION','PRODUCT','ITEMS','PART_COST_HT','SHIPPING_HT','MILEAGE_KM','MILEAGE_RATE','MILEAGE_TOTAL','LABOR_HT','TOTAL_HT','VAT_RATE','VAT','TOTAL_TTC','LATE_PENALTY','URSSAF_RATE','WARRANTY','CGV','STATUS','LEGAL_NOTES'];
export function findSoffice():string|null{
 const list=[process.env.LIBREOFFICE_PATH,'C:\\Program Files\\LibreOffice\\program\\soffice.exe','C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe','/usr/bin/soffice','/usr/bin/libreoffice'].filter(Boolean) as string[];
 for(const c of list){if(existsSync(c))return c}
 for(const dir of String(process.env.PATH||'').split(path.delimiter)){for(const n of ['soffice.exe','soffice','libreoffice']){const p=path.join(dir,n);if(dir&&existsSync(p))return p}}
 return null;
}
async function libreOfficeConvert(input:string,outDir:string,to:'pdf'|'docx'|'odt'){
 const exe=findSoffice();if(!exe) throw new Error('LIBREOFFICE_NOT_FOUND');
 const profile=path.join(STORAGE_BASE,'tmp','lo-profile');await fs.mkdir(profile,{recursive:true});
 await execFileAsync(exe,[`-env:UserInstallation=${pathToFileURL(profile).href}`,'--headless','--norestore','--convert-to',to,'--outdir',outDir,input],{timeout:90000,windowsHide:true});
 const out=path.join(outDir,path.basename(input,path.extname(input))+'.'+to);if(!existsSync(out))throw new Error('DOCUMENT_CONVERSION_FAILED');return out;
}

export async function renderDocument(organizationId:string,quoteId:string,type:'quote'|'invoice'){
 const data=await documentData(organizationId,quoteId);if(data.row.document_type!==type)throw new Error('NOT_FOUND');
 const root=storageRoot(organizationId);await fs.mkdir(root,{recursive:true});
 const tpl=await activeTemplate(organizationId,data.row.activity_id,type);
 // Réutilise les fichiers déjà générés tant que le document et le modèle n'ont pas changé.
 const previous=await query('select * from generated_documents where organization_id=$1 and quote_id=$2 and document_type=$3 order by created_at desc limit 1',[organizationId,quoteId,type]);
 const themeRow=(await query('select updated_at from document_themes where organization_id=$1',[organizationId])).rows[0];const stamp=Math.max(new Date(data.row.updated_at||0).getTime(),new Date(data.row.activity_updated_at||0).getTime(),new Date(data.row.organization_updated_at||0).getTime(),new Date(themeRow?.updated_at||0).getTime());
 if(previous.rowCount){const g=previous.rows[0];if(g.template_id===(tpl?.id||null)&&new Date(g.created_at).getTime()>=stamp&&g.docx_key&&g.odt_key&&g.pdf_key&&existsSync(fileFromKey(g.docx_key))&&existsSync(fileFromKey(g.odt_key))&&existsSync(fileFromKey(g.pdf_key)))return {id:g.id,keys:{docx:g.docx_key,odt:g.odt_key,pdf:g.pdf_key},row:data.row}}
 const base=`${(data.row.number||type).replace(/[^A-Za-z0-9_-]/g,'_')}-${Date.now()}`;
 const docx=path.join(root,`${base}.docx`),odt=path.join(root,`${base}.odt`),pdf=path.join(root,`${base}.pdf`);
 const canConvert=!!findSoffice();
 // 1) Modèle personnalisé de l'utilisateur (DOCX/ODT) : ses variables sont remplacées, sa mise en page est conservée.
 if(tpl){
  const tp=fileFromKey(tpl.storage_key);
  if(tpl.mime_type.includes('wordprocessingml'))await templateDocx(tp,data.values,docx);
  else if(tpl.mime_type.includes('opendocument'))await templateOdt(tp,data.values,odt);
  else throw new Error('TEMPLATE_FORMAT_UNSUPPORTED');
  if(canConvert){
   if(!existsSync(odt))await libreOfficeConvert(docx,root,'odt').then(async x=>{if(x!==odt)await fs.rename(x,odt)}).catch(()=>{});
   if(!existsSync(docx))await libreOfficeConvert(odt,root,'docx').then(async x=>{if(x!==docx)await fs.rename(x,docx)}).catch(()=>{});
   await libreOfficeConvert(existsSync(docx)?docx:odt,root,'pdf').then(async x=>{if(x!==pdf)await fs.rename(x,pdf)}).catch(()=>{});
  }
 }
 // 2) Mise en page native Aurion pour chaque format manquant : chaque format a ses propres styles.
 if(!existsSync(docx))await fs.writeFile(docx,await buildDocx(data.model));
 if(!existsSync(odt))await fs.writeFile(odt,buildOdt(data.model));
 if(!existsSync(pdf))await fs.writeFile(pdf,await buildPdf(data.model));
 const genId=cryptoRandom();const keys={docx:`private/${organizationId}/${path.basename(docx)}`,odt:`private/${organizationId}/${path.basename(odt)}`,pdf:`private/${organizationId}/${path.basename(pdf)}`};
 await query(`insert into generated_documents(id,organization_id,activity_id,quote_id,document_type,template_id,docx_key,odt_key,pdf_key) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[genId,organizationId,data.row.activity_id,quoteId,type,tpl?.id||null,keys.docx,keys.odt,keys.pdf]);
 return {id:genId,keys,row:data.row};
}

function cryptoRandom(){return crypto.randomUUID()}
