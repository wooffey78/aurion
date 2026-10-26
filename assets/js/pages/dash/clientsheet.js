// Fiche client (fenêtre détaillée) : coordonnées, indicateurs, historique des documents et rendez-vous.
import{api}from'../../core/api.js';
import{S,e,money,toast,openDoc,prof,hooks,modalForm}from'./core.js';

export const initials=n=>String(n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')||'?';
const fdate=d=>new Date(d).toLocaleDateString('fr-FR');
const fdt=d=>new Date(d).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'});
const statusFr={planned:'Planifié',done:'Terminé',cancelled:'Annulé'};

export async function openClientSheet(id,{onEdit,onQuote,onDelete}={}){
  const root=document.createElement('div');
  root.className='modal-backdrop';let timerId=null;root.innerHTML='<div class="modal glass sheet"><p class="muted">Chargement de la fiche…</p></div>';
  document.body.append(root);
  const close=()=>{document.removeEventListener('keydown',onKey);root.remove()};
  const onKey=ev=>{if(ev.key==='Escape')close()};document.addEventListener('keydown',onKey);
  root.addEventListener('click',ev=>{if(ev.target===root)close()});
  let d;
  try{d=await api.clientSummary(id)}catch(x){close();return toast(x.message,'error')}
  const c=d.client,st=d.stats;
  root.querySelector('.modal').innerHTML=`
   <div class="sheet-head"><div class="avatar-xl">${e(initials(c.name))}</div><div class="sheet-id"><span class="eyebrow">FICHE CLIENT</span><h2>${e(c.name)}</h2><small class="muted">Client depuis le ${fdate(c.created_at)}</small></div><button class="icon-btn modal-close" aria-label="Fermer">×</button></div>
   <div class="sheet-contact">
     <div class="contact-tile"><span>E-mail</span>${c.email?`<a href="mailto:${e(c.email)}">${e(c.email)}</a>`:'<em>Non renseigné</em>'}</div>
     <div class="contact-tile"><span>Téléphone</span>${c.phone?`<a href="tel:${e(c.phone.replace(/\s/g,''))}">${e(c.phone)}</a>`:'<em>Non renseigné</em>'}</div>
     <div class="contact-tile wide"><span>Adresse postale</span>${c.address?e(c.address).replace(/\n/g,'<br>'):'<em>Non renseignée</em>'}</div><div class="contact-tile wide"><span>Adresse d’intervention</span>${c.intervention_address?e(c.intervention_address).replace(/\n/g,'<br>'):'<em>Non renseignée</em>'}</div><div class="contact-tile wide"><span>Dernier choix de facturation</span>${c.last_invoice_address_source==='intervention'?'Adresse d’intervention':c.last_invoice_address_source==='free'?'Adresse libre':c.last_invoice_address_source==='client'?'Adresse postale':'<em>Non défini</em>'}</div>
   </div>
   <div class="kpi-grid"><div class="kpi"><span>Documents</span><b>${st.invoiceCount+st.quoteCount}</b><small>${st.invoiceCount} facture(s) · ${st.quoteCount} devis</small></div><div class="kpi accent"><span>Facturé TTC</span><b>${money(st.invoicedTtc)}</b><small>Factures émises</small></div><div class="kpi"><span>Devis en attente</span><b>${money(st.pendingQuotesTtc)}</b><small>${st.quoteCount} devis</small></div><div class="kpi"><span>Rendez-vous</span><b>${st.appointmentCount}</b><small>Rendez-vous programmés</small></div><div class="kpi"><span>Temps Aurion</span><b>${Number(st.actualMinutes||0).toFixed(1)} min</b><small>${Number(st.savedMinutes||0)>0?`Économisé : ${Number(st.savedMinutes).toFixed(1)} min`:`Temps mesuré`}</small></div></div>
   <div class="sheet-cols">
    <section class="sheet-block"><h3>Historique des documents</h3>${d.documents.slice(0,12).map(x=>`<div class="hist-row"><div><b>${e(x.number)}</b><small>${x.document_type==='invoice'?'Facture':'Devis'} · ${fdate(x.created_at)} · ${e(x.intervention||'')}</small></div><div class="hist-end"><strong>${money(x.total_ttc)}</strong><button class="link-btn sheet-pdf" data-id="${x.id}" data-kind="${x.document_type==='invoice'?'invoices':'quotes'}">PDF</button></div></div>`).join('')||'<p class="muted">Aucun document pour ce client.</p>'}</section>
    <section class="sheet-block"><h3>Rendez-vous</h3>${d.appointments.slice(0,8).map(a=>`<div class="hist-row"><div><b>${e(a.title)}</b><small>${fdt(a.starts_at)}</small></div><span class="pill">${e(statusFr[a.status]||a.status||'')}</span></div>`).join('')||'<p class="muted">Aucun rendez-vous.</p>'}</section>
   </div>
   <div class="button-row sheet-actions"><span class="help" id="sh-time">⏱ Compteur automatique</span><button class="btn primary" id="sh-quote">+ Nouveau devis</button><button class="btn secondary" id="sh-pdf">Fiche PDF</button><button class="btn secondary" id="sh-edit">Modifier</button><button class="btn danger" id="sh-del">Supprimer</button></div>`;
  const q=s=>root.querySelector(s);
  q('.modal-close').onclick=close;
  const syncTimer=async()=>{try{const m=await api.timeMetrics();q('#sh-time').textContent=m.active?.client_id===c.id?'⏱ Compteur en cours':'⏸ Compteur en pause';}catch{}};
  await syncTimer();
  q('#sh-quote').onclick=()=>{close();onQuote?.(c)};
  q('#sh-edit').onclick=()=>{close();onEdit?.(c)};
  q('#sh-del').onclick=()=>{close();onDelete?.(c)};
  q('#sh-pdf').onclick=()=>openDoc('clients',c.id,'pdf','view');
  root.querySelectorAll('.sheet-pdf').forEach(b=>b.onclick=()=>openDoc(b.dataset.kind,b.dataset.id,'pdf','view'));
}
void hooks;
