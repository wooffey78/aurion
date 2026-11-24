// Devis & factures : consulter, modifier, télécharger (PDF / Word / ODT), envoyer, facturer, supprimer.
import{api}from'../../core/api.js';
import{S,e,money,toast,modalForm,confirmDelete,openDoc,emailToast,itemsText,prof,hooks,askConfirm}from'./core.js';

const kindOf=q=>q.document_type==='invoice'?'invoices':'quotes';
const fmt=d=>new Date(d).toLocaleDateString('fr-FR');
const invoicePenalty=q=>Number(q.total_penalty_amount||0)||0;
const invoiceDue=q=>Number(q.total_ttc||0)+invoicePenalty(q);
const invoiceStatus=q=>!q.sent_at?'Facture non envoyée':Number(q.reminder_count||0)>=4?`${Number(q.reminder_count)}e relance envoyée avec majoration`:Number(q.reminder_count||0)===3?'3e relance envoyée':Number(q.reminder_count||0)===2?'2e relance envoyée':Number(q.reminder_count||0)===1?'Première relance envoyée':'Facture envoyée';
const documentContributionEstimate=q=>{
  const rows=Array.isArray(q?.contribution_snapshot)?q.contribution_snapshot.filter(c=>Number.isFinite(Number(c?.rate))):[];
  if(!rows.length)return {amount:Math.max(0,Number(q?.total_ht||0)*Number(q?.urssaf_rate||0)/100),source:'legacy'};
  const billedMileage=q?.mileage_mode==='client_price'?Math.max(0,Number(q?.mileage_total||0)):0;
  const caHt=Math.max(0,Number(q?.total_ht||0)-billedMileage);
  const grossMargin=Number(q?.margin||0);
  let provisionalProfit=grossMargin,total=0;
  for(const row of rows){
    const basis=String(row?.basis||'ca_ht');
    const base=basis==='gross_margin'?grossMargin:basis==='profit'?provisionalProfit:caHt;
    const amount=Math.max(0,base)*Number(row.rate)/100;
    total+=amount;provisionalProfit=grossMargin-total;
  }
  return {amount:total,source:'snapshot'};
};

const savPartOptions=(selected='')=>`<option value="">Votre choix</option>${(S.parts||[]).map(p=>`<option value="${e(p.id)}" ${selected===p.id?'selected':''}>${e(p.name)}${Number(p.selling_price)>0?` · ${money(p.selling_price)} HT`:''}</option>`).join('')}`;
const savRow=(item={},prefix='sav')=>`<div class="sav-line stack" data-sav-row>
  <div class="grid-2"><label class="field"><span>Pièce / prestation</span><select class="sav-part">${savPartOptions(item.partId||'')}</select></label><label class="field"><span>Désignation</span><input class="sav-label" value="${e(item.label||'')}" placeholder="Pièce ou main-d’œuvre"></label></div>
  <div class="grid-2"><label class="field"><span>Quantité</span><input class="sav-qty" type="number" min="0.01" step="any" value="${item.quantity!=null&&Number(item.quantity)>0?e(item.quantity):''}" placeholder="1"></label><label class="field"><span>Tarif SAV unitaire HT</span><input class="sav-price" type="number" min="0" step="0.01" value="${item.unitPrice!=null&&Number(item.unitPrice)>0?e(item.unitPrice):''}" placeholder="Tarif SAV"></label></div>
  <div class="button-row"><button type="button" class="btn danger small sav-remove">Retirer cette ligne</button></div>
</div>`;
const savUnitPrice=(item,invoiceShipping=0)=>{const part=(S.parts||[]).find(p=>p.id===item.partId);const supplierPrices=(part?.suppliers||[]).map(s=>Number(s.purchasePrice)).filter(n=>n>0);const purchase=supplierPrices.length?Math.min(...supplierPrices):Number(item.unitCost||0);return Math.max(0,purchase+Number(invoiceShipping||0));};
const savRows=(items=[],invoiceShipping=0)=>Array.isArray(items)&&items.length?items.map(i=>savRow({...i,unitPrice:savUnitPrice(i,invoiceShipping)})).join(''):savRow();
const readSavItems=m=>[...m.querySelectorAll('[data-sav-row]')].map(row=>({
  label:String(row.querySelector('.sav-label')?.value||'').trim(),
  quantity:Number(String(row.querySelector('.sav-qty')?.value||'').replace(',','.'))||0,
  unitPrice:Number(String(row.querySelector('.sav-price')?.value||'').replace(',','.'))||0,
  partId:row.querySelector('.sav-part')?.value||null
})).filter(x=>x.label&&x.quantity>0);
const savTotal=m=>readSavItems(m).reduce((t,x)=>t+x.quantity*x.unitPrice,0);
const refreshSavTotal=m=>{const total=savTotal(m);const node=m.querySelector('.sav-total');if(node)node.textContent=total>0?`-${money(total)}`:money(0);};
const bindSavForm=(m,{items=[],invoiceShipping=0}={})=>{
  const syncPartLabel=row=>{const select=row.querySelector('.sav-part'),label=row.querySelector('.sav-label'),price=row.querySelector('.sav-price');const part=(S.parts||[]).find(x=>x.id===select?.value);if(part&&label&&!label.value)label.value=part.name;if(part&&price)price.value=savUnitPrice({partId:part.id,unitCost:0},invoiceShipping).toFixed(2);};
  m.querySelector('#sav-add-line')?.addEventListener('click',()=>{m.querySelector('#sav-lines')?.insertAdjacentHTML('beforeend',savRow());const row=m.querySelector('#sav-lines')?.lastElementChild;row?.querySelector('.sav-label')?.focus();refreshSavTotal(m)});
  m.querySelector('#sav-lines')?.addEventListener('click',ev=>{const b=ev.target.closest('.sav-remove');if(!b)return;const rows=[...m.querySelectorAll('[data-sav-row]')];if(rows.length>1)b.closest('[data-sav-row]').remove();else{b.closest('[data-sav-row]').querySelectorAll('input').forEach(i=>{i.value=''});b.closest('[data-sav-row]').querySelector('.sav-part').value='';}refreshSavTotal(m)});
  m.querySelector('#sav-lines')?.addEventListener('input',()=>refreshSavTotal(m));
  m.querySelector('#sav-lines')?.addEventListener('change',ev=>{if(ev.target.classList.contains('sav-part'))syncPartLabel(ev.target.closest('[data-sav-row]'));refreshSavTotal(m)});
  refreshSavTotal(m);
};
const openSavForInvoice=async q=>{
  const warranties=q.warranties||[];
  if(!warranties.length){modalForm(`SAV · ${e(q.number)}`,`<div class="notice">Aucune garantie active n’est associée à cette facture. Le bouton SAV reste disponible, mais un dossier SAV ne peut être créé qu’avec une garantie encore valide.</div>`,async()=>{},{label:'Fermer'});return;}
  const remaining=Math.min(...warranties.map(w=>Number(w.remainingDays||0)));
  const scope=[...new Set(warranties.map(w=>w.scopeType).filter(Boolean))].map(v=>v==='parts'?'pièces':v==='labor'?'main-d’œuvre':'pièces + main-d’œuvre').join(', ');
  const fields=`<p class="muted">Garantie restante : <b>${remaining} jour${remaining>1?'s':''}</b>${scope?` · Couverture : <b>${e(scope)}</b>`:''}. Le SAV est sans coefficient et son montant total sera toujours nul ou négatif.</p>
    <label class="field"><span>Client</span><select id="savClient" disabled><option value="${e(q.client_id||'')}" selected>${e(q.client_name||'Client')}</option></select></label>
    <div id="sav-lines" class="stack">${savRows(q.items||[],Number(q.shipping_cost||0)).replaceAll('class="sav-line stack"','class="sav-line stack"')}</div>
    <div class="button-row"><button type="button" class="btn secondary" id="sav-add-line">+ Ajouter une pièce / main-d’œuvre</button></div>
    <div class="calc-total"><span>Total SAV</span><strong class="sav-total">0,00 €</strong></div>
    <label class="field"><span>Note <em class="tag">facultatif</em></span><textarea id="savNote" placeholder="Motif ou détail du SAV"></textarea></label>`;
  const m=modalForm(`SAV · ${e(q.number)}`,fields,async sm=>{
    const arr=readSavItems(sm);
    await api.createSav({clientId:q.client_id,invoiceId:q.id,items:arr,note:sm.querySelector('#savNote').value.trim()||null});
    await hooks.refresh('invoices');
  },{label:'Enregistrer le SAV'});
  bindSavForm(m,{items:q.items||[]});
};

