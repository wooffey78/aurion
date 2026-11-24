import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { savePrivateUpload, savePrivateBuffer, readPrivateObject, deletePrivateObject } from '../services/storage.js';
import { publishInTransaction } from '../services/events-outbox.js';
import { query } from '../db.js';
import { sniffMime, decideUpload, sha256Hex, isKnownCategory, DOCUMENT_CATEGORIES } from '../services/doc-security.js';
import { quotePdf, clientPdf, supplierPdf } from '../services/pdf.js';
import { renderDocument, findSoffice, TEMPLATE_FIELDS } from '../services/document-renderer.js';
import { extractText, parseBordereau, matchCatalogItems } from '../services/bordereau-parser.js';
import AdmZip from 'adm-zip';
import { execFileSync } from 'node:child_process';

/** Activité courante (en-tête x-aurion-activity-id) — identique au reste des routes métier. */
async function ensureActivitySafe(r:any):Promise<string|null>{
  const header=String(r.headers['x-aurion-activity-id']||'');
  if(header){const ok=await query('select id from activities where id=$1 and organization_id=$2',[header,r.auth!.organizationId]);if(ok.rowCount)return header;}
  const first=(await query("select id from activities where organization_id=$1 and code='principale' order by created_at asc limit 1",[r.auth!.organizationId])).rows[0];
  return first?.id||null;
}

const documentTypes=new Set(['application/pdf','image/png','image/jpeg','image/webp','image/svg+xml','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text']);
const extFor=(name:string)=>{const e=path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g,'');return e.length>=2&&e.length<=10?e:'.bin'};
function contentType(ext:string){return ext==='.pdf'?'application/pdf':ext==='.docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/vnd.oasis.opendocument.text'}

