import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { privateRoot, savePrivateUpload, readPrivateObject, deletePrivateObject } from '../services/storage.js';
import { pipeline } from 'node:stream/promises';
import { query } from '../db.js';
import { quotePdf, clientPdf, supplierPdf } from '../services/pdf.js';
import { renderDocument, findSoffice, TEMPLATE_FIELDS } from '../services/document-renderer.js';
import AdmZip from 'adm-zip';
import { addBrandLogoAssets, addBrandGuideFiles, addBrandGuidePdf, brandBundleReadme } from '../services/brand-assets.js';

const documentTypes=new Set(['application/pdf','image/png','image/jpeg','image/webp','image/svg+xml','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text']);
const templateTypes=new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text']);
const logoTypes=new Set(['image/png','image/jpeg']);
const extFor=(name:string)=>{const e=path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g,'');return e.length>=2&&e.length<=10?e:'.bin'};
function contentType(ext:string){return ext==='.pdf'?'application/pdf':ext==='.docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/vnd.oasis.opendocument.text'}

export async function documentsRoutes(app:FastifyInstance){
 app.addHook('onRequest',app.requireAuth);
 app.get('/documents',async r=>({documents:(await query(`select id,original_name,mime_type,size_bytes,status,created_at from documents where organization_id=$1 and status <> 'deleted' order by created_at desc`,[r.auth!.organizationId])).rows}));
 app.post('/documents/upload',async(request,reply)=>{const part=await request.file();if(!part)return reply.badRequest('Fichier manquant.');if(!documentTypes.has(part.mimetype))return reply.badRequest('Type de fichier non autorisé.');try{const s=await savePrivateUpload(request.auth!.organizationId,part,25*1024*1024);await query(`insert into documents(id,organization_id,original_name,mime_type,size_bytes,storage_key,status) values($1,$2,$3,$4,$5,$6,'quarantined')`,[s.id,request.auth!.organizationId,part.filename,part.mimetype,s.size,`private/${request.auth!.organizationId}/${s.safe}`]);return reply.code(201).send({document:{id:s.id,originalName:part.filename,mimeType:part.mimetype,sizeBytes:s.size,status:'quarantined'}})}catch(e:any){if(e?.statusCode===413)return reply.code(413).send({error:'FILE_TOO_LARGE'});throw e}});
 app.delete('/documents/:id',async(r,reply)=>{const x=await query("update documents set status='deleted' where id=$1 and organization_id=$2 and status<>'deleted' returning storage_key",[(r.params as any).id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});try{await deletePrivateObject(x.rows[0].storage_key)}catch{}return {ok:true}});
 app.get('/documents/:id/download',async(r,reply)=>{const x=await query("select original_name,mime_type,storage_key from documents where id=$1 and organization_id=$2 and status<>'deleted'",[(r.params as any).id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});const d=x.rows[0];try{const buf=await readPrivateObject(d.storage_key);return reply.header('Content-Type',d.mime_type).header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(d.original_name)}`).send(buf)}catch{return reply.code(404).send({error:'NOT_FOUND',message:'Fichier introuvable sur le disque.'})}});
 app.get('/document-templates/status',async()=>({libreOffice:!!findSoffice(),fields:TEMPLATE_FIELDS}));
 const styles=['aurion-minimal','aurion-classic','aurion-signature'];
 app.get('/document-template-choices',async r=>{const row=(await query('select quote_template_style,invoice_template_style from document_themes where organization_id=$1',[r.auth!.organizationId])).rows[0]||{};return {quote:row.quote_template_style||'aurion-classic',invoice:row.invoice_template_style||'aurion-classic',styles}});
 app.patch('/document-template-choices',async(r,reply)=>{const b:any=r.body||{};if(!styles.includes(b.quote)||!styles.includes(b.invoice))return reply.code(400).send({error:'INVALID_INPUT'});await query(`insert into document_themes(organization_id,accent,dark,font,radius,customized,quote_template_style,invoice_template_style) values($1,'#0b63ce','#0b1220','sans','round',false,$2,$3) on conflict(organization_id) do update set quote_template_style=excluded.quote_template_style,invoice_template_style=excluded.invoice_template_style,updated_at=now()`,[r.auth!.organizationId,b.quote,b.invoice]);return {quote:b.quote,invoice:b.invoice}});
 app.get('/document-templates',async r=>({templates:(await query(`select id,activity_id,document_type,name,mime_type,size_bytes,active,created_at from document_templates where organization_id=$1 order by created_at desc`,[r.auth!.organizationId])).rows}));
 app.post('/document-templates/upload',async(request,reply)=>{const parts=request.parts();let type:'quote'|'invoice'='quote',activityId:string|null=null,saved:any=null,fileName='',mime='';for await(const p of parts as any){if(p.type==='file'){if(!templateTypes.has(p.mimetype))return reply.code(400).send({error:'TEMPLATE_FORMAT_UNSUPPORTED'});const x=await savePrivateUpload(request.auth!.organizationId,p,25*1024*1024);saved=x;fileName=p.filename;mime=p.mimetype}else if(p.fieldname==='documentType')type=p.value==='invoice'?'invoice':'quote';else if(p.fieldname==='activityId')activityId=p.value||null}if(!saved)return reply.code(400).send({error:'FILE_MISSING'});if(activityId){const ok=await query('select id from activities where id=$1 and organization_id=$2',[activityId,request.auth!.organizationId]);if(!ok.rowCount){try{await unlink(saved.target)}catch{};return reply.code(400).send({error:'INVALID_ACTIVITY'})}}const id=randomUUID();await query(`insert into document_templates(id,organization_id,activity_id,document_type,name,mime_type,size_bytes,storage_key) values($1,$2,$3,$4,$5,$6,$7,$8)`,[id,request.auth!.organizationId,activityId,type,fileName,mime,saved.size,`private/${request.auth!.organizationId}/${saved.safe}`]);let fields:string[]=[];try{const z=new AdmZip(saved.target);let text='';for(const e of z.getEntries()){const ok=mime.includes('wordprocessingml')?/^word\/(document|header\d*|footer\d*)\.xml$/.test(e.entryName):(e.entryName==='content.xml'||e.entryName==='styles.xml');if(ok)text+=e.getData().toString('utf8').replace(/<[^>]+>/g,'')}fields=[...new Set([...text.matchAll(/\{\{([A-Z_]+)\}\}/g)].map(m=>m[1]!))]}catch{}return reply.code(201).send({id,name:fileName,documentType:type,activityId,fields,unknown:fields.filter(f=>!TEMPLATE_FIELDS.includes(f))})});
 app.delete('/document-templates/:id',async(r,reply)=>{const x=await query('delete from document_templates where id=$1 and organization_id=$2 returning storage_key',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});try{await deletePrivateObject(x.rows[0].storage_key)}catch{};return {ok:true}});
 app.post('/documents/render/:type/:id',async(r,reply)=>{const type=(r.params as any).type as 'quote'|'invoice';if(!['quote','invoice'].includes(type))return reply.code(400).send({error:'INVALID_INPUT'});try{return await renderDocument(r.auth!.organizationId,(r.params as any).id,type)}catch(e:any){if(e.message==='NOT_FOUND')return reply.code(404).send({error:'NOT_FOUND'});if(e.message==='PDF_CONVERSION_UNAVAILABLE')return reply.code(503).send({error:'PDF_CONVERSION_UNAVAILABLE',message:'LibreOffice est requis pour convertir les modèles DOCX/ODT en PDF.'});throw e}});
 async function generated(request:any,reply:any,type:'quote'|'invoice',id:string,ext:'docx'|'odt'|'pdf'){
  try{
   const d=await renderDocument(request.auth.organizationId,id,type);
   const buf=await readPrivateObject(String((d.keys as any)[ext]));
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
   // Les fichiers individuellement indisponibles ne bloquent pas l'archive, mais leur absence est tracée.
   const exportWarnings:string[]=[];
   const exportOmissions={clientPdfs:0,quotePdfs:0,supplierPdfs:0,storedDocuments:0,templateFiles:0,generatedDocumentFiles:0,brandLogo:0,invalidArchivePaths:0};
   const includedDocumentIds=new Set<string>();
   let clientPdfsIncluded=0,quotePdfsIncluded=0,supplierPdfsIncluded=0,storedCount=0,templateFilesIncluded=0,generatedDocumentFilesIncluded=0,brandLogoIncluded=false;
   for(const c of clients){try{const x=await clientPdf(org,c.id);zip.addFile(`fiches-clients/fiche-${String(c.name||c.id).replace(/[^A-Za-z0-9_-]/g,'_')}-${c.id}.pdf`,x.buffer);clientPdfsIncluded++;}catch(err){exportOmissions.clientPdfs++;r.log.warn({err,clientId:c.id},'Client PDF omitted from full data export');}}
   for(const doc of docs){try{const x=await quotePdf(org,doc.id);zip.addFile(`${doc.document_type==='invoice'?'factures':'devis'}/${String(doc.number||doc.id).replace(/[^A-Za-z0-9_-]/g,'_')}.pdf`,x.buffer);quotePdfsIncluded++;}catch(err){exportOmissions.quotePdfs++;r.log.warn({err,documentId:doc.id},'Quote or invoice PDF omitted from full data export');}}
   for(const supplier of suppliers){try{const x=await supplierPdf(org,supplier.id);zip.addFile(`fournisseurs/fiche-${String(supplier.name||supplier.id).replace(/[^A-Za-z0-9_-]/g,'_')}-${supplier.id}.pdf`,x.buffer);supplierPdfsIncluded++;}catch(err){exportOmissions.supplierPdfs++;r.log.warn({err,supplierId:supplier.id},'Supplier PDF omitted from full data export');}}
   const aid=(await query('select id from activities where organization_id=$1 and active=true order by created_at limit 1',[org])).rows[0]?.id;
   const requestedYear=Number((r.query as any)?.year);
   const accountingReportYear=Number.isInteger(requestedYear)&&requestedYear>=1900&&requestedYear<=2100?requestedYear:new Date().getFullYear();
   let accountingReportPdfIncluded=false;
   const exportWarnings:string[]=[];
   if(aid){
     try{
       const {accountingReportPdf}=await import('../services/accounting-report.js');
       const report=await accountingReportPdf(org,aid,accountingReportYear);
       zip.addFile(`comptabilite/comptabilite-${accountingReportYear}.pdf`,report.buffer);
       accountingReportPdfIncluded=true;
     }catch(err){
       r.log.warn({err},'Accounting PDF omitted from data export');
       exportWarnings.push('Le rapport comptable PDF n’a pas pu être inclus. Vérifiez le journal d’Aurion avant d’utiliser cet export.');
     }
   }else{
     exportWarnings.push('Le rapport comptable PDF n’a pas été inclus : aucune activité active n’a été trouvée.');
   }
   // Ajouts rétrocompatibles à l'export historique : dossier administratif, état du parcours,
   // signature, adresses d'intervention et fichiers réellement présents dans le stockage privé.
   const orgData=(await query(`select id,name,activity,custom_activity,siren,siret,legal_form,address,postal_code,city,website,configuration_incomplete,logo_key from organizations where id=$1`,[org])).rows[0]||{};
   // La clé de stockage est interne : elle sert à récupérer le logo, mais n'est pas exportée.
   const logoStorageKey=orgData.logo_key;
   delete orgData.logo_key;
   const themeRow=(await query(`select accent,dark,font,radius,customized,quote_template_style,invoice_template_style from document_themes where organization_id=$1`,[org])).rows[0]||null;
   const signatureRow=(await query(`select enabled,first_name,last_name,job_title,company,phone,website,address,extra,include_quotes,include_invoices,include_professional,signature_html,signature_text,updated_at from email_signatures where organization_id=$1`,[org])).rows[0]||null;
   const journeyRow=(await query(`select status,current_step,business_status,data,first_redirect_at,completed_at,created_at,updated_at from onboarding_journeys where organization_id=$1`,[org])).rows[0]||null;
   const formalitiesRows=(await query(`select id,activity_id,title,organization_name,category,applicability,status,official_url,source_label,source_checked_at,certainty,missing_information,prerequisites,next_action,rationale,notes,prepared_email,provider_message_id,provider_thread_id,expected_sender_domain,reference_tokens,manual_evidence,declared_completed_at,proven_completed_at,history,created_at,updated_at from administrative_formalities where organization_id=$1 order by created_at`,[org])).rows;
   const mailRows=(await query(`select id,formality_id,provider,provider_message_id,thread_id,sender,subject,received_at,category,confidence,minimal_excerpt,safe_open_url,user_confirmed,created_at from administrative_mail_items where organization_id=$1 order by received_at nulls last,created_at`,[org])).rows;
   const adminDocs=(await query(`select l.formality_id,l.purpose,d.id,d.original_name,d.mime_type,d.size_bytes,d.storage_key,d.status,d.created_at from administrative_document_links l join documents d on d.id=l.document_id and d.organization_id=l.organization_id where l.organization_id=$1 and d.status<>'deleted' order by d.created_at`,[org])).rows;
   const interventions=(await query(`select a.id,a.client_id,c.name as client_name,a.label,a.address,a.is_default,a.is_active,a.created_at,a.updated_at from client_intervention_addresses a join clients c on c.id=a.client_id and c.organization_id=a.organization_id where a.organization_id=$1 order by c.name,a.created_at`,[org])).rows;
   const storedDocs=(await query(`select id,original_name,mime_type,size_bytes,storage_key,status,created_at from documents where organization_id=$1 and status<>'deleted' order by created_at`,[org])).rows;
   const safeName=(name:any)=>String(name||'document').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^\.+/,'').slice(0,150)||'document';
   const addStoredFile=async (key:any, archiveName:string)=>{
     if(!key)return false;
     const normalizedName=archiveName.replace(/\\/g,'/');
     if(normalizedName.startsWith('/')||normalizedName.split('/').some(part=>!part||part==='.'||part==='..')){
       exportOmissions.invalidArchivePaths++;
       r.log.warn({archiveName:normalizedName},'Unsafe archive entry path rejected');
       return false;
     }
     try{const bytes=await readPrivateObject(String(key));zip.addFile(normalizedName,bytes);return true;}
     catch(err){r.log.warn({err,archiveName:normalizedName},'Stored file omitted from full data export');return false;}
   };
   const putJson=(name:string,data:any)=>zip.addFile(name,Buffer.from(JSON.stringify(data,null,2),'utf8'));
   putJson('dossier-administratif/entreprise.json',orgData);
   putJson('dossier-administratif/parcours.json',journeyRow);
   putJson('dossier-administratif/formalites.json',formalitiesRows);

   putJson('dossier-administratif/messages-detectes.json',mailRows);
   putJson('dossier-administratif/journal-de-bord.json',(await query(`select event_type,title,description,severity,source,internal_path,external_url,dedupe_key,is_read,resolved_at,created_at from dashboard_journal_events where organization_id=$1 order by created_at`,[org])).rows);
   putJson('clients/adresses-intervention.json',interventions);
   putJson('parametres/signature-email.json',signatureRow);
   for(const storedDoc of storedDocs){const ok=await addStoredFile(storedDoc.storage_key,`dossier-administratif/fichiers/${safeName(storedDoc.id)}-${safeName(storedDoc.original_name)}`);if(ok){storedCount++;includedDocumentIds.add(String(storedDoc.id));}else exportOmissions.storedDocuments++;}
   putJson('dossier-administratif/documents-index.json',adminDocs.map(({storage_key,...doc}:any)=>({...doc,storedInArchive:includedDocumentIds.has(String(doc.id))})));
   // Les modèles et versions ne sont pas forcément enregistrés dans la table documents.
   const templates=(await query(`select id,activity_id,document_type,name,mime_type,size_bytes,storage_key,active,source,file_format,mapping_status,version,created_at,updated_at from document_templates where organization_id=$1 order by created_at`,[org])).rows;
   putJson('modeles-documents/index.json',templates.map(({storage_key,...row}:any)=>row));
   const templateFilesExpected=templates.filter((t:any)=>Boolean(t.storage_key)).length;
   for(const t of templates){if(!t.storage_key)continue;if(await addStoredFile(t.storage_key,`modeles-documents/${safeName(t.id)}-${safeName(t.name)}`))templateFilesIncluded++;else exportOmissions.templateFiles++;}
   const generated=(await query(`select id,activity_id,quote_id,document_type,template_id,docx_key,odt_key,pdf_key,created_at from generated_documents where organization_id=$1 order by created_at`,[org])).rows;
   const generatedDocumentFilesExpected=generated.reduce((total:number,g:any)=>total+[g.docx_key,g.odt_key,g.pdf_key].filter(Boolean).length,0);
   putJson('documents-generes/index.json',generated.map(({docx_key,odt_key,pdf_key,...row}:any)=>row));
   for(const g of generated){for(const [ext,key] of [['docx',g.docx_key],['odt',g.odt_key],['pdf',g.pdf_key]] as const){if(!key)continue;if(await addStoredFile(key,`documents-generes/${safeName(g.id)}.${ext}`))generatedDocumentFilesIncluded++;else exportOmissions.generatedDocumentFiles++;}}
   // Bundle visuel réel : fichiers persistés uniquement, et absence explicitement documentée.
   const brandZip=new AdmZip();
   const palette={organization:orgData.name||'',activity:orgData.activity||'',accent:themeRow?.accent||'#0b63ce',dark:themeRow?.dark||'#0b1220',font:themeRow?.font||'sans',radius:themeRow?.radius||'round',documentThemeCustomized:Boolean(themeRow?.customized),quoteTemplate:themeRow?.quote_template_style||'aurion-classic',invoiceTemplate:themeRow?.invoice_template_style||'aurion-classic'};
   brandZip.addFile('palette.json',Buffer.from(JSON.stringify(palette,null,2),'utf8'));
   if(signatureRow?.signature_html)brandZip.addFile('signature/signature.html',Buffer.from(String(signatureRow.signature_html),'utf8'));
   if(signatureRow?.signature_text)brandZip.addFile('signature/signature.txt',Buffer.from(String(signatureRow.signature_text),'utf8'));
   let logoBuffer:Buffer|undefined;
   if(logoStorageKey){try{const logo=await readPrivateObject(String(logoStorageKey));const ext=path.extname(String(logoStorageKey)).toLowerCase();if(['.png','.jpg','.jpeg'].includes(ext)){addBrandLogoAssets(brandZip,logo,ext,palette.accent,palette.dark);logoBuffer=logo;brandLogoIncluded=true;}else{exportOmissions.brandLogo++;r.log.warn({extension:ext},'Organization logo omitted from visual identity bundle: unsupported file extension');}}catch(err){exportOmissions.brandLogo++;r.log.warn({err},'Organization logo omitted from visual identity bundle');}}
   addBrandGuideFiles(brandZip,{companyName:orgData.name,activity:orgData.activity,accent:palette.accent,dark:palette.dark,font:palette.font,radius:palette.radius});
   await addBrandGuidePdf(brandZip,{companyName:orgData.name,activity:orgData.activity,accent:palette.accent,dark:palette.dark,font:palette.font,radius:palette.radius},logoBuffer);
   brandZip.addFile('README.txt',Buffer.from(brandBundleReadme(orgData.name,brandZip.getEntries().map(entry=>entry.entryName)),'utf8'));
   zip.addFile('identite-visuelle.zip',brandZip.toBuffer());
   const omissionLabels:Record<string,string>={clientPdfs:'fiche(s) client PDF',quotePdfs:'devis/facture(s) PDF',supplierPdfs:'fiche(s) fournisseur PDF',storedDocuments:'document(s) stocké(s)',templateFiles:'fichier(s) de modèle',generatedDocumentFiles:'fichier(s) de document généré',brandLogo:'logo(s) d’entreprise',invalidArchivePaths:'chemin(s) interne(s) rejeté(s)'};
   for(const [key,count] of Object.entries(exportOmissions))if(count>0)exportWarnings.push(`${count} ${omissionLabels[key]||key} n’ont pas été inclus dans l’export complet. Consultez le journal d’Aurion pour les détails.`);
   putJson('export-manifest.json',{formatVersion:4,generatedAt:new Date().toISOString(),organizationId:org,contents:{clients:clients.length,clientPdfsIncluded,quotes:docs.length,quotePdfsIncluded,suppliers:suppliers.length,supplierPdfsIncluded,storedDocuments:storedDocs.length,storedDocumentsIncluded:storedCount,administrativeFormalities:formalitiesRows.length,detectedMailMetadata:mailRows.length,interventionAddresses:interventions.length,templates:templates.length,templateFilesExpected,templateFilesIncluded,generatedDocuments:generated.length,generatedDocumentFilesExpected,generatedDocumentFilesIncluded,journeyIncluded:Boolean(journeyRow),identityBundle:true,brandLogoIncluded,accountingReportPdfIncluded,accountingReportYear},omissions:exportOmissions,warnings:exportWarnings,security:{oauthTokensIncluded:false,secretsIncluded:false,crossOrganizationDataIncluded:false,internalStorageKeysIncluded:false}});
   const buf=zip.toBuffer();return reply.header('Content-Type','application/zip').header('Content-Disposition','attachment; filename="aurion-donnees.zip"').header('Cache-Control','no-store').send(buf);
 });
 app.get('/documents/logo',async(request,reply)=>{const row=(await query('select logo_key from organizations where id=$1',[request.auth!.organizationId])).rows[0];if(!row?.logo_key)return reply.code(404).send({error:'NOT_FOUND',message:'Aucun logo enregistré.'});try{const key=String(row.logo_key);const ext=path.extname(key).toLowerCase();const mime=ext==='.png'?'image/png':(ext==='.jpg'||ext==='.jpeg')?'image/jpeg':'application/octet-stream';const buf=await readPrivateObject(key);return reply.header('Content-Type',mime).header('Cache-Control','no-store').header('Content-Security-Policy',"img-src 'self' blob: data:").send(buf)}catch{return reply.code(404).send({error:'NOT_FOUND',message:'Logo introuvable.'})}});
 app.post('/documents/logo',async(request,reply)=>{const part=await request.file();if(!part||!logoTypes.has(part.mimetype))return reply.code(400).send({error:'INVALID_LOGO'});const s=await savePrivateUpload(request.auth!.organizationId,part,5*1024*1024);try{const head=(await readFile(s.target)).subarray(0,12),ext=path.extname(part.filename).toLowerCase();const valid=part.mimetype==='image/png'?ext==='.png'&&head.length>=8&&head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):['.jpg','.jpeg'].includes(ext)&&head.length>=3&&head[0]===0xff&&head[1]===0xd8&&head[2]===0xff;if(!valid){await unlink(s.target).catch(()=>{});return reply.code(400).send({error:'FILE_CONTENT_MISMATCH',message:'Le contenu réel du logo ne correspond pas au format PNG ou JPEG annoncé.'});}await query('update organizations set logo_key=$1,updated_at=now() where id=$2',[`private/${request.auth!.organizationId}/${s.safe}`,request.auth!.organizationId]);return{ok:true,stored:true};}catch(e){await unlink(s.target).catch(()=>{});throw e}});
}
