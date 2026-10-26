import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { privateRoot, savePrivateUpload } from '../services/storage.js';
import { pipeline } from 'node:stream/promises';
import { query } from '../db.js';
import { quotePdf, clientPdf, supplierPdf } from '../services/pdf.js';
import { renderDocument, fileFromKey, findSoffice, TEMPLATE_FIELDS } from '../services/document-renderer.js';
import AdmZip from 'adm-zip';

const documentTypes=new Set(['application/pdf','image/png','image/jpeg','image/webp','image/svg+xml','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text']);
const templateTypes=new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text']);
const logoTypes=new Set(['image/png','image/jpeg']);
const extFor=(name:string)=>{const e=path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g,'');return e.length>=2&&e.length<=10?e:'.bin'};
function contentType(ext:string){return ext==='.pdf'?'application/pdf':ext==='.docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/vnd.oasis.opendocument.text'}

export async function documentsRoutes(app:FastifyInstance){
 app.addHook('onRequest',app.requireAuth);
 app.get('/documents',async r=>({documents:(await query(`select id,original_name,mime_type,size_bytes,status,created_at from documents where organization_id=$1 and status <> 'deleted' order by created_at desc`,[r.auth!.organizationId])).rows}));
 app.post('/documents/upload',async(request,reply)=>{const part=await request.file();if(!part)return reply.badRequest('Fichier manquant.');if(!documentTypes.has(part.mimetype))return reply.badRequest('Type de fichier non autorisé.');try{const s=await savePrivateUpload(request.auth!.organizationId,part,25*1024*1024);await query(`insert into documents(id,organization_id,original_name,mime_type,size_bytes,storage_key,status) values($1,$2,$3,$4,$5,$6,'quarantined')`,[s.id,request.auth!.organizationId,part.filename,part.mimetype,s.size,`private/${request.auth!.organizationId}/${s.safe}`]);return reply.code(201).send({document:{id:s.id,originalName:part.filename,mimeType:part.mimetype,sizeBytes:s.size,status:'quarantined'}})}catch(e:any){if(e?.statusCode===413)return reply.code(413).send({error:'FILE_TOO_LARGE'});throw e}});
 app.delete('/documents/:id',async(r,reply)=>{const x=await query("update documents set status='deleted' where id=$1 and organization_id=$2 and status<>'deleted' returning storage_key",[(r.params as any).id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});try{await unlink(fileFromKey(x.rows[0].storage_key))}catch{}return {ok:true}});
 app.get('/documents/:id/download',async(r,reply)=>{const x=await query("select original_name,mime_type,storage_key from documents where id=$1 and organization_id=$2 and status<>'deleted'",[(r.params as any).id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});const d=x.rows[0];try{const buf=await readFile(fileFromKey(d.storage_key));return reply.header('Content-Type',d.mime_type).header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(d.original_name)}`).send(buf)}catch{return reply.code(404).send({error:'NOT_FOUND',message:'Fichier introuvable sur le disque.'})}});
 app.get('/document-templates/status',async()=>({libreOffice:!!findSoffice(),fields:TEMPLATE_FIELDS}));
 const styles=['aurion-minimal','aurion-classic','aurion-signature'];
 app.get('/document-template-choices',async r=>{const row=(await query('select quote_template_style,invoice_template_style from document_themes where organization_id=$1',[r.auth!.organizationId])).rows[0]||{};return {quote:row.quote_template_style||'aurion-classic',invoice:row.invoice_template_style||'aurion-classic',styles}});
 app.patch('/document-template-choices',async(r,reply)=>{const b:any=r.body||{};if(!styles.includes(b.quote)||!styles.includes(b.invoice))return reply.code(400).send({error:'INVALID_INPUT'});await query(`insert into document_themes(organization_id,accent,dark,font,radius,customized,quote_template_style,invoice_template_style) values($1,'#0b63ce','#0b1220','sans','round',false,$2,$3) on conflict(organization_id) do update set quote_template_style=excluded.quote_template_style,invoice_template_style=excluded.invoice_template_style,updated_at=now()`,[r.auth!.organizationId,b.quote,b.invoice]);return {quote:b.quote,invoice:b.invoice}});
 app.get('/document-templates',async r=>({templates:(await query(`select id,activity_id,document_type,name,mime_type,size_bytes,active,created_at from document_templates where organization_id=$1 order by created_at desc`,[r.auth!.organizationId])).rows}));
 app.post('/document-templates/upload',async(request,reply)=>{const parts=request.parts();let type:'quote'|'invoice'='quote',activityId:string|null=null,saved:any=null,fileName='',mime='';for await(const p of parts as any){if(p.type==='file'){if(!templateTypes.has(p.mimetype))return reply.code(400).send({error:'TEMPLATE_FORMAT_UNSUPPORTED'});const x=await savePrivateUpload(request.auth!.organizationId,p,25*1024*1024);saved=x;fileName=p.filename;mime=p.mimetype}else if(p.fieldname==='documentType')type=p.value==='invoice'?'invoice':'quote';else if(p.fieldname==='activityId')activityId=p.value||null}if(!saved)return reply.code(400).send({error:'FILE_MISSING'});if(activityId){const ok=await query('select id from activities where id=$1 and organization_id=$2',[activityId,request.auth!.organizationId]);if(!ok.rowCount){try{await unlink(saved.target)}catch{};return reply.code(400).send({error:'INVALID_ACTIVITY'})}}const id=randomUUID();await query(`insert into document_templates(id,organization_id,activity_id,document_type,name,mime_type,size_bytes,storage_key) values($1,$2,$3,$4,$5,$6,$7,$8)`,[id,request.auth!.organizationId,activityId,type,fileName,mime,saved.size,`private/${request.auth!.organizationId}/${saved.safe}`]);let fields:string[]=[];try{const z=new AdmZip(saved.target);let text='';for(const e of z.getEntries()){const ok=mime.includes('wordprocessingml')?/^word\/(document|header\d*|footer\d*)\.xml$/.test(e.entryName):(e.entryName==='content.xml'||e.entryName==='styles.xml');if(ok)text+=e.getData().toString('utf8').replace(/<[^>]+>/g,'')}fields=[...new Set([...text.matchAll(/\{\{([A-Z_]+)\}\}/g)].map(m=>m[1]!))]}catch{}return reply.code(201).send({id,name:fileName,documentType:type,activityId,fields,unknown:fields.filter(f=>!TEMPLATE_FIELDS.includes(f))})});
 app.delete('/document-templates/:id',async(r,reply)=>{const x=await query('delete from document_templates where id=$1 and organization_id=$2 returning storage_key',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});try{await unlink(fileFromKey(x.rows[0].storage_key))}catch{};return {ok:true}});
 app.post('/documents/render/:type/:id',async(r,reply)=>{const type=(r.params as any).type as 'quote'|'invoice';if(!['quote','invoice'].includes(type))return reply.code(400).send({error:'INVALID_INPUT'});try{return await renderDocument(r.auth!.organizationId,(r.params as any).id,type)}catch(e:any){if(e.message==='NOT_FOUND')return reply.code(404).send({error:'NOT_FOUND'});if(e.message==='PDF_CONVERSION_UNAVAILABLE')return reply.code(503).send({error:'PDF_CONVERSION_UNAVAILABLE',message:'LibreOffice est requis pour convertir les modèles DOCX/ODT en PDF.'});throw e}});
 async function generated(request:any,reply:any,type:'quote'|'invoice',id:string,ext:'docx'|'odt'|'pdf'){
  try{
   const d=await renderDocument(request.auth.organizationId,id,type);
   const buf=await readFile(fileFromKey((d.keys as any)[ext]));
   const download=ext!=='pdf'||request.query?.download==='1';   // PDF : aperçu dans le navigateur ; DOCX/ODT : téléchargement
   const name=String(d.row.number||type).replace(/[^A-Za-z0-9_-]/g,'_');
   return reply.header('Content-Type',contentType('.'+ext)).header('Content-Disposition',`${download?'attachment':'inline'}; filename="${name}.${ext}"`).header('Cache-Control','no-store').header('Content-Security-Policy',"frame-ancestors 'none'").send(buf);
  }catch(e:any){
   if(e?.message==='NOT_FOUND')return reply.code(404).send({error:'NOT_FOUND',message:'Document introuvable.'});
   request.log.error({err:e},'document generation failed');
   return reply.code(500).send({error:'DOCUMENT_FAILED',message:'Le document n’a pas pu être généré : '+String(e?.message||e)});
  }
 }
 app.get('/documents/quotes/:id.pdf',async(r,reply)=>generated(r,reply,'quote',(r.params as any).id,'pdf'));
 app.get('/documents/quotes/:id.docx',async(r,reply)=>generated(r,reply,'quote',(r.params as any).id,'docx'));
 app.get('/documents/quotes/:id.odt',async(r,reply)=>generated(r,reply,'quote',(r.params as any).id,'odt'));
 app.get('/documents/invoices/:id.pdf',async(r,reply)=>generated(r,reply,'invoice',(r.params as any).id,'pdf'));
 app.get('/documents/invoices/:id.docx',async(r,reply)=>generated(r,reply,'invoice',(r.params as any).id,'docx'));
 app.get('/documents/invoices/:id.odt',async(r,reply)=>generated(r,reply,'invoice',(r.params as any).id,'odt'));
 app.get('/documents/clients/:id.pdf',async(r,reply)=>{let x:any;try{x=await clientPdf(r.auth!.organizationId,(r.params as any).id)}catch(e:any){if(e?.message==='NOT_FOUND')return reply.code(404).send({error:'NOT_FOUND',message:'Client introuvable.'});throw e}reply.header('Content-Type','application/pdf').header('Content-Disposition',`inline; filename="fiche-client-${x.row.id}.pdf"`).send(x.buffer)});
 app.get('/documents/export-all.zip',async(r,reply)=>{
   const org=r.auth!.organizationId,zip=new AdmZip(),clients=(await query('select id,name from clients where organization_id=$1 order by name',[org])).rows;
   const docs=(await query(`select id,number,document_type from quotes where organization_id=$1 order by created_at`,[org])).rows;
   const suppliers=(await query(`select id,name from suppliers where organization_id=$1 order by name`,[org])).rows;
   for(const c of clients){try{const x=await clientPdf(org,c.id);zip.addFile(`fiches-clients/fiche-${String(c.name||c.id).replace(/[^A-Za-z0-9_-]/g,'_')}-${c.id}.pdf`,x.buffer)}catch{}}
   for(const d of docs){try{const x=await quotePdf(org,d.id);zip.addFile(`${d.document_type==='invoice'?'factures':'devis'}/${String(d.number||d.id).replace(/[^A-Za-z0-9_-]/g,'_')}.pdf`,x.buffer)}catch{}}
   for(const s of suppliers){try{const x=await supplierPdf(org,s.id);zip.addFile(`fournisseurs/fiche-${String(s.name||s.id).replace(/[^A-Za-z0-9_-]/g,'_')}-${s.id}.pdf`,x.buffer)}catch{}}
   const aid=(await query('select id from activities where organization_id=$1 and active=true order by created_at limit 1',[org])).rows[0]?.id;
   if(aid){try{const {accountingReportPdf}=await import('../services/accounting-report.js');const year=Number((r.query as any)?.year)||new Date().getFullYear();const x=await accountingReportPdf(org,aid,year);zip.addFile(`comptabilite/comptabilite-${year}.pdf`,x.buffer)}catch{}}
   const buf=zip.toBuffer();return reply.header('Content-Type','application/zip').header('Content-Disposition','attachment; filename="aurion-donnees.zip"').header('Cache-Control','no-store').send(buf);
 });
 app.get('/documents/logo',async(request,reply)=>{const row=(await query('select logo_key from organizations where id=$1',[request.auth!.organizationId])).rows[0];if(!row?.logo_key)return reply.code(404).send({error:'NOT_FOUND',message:'Aucun logo enregistré.'});try{const key=String(row.logo_key);const ext=path.extname(key).toLowerCase();const mime=ext==='.png'?'image/png':(ext==='.jpg'||ext==='.jpeg')?'image/jpeg':'application/octet-stream';const buf=await readFile(fileFromKey(key));return reply.header('Content-Type',mime).header('Cache-Control','no-store').header('Content-Security-Policy',"img-src 'self' blob: data:").send(buf)}catch{return reply.code(404).send({error:'NOT_FOUND',message:'Logo introuvable.'})}});
 app.post('/documents/logo',async(request,reply)=>{const part=await request.file();if(!part||!logoTypes.has(part.mimetype))return reply.code(400).send({error:'INVALID_LOGO'});const s=await savePrivateUpload(request.auth!.organizationId,part,5*1024*1024);await query('update organizations set logo_key=$1,updated_at=now() where id=$2',[`private/${request.auth!.organizationId}/${s.safe}`,request.auth!.organizationId]);return{ok:true}});
}
