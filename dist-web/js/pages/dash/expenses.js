// Notes de frais (Comptabilité & trésorerie) : ajout, consultation, téléchargement, suppression, transfert cloud.
// Les montants sont pris en compte par le moteur de calcul (achats HT, TVA déductible, sorties de trésorerie prévues).
import{api}from'../../core/api.js';
import{S,e,money,toast,askConfirm,hooks}from'./core.js';
import{enqueueFile,queueItem,retryQueueItem,STATUS_LABELS}from'../../core/cloud-sync.js';

const CATEGORIES={deplacement:'Déplacement',repas:'Repas',hebergement:'Hébergement',carburant:'Carburant',peage_stationnement:'Péage / stationnement',fournitures:'Fournitures',materiel:'Matériel',telecom:'Téléphone / internet',formation:'Formation',autre:'Autre'};
const STATUS={to_reimburse:'À rembourser',reimbursed:'Remboursée',paid_by_company:'Payée par l’entreprise'};
const RECEIPT_TYPES=['application/pdf','image/png','image/jpeg','image/webp'];

const cloudLabel=x=>x.cloudStatus?(STATUS_LABELS[x.cloudStatus]||x.cloudStatus):x.receiptClientRef?'Sur cet appareil (en attente)':x.receiptName?'Justificatif non transféré':'Sans justificatif';

export function expensesPanel(){
  const data=S.expenseReports||{expenses:[],totals:{}};const t=data.totals||{};
  return`<section class="panel stack" id="expense-reports"><div class="section-title"><div><h2>Notes de frais</h2><small>Intégrées aux achats (HT), à la TVA déductible et aux sorties de trésorerie tant qu’elles restent à rembourser.</small></div><div class="button-row"><button class="btn primary" id="expense-add" type="button">+ Ajouter une note de frais</button><button class="btn secondary" id="expense-csv" type="button">Exporter (CSV)</button></div></div>
   <div class="metrics"><article><span>Notes de frais</span><b>${Number(t.count||0)}</b><small>année ${S.accountingYear||new Date().getFullYear()}</small></article><article><span>Total TTC</span><b>${money(t.amountTtc||0)}</b><small>dont TVA ${money(t.vatAmount||0)}</small></article><article><span>Total HT</span><b>${money(t.amountHt||0)}</b><small>compté en achats</small></article><article><span>À rembourser</span><b>${money(t.toReimburse||0)}</b><small>sorties de trésorerie prévues</small></article></div>
   <div class="expense-list">${(data.expenses||[]).map(x=>`<article class="expense-row"><div><b>${e(x.label)}</b><small>${e(new Date(x.spentOn+'T00:00:00').toLocaleDateString('fr-FR'))} · ${e(CATEGORIES[x.category]||x.category)} · ${e(STATUS[x.status]||x.status)}</small><small>Justificatif : ${e(x.receiptName||'aucun')} · ${e(cloudLabel(x))}${x.cloudError?` · ${e(x.cloudError)}`:''}</small></div><div><b>${money(x.amountTtc)}</b><small>TVA ${money(x.vatAmount)}</small></div><div class="button-row">${x.receiptName?`<button class="btn secondary small" data-exp-view="${e(x.id)}">Consulter</button><button class="btn secondary small" data-exp-download="${e(x.id)}">Télécharger</button>`:''}${x.receiptClientRef&&x.cloudStatus!=='synced'?`<button class="btn secondary small" data-exp-cloud="${e(x.id)}">Transférer vers le cloud</button>`:''}<button class="btn secondary small" data-exp-edit="${e(x.id)}">Modifier</button><button class="btn danger small" data-exp-delete="${e(x.id)}">Supprimer</button></div></article>`).join('')||'<p class="muted">Aucune note de frais pour cette année.</p>'}</div></section>`;
}