export const view=()=>{
  const f=S.docFilter,list=S.quotes.filter(q=>f==='all'||(f==='invoice')===(q.document_type==='invoice'));
  const savList=S.sav||[];
  return`<div class="page-head"><div><span class="eyebrow">DOCUMENTS COMMERCIAUX</span><h1>Devis & factures</h1><p>Consultez, modifiez, téléchargez, envoyez ou supprimez vos documents.</p></div><div class="button-row"><button class="btn primary" data-new-type="quote">+ Nouveau devis</button><button class="btn secondary" data-new-type="invoice">+ Nouvelle facture</button><button class="btn secondary" id="parse-bordereau">Bordereau → brouillon</button>${(S.quotes||[]).some(x=>x.email_pending)?`<button class="btn primary" id="flush-outbox" title="Envoyer immédiatement les e-mails mis en attente (messagerie opérationnelle)">Envoyer les e-mails en attente</button>`:''}</div></div>
  <div class="doc-search"><input id="doc-search" type="search" placeholder="Rechercher par identité, montant ou date…" aria-label="Rechercher par identité, montant ou date"></div><div class="seg">${[['all','Tous'],['quote','Devis'],['invoice','Factures']].map(([k,l])=>`<button class="seg-btn ${f===k?'active':''}" data-filter="${k}">${l}</button>`).join('')}</div>
  ${list.some(q=>q.document_type==='invoice'&&Number(q.reminder_count||0)===3&&q.payment_status!=='paid')?'<div class="notice warn-notice">⚠ Une ou plusieurs factures nécessitent une 4e relance. Ouvrez la section Devis & factures pour définir ou vérifier la majoration puis envoyer la relance.</div>':''}<section class="panel">${list.map(q=>`<article class="doc-row" data-client-name="${e(String(q.client_name||'').toLowerCase())}" data-doc-search="${e([q.client_name,q.total_ttc,q.created_at,q.number].join(' ').toLowerCase())}"><div class="doc-main"><div class="doc-title"><b>${e(q.number)}</b><span class="pill">${q.document_type==='invoice'?'Facture':'Devis'}</span>${q.email_pending?'<span class="pill email-pending-pill" title="L\'e-mail n\'a pas pu partir immédiatement : il est en file d\'attente et partira dès que la messagerie sera opérationnelle">E-mail en attente</span>':''}${q.document_type!=='invoice'&&q.sent_at?'<span class="pill ok">Envoyé</span>':''}${q.document_type==='invoice'?`<span class="pill">${e(invoiceStatus(q))}</span><span class="pill ${q.payment_status==='paid'?'ok':''}">${q.payment_status==='paid'?'Réglé':'Paiement en attente'}</span>`:''}${q.warranties?.length?`<span class="pill ok warranty-live">Garantie restante · ${Math.min(...q.warranties.map(w=>Number(w.remainingDays||0)))} jour${Math.min(...q.warranties.map(w=>Number(w.remainingDays||0)))>1?'s':''}</span>`:''}</div><small>${e(q.client_name||'Client')} · ${fmt(q.created_at)}</small><small>${e(q.intervention||'')}${itemsText(q)?` — ${e(itemsText(q))}`:''}${Number(q.mileage_total||0)>0?` · ${Number(q.mileage_km||0).toLocaleString('fr-FR')} km × ${Number(q.mileage_rate||0).toLocaleString('fr-FR',{maximumFractionDigits:4})} €/km`:''}</small></div><div class="doc-total">${money(q.document_type==='invoice'?invoiceDue(q):q.total_ttc)}<small>TTC</small></div>
   <div class="doc-actions"><button class="btn secondary small view-doc" data-id="${q.id}">Voir</button><button class="btn secondary small edit-doc" data-id="${q.id}">Modifier</button><button class="btn secondary small pdf-view" data-id="${q.id}">Aperçu PDF</button><button class="link-btn dl" data-id="${q.id}" data-ext="pdf">PDF</button><button class="link-btn dl" data-id="${q.id}" data-ext="docx">Word</button><button class="link-btn dl" data-id="${q.id}" data-ext="odt">ODT</button><button class="btn secondary small mail-doc" data-id="${q.id}">E-mail</button><button class="btn secondary small cloud-doc" data-id="${q.id}" data-kind="${q.document_type==='invoice'?'invoice':'quote'}" title="Archiver le PDF dans votre cloud personnel">Cloud</button>${q.document_type==='invoice'?`<button class="btn secondary small integrity-doc" data-id="${q.id}" title="Vérifier l'empreinte et la chaîne d'intégrité du coffre">Intégrité</button>`:''}${q.document_type!=='invoice'?`<button class="btn primary small convert" data-id="${q.id}">Facturer</button>`:`${q.sent_at?`<button class="btn secondary small sav-from-invoice" data-id="${q.id}">SAV</button>`:''}${q.document_type==='invoice'&&q.payment_status!=='paid'?`<button class="btn secondary small schedule-doc" data-id="${q.id}">Échéancier</button>`:''}${q.document_type==='invoice'&&q.payment_status!=='paid'?`<button class="btn secondary small paylink-doc" data-id="${q.id}">Lien de paiement</button>`:''}<button class="btn ${q.payment_status==='paid'?'secondary':'primary'} small settle-doc" data-id="${q.id}" ${q.payment_status==='paid'?'disabled':''}>${q.payment_status==='paid'?'Réglé':'Réglé'}</button>${q.document_type==='invoice'&&q.payment_status!=='paid'&&Number(q.reminder_count||0)===3?`<button class="btn secondary small penalty-config" data-id="${q.id}">Configurer la majoration</button>`:''}${q.document_type==='invoice'&&q.payment_status!=='paid'&&Number(q.reminder_count||0)<1000?`<button class="btn secondary small remind-doc" data-id="${q.id}">Relance</button>`:''}`}${`<button class="btn danger small delete-doc" data-id="${q.id}" aria-label="Supprimer le document ${e(q.number)}" title="Suppression définitive">Supprimer</button>`}</div>${q.document_type==='invoice'?`<details class="invoice-history"><summary>Facture et relances envoyées</summary><div class="stack"><div class="list-row"><div><b>Facture ${e(q.number)}</b><small>Montant facture : ${money(q.total_ttc||0)} TTC</small></div><strong>${money(invoiceDue(q))}</strong></div>${(q.reminders||[]).map(r=>`<div class="list-row"><div><b>${Number(r.reminderNumber)===1?'1ère':`${Number(r.reminderNumber)}e`} relance</b><small>Envoyée le ${fmt(r.createdAt)}${Number(r.penaltyAmount||0)>0?` · Majoration : ${money(r.penaltyAmount)}`:''}</small></div><strong>${money(Number(q.total_ttc||0)+Number((q.reminders||[]).filter(x=>Number(x.reminderNumber)<=Number(r.reminderNumber)).reduce((n,x)=>n+Number(x.penaltyAmount||0),0)))} TTC</strong></div>`).join('')||'<p class="muted">Aucune relance envoyée.</p>'}</div></details>`:''}</article>`).join('')||'<div class="empty">Aucun document.</div>'}</section><section class="panel"><div class="section-title"><div><h2>SAV</h2><small>Consultation, modification et suppression des dossiers SAV.</small></div></div>${savList.map(x=>`<article class="doc-row sav-row"><div class="doc-main"><div class="doc-title"><b>SAV</b><span class="pill">${e(x.invoice_number||'Facture')}</span></div><small>${e(x.client_name||'Client')} · ${fmt(x.created_at)}</small><small>${(x.items||[]).map(i=>`${Number(i.quantity)} × ${e(i.label)}`).join(', ')}</small>${x.note?`<small>Note SAV : ${e(x.note)}</small>`:''}</div><div class="doc-total">${money(x.amount_ttc||0)}<small>TTC</small></div><div class="doc-actions"><button class="btn secondary small edit-sav" data-id="${x.id}">Modifier</button><button class="btn danger small delete-sav" data-id="${x.id}">Supprimer</button></div></article>`).join('')||'<div class="empty">Aucun SAV enregistré.</div>'}</section>`;
};

