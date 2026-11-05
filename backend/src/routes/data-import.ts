// Import de données d'un ancien logiciel : préclassement déterministe uniquement (aucune IA, décision D3).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import AdmZip from 'adm-zip';
import crypto from 'node:crypto';
import { db, query } from '../db.js';

const str = (v: unknown, max = 32000) => String(v ?? '').trim().slice(0, max);
const xmlText = (xml: string) => xml.replace(/<w:tab\b[^>]*\/>|<text:tab\b[^>]*\/>/g, '\t').replace(/<\/w:p>|<\/text:p>|<\/p>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 50000);
const extractDocxText = (buffer: Buffer, ext: string) => {
  try { const zip = new AdmZip(buffer); const entry = zip.getEntry(ext === '.docx' ? 'word/document.xml' : 'content.xml'); return entry && entry.header.size <= 15 * 1024 * 1024 ? xmlText(entry.getData().toString('utf8')) : ''; } catch { return ''; }
};
function safeText(value: unknown, max = 1200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function htmlDecodeXml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}
function parseDelimited(text: string, delimiter?: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const sep = delimiter || ([',', ';', '\t', '|'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0] || ',');
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { field += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === sep && !quoted) { row.push(field); field = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
    } else field += ch;
    if (rows.length >= 1501) break;
  }
  row.push(field); if (row.some(cell => cell.trim()) && rows.length < 1501) rows.push(row);
  return rows;
}
function columnNumber(reference: string): number {
  const letters = String(reference || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}
function parseXmlRows(source: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const rowRe = /<(row|record|client|customer|contact|supplier|vendor|product|part|service|quote|devis|invoice|facture|item)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of source.matchAll(rowRe)) {
    const row: Record<string, string> = {};
    const fieldRe = /<([\w:.-]+)\b[^>]*>([\s\S]*?)<\/\1\s*>/g;
    for (const field of match[2].matchAll(fieldRe)) {
      const name = field[1].split(':').pop() || field[1];
      const value = xmlText(field[2]).trim();
      if (value && value.length <= 8000 && !Object.prototype.hasOwnProperty.call(row, name)) row[name] = value.slice(0, 8000);
    }
    if (Object.keys(row).length) rows.push(row);
    if (rows.length >= 1500) break;
  }
  return rows;
}
function isSafeStructuredText(buffer: Buffer): boolean {
  return buffer.length > 0 && !buffer.includes(0);
}
function parseXlsx(buffer: Buffer): Array<{ name: string; rows: Record<string, unknown>[] }> {
  const zip = new AdmZip(buffer);
  const allEntries = zip.getEntries();
  const uncompressedBytes = allEntries.reduce((sum, entry) => sum + (Number(entry.header.size) || 0), 0);
  if (uncompressedBytes > 80 * 1024 * 1024) throw new Error('Classeur trop volumineux après décompression.');
  const stringsEntry = zip.getEntry('xl/sharedStrings.xml');
  const sharedStrings = stringsEntry && stringsEntry.header.size <= 20 * 1024 * 1024 ? [...stringsEntry.getData().toString('utf8').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match => [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => htmlDecodeXml(x[1])).join('')) : [];
  const worksheets = allEntries.filter(entry => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.entryName) && entry.header.size <= 20 * 1024 * 1024).slice(0, 30);
  const results: Array<{ name: string; rows: Record<string, unknown>[] }> = [];
  for (const sheet of worksheets) {
    const raw = sheet.getData().toString('utf8');
    const table: string[][] = [];
    for (const rowMatch of raw.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const ref = cellMatch[1].match(/\br="([A-Z]+\d+)"/i)?.[1] || `A${table.length + 1}`;
        const type = cellMatch[1].match(/\bt="([^"]+)"/)?.[1] || '';
        const inner = cellMatch[2]; const val = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('');
        const decoded = type === 's' ? (sharedStrings[Number(val)] || '') : htmlDecodeXml(val);
        row[columnNumber(ref)] = decoded;
      }
      table.push(row);
      if (table.length >= 1501) break;
    }
    const headers = (table.shift() || []).map((x, i) => safeText(x, 200) || `colonne_${i + 1}`);
    const rows = table.filter(row => row.some(cell => String(cell ?? '').trim())).map(row => Object.fromEntries(headers.map((header, i) => [header, row[i] ?? ''])))
      .slice(0, 1500);
    if (rows.length) results.push({ name: sheet.entryName, rows });
  }
  return results;
}
function keyNorm(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function numericMaybe(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).trim().replace(/[€$£\s]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = Number(cleaned); return Number.isFinite(n) ? n : null;
}
function objectRows(value: any): Record<string, any>[] {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object' && !Array.isArray(item)).slice(0, 1500);
  if (!value || typeof value !== 'object') return [];
  const preferred = ['clients', 'customers', 'contacts', 'suppliers', 'vendors', 'products', 'items', 'parts', 'services', 'catalog', 'catalogue', 'quotes', 'estimates', 'invoices', 'factures', 'devis'];
  const rows: Record<string, any>[] = [];
  for (const key of preferred) {
    const match = Object.keys(value).find(k => keyNorm(k) === key);
    if (match && Array.isArray(value[match])) rows.push(...objectRows(value[match]));
  }
  if (!rows.length) {
    const firstArray = Object.values(value).find(Array.isArray);
    if (Array.isArray(firstArray)) rows.push(...objectRows(firstArray));
  }
  return rows.slice(0, 1500);
}
function entityFromName(name: string, row: Record<string, any>): string | null {
  const n = keyNorm(name); const keys = Object.keys(row).map(keyNorm).join(' ');
  if (/client|customer|contact|crm|prospect/.test(n)) return 'client';
  if (/supplier|fournisseur|vendor|partner/.test(n)) return 'supplier';
  if (/invoice|facture|bill/.test(n)) return 'invoice';
  if (/quote|devis|estimate|quotation/.test(n)) return 'quote';
  if (/product|produit|article|stock|part|piece/.test(n)) return 'product';
  if (/service|catalog|catalogue|prestation|intervention/.test(n)) return 'service';
  if (/company|entreprise|organization|organisation/.test(n)) return 'company';
  if (/siret|siren|legalform|raisonsociale/.test(keys)) return 'company';
  if (/invoicenumber|facturenumero|numero facture|numfacture/.test(keys) || (/invoice/.test(keys) && /total|amount|montant/.test(keys))) return 'invoice';
  if (/quotenumber|devisnumero|numerodevis/.test(keys) || (/quote/.test(keys) && /total|amount|montant/.test(keys))) return 'quote';
  if ((/durationminutes|defaultprice|duree|prixprestation/.test(keys)) && /name|nom|description|libelle/.test(keys)) return 'service';
  if (/email|courriel/.test(keys) && /name|nom|firstname|lastname|prenom/.test(keys)) return 'client';
  if (/reference|sku|stock|quantity|quantite/.test(keys) && /price|prix|sellingprice|unitprice/.test(keys)) return 'product';
  if (/clientname|customername/.test(keys) && /total|amount|montant|number|numero/.test(keys)) return 'quote';
  return null;
}
const alias = (row: Record<string, any>, names: string[]) => {
  const entries = Object.entries(row); const match = entries.find(([key]) => names.some(name => keyNorm(name) === keyNorm(key)));
  return match?.[1] ?? null;
};
function canonicalRecord(entity: string, row: Record<string, any>): Record<string, any> | null {
  const get = (names: string[]) => alias(row, names);
  const text = (names: string[], max = 1000) => { const v = get(names); return v === null || v === undefined || String(v).trim() === '' ? null : safeText(String(v), max); };
  const num = (names: string[]) => numericMaybe(get(names));
  if (entity === 'company') {
    const data = { name:text(['companyName','company','businessName','raisonSociale','nomEntreprise','nom']), activity:text(['activity','activité','activité principale','businessActivity']), customActivity:text(['customActivity','activité précise']), siren:text(['siren']), siret:text(['siret']), legalForm:text(['legalForm','forme juridique','statut']), website:text(['website','site web','url']), address:text(['address','adresse']), postalCode:text(['postalCode','code postal']), city:text(['city','ville']) };
    return data.name || data.siren || data.siret ? data : null;
  }
  if (entity === 'client') {
    const first = text(['firstName','prénom']); const last = text(['lastName','nom de famille']);
    const data = { name:text(['name','nom','client','customer','contact','displayName']) || [first,last].filter(Boolean).join(' ') || null, email:text(['email','e-mail','courriel'],254), phone:text(['phone','telephone','téléphone','mobile'],80), address:text(['address','adresse','billingAddress','adresse de facturation']), interventionAddress:text(['interventionAddress','adresse intervention','serviceAddress']), siret:text(['siret'],40), estimatedMinutes:num(['estimatedMinutes','durationMinutes','durée']) };
    return data.name ? data : null;
  }
  if (entity === 'supplier') {
    const data={name:text(['name','nom','supplier','fournisseur','vendor']),legalName:text(['legalName','raison sociale']),email:text(['email','e-mail','courriel'],254),phone:text(['phone','telephone','téléphone'],80),website:text(['website','site web','url'],2048),notes:text(['notes','note','commentaire'],4000),siren:text(['siren'],40),siret:text(['siret'],40),address:text(['address','adresse']),postalCode:text(['postalCode','code postal'],20),city:text(['city','ville'],160),legalForm:text(['legalForm','forme juridique'],160)};
    return data.name ? data : null;
  }
  if (entity === 'product') {
    const data={name:text(['name','nom','product','produit','article','designation','désignation']),category:text(['category','catégorie','famille'],160),model:text(['model','modèle'],160),variant:text(['variant','variante'],160),color:text(['color','couleur'],100),quality:text(['quality','qualité','grade'],100),reference:text(['reference','référence','sku','code article','productCode'],160),stock:num(['stock','quantity','quantité','qty']),sellingPrice:num(['sellingPrice','salePrice','unitPrice','prix de vente','price','prix','tarif']),saleCoefficientPercent:num(['saleCoefficientPercent','coefficient de vente']),notes:text(['notes','description','commentaire'],4000)};
    return data.name ? data : null;
  }
  if (entity === 'service') {
    const data={name:text(['name','nom','service','prestation','intervention','designation','désignation']),description:text(['description','détails','details'],4000),durationMinutes:num(['durationMinutes','duration','durée','durée minutes','minutes']),defaultPrice:num(['defaultPrice','price','prix','tarif','prix par défaut'])};
    return data.name ? data : null;
  }
  if (entity === 'quote' || entity === 'invoice') {
    let itemsRaw=get(['items','lines','lineItems','lignes','produits']); if (typeof itemsRaw === 'string') { try { itemsRaw=JSON.parse(itemsRaw); } catch { itemsRaw=[]; } }
    const items=Array.isArray(itemsRaw)?itemsRaw.slice(0,200).map((item:any)=>({label:safeText(item.label||item.name||item.description||item.designation,240),quantity:numericMaybe(item.quantity??item.qty)??1,unitCost:numericMaybe(item.unitCost??item.cost??item.prixAchat)??0,unitPrice:numericMaybe(item.unitPrice??item.price??item.prixVente??item.amount)??null})).filter((item:any)=>item.label):[];
    const data={number:text(['number','numero','numéro','documentNumber','invoiceNumber','quoteNumber','reference'],40),clientName:text(['clientName','customerName','client','customer','nom client','nom du client'],240),clientEmail:text(['clientEmail','customerEmail','email','e-mail'],254),intervention:text(['intervention','description','title','objet','prestation','service'],240),product:text(['product','produit','article','summary','résumé'],240),status:text(['status','statut','etat','état'],40),createdAt:text(['createdAt','date','date document','issueDate','invoiceDate','quoteDate'],60),dueAt:text(['dueAt','dueDate','date échéance','échéance'],60),vatRate:num(['vatRate','tvaRate','taux tva','tva']),urssafRate:num(['urssafRate','cotisations']),totalHt:num(['totalHt','totalHT','subtotal','montantHt','montantHT','total hors taxes']),totalTva:num(['totalTva','tvaAmount','montantTva','montantTVA']),totalTtc:num(['totalTtc','totalTTC','total','amount','montantTtc','montantTTC','amountDue']),finalPriceTtc:num(['finalPriceTtc','finalTtc']),partCost:num(['partCost','costParts','coût pièces']),laborCost:num(['laborCost','main d oeuvre','labor']),shippingCost:num(['shippingCost','livraison','frais livraison']),paidAmount:num(['paidAmount','amountPaid','montant payé','règlement']),paymentMethod:text(['paymentMethod','moyen de paiement'],20),paidAt:text(['paidAt','date paiement','date règlement'],60),items};
    return data.number || data.clientName || data.totalTtc !== null || data.intervention ? data : null;
  }
  return null;
}
function parseImportFile(name: string, mime: string, buffer: Buffer): { sources: Array<{ name: string; type: string; content: string; rows?: Record<string, any>[] }>; warnings: string[]; binaryFiles: Array<{name:string;mime:string;buffer:Buffer}> } {
  const sources: Array<{ name: string; type: string; content: string; rows?: Record<string, any>[] }> = []; const warnings: string[]=[]; const binaryFiles:Array<{name:string;mime:string;buffer:Buffer}>=[]; let expandedArchiveBytes=0;
  const add = (fileName: string, fileMime: string, bytes: Buffer, depth = 0) => {
    if (depth > 2) { warnings.push(`${fileName}: archive imbriquée ignorée au-delà de deux niveaux.`); return; }
    const fileExt=fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    if (fileExt === '.zip') {
      try { const zip=new AdmZip(bytes); let count=0; for(const entry of zip.getEntries()){if(entry.isDirectory)continue;const entryName=entry.entryName.replace(/\\/g,'/');if(entryName.startsWith('/')||entryName.split('/').includes('..'))continue;if(count++>=300){warnings.push(`${fileName}: limite de 300 fichiers internes atteinte.`);break;}if(entry.header.size>20*1024*1024){warnings.push(`${entryName}: fichier interne de plus de 20 Mo ignoré.`);continue;}if(expandedArchiveBytes+entry.header.size>80*1024*1024){warnings.push(`${fileName}: limite cumulée de décompression de 80 Mo atteinte.`);break;}expandedArchiveBytes+=entry.header.size;const child=entry.getData();const childExt=entryName.slice(entryName.lastIndexOf('.')).toLowerCase();if(['.csv','.tsv','.txt','.json','.xml','.xlsx','.docx','.odt','.pdf','.png','.jpg','.jpeg','.webp','.xls','.sql'].includes(childExt))add(`${fileName} › ${entryName}`,childExt==='.pdf'?'application/pdf':childExt==='.png'?'image/png':['.jpg','.jpeg'].includes(childExt)?'image/jpeg':childExt==='.webp'?'image/webp':'application/octet-stream',child,depth+1);} } catch { warnings.push(`${fileName}: archive ZIP impossible à lire.`); } return;
    }
    if (fileExt === '.xlsx') { try { for(const sheet of parseXlsx(bytes)){sources.push({name:`${fileName} / ${sheet.name}`,type:'table',content:JSON.stringify(sheet.rows).slice(0,50000),rows:sheet.rows});} } catch { warnings.push(`${fileName}: classeur XLSX illisible.`); } return; }
    if (fileExt === '.xls') { warnings.push(`${fileName}: format XLS ancien non pris en charge. Exportez-le en XLSX ou CSV.`); return; }
    if (fileExt === '.csv' || fileExt === '.tsv') { const rows0=parseDelimited(bytes.toString('utf8'),fileExt==='.tsv'?'\t':undefined);const headers=(rows0.shift()||[]).map((x,i)=>safeText(x,160)||`colonne_${i+1}`);const rows=rows0.slice(0,1500).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??''])));sources.push({name:fileName,type:'table',content:JSON.stringify(rows).slice(0,60000),rows});return; }
    if(fileExt==='.json'){try{const parsed=JSON.parse(bytes.toString('utf8'));const rows=objectRows(parsed);sources.push({name:fileName,type:'json',content:JSON.stringify(parsed).slice(0,60000),...(rows.length?{rows}:{})});}catch{warnings.push(`${fileName}: JSON invalide.`);}return;}
    if(fileExt==='.xml'){const raw=bytes.toString('utf8');const rows=parseXmlRows(raw);sources.push({name:fileName,type:rows.length?'table':'text',content:xmlText(raw).slice(0,50000),...(rows.length?{rows}:{})});return;}
    if(fileExt==='.sql'){if(!isSafeStructuredText(bytes)){warnings.push(`${fileName}: dump SQL binaire ignoré.`);return;}sources.push({name:fileName,type:'sql-text',content:bytes.toString('utf8').slice(0,50000)});warnings.push(`${fileName}: dump SQL lu comme texte uniquement ; aucune instruction SQL n’est exécutée. Exportez les tables utiles en CSV pour les importer.`);return;}
    if(fileExt==='.docx'||fileExt==='.odt'){const text=extractDocxText(bytes,fileExt);if(text)sources.push({name:fileName,type:'text',content:text});else warnings.push(`${fileName}: texte non extrait.`);return;}
    if(fileExt==='.txt'){sources.push({name:fileName,type:'text',content:bytes.toString('utf8').slice(0,40000)});return;}
    if(fileExt==='.pdf'||['.png','.jpg','.jpeg','.webp'].includes(fileExt)){const valid=fileExt==='.pdf'?bytes.subarray(0,5).toString('ascii')==='%PDF-':fileExt==='.png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):['.jpg','.jpeg'].includes(fileExt)?bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff:bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP';if(!valid){warnings.push(`${fileName}: signature de fichier non reconnue.`);return;}const childMime=fileExt==='.pdf'?'application/pdf':fileExt==='.png'?'image/png':fileExt==='.webp'?'image/webp':'image/jpeg';binaryFiles.push({name:fileName,mime:childMime,buffer:bytes});sources.push({name:fileName,type:fileExt==='.pdf'?'pdf':'image',content:'',rows:undefined});return;}
    warnings.push(`${fileName}: format non pris en charge, ignoré.`);
  };
  add(name,mime,buffer);
  return {sources,warnings,binaryFiles};
}
function deterministicImportCandidates(sources: Array<{name:string;type:string;content:string;rows?:Record<string,any>[]}>) {
  const records:any[]=[]; const seen=new Set<string>();
  for(const source of sources){
    const rows=source.rows || (()=>{try{return objectRows(JSON.parse(source.content));}catch{return [];}})();
    for(let i=0;i<rows.length && records.length<200;i++){
      const row=rows[i]; const entity=entityFromName(source.name,row);if(!entity)continue;
      const data=canonicalRecord(entity,row);if(!data)continue;
      const key=`${entity}:${JSON.stringify(data).slice(0,200)}`;if(seen.has(key))continue;seen.add(key);
      records.push({id:crypto.randomUUID(),entity,sourceFile:source.name,sourceRow:i+2,confidence:0.62,reason:'Mapping local à partir des en-têtes et des valeurs du fichier ; vérification recommandée.',warnings:[],data,defaultAction:'create'});
    }
  }
  return records;
}
async function detectImportDuplicates(organizationId:string,records:any[]) {
  const [companyRow,clients,suppliers,parts,services,quotes]=await Promise.all([
    query('select id,name,siren,siret from organizations where id=$1',[organizationId]),
    query('select id,name,email,siret from clients where organization_id=$1 order by created_at desc limit 5000',[organizationId]),
    query('select id,name,email,siren,siret from suppliers where organization_id=$1 order by created_at desc limit 5000',[organizationId]),
    query('select id,name,reference,model from parts where organization_id=$1 order by created_at desc limit 5000',[organizationId]),
    query('select id,name from interventions where organization_id=$1 order by created_at desc limit 5000',[organizationId]),
    query('select q.id,q.number,q.document_type,c.name as client_name from quotes q left join clients c on c.id=q.client_id where q.organization_id=$1 order by q.created_at desc limit 10000',[organizationId]),
  ]);
  const matchRecord=(r:any)=>{
    const d=r.data||{}; let found:any=null;
    if(r.entity==='company')found=companyRow.rows[0];
    else if(r.entity==='client')found=clients.rows.find(x=>(d.email&&String(x.email||'').toLowerCase()===String(d.email).toLowerCase())||(d.siret&&String(x.siret||'')===String(d.siret).replace(/\D/g,''))||(!d.email&&!d.siret&&keyNorm(x.name)===keyNorm(d.name)));
    else if(r.entity==='supplier')found=suppliers.rows.find(x=>(d.siret&&String(x.siret||'')===String(d.siret).replace(/\D/g,''))||(d.siren&&String(x.siren||'')===String(d.siren).replace(/\D/g,''))||(d.email&&String(x.email||'').toLowerCase()===String(d.email).toLowerCase())||keyNorm(x.name)===keyNorm(d.name));
    else if(r.entity==='product')found=parts.rows.find(x=>(d.reference&&String(x.reference||'').toLowerCase()===String(d.reference).toLowerCase())||(!d.reference&&keyNorm(x.name)===keyNorm(d.name)&&keyNorm(x.model)===keyNorm(d.model)));
    else if(r.entity==='service')found=services.rows.find(x=>keyNorm(x.name)===keyNorm(d.name));
    else if(r.entity==='quote'||r.entity==='invoice')found=quotes.rows.find(x=>String(x.document_type)===r.entity&&d.number&&String(x.number).toLowerCase()===String(d.number).toLowerCase());
    if(found){r.duplicate=true;r.duplicateOf=String(found.id);r.duplicateLabel=safeText(found.name||found.number||found.client_name||'Élément existant',240);r.defaultAction='skip';}
    else {r.duplicate=false;r.duplicateOf=null;r.duplicateLabel='';r.defaultAction=r.entity==='company'?'update':'create';}
    if(r.entity==='company')r.defaultAction='update';
    return r;
  };
  // De-duplicate candidates within this batch as well as against Aurion.
  const seen=new Map<string,any>();
  return records.map(r=>{
    matchRecord(r);
    const d=r.data||{};const key=[r.entity,keyNorm(d.email||d.siret||d.siren||d.reference||d.number||d.name||'')].join(':');
    if(!r.duplicate&&seen.has(key)){r.duplicate=true;r.duplicateOf=seen.get(key).id;r.duplicateLabel=`Doublon dans les fichiers importés : ${seen.get(key).data?.name||seen.get(key).data?.number||'entrée précédente'}`;r.defaultAction='skip';}
    else if(!r.duplicate)seen.set(key,r);
    return r;
  });
}
function finiteNumber(value:any, fallback=0, min=-1e12, max=1e12):number {
  const n=numericMaybe(value);return n!==null&&n>=min&&n<=max?n:fallback;
}
function stringField(d:any,key:string,max=1000):string|null {const v=d?.[key];if(v===null||v===undefined||String(v).trim()==='')return null;return safeText(String(v),max)||null;}
function safeDate(value:any):string|null {const raw=safeText(value,100);if(!raw)return null;const d=new Date(raw);return Number.isNaN(d.getTime())?null:d.toISOString();}
function safeDateOnly(value:any):string|null {const d=safeDate(value);return d?d.slice(0,10):null;}
async function commitAbsorption(request:FastifyRequest, body:any) {
  const org=String((request as any).auth?.organizationId||'');
  const priority:Record<string,number>={company:0,client:1,supplier:2,product:3,service:4,quote:5,invoice:6};const items=Array.isArray(body?.records)?body.records.slice(0,300).sort((a:any,b:any)=>(priority[String(a?.entity)]??99)-(priority[String(b?.entity)]??99)):[];
  if(!items.length)throw Object.assign(new Error('Aucun enregistrement sélectionné pour l’import.'),{statusCode:400});
  const requestedActivity=String(request.headers['x-aurion-activity-id']||'');
  const activity=(await query(requestedActivity?'select id from activities where id=$1 and organization_id=$2':'select id from activities where organization_id=$1 order by active desc,created_at asc limit 1',requestedActivity?[requestedActivity,org]:[org])).rows[0];
  const activityId=activity?.id?String(activity.id):null;
  const conn=await db.connect();const outcome={created:0,updated:0,skipped:0,failed:0,results:[] as any[]};
  try{
    await conn.query('begin');
    const importedClientIds=new Map<string,string>();
    for(let index=0;index<items.length;index++){
      const item=items[index]||{};const entity=String(item.entity||'');const action=String(item.action||'create');const d=item.data&&typeof item.data==='object'?item.data:{};
      if(action==='skip'||action==='delete'){outcome.skipped++;outcome.results.push({id:item.id,entity,status:'skipped',reason:'Ignoré ou retiré de l’import par l’utilisateur.'});continue;}
      if(!['company','client','supplier','product','service','quote','invoice'].includes(entity)){outcome.failed++;outcome.results.push({id:item.id,entity,status:'failed',message:'Type d’enregistrement non autorisé.'});continue;}
      if(!['create','update'].includes(action)){outcome.failed++;outcome.results.push({id:item.id,entity,status:'failed',message:'Action d’import invalide.'});continue;}
      if(entity==='company'&&action!=='update'){outcome.failed++;outcome.results.push({id:item.id,entity,status:'failed',message:'La fiche entreprise existante ne peut être actualisée que par une action explicite « Mettre à jour ».'});continue;}
      const duplicateId=String(item.duplicateOf||'');const idLooksUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(duplicateId);
      try{
        await conn.query(`savepoint absorption_item_${index}`);
        if(entity==='company'){
          const values={name:stringField(d,'name',180),activity:stringField(d,'activity',180),customActivity:stringField(d,'customActivity',240),siren:stringField(d,'siren',9)?.replace(/\D/g,'')||null,siret:stringField(d,'siret',14)?.replace(/\D/g,'')||null,legalForm:stringField(d,'legalForm',160),website:stringField(d,'website',2048),address:stringField(d,'address',500),postalCode:stringField(d,'postalCode',20),city:stringField(d,'city',160)};
          if(values.siren&&values.siren.length!==9)throw new Error('SIREN invalide : la valeur doit comporter 9 chiffres.');if(values.siret&&values.siret.length!==14)throw new Error('SIRET invalide : la valeur doit comporter 14 chiffres.');
          await conn.query(`update organizations set name=coalesce($1,name),activity=coalesce($2,activity),custom_activity=coalesce($3,custom_activity),siren=coalesce($4,siren),siret=coalesce($5,siret),legal_form=coalesce($6,legal_form),website=coalesce($7,website),address=coalesce($8,address),postal_code=coalesce($9,postal_code),city=coalesce($10,city),updated_at=now() where id=$11`,[values.name,values.activity,values.customActivity,values.siren,values.siret,values.legalForm,values.website,values.address,values.postalCode,values.city,org]);
          outcome.updated++;outcome.results.push({id:item.id,entity,status:'updated',message:'Fiche entreprise actualisée à partir des champs sélectionnés.'});
        } else if(entity==='client'){
          if(!activityId)throw new Error('Aucune activité Aurion n’est disponible pour rattacher les clients.');
          const name=stringField(d,'name',240);if(!name)throw new Error('Le nom du client est obligatoire.');
          let foundId:string|null=null;
          if(action==='update'&&idLooksUuid){const found=(await conn.query('select id from clients where id=$1 and organization_id=$2',[duplicateId,org])).rows[0];if(found)foundId=String(found.id);}
          if(action==='update'&&!foundId)throw new Error('Mise à jour refusée : la fiche client ciblée n’existe plus dans cette organisation. Relancez la détection des doublons.');
          if(foundId){await conn.query(`update clients set name=coalesce($1,name),email=coalesce($2,email),phone=coalesce($3,phone),address=coalesce($4,address),intervention_address=coalesce($5,intervention_address),siret=coalesce($6,siret),estimated_minutes=coalesce($7,estimated_minutes),updated_at=now() where id=$8 and organization_id=$9`,[name,stringField(d,'email',254),stringField(d,'phone',80),stringField(d,'address',500),stringField(d,'interventionAddress',500),stringField(d,'siret',14)?.replace(/\D/g,'')||null,d.estimatedMinutes===null?null:finiteNumber(d.estimatedMinutes,0,0,1e7),foundId,org]);outcome.updated++;}
          else {const newId=crypto.randomUUID();await conn.query(`insert into clients(id,organization_id,activity_id,name,email,phone,address,intervention_address,siret,estimated_minutes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[newId,org,activityId,name,stringField(d,'email',254),stringField(d,'phone',80),stringField(d,'address',500),stringField(d,'interventionAddress',500),stringField(d,'siret',14)?.replace(/\D/g,'')||null,finiteNumber(d.estimatedMinutes,0,0,1e7)]);foundId=newId;outcome.created++;}
          importedClientIds.set(keyNorm(name),foundId!);outcome.results.push({id:item.id,entity,status:foundId?'saved':'failed'});
        } else if(entity==='supplier'){
          if(!activityId)throw new Error('Aucune activité Aurion n’est disponible pour rattacher les fournisseurs.');const name=stringField(d,'name',240);if(!name)throw new Error('Le nom du fournisseur est obligatoire.');let foundId:string|null=null;
          if(action==='update'&&idLooksUuid){const found=(await conn.query('select id from suppliers where id=$1 and organization_id=$2',[duplicateId,org])).rows[0];if(found)foundId=String(found.id);}
          const fields=[stringField(d,'email',254),stringField(d,'phone',80),stringField(d,'website',2048),stringField(d,'notes',4000),stringField(d,'siren',9)?.replace(/\D/g,'')||null,stringField(d,'siret',14)?.replace(/\D/g,'')||null,stringField(d,'legalName',240),stringField(d,'address',1000),stringField(d,'postalCode',20),stringField(d,'city',160),stringField(d,'legalForm',160)];
          if(action==='update'&&!foundId)throw new Error('Mise à jour refusée : la fiche fournisseur ciblée n’existe plus dans cette organisation. Relancez la détection des doublons.');
          if(foundId){await conn.query(`update suppliers set name=$1,email=coalesce($2,email),phone=coalesce($3,phone),website=coalesce($4,website),notes=coalesce($5,notes),siren=coalesce($6,siren),siret=coalesce($7,siret),legal_name=coalesce($8,legal_name),address=coalesce($9,address),postal_code=coalesce($10,postal_code),city=coalesce($11,city),legal_form=coalesce($12,legal_form),updated_at=now() where id=$13 and organization_id=$14`,[name,...fields,foundId,org]);outcome.updated++;}
          else{foundId=crypto.randomUUID();await conn.query(`insert into suppliers(id,organization_id,activity_id,name,email,phone,website,notes,siren,siret,legal_name,address,postal_code,city,legal_form) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[foundId,org,activityId,name,...fields]);outcome.created++;}
          outcome.results.push({id:item.id,entity,status:'saved',recordId:foundId});
        } else if(entity==='product'){
          if(!activityId)throw new Error('Aucune activité Aurion n’est disponible pour rattacher les produits.');const name=stringField(d,'name',240);if(!name)throw new Error('Le nom du produit est obligatoire.');const stock=finiteNumber(d.stock,0,0,10000000);if(!Number.isInteger(stock))throw new Error('Le stock doit être un nombre entier positif.');let foundId:string|null=null;
          if(action==='update'&&idLooksUuid){const found=(await conn.query('select id from parts where id=$1 and organization_id=$2',[duplicateId,org])).rows[0];if(found)foundId=String(found.id);}
          const values=[stringField(d,'category',160),stringField(d,'model',160),stringField(d,'variant',160),stringField(d,'color',100),stringField(d,'quality',100),stringField(d,'reference',160),stock,finiteNumber(d.sellingPrice,0,0,1e9),finiteNumber(d.saleCoefficientPercent,0,0,1e6),stringField(d,'notes',4000)];
          if(action==='update'&&!foundId)throw new Error('Mise à jour refusée : la fiche produit ciblée n’existe plus dans cette organisation. Relancez la détection des doublons.');
          if(foundId){await conn.query(`update parts set name=$1,category=coalesce($2,category),model=coalesce($3,model),variant=coalesce($4,variant),color=coalesce($5,color),quality=coalesce($6,quality),reference=coalesce($7,reference),stock=$8,selling_price=$9,sale_coefficient_percent=$10,notes=coalesce($11,notes),updated_at=now() where id=$12 and organization_id=$13`,[name,...values,foundId,org]);outcome.updated++;}
          else{foundId=crypto.randomUUID();await conn.query(`insert into parts(id,organization_id,activity_id,name,category,model,variant,color,quality,reference,stock,selling_price,sale_coefficient_percent,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[foundId,org,activityId,name,...values]);outcome.created++;}
          outcome.results.push({id:item.id,entity,status:'saved',recordId:foundId});
        } else if(entity==='service'){
          if(!activityId)throw new Error('Aucune activité Aurion n’est disponible pour rattacher le catalogue.');const name=stringField(d,'name',240);if(!name)throw new Error('Le nom de la prestation est obligatoire.');let foundId:string|null=null;
          if(action==='update'&&idLooksUuid){const found=(await conn.query('select id from interventions where id=$1 and organization_id=$2',[duplicateId,org])).rows[0];if(found)foundId=String(found.id);}
          const duration=d.durationMinutes===null?null:Math.round(finiteNumber(d.durationMinutes,0,0,1e7));const price=finiteNumber(d.defaultPrice,0,0,1e9);
          if(action==='update'&&!foundId)throw new Error('Mise à jour refusée : la prestation ciblée n’existe plus dans cette organisation. Relancez la détection des doublons.');
          if(foundId){await conn.query('update interventions set name=$1,description=coalesce($2,description),default_duration_minutes=$3,default_price=$4,updated_at=now() where id=$5 and organization_id=$6',[name,stringField(d,'description',4000),duration,price,foundId,org]);outcome.updated++;}
          else{foundId=crypto.randomUUID();await conn.query('insert into interventions(id,organization_id,activity_id,name,description,default_duration_minutes,default_price) values($1,$2,$3,$4,$5,$6,$7)',[foundId,org,activityId,name,stringField(d,'description',4000),duration,price]);outcome.created++;}
          outcome.results.push({id:item.id,entity,status:'saved',recordId:foundId});
        } else if(entity==='quote'||entity==='invoice'){
          if(!activityId)throw new Error('Aucune activité Aurion n’est disponible pour rattacher le document historique.');const number=stringField(d,'number',40)||`${entity==='invoice'?'IMP-FAC':'IMP-DEV'}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;const intervention=stringField(d,'intervention',240)||stringField(d,'product',240)||`Import historique ${number}`;const vatRate=finiteNumber(d.vatRate,20,0,100);const ttcFallback=d.finalPriceTtc!==null&&d.finalPriceTtc!==undefined?finiteNumber(d.finalPriceTtc,0):d.totalHt!==null&&d.totalHt!==undefined?finiteNumber(d.totalHt,0)*(1+vatRate/100):0;const ttc=finiteNumber(d.totalTtc,ttcFallback,0,1e12);const ht=finiteNumber(d.totalHt,vatRate>0?ttc/(1+vatRate/100):ttc,0,1e12);const tva=finiteNumber(d.totalTva,ttc-ht,-1e12,1e12);const created=safeDate(d.createdAt)||new Date().toISOString();const due=safeDateOnly(d.dueAt);let clientId:string|null=null;
          if(stringField(d,'clientName',240)){clientId=importedClientIds.get(keyNorm(d.clientName))||null;if(!clientId){const found=(await conn.query(`select id from clients where organization_id=$1 and (($2::text is not null and lower(coalesce(email,''))=lower($2)) or lower(name)=lower($3)) order by created_at limit 1`,[org,stringField(d,'clientEmail',254),stringField(d,'clientName',240)])).rows[0];if(found)clientId=String(found.id);}}
          let quoteId:string|null=null;if(action==='update'&&idLooksUuid){const found=(await conn.query('select id from quotes where id=$1 and organization_id=$2 and document_type=$3',[duplicateId,org,entity])).rows[0];if(found)quoteId=String(found.id);}
          if(action==='update'&&!quoteId)throw new Error('Mise à jour refusée : le devis ou la facture ciblé(e) n’existe plus dans cette organisation. Relancez la détection des doublons.');
          const statusRaw=keyNorm(d.status||'');const normalizedStatus=entity==='invoice'?(statusRaw.includes('annul')||statusRaw.includes('cancel')?'cancelled':statusRaw.includes('draft')||statusRaw.includes('brouillon')?'draft':'issued'):(statusRaw.includes('accept')?'accepted':statusRaw.includes('sent')||statusRaw.includes('envoye')?'sent':statusRaw.includes('reject')||statusRaw.includes('refuse')?'rejected':statusRaw.includes('expire')?'expired':'draft');
          const paidSource=entity==='invoice'&&(statusRaw.includes('paid')||statusRaw.includes('paye')||statusRaw.includes('regle'));const paid=entity==='invoice'?Math.min(ttc,Math.max(0,finiteNumber(d.paidAmount,paidSource?ttc:0,0,1e12))):0;const paymentStatus=paid>=ttc&&ttc>0?'paid':paid>0?'partially_paid':'unpaid';
          const original={source:'external-import',reviewRequired:true,sourceNumber:stringField(d,'number',40),sourceDate:stringField(d,'createdAt',60),sourceStatus:stringField(d,'status',40),sourceAmounts:{totalHt:d.totalHt??null,totalTva:d.totalTva??null,totalTtc:d.totalTtc??null,paidAmount:d.paidAmount??null},warnings:Array.isArray(item.warnings)?item.warnings.slice(0,20):[]};
          if(quoteId){await conn.query(`update quotes set client_id=coalesce($1,client_id),intervention=$2,product=$3,status=$4,vat_rate=$5,total_ht=$6,total_tva=$7,total_ttc=$8,final_price_ttc=$9,part_cost=$10,labor_cost=$11,shipping_cost=$12,due_at=$13,updated_at=now(),calculation_snapshot=$14::jsonb,structured_invoice=$15::jsonb where id=$16 and organization_id=$17`,[clientId,intervention,stringField(d,'product',240),normalizedStatus,vatRate,ht,tva,ttc,ttc,finiteNumber(d.partCost,0),finiteNumber(d.laborCost,0),finiteNumber(d.shippingCost,0),due,JSON.stringify(original),JSON.stringify({profile:'external-import',status:'prepared',original}),quoteId,org]);outcome.updated++;}
          else{quoteId=crypto.randomUUID();await conn.query(`insert into quotes(id,organization_id,activity_id,client_id,number,document_type,status,intervention,product,part_cost,shipping_cost,labor_cost,vat_rate,urssaf_rate,total_ht,total_tva,total_ttc,final_price_ttc,created_at,updated_at,due_at,payment_status,amount_paid,paid_at,calculation_snapshot,structured_invoice,electronic_status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now(),$20,$21,$22,$23,$24::jsonb,$25::jsonb,'prepared')`,[quoteId,org,activityId,clientId,number,entity,normalizedStatus,intervention,stringField(d,'product',240),finiteNumber(d.partCost,0),finiteNumber(d.shippingCost,0),finiteNumber(d.laborCost,0),vatRate,finiteNumber(d.urssafRate,0,0,99.99),ht,tva,ttc,ttc,created,due,paymentStatus,paid,paid>0?safeDate(d.paidAt)||created:null,JSON.stringify(original),JSON.stringify({profile:'external-import',status:'prepared',original})]);outcome.created++;
            const lines=Array.isArray(d.items)?d.items.slice(0,200):[];let position=0;
            if(lines.length){for(const line of lines){const label=stringField(line,'label',240);if(!label)continue;const quantity=finiteNumber(line.quantity,1,0.01,1e7);const unitCost=finiteNumber(line.unitCost,0,0,1e12);const unitPrice=finiteNumber(line.unitPrice,unitCost,0,1e12);await conn.query(`insert into quote_items(id,quote_id,position,label,quantity,unit_cost,part_id,unit_price,sale_coefficient_percent) values($1,$2,$3,$4,$5,$6,null,$7,0)`,[crypto.randomUUID(),quoteId,position++,label,quantity,unitCost,unitPrice]);}}
            else if(ht>0){await conn.query(`insert into quote_items(id,quote_id,position,label,quantity,unit_cost,part_id,unit_price,sale_coefficient_percent) values($1,$2,0,$3,1,$4,null,$4,0)`,[crypto.randomUUID(),quoteId,stringField(d,'product',240)||intervention,ht]);}
            if(entity==='invoice'&&paid>0){await conn.query(`insert into invoice_payments(id,organization_id,quote_id,amount,payment_method,paid_at,reference,note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[crypto.randomUUID(),org,quoteId,paid,['transfer','card','cash','cheque','crypto','other'].includes(String(d.paymentMethod))?String(d.paymentMethod):'other',safeDate(d.paidAt)||created,stringField(d,'number',160),`Paiement repris lors d’un import externe. Vérifiez la source comptable.`,(request as any).auth?.userId||null]);}
          }
          outcome.results.push({id:item.id,entity,status:'saved',recordId:quoteId,number,reviewRequired:true});
        } else throw new Error('Type de donnée non pris en charge pour l’import.');
        await conn.query(`release savepoint absorption_item_${index}`);
      }catch(error:any){await conn.query(`rollback to savepoint absorption_item_${index}`).catch(()=>{});await conn.query(`release savepoint absorption_item_${index}`).catch(()=>{});outcome.failed++;outcome.results.push({id:item.id,entity,status:'failed',message:safeText(error?.message||'Enregistrement impossible.',500)});}
    }
    await conn.query('commit');
    return outcome;
  }catch(error){await conn.query('rollback').catch(()=>{});throw error;}finally{conn.release();}
}


export async function dataImportRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);
  app.post('/data-import/preview', { bodyLimit: 90 * 1024 * 1024, config: { rateLimit: { max: 4, timeWindow: '1 minute' } } }, async (request, reply) => {
    try {
      const sources:any[]=[];const warnings:string[]=[];const binaryFiles:Array<{name:string;mime:string;buffer:Buffer}>=[];let total=0;let filesSeen=0;
      for await (const part of (request as any).parts()) {
        if (part.type !== 'file') continue;
        filesSeen++;if(filesSeen>30)throw Object.assign(new Error('La limite est de 30 fichiers par import.'),{statusCode:413});
        const buffer:Buffer=await part.toBuffer();total+=buffer.length;if(total>80*1024*1024)throw Object.assign(new Error('La taille totale des fichiers dépasse 80 Mo.'),{statusCode:413});
        if(!buffer.length)continue;
        const parsed=parseImportFile(str(part.filename,240),str(part.mimetype,140),buffer);sources.push(...parsed.sources);warnings.push(...parsed.warnings);binaryFiles.push(...parsed.binaryFiles);
      }
      if(!filesSeen)throw Object.assign(new Error('Sélectionnez au moins un export de données.'),{statusCode:400});
      const normalized={records:deterministicImportCandidates(sources),warning:binaryFiles.length?'Les PDF et images sont conservés comme pièces non interprétées : exportez leurs données en CSV, XLSX ou JSON pour les importer.':''};
      const organizationId=(request as any).auth!.organizationId;
      const records=await detectImportDuplicates(organizationId,normalized.records.slice(0,180));
      return {records,filesSeen,totalBytes:total,sourceCount:sources.length,warning:normalized.warning||'',warnings:warnings.slice(0,100),supported:['CSV','TSV','XLSX','JSON','XML','ZIP contenant ces formats','SQL comme texte non exécuté','DOCX','ODT','TXT'],limitations:['Les exports structurés et documents lisibles peuvent être absorbés.','Un accès direct à un logiciel tiers, une sauvegarde chiffrée ou un format propriétaire opaque nécessite son API ou un export ouvert.','Les données importées restent à vérifier ; aucun doublon n’est écrasé sans action explicite.']};
    } catch(error:any) { request.log.error({statusCode:error?.statusCode},'Data import preview failed');return reply.code(Number(error?.statusCode)||502).send({error:'DATA_ABSORPTION_PREVIEW_FAILED',message:str(error?.message||'Les exports n’ont pas pu être analysés.',500)}); }
  });
  app.post('/data-import/commit', { bodyLimit: 6 * 1024 * 1024, config: { rateLimit: { max: 4, timeWindow: '1 minute' } } }, async (request, reply) => {
    try { return await commitAbsorption(request, request.body); }
    catch(error:any) { request.log.error({statusCode:error?.statusCode},'Data import commit failed');return reply.code(Number(error?.statusCode)||500).send({error:'DATA_ABSORPTION_COMMIT_FAILED',message:str(error?.message||'L’import des données a échoué.',500)}); }
  });
}