function form(x={}){
  const today=new Date().toISOString().slice(0,10);
  return`<div class="grid-2"><label class="field"><span>Date de la dépense</span><input id="exp-date" type="date" required max="${today}" value="${e(x.spentOn||today)}"></label><label class="field"><span>Catégorie</span><select id="exp-category">${Object.entries(CATEGORIES).map(([k,l])=>`<option value="${k}" ${x.category===k?'selected':''}>${e(l)}</option>`).join('')}</select></label></div>
  <label class="field"><span>Libellé</span><input id="exp-label" required maxlength="240" value="${e(x.label||'')}" placeholder="Ex. déplacement client Dupont"></label>
  <div class="grid-2"><label class="field"><span>Montant TTC (€)</span><input id="exp-ttc" type="number" min="0" step="0.01" required value="${x.amountTtc??''}"></label><label class="field"><span>dont TVA (€)</span><input id="exp-vat" type="number" min="0" step="0.01" value="${x.vatAmount??''}" placeholder="0"></label></div>
  <div class="grid-2"><label class="field"><span>Moyen de paiement</span><input id="exp-method" maxlength="40" value="${e(x.paymentMethod||'')}" placeholder="Carte personnelle, espèces…"></label><label class="field"><span>Statut</span><select id="exp-status">${Object.entries(STATUS).map(([k,l])=>`<option value="${k}" ${(x.status||'to_reimburse')===k?'selected':''}>${e(l)}</option>`).join('')}</select></label></div>
  <label class="field"><span>Notes</span><textarea id="exp-notes" rows="2" maxlength="2000">${e(x.notes||'')}</textarea></label>
  <label class="field"><span>${x.receiptName?'Remplacer le justificatif (nouvelle version, l’ancienne est conservée)':'Justificatif (PDF ou photo)'}</span><input id="exp-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" capture="environment"><small class="help">25 Mo maximum. Le fichier est conservé sur l’appareil puis transféré dans votre cloud (dossier 07_Notes_de_frais).</small></label>
  <p class="error" id="exp-error" role="alert" hidden></p>`;
}

function openForm(existing=null){
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title"><form class="modal glass" id="expense-form" novalidate><div class="section-title"><h2 id="expense-modal-title">${existing?'Modifier la note de frais':'Nouvelle note de frais'}</h2><button type="button" class="icon-btn" data-close aria-label="Fermer">×</button></div>${form(existing||{})}<div class="button-row"><button type="button" class="btn secondary" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button></div></form></div>`);
  const m=document.querySelector('#expense-modal');const v=id=>m.querySelector('#'+id)?.value.trim()||'';const err=m.querySelector('#exp-error');
  m.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>m.remove()));
  m.querySelector('#exp-label').focus();
  m.querySelector('#expense-form').addEventListener('submit',async ev=>{
    ev.preventDefault();err.hidden=true;
    const ttc=Number(v('exp-ttc')),vat=Number(v('exp-vat')||0);
    if(!v('exp-label')||!v('exp-date')||!Number.isFinite(ttc)||ttc<0){err.textContent='Renseignez la date, le libellé et un montant TTC valide.';err.hidden=false;return}
    if(vat>ttc){err.textContent='La TVA ne peut pas dépasser le montant TTC.';err.hidden=false;return}
    const file=m.querySelector('#exp-file').files?.[0]||null;
    if(file&&(!RECEIPT_TYPES.includes(file.type)||file.size>25*1024*1024)){err.textContent='Justificatif : PDF, PNG, JPEG ou WebP de 25 Mo maximum.';err.hidden=false;return}
    const submit=m.querySelector('button[type=submit]');submit.disabled=true;
    const body={spentOn:v('exp-date'),label:v('exp-label'),category:v('exp-category'),amountTtc:ttc,vatAmount:vat,paymentMethod:v('exp-method')||null,status:v('exp-status'),notes:v('exp-notes')||null,...(file?{receiptName:file.name.slice(0,255),receiptMime:file.type,receiptSize:file.size}:{})};
    try{
      const saved=existing?await api.updateExpenseReport(existing.id,body):await api.createExpenseReport(body);
      if(file){
        // Enregistrement durable sur l'appareil puis envoi au cloud dès que possible (jamais d'annonce de réussite avant confirmation).
        try{const q=await enqueueFile(file,{sourceKind:'expense_receipt',sourceId:saved.id,businessRef:`NDF-${body.spentOn}`,fileName:`NDF-${body.spentOn}_${file.name}`});await api.updateExpenseReport(saved.id,{...body,receiptSha256:q.sha256||undefined,receiptClientRef:q.clientRef});if(q.warning)toast(q.warning,'info')}
        catch(x){toast(`Note enregistrée, mais le justificatif n’a pas pu être conservé sur cet appareil : ${x.message}`,'error')}
      }
      m.remove();toast(file?'Note de frais enregistrée. Justificatif en attente de synchronisation.':'Note de frais enregistrée.','success');await hooks.refresh(S.view);
    }catch(x){err.textContent=x.message||'Enregistrement impossible.';err.hidden=false;submit.disabled=false}
  });
}