export async function documentsRoutes(app:FastifyInstance){
 app.addHook('onRequest',app.requireAuth);
 // Bloc 12 — lecture déterministe d'un bordereau professionnel : extraction de texte
 // (pdftotext/LibreOffice pour les PDF texte, TXT/CSV en direct), analyse de tableaux,
 // formats français. AUCUNE écriture : le module retourne les valeurs détectées avec leur
 // source, leur confiance et les champs manquants ; l'utilisateur corrige tout.
 app.post('/documents/parse-bordereau',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(request,reply)=>{
   const part=await request.file();
   if(!part)return reply.code(400).send({error:'FILE_MISSING',message:'Fournissez un bordereau (PDF texte, TXT ou CSV).'});
   if(part.file.bytesRead>25*1024*1024)return reply.code(413).send({error:'FILE_TOO_LARGE'});
   const chunks:Buffer[]=[];for await(const c of part.file)chunks.push(c as Buffer);
   const buffer=Buffer.concat(chunks);
   const run=(cmd:string,args:string[],input:Buffer):Promise<string>=>new Promise((resolve,reject)=>{
     try{const out=execFileSync(cmd,args,{input,maxBuffer:64*1024*1024,timeout:20000});resolve(out.toString('utf8'))}catch(e:any){reject(e)}
   });
   try{
     const text=await extractText(part.filename,part.mimetype,buffer,run);
     const parsed=parseBordereau(text);
     const catalog=(await query('select id,name from parts where organization_id=$1 and activity_id=$2 order by name limit 500',[request.auth!.organizationId,await ensureActivitySafe(request)])).rows;
     return {fileName:part.filename,linesAnalyzed:parsed.linesAnalyzed,fields:parsed.fields,items:matchCatalogItems(parsed.items,catalog as any),totals:parsed.totals,missing:parsed.missing,warnings:parsed.warnings,catalogOnly:true};
   }catch(e:any){
     return reply.code(422).send({error:'PARSE_FAILED',message:String(e?.message||e)});
   }
 });
 // Bloc 16 — liste du dépôt central : recherche insensible aux accents, filtres déterministes
 // (catégorie, type MIME), lien vers objet métier. La corbeille (deleted) et la purge (purged)
 // ne sont plus servies ici.
 app.get('/documents',async r=>{
   const org=r.auth!.organizationId,q=String((r.query as any)?.q||'').trim(),category=String((r.query as any)?.category||'').trim();
   const entityType=String((r.query as any)?.entityType||'').trim(),entityId=String((r.query as any)?.entityId||'').trim();
   const params:unknown[]=[org];let filters='';
   if(q){params.push(`%${q}%`);filters+=` and (aurion_unaccent(original_name) like aurion_unaccent($${params.length}) or coalesce(category,'') ilike $${params.length})`}
   if(category){params.push(category);filters+=` and category=$${params.length}`}
   if(entityType&&/^[0-9a-f-]{36}$/i.test(entityId)){
     params.push(entityType,params.length>0?entityId:null);
     filters+=` and exists (select 1 from document_links dl where dl.document_id=documents.id and dl.entity_type=$${params.length-1} and dl.entity_id=$${params.length})`;
   }
   const rows=(await query(`select id,original_name,mime_type,detected_mime as "detectedMime",size_bytes as "sizeBytes",status,category,sha256,validated_at as "validatedAt",created_at as "createdAt" from documents where organization_id=$1 and status not in ('deleted','purged')${filters} order by created_at desc limit 500`,params)).rows;
   return {documents:rows,categories:DOCUMENT_CATEGORIES};
 });
 // Bloc 16 — upload durci : détection du type réel par octets magiques (jamais confiance au
 // MIME déclaré), empreinte SHA-256 systématique, catégorie déterministe. Un contenu dangereux
 // ou usurpé (EXE renommé en .pdf…) est REFUSÉ et supprimé : aucun statut ambigu, aucun succès simulé.
 app.post('/documents/upload',async(request,reply)=>{
   const part=await request.file();if(!part)return reply.badRequest('Fichier manquant.');
   if(!documentTypes.has(part.mimetype))return reply.badRequest('Type de fichier non autorisé.');
   const category=String((request.query as any)?.category||'').trim();
   if(category&&!isKnownCategory(category))return reply.code(400).send({error:'INVALID_CATEGORY',message:'Catégorie inconnue : choisissez une catégorie déterministe de la liste.',categories:DOCUMENT_CATEGORIES});
   try{
     const chunks:Buffer[]=[];for await(const c of part.file)chunks.push(c as Buffer);
     const buffer=Buffer.concat(chunks);
     const sniff=sniffMime(buffer);
     const decision=decideUpload(part.mimetype,sniff);
     if(!decision.accepted){
       return reply.code(415).send({error:decision.reason,message:'Le contenu du fichier ne correspond pas à un format autorisé (détection par signature). Le fichier a été refusé.',detectedMime:decision.detectedMime});
     }
     const hash=sha256Hex(buffer);
     const s=await savePrivateBuffer(request.auth!.organizationId,part.filename,buffer,25*1024*1024);
     const inserted=await query(`insert into documents(id,organization_id,original_name,mime_type,detected_mime,size_bytes,storage_key,status,category,sha256,validated_at,validated_by)
       values($1,$2,$3,$4,$5,$6,$7,'clean',$8,$9,now(),$10) returning id`,
       [s.id,request.auth!.organizationId,part.filename,part.mimetype,decision.detectedMime,s.size,`private/${request.auth!.organizationId}/${s.safe}`,category||null,hash,request.auth!.userId]);
     return reply.code(201).send({document:{id:String(inserted.rows[0].id),originalName:part.filename,mimeType:part.mimetype,detectedMime:decision.detectedMime,sizeBytes:s.size,status:'clean',category:category||null,sha256:hash}});
   }catch(e:any){
     if(e?.statusCode===413)return reply.code(413).send({error:'FILE_TOO_LARGE'});
     throw e;
   }
 });
 // Bloc 16 — corbeille : suppression LOGIQUE (le fichier reste restaurable), partage lié
 // automatiquement indisponible (le téléchargement public exige un document « clean »).
 app.delete('/documents/:id',async(r,reply)=>{const x=await query("update documents set status='deleted',deleted_at=now(),deleted_by=$3 where id=$1 and organization_id=$2 and status not in ('deleted','purged') returning id",[(r.params as any).id,r.auth!.organizationId,r.auth!.userId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true,trashed:true,note:'Le justificatif est en corbeille : restaurez-le ou purgez-le définitivement.'}});
 // Bloc 16 — restauration depuis la corbeille.
 app.post('/documents/:id/restore',async(r,reply)=>{const x=await query("update documents set status='clean',deleted_at=null,deleted_by=null where id=$1 and organization_id=$2 and status='deleted' returning id",[(r.params as any).id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND',message:'Aucun document en corbeille à restaurer.'});return {ok:true}});
 // Bloc 16 — purge définitive : le fichier physique n'est supprimé qu'APRÈS contrôle des
 // références (liens métier, demandes comptable). La ligne reste pour la piste d'audit.
 app.post('/documents/:id/purge',async(r,reply)=>{
   const id=(r.params as any).id,org=r.auth!.organizationId;
   const doc=(await query("select id,storage_key from documents where id=$1 and organization_id=$2 and status='deleted'",[id,org])).rows[0];
   if(!doc)return reply.code(404).send({error:'NOT_FOUND',message:'La purge s\'applique uniquement à un document en corbeille.'});
   const linked=(await query('select 1 from document_links where document_id=$1 and organization_id=$2 limit 1',[id,org])).rowCount;
   if(linked)return reply.code(409).send({error:'DOCUMENT_REFERENCED',message:'Ce document est associé à au moins un objet métier : détachez les liens avant la purge définitive.'});
   const requested=(await query('select 1 from accountant_requests where document_id=$1 and organization_id=$2 limit 1',[id,org])).rowCount;
   if(requested)return reply.code(409).send({error:'DOCUMENT_REFERENCED',message:'Ce document est référencé par une demande comptable : résolvez ou détachez la demande avant la purge.'});
   try{await deletePrivateObject(String(doc.storage_key))}catch{}
   await query("update documents set status='purged',purge_at=now() where id=$1 and organization_id=$2",[id,org]);
   return {ok:true,purged:true};
 });
 app.get('/documents/:id/download',async(r,reply)=>{const x=await query("select original_name,mime_type,storage_key,created_at from documents where id=$1 and organization_id=$2 and status not in ('deleted','purged')",[(r.params as any).id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});const d=x.rows[0];
    // Bloc 6-bis — ETag faible (version du justificatif) : le pré-téléchargement hors connexion
    // peut vérifier la fraîcheur sans retélécharger (If-None-Match → 304).
    const etag=`W/"${createHash('sha256').update(String(d.storage_key)+String(d.created_at)).digest('hex').slice(0,24)}"`;
    if((r.headers['if-none-match']||'')===etag)return reply.code(304).header('ETag',etag).send();
    try{const buf=await readPrivateObject(d.storage_key);return reply.header('ETag',etag).header('Content-Type',d.mime_type).header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(d.original_name)}`).send(buf)}catch{return reply.code(404).send({error:'NOT_FOUND',message:'Fichier introuvable sur le disque.'})}});
 // Bloc 16 / Bloc 14 — liens multi-objets : un même document associé à plusieurs objets métier
 // SANS duplication physique du fichier. L'objet lié est vérifié dans l'organisation (aucune
 // référence croisée inter-tenant, aucune entité fantôme).
 const LINK_ENTITIES:Record<string,{table:string}> = {
   quote:{table:'quotes'},invoice:{table:'quotes'},client:{table:'clients'},supplier:{table:'suppliers'},
   appointment:{table:'appointments'},sav:{table:'sav_cases'},expense_report:{table:'expense_reports'},
 };
 async function entityExists(org:string,entityType:string,entityId:string):Promise<boolean>{
   const def=LINK_ENTITIES[entityType];
   if(!def)return true; // 'other' : référence libre assumée, jamais vérifiée silencieusement
   return Boolean((await query(`select 1 from ${def.table} where id=$1 and organization_id=$2`,[entityId,org])).rowCount);
 }
 app.post('/documents/:id/links',async(r,reply)=>{
   const id=String((r.params as any).id),org=r.auth!.organizationId,b:any=r.body||{};
   const entityType=String(b.entityType||''),entityId=String(b.entityId||'');
   if(!LINK_ENTITIES[entityType]&&entityType!=='other')return reply.code(400).send({error:'INVALID_ENTITY_TYPE',message:'Types disponibles : quote, invoice, client, supplier, appointment, sav, expense_report, other.'});
   if(!/^[0-9a-f-]{36}$/i.test(entityId))return reply.code(400).send({error:'INVALID_INPUT',message:'Identifiant de l\'objet lié invalide.'});
   const doc=(await query("select id from documents where id=$1 and organization_id=$2 and status not in ('deleted','purged')",[id,org])).rows[0];
   if(!doc)return reply.code(404).send({error:'NOT_FOUND'});
   if(!await entityExists(org,entityType,entityId))return reply.code(400).send({error:'INVALID_ENTITY',message:'L\'objet lié n\'existe pas dans votre organisation.'});
   await query(`insert into document_links(organization_id,document_id,entity_type,entity_id,created_by) values($1,$2,$3,$4,$5)
     on conflict(document_id,entity_type,entity_id) do nothing`,[org,id,entityType,entityId,r.auth!.userId]);
   return reply.code(201).send({ok:true});
 });
 app.get('/documents/:id/links',async r=>{
   const id=String((r.params as any).id),org=r.auth!.organizationId;
   return {links:(await query('select id,entity_type as "entityType",entity_id as "entityId",created_at as "createdAt" from document_links where document_id=$1 and organization_id=$2 order by created_at',[id,org])).rows};
 });
 app.delete('/documents/links/:linkId',async(r,reply)=>{
   const x=await query('delete from document_links where id=$1 and organization_id=$2',[(r.params as any).linkId,r.auth!.organizationId]);
   if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
   return {ok:true};
 });
 // Bloc 14 / Bloc 16 — partages explicites : création (jeton transmis UNE fois, seul son
 // SHA-256 est conservé), liste (jamais de jeton), révocation immédiate et historisée.
 app.get('/documents/shares',async r=>{
   const org=r.auth!.organizationId;
   const rows=(await query(`select s.id,s.document_id as "documentId",d.original_name as "documentName",s.recipient_email as "recipientEmail",
      s.purpose,s.note,s.expires_at as "expiresAt",s.revoked_at as "revokedAt",s.access_count as "accessCount",
      s.last_accessed_at as "lastAccessedAt",s.created_at as "createdAt"
    from document_shares s join documents d on d.id=s.document_id
    where s.organization_id=$1 order by s.created_at desc limit 200`,[org])).rows;
   return {shares:rows};
 });
 app.post('/documents/:id/shares',async(r,reply)=>{
   const id=String((r.params as any).id),org=r.auth!.organizationId,b:any=r.body||{};
   const doc=(await query("select id,original_name from documents where id=$1 and organization_id=$2 and status='clean'",[id,org])).rows[0];
   if(!doc)return reply.code(404).send({error:'NOT_FOUND',message:'Seul un justificatif validé (clean) du dépôt central peut être partagé.'});
   const recipientEmail=b.recipientEmail?String(b.recipientEmail).trim().slice(0,254):null;
   if(recipientEmail&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail))return reply.code(400).send({error:'INVALID_INPUT',message:'Adresse e-mail du destinataire invalide.'});
   const purpose=['portal','accountant','other'].includes(String(b.purpose))?String(b.purpose):'portal';
   const expiresInDays=Math.max(1,Math.min(365,Math.round(Number(b.expiresInDays ?? 30))));
   const token=randomUUID()+'-'+randomBytes(16).toString('hex');
   const tokenHash=sha256Hex(Buffer.from(token));
   const expiresAt=new Date(Date.now()+expiresInDays*86400000);
   const row=(await query(`insert into document_shares(organization_id,document_id,token_hash,recipient_email,purpose,note,expires_at,created_by)
     values($1,$2,$3,$4,$5,$6,$7,$8) returning id,expires_at as "expiresAt"`,[org,id,tokenHash,recipientEmail,purpose,String(b.note||'').slice(0,400)||null,expiresAt,r.auth!.userId])).rows[0];
   // Prompt 05 — opération sensible (partage externe) : événement publié dans l'outbox,
   // idempotent par identifiant de partage (un partage = un événement).
   await publishInTransaction({query},org,{type:'document_shared',idempotencyKey:`share-created:${row.id}`,actorId:r.auth!.userId,sourceEntityType:'document',sourceEntityId:id,payload:{title:'Document partagé par lien',description:`« ${doc.original_name} » est partagé par lien public${recipientEmail?` (destinataire : ${recipientEmail})`:''}, expirable le ${new Date(expiresAt).toLocaleDateString('fr-FR')}. Révocation possible à tout moment.`,severity:'warning'}});
   return reply.code(201).send({id:String(row.id),url:`/share/${token}/download`,token,expiresAt:row.expiresAt,
     note:'Transmettez le lien au destinataire. Le jeton n\'est plus visible ensuite ; le partage peut être révoqué à tout moment.'});
 });
 app.delete('/documents/shares/:shareId',async(r,reply)=>{
   const x=await query("update document_shares set revoked_at=now(),revoked_by=$3 where id=$1 and organization_id=$2 and revoked_at is null returning id",[(r.params as any).shareId,r.auth!.organizationId,r.auth!.userId]);
   if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND',message:'Aucun partage actif à révoquer.'});
   return {ok:true,revoked:true};
 });
 // 15.4.56 — huit modèles natifs : les trois historiques (Minimal, Classique, Signature) et cinq
 // nouvelles ambiances (Horizon, Orchidée, Encre, Corail, Glacier), toutes construites avec le
 // même moteur de mise en page (variantes classic/minimal/signature × teintes × typographies).
 const styles=['aurion-minimal','aurion-classic','aurion-signature','aurion-horizon','aurion-orchidee','aurion-encre','aurion-corail','aurion-glacier'];
 app.get('/document-template-choices',async r=>{const row=(await query('select quote_template_style,invoice_template_style from document_themes where organization_id=$1',[r.auth!.organizationId])).rows[0]||{};return {quote:row.quote_template_style||'aurion-classic',invoice:row.invoice_template_style||'aurion-classic',styles}});
 app.patch('/document-template-choices',async(r,reply)=>{const b:any=r.body||{};if(!styles.includes(b.quote)||!styles.includes(b.invoice))return reply.code(400).send({error:'INVALID_INPUT'});await query(`insert into document_themes(organization_id,accent,dark,font,radius,customized,quote_template_style,invoice_template_style) values($1,'#0b63ce','#0b1220','sans','round',false,$2,$3) on conflict(organization_id) do update set quote_template_style=excluded.quote_template_style,invoice_template_style=excluded.invoice_template_style,updated_at=now()`,[r.auth!.organizationId,b.quote,b.invoice]);return {quote:b.quote,invoice:b.invoice}});
 app.post('/documents/render/:type/:id',async(r,reply)=>{const type=(r.params as any).type as 'quote'|'invoice';if(!['quote','invoice'].includes(type))return reply.code(400).send({error:'INVALID_INPUT'});try{return await renderDocument(r.auth!.organizationId,(r.params as any).id,type)}catch(e:any){if(e.message==='NOT_FOUND')return reply.code(404).send({error:'NOT_FOUND'});if(e.message==='PDF_CONVERSION_UNAVAILABLE')return reply.code(503).send({error:'PDF_CONVERSION_UNAVAILABLE',message:'LibreOffice est requis pour convertir les modèles DOCX/ODT en PDF.'});throw e}});
 async function generated(request:any,reply:any,type:'quote'|'invoice',id:string,ext:'docx'|'odt'|'pdf'){
  try{
   const d=await renderDocument(request.auth.organizationId,id,type);
   const buf=await readPrivateObject(String((d.keys as any)[ext]));
   const download=ext!=='pdf'||request.query?.download==='1';   // PDF : aperçu dans le navigateur ; DOCX/ODT : téléchargement
   const name=String(d.row.number||type).replace(/[^A-Za-z0-9_-]/g,'_');
   return reply.header('Content-Type',contentType('.'+ext)).header('Content-Disposition',`${download?'attachment':'inline'}; filename="${name}.${ext}"`).header('Cache-Control','no-store').header('Content-Security-Policy',"frame-ancestors 'self'").send(buf);
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
   const org=r.auth!.organizationId,zip=new AdmZip();
   const clients=(await query('select id,name from clients where organization_id=$1 order by name',[org])).rows;
   const quotes=(await query('select id,number,document_type from quotes where organization_id=$1 order by created_at',[org])).rows;
   const suppliers=(await query('select id,name from suppliers where organization_id=$1 order by name',[org])).rows;
   for(const c of clients){try{const x=await clientPdf(org,c.id);zip.addFile(`fiches-clients/fiche-${String(c.name||c.id).replace(/[^A-Za-z0-9_-]/g,'_')}-${c.id}.pdf`,x.buffer)}catch{}}
   for(const d of quotes){try{const x=await quotePdf(org,d.id);zip.addFile(`${d.document_type==='invoice'?'factures':'devis'}/${String(d.number||d.id).replace(/[^A-Za-z0-9_-]/g,'_')}.pdf`,x.buffer)}catch{}}
   for(const s of suppliers){try{const x=await supplierPdf(org,s.id);zip.addFile(`fournisseurs/fiche-${String(s.name||s.id).replace(/[^A-Za-z0-9_-]/g,'_')}-${s.id}.pdf`,x.buffer)}catch{}}
   const aid=(await query('select id from activities where organization_id=$1 and active=true order by created_at limit 1',[org])).rows[0]?.id;
   if(aid){try{const {accountingReportPdf}=await import('../services/accounting-report.js');const year=Number((r.query as any)?.year)||new Date().getFullYear();const x=await accountingReportPdf(org,aid,year);zip.addFile(`comptabilite/comptabilite-${year}.pdf`,x.buffer)}catch{}}
   const company=(await query('select id,name,activity,custom_activity,siren,siret,legal_form,address,postal_code,city,website,configuration_data,configuration_incomplete,created_at,updated_at from organizations where id=$1',[org])).rows[0]||{};
   const signature=(await query('select enabled,first_name,last_name,job_title,company,phone,website,address,extra,include_quotes,include_invoices,include_professional,signature_html,signature_text,updated_at from email_signatures where organization_id=$1',[org])).rows[0]||null;
   const interventions=(await query('select a.id,a.client_id,c.name as client_name,a.label,a.address,a.is_default,a.is_active,a.created_at,a.updated_at from client_intervention_addresses a join clients c on c.id=a.client_id and c.organization_id=a.organization_id where a.organization_id=$1 order by c.name,a.created_at',[org])).rows;
   const journal=(await query("select event_type,title,description,severity,source,internal_path,external_url,dedupe_key,is_read,resolved_at,created_at from dashboard_journal_events where organization_id=$1 and event_type not like 'administrative_%' and event_type not like 'journey_%' order by created_at",[org])).rows;
   const storedDocs=(await query("select id,original_name,mime_type,size_bytes,storage_key,status,sha256,created_at from documents where organization_id=$1 and status not in ('deleted','purged') order by created_at",[org])).rows;
   const templates=(await query('select id,activity_id,document_type,name,mime_type,size_bytes,storage_key,active,source,file_format,mapping_status,version,created_at,updated_at from document_templates where organization_id=$1 order by created_at',[org])).rows;
   const generated=(await query('select id,activity_id,quote_id,document_type,template_id,docx_key,odt_key,pdf_key,created_at from generated_documents where organization_id=$1 order by created_at',[org])).rows;
   const safeName=(name:any)=>String(name||'document').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^\.+/,'').slice(0,150)||'document';
   // Bloc 14 — empreinte SHA-256 calculée sur les octets exportés (index des justificatifs).
   const fileHashes=new Map<string,string>();
   const addStoredFile=async(key:any,archiveName:string,docId?:string)=>{if(!key)return false;try{const bytes=await readPrivateObject(String(key));const safe=archiveName.replace(/\\/g,'/').replace(/^\/+|(?:\.\.[/\\])/g,'');zip.addFile(safe,bytes);if(docId)fileHashes.set(String(docId),require('node:crypto').createHash('sha256').update(bytes).digest('hex'));return true}catch{return false}};
   const putJson=(name:string,data:any)=>zip.addFile(name,Buffer.from(JSON.stringify(data,null,2),'utf8'));
   putJson('entreprise/identite-legale.json',company);
   putJson('entreprise/signature-email.json',signature);
   putJson('entreprise/adresses-intervention-clients.json',interventions);
   putJson('journal/evenements.json',journal);
   putJson('documents/index.json',storedDocs.map(({storage_key,...row}:any)=>({...row,storedInArchive:storedDocs.some((d:any)=>d.id===row.id)})));
   let storedCount=0;
   for(const d of storedDocs){if(await addStoredFile(d.storage_key,`documents/fichiers/${safeName(d.id)}-${safeName(d.original_name)}`,d.id))storedCount++;}
   // Bloc 14 — index des justificatifs (nom stable, empreinte, taille, date d'export).
   {const {attachmentsIndex}=await import('../services/accounting-export.js');
    const idx=attachmentsIndex(storedDocs as any,fileHashes);
    zip.addFile('comptabilite/justificatifs-index.csv',Buffer.from(['Fichier;Empreinte SHA-256;Taille (octets);Date d\'export'].concat(idx.map(x=>[x.file,x.sha256,String(x.size),x.exportedOn].join(';'))).join('\n'),'utf8'));}
   putJson('modeles-documents/index.json',templates.map(({storage_key,...row}:any)=>row));
   for(const t of templates)await addStoredFile(t.storage_key,`modeles-documents/${safeName(t.id)}-${safeName(t.name)}`);
   putJson('documents-generes/index.json',generated.map(({docx_key,odt_key,pdf_key,...row}:any)=>row));
   for(const g of generated){for(const [ext,key] of [['docx',g.docx_key],['odt',g.odt_key],['pdf',g.pdf_key]] as const)if(key)await addStoredFile(key,`documents-generes/${safeName(g.id)}.${ext}`);}
   putJson('export-manifest.json',{formatVersion:3,generatedAt:new Date().toISOString(),organizationId:org,contents:{clients:clients.length,quotes:quotes.length,suppliers:suppliers.length,storedDocuments:storedDocs.length,storedDocumentsIncluded:storedCount,interventionAddresses:interventions.length,templates:templates.length,generatedDocuments:generated.length,journalEvents:journal.length,signatureIncluded:Boolean(signature)},security:{oauthTokensIncluded:false,secretsIncluded:false,crossOrganizationDataIncluded:false}});
   const buffer=zip.toBuffer();return reply.header('Content-Type','application/zip').header('Content-Disposition','attachment; filename="aurion-donnees.zip"').header('Cache-Control','no-store').send(buffer);
 });
}