export function bind(){
  const all=s=>document.querySelectorAll(s),get=id=>S.quotes.find(x=>x.id===id); const search=document.querySelector('#doc-search'); search?.addEventListener('input',ev=>{const q=String(ev.target.value||'').trim().toLowerCase();all('.doc-row').forEach(r=>r.hidden=!!q&&!r.dataset.docSearch.includes(q))});
  all('[data-new-type]').forEach(b=>b.onclick=()=>{S.editing=null;S.quoteDraft=null;S.startBlankQuote=true;S.documentType=b.dataset.newType;hooks.refresh('quote',{navigation:true}).catch(x=>toast(x.message,'error'))});
  all('[data-filter]').forEach(b=>b.onclick=()=>{S.docFilter=b.dataset.filter;hooks.show('invoices')});
  // Bloc 12 — bordereau professionnel → brouillon de facture (chaîne déterministe, sans IA).
  document.querySelector('#parse-bordereau')?.addEventListener('click',()=>{
    modalForm('Bordereau → brouillon de facture',`<p class="help">Formats pris en charge : PDF texte, TXT, CSV (extraction déterministe : pdftotext/LibreOffice, analyse de tableaux, formats numériques français — sans IA distante). Les scans image nécessitent un OCR local non inclus : collez le texte dans un TXT si besoin.</p><label class="field"><span>Bordereau (PDF texte / TXT / CSV)</span><input id="bordereau-file" type="file" accept=".pdf,.txt,.csv,application/pdf,text/plain,text/csv"></label>`,async m=>{
      const file=m.querySelector('#bordereau-file')?.files?.[0];
      if(!file)throw new Error('Choisissez un fichier de bordereau.');
      let parsed;
      try{parsed=await api.parseBordereau(file)}catch(x){throw new Error(x?.message||'Extraction impossible.')}
      openBordereauReview(parsed);
    },{label:'Analyser le bordereau'});
  });
  // Relecture : toutes les valeurs détectées restent modifiables ; confiance et champs manquants affichés.
  function openBordereauReview(parsed){
    const fields=parsed.fields||[];
    const fieldInput=(f)=>`<label class="field"><span>${e(f.label)}${f.confidence==='labeled'?' <em class="tag ok">étiquette</em>':f.confidence==='inferred'?' <em class="tag">déduit</em>':' <em class="tag">manquant</em>'}</span><input id="bd-${e(f.key)}" value="${e(f.value||'')}" data-line="${f.line??''}" placeholder="Corrigez ou complétez…"></label>`;
    const itemRow=(it,i)=>`<div class="grid-3 bordereau-item" data-i="${i}"><label class="field"><span>Libellé${it.matchKind==='exact'?' <em class="tag ok">catalogue</em>':it.matchKind==='partial'?' <em class="tag">approchant</em>':''}</span><input id="bd-item-label-${i}" value="${e(it.item.label)}"></label><label class="field"><span>Qté</span><input id="bd-item-qty-${i}" type="number" min="0.01" step="any" value="${it.item.quantity}"></label><label class="field"><span>Prix unitaire HT</span><input id="bd-item-price-${i}" type="number" min="0" step="0.01" value="${it.item.unitPrice}"></label></div>`;
    modalForm('Relecture du bordereau',`<p class="muted">Source : ${e(parsed.fileName||'bordereau')} · ${Number(parsed.linesAnalyzed||0)} ligne(s) analysée(s). Toutes les valeurs sont modifiables — rien n\'est envoyé ni créé sans votre validation.</p>${(parsed.warnings||[]).map(w=>`<p class="notice warn-notice">${e(w)}</p>`).join('')||''}${fields.map(fieldInput).join('')}<h3 class="calc-sub">Lignes détectées</h3>${(parsed.items||[]).map(itemRow).join('')||'<p class="muted">Aucune ligne détectée — ajoutez-la manuellement après création.</p>'}${parsed.totals&&parsed.totals.ttc!=null?`<div class="calc-total"><span>Total TTC affiché</span><strong>${money(parsed.totals.ttc)}</strong></div>`:''}`,async m=>{
      const fv=k=>m.querySelector(`#bd-${k}`)?.value.trim()||'';
      const clientName=fv('client');
      const items=(parsed.items||[]).map((it,i)=>({label:m.querySelector(`#bd-item-label-${i}`)?.value.trim()||it.item.label,quantity:Number(m.querySelector(`#bd-item-qty-${i}`)?.value||it.item.quantity)||1,unitCost:0,unitPrice:Number(m.querySelector(`#bd-item-price-${i}`)?.value||it.item.unitPrice)||0,activityCategory:null}));
      if(!items.length)throw new Error('Aucune ligne : créez le brouillon seulement si le bordereau contient des lignes.');
      if(!clientName)throw new Error('Indiquez le nom du client (champ Client).');
      const siret=fv('siret').replace(/\s/g,'');
      const newClient={name:clientName,email:fv('email'),phone:fv('phone'),address:fv('address'),siret:siret&&/^\d{9,14}$/.test(siret)?siret:''};
      // Confirmation explicite avant création (popup Aurion) ; brouillon de facture NON ÉMIS.
      if(!await askConfirm({title:'Créer le brouillon de facture ?',message:`Client : ${clientName}\n${items.length} ligne(s)\nLe brouillon reste modifiable et n\'est pas émis : la facture définitive passe par « Facturer ».`,confirmLabel:'Créer le brouillon'}))return;
      const created=await api.createQuote({documentType:'quote',intervention:fv('reference')?`Bordereau ${fv('reference')}`:'Bordereau reçu',newClient,items,vatRate:0,urssafRate:0,allowLoss:true,catalogPricing:false});
      toast(`Brouillon ${created.number} créé : relisez-le puis facturez.`,'success');
      await hooks.refresh('invoices');
    },{label:'Créer le brouillon'});
  }
  all('.pdf-view').forEach(b=>b.onclick=()=>{const q=get(b.dataset.id);openDoc(kindOf(q),q.id,'pdf','view')});
  all('.dl').forEach(b=>b.onclick=()=>{const q=get(b.dataset.id);openDoc(kindOf(q),q.id,b.dataset.ext,'download')});
  all('.edit-doc').forEach(b=>b.onclick=()=>{S.editing=get(b.dataset.id);if(!S.editing)return;S.documentType=S.editing.document_type==='invoice'?'invoice':'quote';hooks.refresh('quote',{navigation:true}).catch(x=>toast(x.message,'error'))});
  all('.delete-doc').forEach(b=>b.onclick=()=>{const q=get(b.dataset.id);confirmDelete(`Supprimer définitivement ${q.document_type==='invoice'?'la facture':'le devis'} ${q.number} ?\nSes fichiers PDF, Word et ODT seront aussi supprimés. Cette action est irréversible.`,()=>api.deleteQuote(q.id),'Document supprimé',{title:`Supprimer ${q.number} ?`})});
  // Bloc 13 — lien de paiement (décision D3 non tranchée : le message reste honnête si non configuré).
  all('.paylink-doc').forEach(b=>b.onclick=async()=>{const q=get(b.dataset.id);if(!q)return;
    if(!await askConfirm({title:'Générer un lien de paiement ?',message:`Un lien sera créé pour le montant restant de ${e(q.number)}. Il est lié à ce montant : toute modification de la facture l'invalide. Le règlement n'est enregistré que sur confirmation signée du prestataire.`,confirmLabel:'Générer le lien'}))return;
    try{const r=await api.createPaymentLink(q.id);modalForm('Lien de paiement créé',`<div class="list-row"><div><b>Montant</b><small>reste dû</small></div><strong>${money(r.amountTtc)}</strong></div><label class="field"><span>URL de paiement</span><input readonly value="${e(r.checkoutUrl)}"></label><p class="help">Transmettez ce lien à votre client. Aucun numéro de carte ne transite par Aurion ; le statut de paiement sera mis à jour uniquement sur confirmation signée du prestataire.</p>`,()=>{},{label:'Fermer'});}
    catch(x){toast(x.message||x?.body?.message||'Paiement en ligne indisponible.','info')}});
  all('.delete-sav').forEach(b=>b.onclick=()=>{const x=S.sav.find(v=>v.id===b.dataset.id);if(!x)return;confirmDelete(`Supprimer définitivement le SAV de ${x.client_name||'ce client'} ?`,()=>api.deleteSav(x.id),'SAV supprimé',{title:'Supprimer le SAV ?'});});
  all('.edit-sav').forEach(b=>b.onclick=()=>{const x=S.sav.find(v=>v.id===b.dataset.id);if(!x)return;const items=Array.isArray(x.items)?x.items:[];const invoice=S.quotes.find(q=>q.id===x.quote_id);const m=modalForm('Modifier le SAV',`<p class="muted">Le SAV reste associé à la facture et à son client. Aucun coefficient n'est appliqué.</p><div id="sav-lines" class="stack">${savRows(items,Number(invoice?.shipping_cost||0))}</div><div class="button-row"><button type="button" class="btn secondary" id="sav-add-line">+ Ajouter une pièce / main-d’œuvre</button></div><div class="calc-total"><span>Total SAV</span><strong class="sav-total">0,00 €</strong></div><label class="field"><span>Note <em class="tag">facultatif</em></span><textarea id="savNote" placeholder="Motif ou détail du SAV">${e(x.note||'')}</textarea></label>`,async m=>{await api.updateSav(x.id,{items:readSavItems(m),note:m.querySelector('#savNote').value.trim()||null});},{label:'Enregistrer'});bindSavForm(m,{items,invoiceShipping:Number(invoice?.shipping_cost||0)});});
  all('.integrity-doc').forEach(b=>b.onclick=async()=>{const q=get(b.dataset.id);if(!q)return;
    // 15.4.51 (PROMPT B3) — vérification de la chaîne d'intégrité : le verdict vient du serveur
    // (vérification de la chaîne complète du coffre), jamais d'un recalcul côté navigateur.
    try{const v=await api.integrityChain();
      const state=v?.valid?'Chaîne intègre':'CHAÎNE ROMPUE';
      const detail=`${v?.reason||''}${v?.brokenAtDocumentId?` — maillon fautif : ${v.brokenAtDocumentId}`:''}`;
      modalForm(`Intégrité du coffre · ${e(q.number)}`,`<p class="${v?.valid?'help':'error'}">${e(state)} — ${e(detail)}</p><p class="help">Chaque facture émise est chaînée à l'émission (empreinte du contenu canonique + horodatage serveur, append-only) : toute altération d'une pièce passée est détectée à l'endroit exact. ${Number(v?.entries||v?.checked||0)} maillon(s) vérifié(s).</p>`,()=>{},{label:'Fermer'});
    }catch(x){toast(x.message||'Vérification d\u2019intégrité indisponible.','error')}
  });
  all('.convert').forEach(b=>b.onclick=async()=>{
    const q=get(b.dataset.id);if(!q)return;
    // 15.4.53 (PROMPT C3) — pré-vérification des mentions bloquantes AVANT d'ouvrir la fenêtre :
    // les champs manquants sont listés avec un renvoi exact vers Paramètres ; la source de
    // vérité reste le contrôle serveur du POST d'émission (422 MENTIONS_INCOMPLETES).
    // 15.4.54 — seules les mentions BLOQUANTES (identité légale, assurance travaux) ouvrent la
    // fenêtre « Émission bloquée » ; le médiateur de la consommation n'est plus bloquant : il
    // apparaît au pire comme un rappel informatif dans la fenêtre de facturation elle-même.
    let mentionReminders=[];
    try{
      const pre=await api.blockingMentions(q.id);
      if(Array.isArray(pre?.gaps)&&pre.gaps.length){
        const labels={identity:'Identité légale (SIRET/SIREN)',insurance:'Assurance professionnelle / décennale'};
        const rows=pre.gaps.map(g=>`<div class="list-row"><div><b>${e(labels[g.key]||g.key)}</b><small>${e(g.note||'À renseigner dans Paramètres.')}</small></div></div>`).join('');
        return modalForm('Émission bloquée : mentions obligatoires manquantes',`<p class="help">Aurion ne peut pas émettre cette facture tant que ces mentions ne sont pas renseignées. Cette information est obligatoire et reste modifiable dans Paramètres — aucune valeur n'est inventée.</p>${rows}<p class="help">Référentiel complet : docs/MENTIONS-OBLIGATOIRES.md</p>`,()=>{hooks.show('settings')},{label:'Compléter dans Paramètres'});
      }
      mentionReminders=Array.isArray(pre?.reminders)?pre.reminders:[];
    }catch{/* pré-vérification indisponible : le contrôle serveur de l'émission reste la porte */}
    const reminderNotice=mentionReminders.some(x=>x.key==='mediator')?'<p class="help">Rappel non bloquant : le médiateur de la consommation n’est pas renseigné. Vous pouvez le saisir dans Paramètres → Activités → Facturation et documents ; il figurera sur les prochains documents.</p>':'';
    const rubrics=(q.items||[]).map(x=>({label:String(x.label||x.name||'Ligne'),amountHt:Number(x.quantity||0)*Number(x.unitPrice??x.unit_cost??0)}));
    const convert=(dueAt2,interval2,source2,extra={})=>api.convertQuote(q.id,true,{dueAt:dueAt2,reminderIntervalDays:interval2,invoiceAddressSource:source2,quoteRubrics:rubrics,invoiceRubrics:rubrics,...extra});
    const m=modalForm(`Transformer ${e(q.number)} en facture`,`<p class="muted">La facture sera le document envoyé au client. Elle ne sera intégrée aux calculs Aurion qu’après déclaration d’un paiement.</p>${reminderNotice}<div class="grid-2"><label class="field"><span>Échéance de paiement</span><input id="convertDueAt" type="date" required></label><label class="field"><span>Délai entre les relances (jours)</span><input id="convertReminderInterval" type="number" min="0" max="365" step="1" placeholder="0"></label></div><label class="field"><span>Adresse de facturation</span><select id="convertAddressSource"><option value="">Votre choix</option><option value="client">Adresse du client</option><option value="intervention">Adresse d’intervention</option></select></label>`,async m=>{
      const dueAt=m.querySelector('#convertDueAt').value||null;if(!dueAt)throw new Error('Indiquez une échéance de paiement.');
      const rawInterval=m.querySelector('#convertReminderInterval').value.trim();const interval=rawInterval===''?0:Math.min(365,Math.max(0,Number(rawInterval)));
      const invoiceAddressSource=m.querySelector('#convertAddressSource').value;
      let r;
      try{r=await convert(dueAt,interval,invoiceAddressSource)}
      catch(x){
        // 15.4.51 (PROMPT B2) — dérive au-delà du seuil : le serveur exige une justification
        // horodatée ; la fenêtre de justification reprend les raisons exactes du moteur.
        if(x?.data?.error==='DEVIATION_JUSTIFICATION_REQUIRED'||x?.error==='DEVIATION_JUSTIFICATION_REQUIRED'){
          const dev=x.data?.deviation||x.deviation||{};
          const reasons=(dev.reasons||[]).map(t=>`<li>${e(t)}</li>`).join('');
          const jm=modalForm(`Dérive devis → facture · ${e(q.number)}`,`<p class="notice warn-notice">La facture s'écarte du devis au-delà du seuil de 10 % (${Number(dev.deviationPct||0)} %). Indiquez une justification : elle est horodatée et conservée avec la facture.</p>${reasons?`<ul>${reasons}</ul>`:''}<label class="field"><span>Justification (15 caractères minimum)</span><textarea id="deviationJustification" maxlength="1000" placeholder="Ex. pièces remplacées à la demande du client après acceptation…"></textarea></label>`,async jm=>{
            const justification=jm.querySelector('#deviationJustification').value.trim();
            if(justification.length<15)throw new Error('Justification trop courte : expliquez l\u2019écart en quelques mots (15 caractères minimum).');
            const rr=await convert(dueAt,interval,invoiceAddressSource,{deviationJustification:justification});
            emailToast(rr.emailStatus,`Facture ${rr.number}`);
            await hooks.refresh('invoices');
            return rr;
          },{label:'Émettre avec justification'});
          return jm;
        }
        throw x;
      }
      emailToast(r.emailStatus,`Facture ${r.number}`);
      await hooks.refresh('invoices');
    },{label:'Créer et envoyer'});
    m.querySelector('#convertDueAt').value=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  });
  all('.schedule-doc').forEach(b=>b.onclick=async()=>{const q=get(b.dataset.id);if(!q)return;const m=modalForm(`Échéancier · ${e(q.number)}`,`<p class="muted">Le dernier centime est automatiquement affecté à la dernière échéance.</p><label class="field"><span>Nombre d’échéances</span><input id="instCount" type="number" min="1" max="120" step="1" value="2"></label><label class="field"><span>Première échéance</span><input id="instStart" type="date" required></label><label class="field"><span>Intervalle entre échéances (jours)</span><input id="instInterval" type="number" min="0" max="3650" step="1" value="30"></label><div id="instPreview" class="stack"></div>`,async m=>{const count=Math.max(1,Math.min(120,Number(m.querySelector('#instCount').value||0))),start=m.querySelector('#instStart').value;if(!start)throw new Error('Indiquez la première échéance.');await api.saveInvoiceInstallments(q.id,{count,startDate:start,intervalDays:Number(m.querySelector('#instInterval').value||0)});toast('Échéancier enregistré.','success');await hooks.refresh('invoices')},{label:'Enregistrer l’échéancier'});m.querySelector('#instStart').value=new Date(Date.now()+7*86400000).toISOString().slice(0,10);});
  all('.settle-doc').forEach(b=>b.onclick=async()=>{
    const q=get(b.dataset.id);if(!q||q.payment_status==='paid')return;
    let live;try{live=await api.invoicePayments(q.id)}catch(x){/* Bloc 3 — hors connexion : lecture des répliques locales (paiements encaissés et relances déjà connus), présentés comme état local. */if(x?.status!==0)return toast(x.message,'error');try{const sm=await import('../../core/sync-manager.js');const pays=await sm.getLocalList('invoice_payments');const rems=await sm.getLocalList('invoice_reminders');const mine=pays.filter(p=>p.quote_id===q.id).map(p=>({id:p.id,amount:Number(p.amount||0),payment_method:p.payment_method,paid_at:p.paid_at,reference:p.reference,note:p.note}));const myRems=rems.filter(r=>r.quote_id===q.id).map(r=>({id:r.id,reminderNumber:r.reminder_number,penaltyAmount:Number(r.penalty_amount||0),createdAt:r.created_at}));const due=Number(q.total_ttc||0)+myRems.reduce((s,r)=>s+r.penaltyAmount,0);const paid=Math.round(mine.reduce((s,p)=>s+p.amount,0)*100)/100;live={invoice:{id:q.id,number:q.number,total_ttc:Number(q.total_ttc||0),payment_status:q.payment_status||'unpaid',amount_paid:paid,total_penalty_amount:myRems.reduce((s,r)=>s+r.penaltyAmount,0)},payments:mine,reminders:myRems,_offline:true}}catch{live={invoice:{id:q.id,number:q.number,total_ttc:Number(q.total_ttc||0),payment_status:q.payment_status||'unpaid',amount_paid:0,total_penalty_amount:0},payments:[],reminders:[],_offline:true}}}
    const penalties=Number(live.invoice?.total_penalty_amount||invoicePenalty(q)||0);
    const dueTotal=Number((live.invoice?.total_ttc??q.total_ttc)||0)+penalties;
    const remaining=Math.max(0,dueTotal-Number((live.invoice?.amount_paid??q.amount_paid)||0));
    if(remaining<=0){toast('Cette facture est déjà entièrement payée.','info');await hooks.refresh('invoices');return}
    const methods=[['cash','Espèces'],['cheque','Chèque'],['card','Carte'],['transfer','Virement'],['crypto','Crypto']];
    modalForm(`Enregistrer un paiement · ${e(q.number)}`,
      `<p class="muted">Reste à payer : ${money(remaining)}.</p>
       <label class="field"><span>Montant</span><input id="payAmount" type="number" min="0.01" step="0.01" max="${remaining}" value="${remaining}" required></label>
       <label class="field"><span>Date du paiement</span><input id="payDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
       <label class="field"><span>Mode de paiement</span><select id="payMethod"><option value="">Votre choix</option>${methods.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
       <label class="field"><span>Référence <em class="tag">facultatif</em></span><input id="payReference" placeholder="Ex. VIR-20261025-001"></label>
       <label class="field"><span>Note <em class="tag">facultatif</em></span><input id="payNote"></label>`,
      async m=>{
        const amount=Number(String(m.querySelector('#payAmount').value||'').replace(',','.'));
        if(!Number.isFinite(amount)||amount<=0)throw new Error('Indiquez un montant valide.');
        const payment=await api.addInvoicePayment(q.id,{amount,paymentMethod:m.querySelector('#payMethod').value,paidAt:m.querySelector('#payDate').value||null,reference:m.querySelector('#payReference').value.trim()||null,note:m.querySelector('#payNote').value.trim()||null});
        // Bloc 1 — règlement confirmé par le serveur : la carte et les données dépendantes se
        // mettent à jour immédiatement (documents, comptabilité, trésorerie, compteurs,
        // échéances), sans rechargement manuel.
        try{await hooks.refresh(['invoices','accounting','treasury','home'])}catch{}
        return payment;
      },
      {label:'Enregistrer le paiement'}
    );
  });
  all('.penalty-config').forEach(b=>b.onclick=()=>{const q=get(b.dataset.id);modalForm(`Majoration · ${e(q.number)}`,`<p class="muted">Configurez ici la majoration qui sera appliquée à la 4e relance. En pourcentage, elle est calculée sur le total TTC de la 3e relance, majorations déjà cumulées comprises. En euros, le montant est ajouté à ce total.</p><label class="field"><span>Type</span><select id="penaltyMode"><option value="">Votre choix</option><option value="none" ${q.late_penalty_mode==='none'?'selected':''}>Aucune</option><option value="fixed" ${q.late_penalty_mode==='fixed'?'selected':''}>Montant en €</option><option value="percent" ${q.late_penalty_mode==='percent'?'selected':''}>Pourcentage %</option></select></label><label class="field"><span>Montant / pourcentage</span><input id="penaltyValue" type="number" min="0" step="0.01" value="${Number(q.late_penalty_value||0)?Number(q.late_penalty_value):''}" placeholder="0"></label>`,async m=>{await api.updateInvoicePenalty(q.id,{mode:m.querySelector('#penaltyMode').value,value:Number(String(m.querySelector('#penaltyValue').value||'').replace(',','.'))||0});},{label:'Enregistrer la majoration'});});
  all('.remind-doc').forEach(b=>b.onclick=async()=>{const q=get(b.dataset.id),next=Number(q.reminder_count||0)+1;let extra={};if(next>4){const m=modalForm(`Nouvelle majoration · ${e(q.number)}`,`<p class="muted">Cette majoration s’ajoutera aux majorations déjà appliquées.</p><label class="field"><span>Type</span><select id="additionalPenaltyMode"><option value="">Votre choix</option><option value="fixed">Montant en €</option><option value="percent">Pourcentage %</option></select></label><label class="field"><span>Valeur</span><input id="additionalPenaltyValue" type="number" min="0" step="0.01" required></label>`,async m=>{extra={additionalPenaltyMode:m.querySelector('#additionalPenaltyMode').value,additionalPenaltyValue:Number(String(m.querySelector('#additionalPenaltyValue').value||'').replace(',','.'))||0};try{const r=await api.sendInvoiceReminder(q.id,extra);toast(`${r.reminderNumber}e relance envoyée.`,'success');await hooks.refresh('invoices')}catch(x){toast(x.message,'error')}},{label:'Envoyer la relance'});return}if(!await askConfirm({title:'Envoyer une relance ?',message:`Aurion enverra la ${next}e relance avec la facture en PDF${next===4?' et appliquera la majoration configurée.':'.'}`,confirmLabel:'Envoyer la relance'}))return;try{const r=await api.sendInvoiceReminder(q.id,extra);toast(`${r.reminderNumber}e relance envoyée.`,'success');await hooks.refresh('invoices')}catch(x){toast(x.message,'error')}});
  all('.sav-from-invoice').forEach(b=>{const q=get(b.dataset.id);b.onclick=()=>openSavForInvoice(q)});
  all('.view-doc').forEach(b=>b.onclick=()=>{
    const q=get(b.dataset.id),p=prof(),d=p.doc||{};
    modalForm(`${q.document_type==='invoice'?'Facture':'Devis'} ${e(q.number)}`,`<div class="document-preview"><div class="preview-grid"><div><span>Client</span><b>${e(q.client_name||'')}</b></div><div><span>${e(d.interventionLabel||'Prestation')}</span><b>${e(q.intervention||'')}</b></div></div>
      ${(q.items||[]).length?`<div class="preview-items"><span>${e(d.itemsLabel||'Pièces')}</span>${q.items.map(i=>`<div class="list-row"><b>${e(i.label)}</b><span>× ${Number(i.quantity)}</span></div>`).join('')}</div>`:''}
      ${q.warranty_text?`<div class="preview-grid"><div><span>Garantie</span><b>${e(q.warranty_text)}</b></div></div>`:''}
      <div class="calc-total"><span>Total TTC client</span><strong>${money(q.document_type==='invoice'?invoiceDue(q):q.total_ttc)}</strong></div>
      <details class="advanced"><summary>Vue interne (jamais visible par le client)</summary><div class="calc-line"><span>Coûts d’achat HT</span><b>${money(Number(q.part_cost)+Number(q.shipping_cost))}</b></div><div class="calc-line"><span>Kilométrage ${q.mileage_mode==='client_price'?'facturé au client':'absorbé par la marge'}</span><b>${money(q.mileage_total||0)}</b></div><div class="calc-line"><span>Marge brute HT</span><b>${money(q.margin)}</b></div><div class="calc-line"><span>Cotisations estimées ${documentContributionEstimate(q).source==='legacy'?'(taux historique)':'(snapshot du document)'}</span><b>${money(documentContributionEstimate(q).amount)}</b></div><div class="calc-line"><span>Marge nette estimée</span><b>${money(Number(q.margin)-documentContributionEstimate(q).amount)}</b></div></details></div>`,async()=>{},{label:'Fermer'});
  });
  // Archivage du PDF dans le cloud personnel (dossiers 04_Devis / 05_Factures). Une facture émise n'est jamais remplacée.
  all('.cloud-doc').forEach(b=>b.onclick=async()=>{b.disabled=true;const label=b.textContent;b.textContent='Envoi…';try{let r;try{r=await api.cloudArchiveBusiness(b.dataset.kind,b.dataset.id)}catch(x){if(x?.data?.error==='ISSUED_DOCUMENT_LOCKED'&&await askConfirm({title:'Archiver une nouvelle version ?',message:'Une version de cette facture est déjà archivée. La nouvelle version sera ajoutée à côté ; l’original ne sera jamais remplacé.',confirmLabel:'Archiver une nouvelle version'}))r=await api.cloudArchiveBusiness(b.dataset.kind,b.dataset.id,true);else throw x}if(r)toast(r.replay?'Ce document est déjà archivé à l’identique dans le cloud.':`Archivé dans le cloud : ${r.document?.fileName||''}`,'success')}catch(x){toast(x.message||'Archivage impossible.','error')}finally{b.disabled=false;b.textContent=label}});
  const flushBtn=document.querySelector('#flush-outbox');
  flushBtn?.addEventListener('click',async()=>{
    flushBtn.disabled=true;
    try{const r=await api.flushEmails();
      if(!r.mailConfigured)toast(`Messagerie non configurée : ${r.remaining} e-mail(s) reste(nt) en attente. Configurez votre messagerie dans Paramètres.`,'error');
      else if(r.sent)toast(`${r.sent} e-mail(s) envoyé(s)${r.failed?`, ${r.failed} en échec (nouvel essai au prochain envoi possible)`:''}.`,'success');
      else toast(r.remaining?`${r.remaining} e-mail(s) en attente : l'envoi a échoué, nouvel essai automatique au prochain envoi possible.`:'Aucun e-mail en attente.','info');
      await hooks.refresh('invoices');
    }catch(x){toast(x.message||'Vidage de la boîte d\'envoi impossible.','error')}
    finally{flushBtn.disabled=false}
  });
  all('.mail-doc').forEach(b=>b.onclick=()=>{
    const q=get(b.dataset.id),noun=q.document_type==='invoice'?'facture':'devis';
    modalForm(`Envoyer ${e(q.number)} par e-mail`,`<div class="mail-form-spaced">${q.client_email?`<p class="muted">Destinataire : <b>${e(q.client_email)}</b> — le PDF est joint automatiquement.</p>`:'<div class="notice">Ce client n’a pas d’adresse e-mail : ajoutez-la dans sa fiche.</div>'}<label class="field"><span>Message</span><textarea id="message" rows="7">Bonjour ${e(q.client_name||'')},\n\nVeuillez trouver votre ${noun} ${e(q.number)} en pièce jointe.\n\nCordialement.</textarea></label></div>`,
      async m=>{
        await api.sendDocumentEmail(q.document_type==='invoice'?'invoice':'quote',q.id,m.querySelector('#message').value);
      },{label:'Envoyer',done:'E-mail envoyé avec la pièce jointe.'});
  });
}