async function receiptBlob(x){
  if(x.cloudDocumentId&&['synced','conflict'].includes(x.cloudStatus)){const r=await api.cloudDocumentContent(x.cloudDocumentId);if(r.ok)return await r.blob();}
  if(x.receiptClientRef){const local=await queueItem(x.receiptClientRef);if(local?.blob)return local.blob;}
  throw new Error(x.cloudStatus==='synced'?'Le cloud ne répond pas : réessayez plus tard.':'Justificatif indisponible sur cet appareil : il sera consultable après synchronisation depuis l’appareil qui l’a enregistré.');
}

export function bindExpenses(){
  const find=id=>(S.expenseReports?.expenses||[]).find(x=>x.id===id);
  document.querySelector('#expense-add')?.addEventListener('click',()=>openForm());
  document.querySelector('#expense-csv')?.addEventListener('click',async()=>{try{const y=S.accountingYear||new Date().getFullYear();const r=await api.expenseReportsCsv(y);if(!r.ok)throw new Error('Export impossible.');const a=document.createElement('a');a.href=URL.createObjectURL(await r.blob());a.download=`aurion-notes-de-frais-${y}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000)}catch(x){toast(x.message,'error')}});
  document.querySelectorAll('[data-exp-edit]').forEach(b=>b.addEventListener('click',()=>openForm(find(b.dataset.expEdit))));
  document.querySelectorAll('[data-exp-view]').forEach(b=>b.addEventListener('click',async()=>{const w=window.open('about:blank','_blank');try{const blob=await receiptBlob(find(b.dataset.expView));const url=URL.createObjectURL(blob);if(w)w.location.href=url;else location.assign(url);setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(x){w?.close();toast(x.message,'error')}}));
  document.querySelectorAll('[data-exp-download]').forEach(b=>b.addEventListener('click',async()=>{try{const x=find(b.dataset.expDownload);const blob=await receiptBlob(x);const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=x.receiptName||'justificatif';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000)}catch(x){toast(x.message,'error')}}));
  document.querySelectorAll('[data-exp-cloud]').forEach(b=>b.addEventListener('click',async()=>{const x=find(b.dataset.expCloud);const local=x?.receiptClientRef?await queueItem(x.receiptClientRef):null;if(!local){toast('Le justificatif n’est pas présent sur cet appareil : relancez le transfert depuis l’appareil qui l’a enregistré.','info');return}await retryQueueItem(local.clientRef);toast('Transfert relancé. L’état sera mis à jour après confirmation du cloud.','info');setTimeout(()=>hooks.refresh(S.view).catch(()=>{}),3000)}));
  document.querySelectorAll('[data-exp-delete]').forEach(b=>b.addEventListener('click',async()=>{if(!await askConfirm({title:'Supprimer cette note de frais ?',message:'Elle sera retirée de la comptabilité et de la trésorerie. Le justificatif déjà présent dans votre cloud n’est pas supprimé.',confirmLabel:'Supprimer',danger:true}))return;try{await api.deleteExpenseReport(b.dataset.expDelete);toast('Note de frais supprimée.','success');await hooks.refresh(S.view)}catch(x){toast(x.message,'error')}}));
}
