import type PDFKit from 'pdfkit';
const pdfkit=async()=>(await import('pdfkit')).default as unknown as typeof PDFKit;
import { query } from '../db.js';
import { clientSummary } from './clients.js';

function money(v:any){return `${Number(v||0).toFixed(2).replace('.',',')} €`}
function esc(v:any){return String(v??'')}
async function makePdf(title:string,org:any,rows:Array<[string,string]>,total?:string){const PDFDocument=await pdfkit();return new Promise<Buffer>((resolve,reject)=>{const doc=new PDFDocument({size:'A4',margin:48});const chunks:Buffer[]=[];doc.on('data',(c:Buffer)=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);const left=48,right=547,width=499;
 doc.roundedRect(left,42,width,96,12).fill('#0b1220');const tx=left+18;doc.fillColor('#fff').font('Helvetica-Bold').fontSize(21).text(esc(org.name)||'Entreprise',tx,58,{width:365});doc.font('Helvetica').fontSize(9).fillColor('#cbd5e1').text(esc(org.activity)||'',tx,86,{width:365});if(org.siret)doc.text(`SIRET : ${esc(org.siret)}`,tx,101,{width:365});
 doc.fillColor('#111827').font('Helvetica-Bold').fontSize(20).text(title,left,164);doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`Émis le ${new Date().toLocaleDateString('fr-FR')}`,left,190);let y=220;
 doc.roundedRect(left,y,width,50,8).fill('#f1f5f9');doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('DÉSIGNATION',left+14,y+10,{width:300});doc.text('VALEUR',right-125,y+10,{width:110,align:'right'});y+=50;
 rows.filter(r=>r[0]&&r[1]).forEach((r,i)=>{const label=esc(r[0]),value=esc(r[1]);const valueH=doc.heightOfString(value,{width:145});const labelH=doc.heightOfString(label,{width:315});const h=Math.max(32,Math.max(valueH,labelH)+18);if(y+h>760){doc.addPage();y=54}if(i%2===0)doc.rect(left,y,width,h).fill('#fafafa');doc.fillColor('#334155').font('Helvetica').fontSize(9).text(label,left+14,y+10,{width:315});doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(value,right-140,y+10,{width:125,align:'right'});y+=h;});
 if(total){y+=14;if(y+70>780){doc.addPage();y=54}doc.roundedRect(left,y,width,60,9).fill('#e8f3ff');doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text('TOTAL TTC',left+18,y+21);doc.fillColor('#0b63ce').fontSize(18).text(total,right-170,y+18,{width:150,align:'right'});y+=80}
 doc.moveTo(left,y).lineTo(right,y).stroke('#e2e8f0');doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('Aurion · Document commercial · Les paramètres fiscaux et sociaux restent sous le contrôle de l’entreprise.',left,y+12,{width:width,align:'center'});doc.end();})}

