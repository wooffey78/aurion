import type PDFKit from 'pdfkit';
import { query } from '../db.js';
import { readPrivateObject } from './storage.js';

const pdfkit = async () => (await import('pdfkit')).default as unknown as typeof PDFKit;
const eur = (n: unknown) => { const v = Number(n || 0); const [i, d] = Math.abs(v).toFixed(2).split('.'); return `${v < 0 ? '-' : ''}${i!.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')},${d}\u00A0€`; };
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Export comptable : PDF consultable et téléchargeable, avec le détail mensuel et les totaux de l'année. */
export async function accountingReportPdf(organizationId: string, activityId: string, year: number) {
  const org = (await query('select name,siret,activity,logo_key from organizations where id=$1', [organizationId])).rows[0] || {};
  const logoBuffer: Buffer | null = org.logo_key ? await readPrivateObject(org.logo_key).catch(() => null) : null;
  const act = (await query('select name,legal_form,social_regime,vat_regime from activities where id=$1', [activityId])).rows[0];
  const contributions=(await query('select name,rate,basis,variable from activity_contributions where activity_id=$1 order by position,name',[activityId])).rows;
  const monthRows=(await query(`select date_trunc('month',p.paid_at)::date month,
      coalesce(sum(p.amount/nullif(1+q.vat_rate/100,0)),0)::numeric revenue_ht,
      coalesce(sum(p.amount-(p.amount/nullif(1+q.vat_rate/100,0))),0)::numeric vat,
      coalesce(sum((coalesce(q.part_cost,0)+coalesce(q.shipping_cost,0)+case when q.mileage_mode='margin'
           then case when coalesce(q.mileage_internal_rate,0)>0
                     then coalesce(q.mileage_km,0)*q.mileage_internal_rate
                     else coalesce(q.mileage_total,0)
                end
           else 0 end+coalesce(q.labor_internal_cost_ht,0))*least(1,p.amount/nullif(q.total_ttc,0))),0)::numeric purchases,
      coalesce(sum((p.amount/nullif(1+q.vat_rate/100,0))*coalesce((select sum(coalesce((c->>'rate')::numeric,0)) from jsonb_array_elements(case when jsonb_typeof(q.contribution_snapshot)='array' then q.contribution_snapshot else '[]'::jsonb end) c where coalesce(c->>'basis','ca_ht')='ca_ht'),q.urssaf_rate,0)/100),0)::numeric social,
      count(distinct q.id)::int invoice_count
    from invoice_payments p join quotes q on q.id=p.quote_id where q.organization_id=$1 and q.activity_id=$2 and q.document_type='invoice' and extract(year from p.paid_at)=$3 group by 1 order by 1`,[organizationId,activityId,year])).rows;
  const months=monthRows.map(m=>({month:m.month,revenueHt:Number(m.revenue_ht),vat:Number(m.vat),purchases:Number(m.purchases),social:Number(m.social),invoiceCount:Number(m.invoice_count)}));
  const byIdx = new Map(months.map(m => [new Date(m.month).getUTCMonth(), m]));
  const totals = months.reduce((t, m) => ({ revenueHt: t.revenueHt + m.revenueHt, vat: t.vat + m.vat, purchases: t.purchases + m.purchases, social: t.social + m.social, invoices: t.invoices + m.invoiceCount }), { revenueHt: 0, vat: 0, purchases: 0, social: 0, invoices: 0 });

  const details=(await query(`select q.id,q.number,q.document_type,q.created_at,q.payment_status,q.part_cost,q.shipping_cost,q.mileage_km,q.mileage_rate,q.mileage_total,q.margin,q.margin_coefficient_percent,q.coefficient_value,q.coefficient_unit,q.coefficient_basis,q.vat_rate,q.urssaf_rate,q.total_ht,q.total_tva,q.total_ttc,c.name client_name,
      coalesce((select json_agg(json_build_object('label',qi.label,'quantity',qi.quantity,'unitCost',qi.unit_cost,'unitPrice',qi.unit_price,'saleCoefficientPercent',qi.sale_coefficient_percent,'suppliers',coalesce((select json_agg(json_build_object('name',s.name,'purchasePrice',sp.purchase_price,'reference',sp.supplier_reference) order by sp.purchase_price) from supplier_parts sp join suppliers s on s.id=sp.supplier_id where sp.part_id=qi.part_id),'[]'::json))) order by qi.position) from quote_items qi where qi.quote_id=q.id),'[]'::json) items
      from quotes q left join clients c on c.id=q.client_id where q.organization_id=$1 and q.activity_id=$2 and extract(year from q.created_at)=$3 order by q.created_at desc`,[organizationId,activityId,year])).rows;
  const entries=(await query(`select entry_date,entry_type,amount,label from accounting_entries where organization_id=$1 and activity_id=$2 and extract(year from entry_date)=$3 order by entry_date desc,created_at desc`,[organizationId,activityId,year])).rows;
  const PDFDocument = await pdfkit();
  const buffer: Buffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `Export comptable ${year}`, Author: org.name || 'Aurion' } });
    const chunks: Buffer[] = []; doc.on('data', (c: Buffer) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const L = 56, R = 539, W = R - L, NAVY = '#0b1220', accent = '#0b63ce', ink = '#0f172a', muted = '#64748b', line = '#e2e8f0', card = '#f8fafc';
    const footer = () => { const sx = doc.x, sy = doc.y, b = doc.page.margins.bottom; doc.page.margins.bottom = 0; doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(`${org.name || ''}  ·  Export comptable ${year}  ·  généré le ${new Date().toLocaleDateString('fr-FR')}`, L, 806, { width: W, align: 'center', lineBreak: false }); doc.page.margins.bottom = b; doc.x = sx; doc.y = sy; };
    footer(); doc.on('pageAdded', footer);
    const label = (t: string, x: number, y: number, w: number) => doc.font('Helvetica-Bold').fontSize(7.5).fillColor(muted).text(t.toUpperCase(), x, y, { width: w, characterSpacing: 1.3 });
    const writeFiscalLine = (d:any, x:number, right:number, yy:number, text:string) => d.font('Helvetica').fontSize(8).fillColor(ink).text(text,x+10,yy,{width:right-x-20,lineBreak:false});

    let tx = L;
    if (logoBuffer) { try { doc.image(logoBuffer, L, 52, { fit: [52, 52] }); tx = L + 68; } catch { /* logo illisible */ } }
    doc.font('Helvetica-Bold').fontSize(16).fillColor(ink).text(org.name || 'Entreprise', tx, 56, { width: 280 });
    if (org.siret) doc.font('Helvetica').fontSize(9).fillColor(muted).text(`SIRET ${org.siret}`, tx, doc.y + 2, { width: 280 });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(accent).text('EXPORT COMPTABLE', R - 240, 56, { width: 240, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(20).fillColor(ink).text(String(year), R - 240, 76, { width: 240, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(act?.name || '', R - 240, 100, { width: 240, align: 'right' });
    let y = Math.max(doc.y, 120) + 20; doc.rect(L, y, W, 3).fill(accent); y += 30;

    const kw = (W - 24) / 4;
    [['CA HT annuel', eur(totals.revenueHt)], ['TVA collectée', eur(totals.vat)], ['Cotisations estimées', eur(totals.social)], ['Factures émises', String(totals.invoices)]].forEach(([k, v], i) => {
      const x = L + i * (kw + 8); doc.roundedRect(x, y, kw, 66, 10).fill(i === 0 ? NAVY : card);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(i === 0 ? '#93c5fd' : muted).text(k!.toUpperCase(), x + 14, y + 12, { width: kw - 28, characterSpacing: 1 });
      doc.font('Helvetica-Bold').fontSize(15).fillColor(i === 0 ? '#ffffff' : ink).text(v!, x + 14, y + 30, { width: kw - 28, lineBreak: false });
    });
    y += 66 + 30;

    if(contributions.length){
      doc.roundedRect(L,y,W,20,5).fill(card);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(muted).text('COTISATIONS CONFIGURÉES POUR L’ACTIVITÉ',L+10,y+6,{width:W-20,characterSpacing:1}); y+=26;
      for(const c of contributions){
        const rate=c.rate===null||c.rate===undefined?'variable':`${Number(c.rate).toLocaleString('fr-FR',{maximumFractionDigits:4})} %`;
        writeFiscalLine(doc, L, R, y, `${c.name} · ${rate} · ${c.basis||'assiette selon régime'}`); y+=15;
      }
      y+=8;
    }

    doc.roundedRect(L, y, W, 26, 6).fill(NAVY);
    const cols = [{ h: 'Mois', w: 140 }, { h: 'CA HT', w: (W - 140) / 4, a: 'right' as const }, { h: 'TVA', w: (W - 140) / 4, a: 'right' as const }, { h: 'Achats', w: (W - 140) / 4, a: 'right' as const }, { h: 'Cotisations', w: (W - 140) / 4, a: 'right' as const }];
    let cx = L + 14; cols.forEach(c => { doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#cbd5e1').text(c.h.toUpperCase(), cx, y + 9, { width: c.w - 8, align: c.a, characterSpacing: 1.1, lineBreak: false }); cx += c.w; });
    y += 26;
    for (let i = 0; i < 12; i++) {
      const m = byIdx.get(i);
      if (y + 26 > 762) { doc.addPage(); y = 56; }
      if (i % 2 === 0) doc.rect(L, y, W, 26).fill('#f8fafc');
      cx = L + 14;
      const vals = [MONTHS_FR[i]!.charAt(0).toUpperCase() + MONTHS_FR[i]!.slice(1) + ' ' + year, m ? eur(m.revenueHt) : '—', m ? eur(m.vat) : '—', m && m.purchases ? eur(m.purchases) : '—', m && m.social ? eur(m.social) : '—'];
      cols.forEach((c, k) => { doc.font(k === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(m ? ink : muted).text(vals[k]!, cx, y + 8, { width: c.w - 8, align: c.a, lineBreak: false }); cx += c.w; });
      doc.moveTo(L, y + 26).lineTo(R, y + 26).lineWidth(0.5).strokeColor(line).stroke(); y += 26;
    }
    // Détail comptable complet : factures, pièces, fournisseurs, coefficients, marge, TVA, cotisations et écritures.
    const newPage=(title:string)=>{doc.addPage();y=56;doc.font('Helvetica-Bold').fontSize(15).fillColor(ink).text(title,L,y,{width:W});y=88;};
    const writeLine=(text:string,bold=false)=>{if(y>760){newPage('Export comptable — suite')}doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(8.5).fillColor(ink).text(text,L,y,{width:W});y+=15;};
    if(details.length){newPage('Détail des documents comptables');for(const q of details){writeLine(`${q.document_type==='invoice'?'FACTURE':'DEVIS'} ${q.number} · ${new Date(q.created_at).toLocaleDateString('fr-FR')} · ${q.client_name||'Sans client'}`,true);writeLine(`Statut paiement : ${q.payment_status||'—'} · Total TTC ${eur(q.total_ttc)} · HT ${eur(q.total_ht)} · TVA ${eur(q.total_tva)}`);writeLine(`Achats HT ${eur(q.part_cost)} · Livraison ${eur(q.shipping_cost)} · Frais km ${eur(q.mileage_total)} (${Number(q.mileage_km||0).toLocaleString('fr-FR')} km × ${Number(q.mileage_rate||0).toLocaleString('fr-FR',{maximumFractionDigits:4})} €/km) · Marge ${eur(q.margin)} · Coefficient ${Number(q.coefficient_value!=null?q.coefficient_value:q.margin_coefficient_percent||0).toLocaleString('fr-FR')} ${q.coefficient_unit==='euro'?'€':'%'} (${q.coefficient_basis==='margin'?'marge':'pièces'}) · Cotisations ${Number(q.urssaf_rate||0).toLocaleString('fr-FR')} %`);
      for(const i of (q.items||[])){const suppliers=(i.suppliers||[]).map((z:any)=>`${z.name} ${eur(z.purchasePrice)}`).join(' ; ')||'Aucun fournisseur rattaché';writeLine(`  • ${i.quantity} × ${i.label} · achat ${eur(i.unitCost)} · vente ${eur(i.unitPrice)} · coef ${Number(i.saleCoefficientPercent||0).toLocaleString('fr-FR')} % · ${suppliers}`);}
      writeLine(`  Cotisations estimées : ${eur(Number(q.total_ht||0)*Number(q.urssaf_rate||0)/100)} · TVA : ${eur(q.total_tva)} · Marge nette estimée : ${eur(Number(q.margin||0)-Number(q.total_ht||0)*Number(q.urssaf_rate||0)/100)}`);y+=8;
    }}
    if(entries.length){newPage('Écritures de trésorerie et comptabilité');for(const x of entries){writeLine(`${new Date(x.entry_date).toLocaleDateString('fr-FR')} · ${x.entry_type} · ${eur(x.amount)} · ${x.label||''}`);}}
    y += 12;
    if (y + 60 > 780) { doc.addPage(); y = 56; }
    doc.font('Helvetica').fontSize(7.5).fillColor(muted).text('Document généré automatiquement par Aurion à partir des factures émises et des écritures saisies. Il ne remplace pas une déclaration fiscale ou sociale officielle ; les cotisations sont une estimation selon le taux configuré par activité.', L, y, { width: W, lineGap: 1.5 });
    doc.end();
  });
  return { buffer, companyName: org.name || 'Entreprise' };
}

/** Export CSV comptable : une ligne par devis/facture avec les calculs utiles. */
export async function accountingReportCsv(organizationId: string, activityId: string, year: number) {
  const activityContributions=(await query('select name,rate,basis,variable from activity_contributions where activity_id=$1 order by position,name',[activityId])).rows;
  const contributionSummary=activityContributions.map(c=>`${c.name}: ${c.rate===null||c.rate===undefined?'variable':Number(c.rate).toLocaleString('fr-FR',{maximumFractionDigits:4})+' %'} (${c.basis||'assiette variable'})`).join(' | ');
  const rows=(await query(`select q.number,q.document_type,q.created_at,q.payment_status,q.total_ht,q.total_tva,q.total_ttc,q.part_cost,q.shipping_cost,q.mileage_km,q.mileage_rate,q.mileage_total,q.margin,q.margin_coefficient_percent,q.coefficient_value,q.coefficient_unit,q.coefficient_basis,q.vat_rate,q.urssaf_rate,c.name client_name
    from quotes q left join clients c on c.id=q.client_id
    where q.organization_id=$1 and q.activity_id=$2 and extract(year from q.created_at)=$3 order by q.created_at asc`,[organizationId,activityId,year])).rows;
  const esc=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;
  // Neutralize spreadsheet formulas only in text fields. Numeric amounts remain numeric.
  const escText=(v:unknown)=>{const value=String(v??'');return esc(/^[\s\uFEFF]*[=+\-@]/.test(value)?`'${value}`:value)};
  const head=['Type','Numéro','Date','Client','Statut paiement','HT','TVA','TTC','Achats HT','Livraison HT','Km','€/km','Frais km','Marge','Coefficient','Unité coefficient','Base coefficient','TVA %','Cotisations %','Cotisations estimées','Cotisations configurées'];
  const textFields=new Set([0,1,2,3,4,15,16,20]);
  const lines=rows.map(r=>[r.document_type==='invoice'?'Facture':'Devis',r.number,new Date(r.created_at).toLocaleDateString('fr-FR'),r.client_name||'',r.payment_status||'',Number(r.total_ht||0).toFixed(2),Number(r.total_tva||0).toFixed(2),Number(r.total_ttc||0).toFixed(2),Number(r.part_cost||0).toFixed(2),Number(r.shipping_cost||0).toFixed(2),Number(r.mileage_km||0).toFixed(2),Number(r.mileage_rate||0).toFixed(4),Number(r.mileage_total||0).toFixed(2),Number(r.margin||0).toFixed(2),Number(r.coefficient_value!=null?r.coefficient_value:r.margin_coefficient_percent||0).toFixed(2),r.coefficient_unit==='euro'?'€':'%',r.coefficient_basis==='margin'?'Marge':'Pièces',Number(r.vat_rate||0).toFixed(2),Number(r.urssaf_rate||0).toFixed(3),(Number(r.total_ht||0)*Number(r.urssaf_rate||0)/100).toFixed(2),contributionSummary].map((value,index)=>textFields.has(index)?escText(value):esc(value)).join(';'));
  return Buffer.from('\ufeff'+[head.map(esc).join(';'),...lines].join('\r\n'),'utf8');
}