export async function quotePdf(organizationId:string,id:string){const q=await query(`select q.*,c.name client_name,c.email client_email,c.phone client_phone,c.address client_address,o.name company_name,o.activity company_activity,o.siret,a.name activity_name,a.cgv_text activity_cgv from quotes q left join clients c on c.id=q.client_id join organizations o on o.id=q.organization_id left join activities a on a.id=q.activity_id where q.id=$1 and q.organization_id=$2`,[id,organizationId]);if(!q.rowCount)throw new Error('NOT_FOUND');const x=q.rows[0];const title=x.document_type==='invoice'?`FACTURE ${x.number}`:`DEVIS ${x.number}`;const rows:[string,string][]=[['Client',esc(x.client_name||'')],['Adresse',esc(x.billing_address_snapshot||x.client_address||'')],...(x.intervention_address_snapshot?[['Adresse d’intervention',esc(x.intervention_address_snapshot)] as [string,string]]:[]),['Intervention',esc(x.intervention||'')],['Article / pièce',esc(x.product||'')],['Prix d’achat pièce HT',money(x.part_cost)],['Livraison HT',money(x.shipping_cost)],['Main-d’œuvre HT',money(x.margin||x.labor_cost)],['Total HT',money(x.total_ht)],['TVA',money(x.total_tva)],['Garantie',esc(x.warranty_text||'')],['CGV',esc(x.cgv_snapshot||x.activity_cgv||'')]];return {buffer:await makePdf(title,{name:x.company_name,activity:x.company_activity,siret:x.siret},rows,money(x.total_ttc)),row:x}}
export async function clientPdf(organizationId:string,id:string){
  const sum=await clientSummary(organizationId,id);if(!sum)throw new Error('NOT_FOUND');
  const o=(await query('select name,activity,siret from organizations where id=$1',[organizationId])).rows[0]||{};
  const c=sum.client as any;
  const eur=(n:any)=>{const [a,b]=Math.abs(Number(n||0)).toFixed(2).split('.');return `${a!.replace(/\B(?=(\d{3})+(?!\d))/g,'\u00A0')},${b}\u00A0€`};
  const fd=(d:any)=>new Date(d).toLocaleDateString('fr-FR');
  const PDFDocument=await pdfkit();
  const buffer=await new Promise<Buffer>((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:56,info:{Title:`Fiche client ${c.name}`,Author:o.name||'Aurion'}});
    const chunks:Buffer[]=[];doc.on('data',(b:Buffer)=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    const L=56,R=539,W=R-L,NAVY='#0b1220',ink='#0f172a',muted='#64748b',accent='#0b63ce',line='#e2e8f0',card='#f8fafc';
    const footer=()=>{const sx=doc.x,sy=doc.y,b=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(`${o.name||''}  ·  Fiche client  ·  ${new Date().toLocaleDateString('fr-FR')}`,L,806,{width:W,align:'center',lineBreak:false});doc.page.margins.bottom=b;doc.x=sx;doc.y=sy};
    footer();doc.on('pageAdded',footer);
    const label=(t:string,x:number,y:number,w:number)=>doc.font('Helvetica-Bold').fontSize(7.5).fillColor(muted).text(t.toUpperCase(),x,y,{width:w,characterSpacing:1.3});
    const need=(y:number,h:number)=>{if(y+h>770){doc.addPage();return 56}return y};
    // en-tête
    const tx=L;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(ink).text(o.name||'Entreprise',tx,56,{width:260});
    doc.font('Helvetica').fontSize(9.5).fillColor(muted);if(o.activity)doc.text(o.activity,tx,doc.y+2,{width:260});
    doc.font('Helvetica-Bold').fontSize(14).fillColor(accent).text('FICHE CLIENT',R-220,56,{width:220,align:'right'});
    doc.font('Helvetica').fontSize(9.5).fillColor(muted).text(`Éditée le ${new Date().toLocaleDateString('fr-FR')}`,R-220,76,{width:220,align:'right'});
    const hEnd=Math.max(doc.y,108);doc.rect(L,hEnd+12,W,3).fill(accent);
    // identité
    let y=hEnd+40;
    doc.roundedRect(L,y,W,118,12).fillAndStroke(card,line);
    const initials=String(c.name||'?').split(/\s+/).filter(Boolean).slice(0,2).map((w:string)=>w[0]!.toUpperCase()).join('');
    doc.circle(L+52,y+59,30).fill(NAVY);doc.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff').text(initials,L+22,y+50,{width:60,align:'center',lineBreak:false});
    doc.font('Helvetica-Bold').fontSize(19).fillColor(ink).text(c.name||'—',L+100,y+18,{width:W-116,lineBreak:false,ellipsis:true});
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(`Client depuis le ${fd(c.created_at)}`,L+100,y+42,{width:W-116});
    const rows:[string,string][]=[['E-mail',c.email||'Non renseigné'],['Téléphone',c.phone||'Non renseigné']];
    rows.forEach(([k,v],i)=>{const x=L+100+i*190;label(k,x,y+66,170);doc.font('Helvetica').fontSize(10.5).fillColor(ink).text(v,x,y+79,{width:176,lineBreak:false,ellipsis:true})});
    y+=118+16;
    if(c.address){doc.roundedRect(L,y,W,54,10).fillAndStroke('#ffffff',line);label('Adresse',L+18,y+12,200);doc.font('Helvetica').fontSize(10.5).fillColor(ink).text(String(c.address).replace(/\r?\n/g,' · '),L+18,y+27,{width:W-36,height:22,ellipsis:true});y+=54+16}
    // indicateurs
    const st=sum.stats,kw=(W-32)/3;
    [['Documents',String(st.invoiceCount+st.quoteCount),`${st.invoiceCount} facture(s) · ${st.quoteCount} devis`],['Facturé TTC',eur(st.invoicedTtc),'Factures émises'],['Devis en attente',eur(st.pendingQuotesTtc),`${st.quoteCount} devis`]].forEach(([k,v,sub],i)=>{
      const x=L+i*(kw+16);doc.roundedRect(x,y,kw,74,10).fill(i===1?NAVY:card);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(i===1?'#93c5fd':muted).text(k!.toUpperCase(),x+16,y+13,{width:kw-32,characterSpacing:1.2});
      doc.font('Helvetica-Bold').fontSize(17).fillColor(i===1?'#ffffff':ink).text(v!,x+16,y+29,{width:kw-32,lineBreak:false});
      doc.font('Helvetica').fontSize(8).fillColor(i===1?'#cbd5e1':muted).text(sub!,x+16,y+53,{width:kw-32,lineBreak:false})});
    y+=74+30;
    // tableau générique
    const table=(title:string,cols:{h:string;w:number;a?:'right'}[],data:string[][])=>{
      if(!data.length)return;y=need(y,80);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(title,L,y);y+=22;
      doc.roundedRect(L,y,W,26,6).fill(NAVY);let x=L+14;
      cols.forEach(cl=>{doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#cbd5e1').text(cl.h.toUpperCase(),x,y+9,{width:cl.w-8,align:cl.a,characterSpacing:1.1,lineBreak:false});x+=cl.w});y+=26;
      data.forEach((row,i)=>{const h=30;if(y+h>765){doc.addPage();y=56}if(i%2===0)doc.rect(L,y,W,h).fill('#f8fafc');let cx=L+14;
        row.forEach((cell,k)=>{const cl=cols[k]!;doc.font(k===0?'Helvetica-Bold':'Helvetica').fontSize(9.5).fillColor(ink).text(cell,cx,y+10,{width:cl.w-8,align:cl.a,lineBreak:false,ellipsis:true});cx+=cl.w});
        doc.moveTo(L,y+h).lineTo(R,y+h).lineWidth(0.5).strokeColor(line).stroke();y+=h});
      y+=26};
    table('Historique des documents',[{h:'N°',w:110},{h:'Type',w:64},{h:'Date',w:70},{h:'Prestation',w:150},{h:'Montant TTC',w:W-394-14,a:'right'}],
      (sum.documents as any[]).slice(0,40).map(d=>[d.number,d.document_type==='invoice'?'Facture':'Devis',fd(d.created_at),d.intervention||'',eur(d.total_ttc)]));
    table('Rendez-vous',[{h:'Date',w:150},{h:'Objet',w:W-150-14-90},{h:'Statut',w:90}],(sum.appointments as any[]).slice(0,15).map(a=>[new Date(a.starts_at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}),a.title,({planned:'Planifié',done:'Terminé',cancelled:'Annulé'} as any)[a.status]||a.status||'']));
    table('Appareils / dossiers',[{h:'Type',w:120},{h:'Marque / modèle',w:200},{h:'Référence',w:W-320-14}],(sum.devices as any[]).map(d=>[d.type||'',[d.brand,d.model].filter(Boolean).join(' '),d.imei||d.serial_number||'']));
    doc.end();
  });
  return {buffer,row:c};
}

export async function supplierPdf(organizationId:string,id:string){
  const r=await query(`select s.*,o.name company_name,o.activity company_activity,o.siret org_siret from suppliers s join organizations o on o.id=s.organization_id where s.id=$1 and s.organization_id=$2`,[id,organizationId]);
  if(!r.rowCount)throw new Error('NOT_FOUND'); const x=r.rows[0];
  return {buffer:await makePdf(`FICHE FOURNISSEUR`,{name:x.company_name,activity:x.company_activity,siret:x.org_siret},[['Fournisseur',x.name],['SIRET',x.siret||''],['Forme juridique',x.legal_form||''],['Site internet',x.website||''],['E-mail',x.email||''],['Téléphone',x.phone||''],['Adresse',x.address||'']],undefined),row:x};
}
