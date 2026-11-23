// Fiche client (fenêtre détaillée) : coordonnées, indicateurs, historique des documents et rendez-vous.
// 15.4.52 (PROMPT B1/B4) : encart fiabilité de paiement (moteur déterministe, aucune prédiction)
// et gestion des accès au portail client invités (liste, création avec lien à transmettre une
// seule fois, partage de devis, révocation).
import{api}from'../../core/api.js';
import{S,e,money,toast,openDoc,prof,hooks,modalForm,askConfirm}from'./core.js';

export const initials=n=>String(n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')||'?';
const fdate=d=>new Date(d).toLocaleDateString('fr-FR');
const fdt=d=>new Date(d).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'});
const statusFr={planned:'Planifié',done:'Terminé',cancelled:'Annulé'};
const portalStatusFr={invited:'Invité',active:'Actif',revoked:'Révoqué'};

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
   <div class="kpi-grid"><div class="kpi"><span>Documents</span><b>${st.invoiceCount+st.quoteCount}</b><small>${st.invoiceCount} facture(s) · ${st.quoteCount} devis</small></div><div class="kpi accent"><span>Factures émises TTC</span><b>${money(st.invoicedTtc)}</b><small>${st.invoiceCount} facture(s) · payé ${money(st.paidTtc||0)} · restant ${money(st.remainingTtc||0)}</small></div><div class="kpi"><span>Devis en attente</span><b>${money(st.pendingQuotesTtc)}</b><small>${st.quoteCount} devis</small></div><div class="kpi"><span>Rendez-vous</span><b>${st.appointmentCount}</b><small>Rendez-vous programmés</small></div><div class="kpi"><span>Temps Aurion</span><b>${Number(st.timeSessionCount||0)>0?`${Number(st.actualMinutes||0).toFixed(1)} min`:'—'}</b><small>${Number(st.timeSessionCount||0)>0?(Number(st.savedMinutes||0)>0?`Économisé : ${Number(st.savedMinutes).toFixed(1)} min`:'Temps mesuré'):'Aucune session terminée'}</small></div></div>
   <div class="sheet-cols">
    <section class="sheet-block"><h3>Historique des documents</h3>${d.documents.slice(0,12).map(x=>`<div class="hist-row"><div><b>${e(x.number)}</b><small>${x.document_type==='invoice'?'Facture':'Devis'}${['canceled','cancelled','void','deleted'].includes(String(x.status||'').toLowerCase())?' · Annulé':['refused','rejected'].includes(String(x.status||'').toLowerCase())?' · Refusé':''} · ${fdate(x.created_at)} · ${e(x.intervention||'')}</small></div><div class="hist-end"><strong>${money(x.total_ttc)}</strong><button class="link-btn sheet-pdf" data-id="${x.id}" data-kind="${x.document_type==='invoice'?'invoices':'quotes'}">PDF</button></div></div>`).join('')||'<p class="muted">Aucun document pour ce client.</p>'}</section>
    <section class="sheet-block"><h3>Rendez-vous</h3>${d.appointments.slice(0,8).map(a=>`<div class="hist-row"><div><b>${e(a.title)}</b><small>${fdt(a.starts_at)}</small></div><span class="pill">${e(statusFr[a.status]||a.status||'')}</span></div>`).join('')||'<p class="muted">Aucun rendez-vous.</p>'}</section>
   </div>
   <section class="sheet-block" id="sheet-reliability"><h3>Fiabilité de paiement</h3><p class="muted" id="reliability-loading">Calcul en cours…</p><div id="reliability-body" hidden></div></section>
   <section class="sheet-block" id="sheet-portal"><h3>Portail client</h3><p class="help">Accès invité sans compte : le client consulte et accepte ses devis par lien sécurisé, révocable à tout moment.</p><div id="portal-body"><p class="muted">Chargement…</p></div></section>
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

  // 15.4.52 (PROMPT B1) — encart fiabilité : statistiques calculées sur l'historique RÉEL de
  // paiement du client (moteur 15.4.50), bande et raisons du moteur affichées telles quelles.
  // Un échec de chargement n'affecte jamais le reste de la fiche (encart masqué, journal).
  renderReliability(root,id);

  // 15.4.52 (PROMPT B4) — gestion des accès portail du client : création (lien affiché une
  // seule fois), partage de devis (devis OUVERTS du client uniquement — isolation serveur),
  // révocation avec confirmation. Actions réservées au chef d'entreprise côté serveur.
  renderPortalPanel(root,c,d).catch(()=>{});
}
void hooks;

async function renderReliability(root,id){
  const box=root.querySelector('#reliability-body'),loading=root.querySelector('#reliability-loading');
  try{
    const r=await api.clientReliability(id);
    if(loading)loading.hidden=true;
    if(!box)return;
    box.hidden=false;
    const reasons=(r.reasons||[]).slice(0,4).map(x=>`<li>${e(String(x))}</li>`).join('');
    box.innerHTML=`<div class="kpi-grid"><div class="kpi accent"><span>Score de fiabilité</span><b>${Number(r.score??0)}/100</b><small>${e(r.band||'—')}</small></div><div class="kpi"><span>Factures réglées</span><b>${Number(r.settledCount||0)}</b><small>historique réel</small></div><div class="kpi"><span>Taux de retard</span><b>${Number(r.lateRate||0).toLocaleString('fr-FR',{style:'percent',maximumFractionDigits:0})}</b><small>${r.medianLateDays!=null?`retard médian : ${Number(r.medianLateDays).toFixed(0)} j`:'sur factures réglées'}</small></div></div>${reasons?`<ul class="help">${reasons}</ul>`:''}<p class="help">Statistiques calculées sur l'historique réel de paiement de ce client. Aucune prédiction.</p>`;
  }catch{
    // Encart masqué silencieusement : la fiche reste entièrement utilisable.
    if(loading)loading.hidden=true;
  }
}

async function renderPortalPanel(root,c,d){
  const body=root.querySelector('#portal-body');
  if(!body)return;
  const quotes=(d.documents||[]).filter(x=>x.document_type!=='invoice'&&!['canceled','cancelled','rejected','void','deleted','expired'].includes(String(x.status||'').toLowerCase()));
  const render=accesses=>{
    const mine=(accesses||[]).filter(a=>String(a.clientId)===String(c.id));
    body.innerHTML=`${mine.length?`<div class="hist-row-list">${mine.map(a=>`<div class="hist-row"><div><b>${e(a.contactName||a.contactEmail||'Accès')}</b><small>${e(a.contactEmail||'')} · ${Number(a.sharedQuotes||0)} devis partagé(s) · vu le ${a.lastSeenAt?fdt(a.lastSeenAt):'jamais'}</small></div><span class="pill">${e(portalStatusFr[a.status]||a.status||'')}${a.status!=='revoked'?` <button class="link-btn portal-revoke" data-id="${e(a.id)}">Révoquer</button>`:''}</span></div>`).join('')}</div>`:'<p class="muted">Aucun accès portail pour ce client.</p>'}
      ${quotes.length?`<div class="button-row"><label class="field"><span>Partager un devis ouvert</span><select id="portal-share-quote">${quotes.map(x=>`<option value="${e(x.id)}">${e(x.number||'Devis')} · ${money(x.total_ttc)}</option>`).join('')}</select></label><select id="portal-share-access">${mine.filter(a=>a.status!=='revoked').map(a=>`<option value="${e(a.id)}">${e(a.contactName||a.contactEmail)}</option>`).join('')||'<option value="">Créez d’abord un accès</option>'}</select><button class="btn secondary small" id="portal-share-btn" ${mine.some(a=>a.status!=='revoked')?'':'disabled'}>Partager</button></div>`:'<p class="help">Aucun devis ouvert à partager.</p>'}
      <div class="button-row"><button class="btn primary small" id="portal-create">Créer un accès portail</button></div>
      <p class="help">Le lien est affiché UNE seule fois à la création : transmettez-le au client (il est révocable à tout moment et expire si une date est définie).</p>`;
    bind(body);
  };
  const bind=container=>{
    const create=async email=>{
      try{
        const created=await api.createPortalAccess({clientId:c.id,contactEmail:email,contactName:c.name});
        const url=`${location.origin}/#/portail/${created.token}`;
        const link=`<div class="notice"><b>Lien à transmettre MAINTENANT (affiché une seule fois) :</b><br><code style="word-break:break-all">${e(url)}</code><div class="button-row"><button class="btn primary small portal-copy">Copier le lien</button></div><p class="help">${e(created.invitationNote||'Révocable à tout moment depuis cette fiche.')}</p></div>`;
        container.querySelector('#portal-create')?.insertAdjacentHTML('beforebegin',link);
        container.querySelector('.portal-copy')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(url);toast('Lien copié : transmettez-le au client.','success')}catch{toast('Copie impossible : sélectionnez le lien manuellement.','error')}});
        toast('Accès portail créé : transmettez le lien au client.','success');
        container.querySelector('#portal-create')?.remove();
      }catch(x){toast(x.message||'Création de l’accès impossible.','error')}
    };
    container.querySelector('#portal-create')?.addEventListener('click',async()=>{
      // Dialogue Aurion (aucun prompt natif) : si le client a un e-mail connu, l'accès se crée
      // directement avec ; sinon la fenêtre de saisie dédiée s'ouvre.
      if(c.email&&/.+@.+\..+/.test(c.email))return create(c.email.trim());
      modalForm('Créer un accès portail',`<p class="help">L'accès portail est nominatif : indiquez l'e-mail du contact (le lien lui sera transmis, révocable à tout moment).</p><label class="field"><span>E-mail du contact</span><input id="portal-contact-email" type="email" maxlength="200" placeholder="contact@exemple.fr"></label>`,async m=>{
        const v=m.querySelector('#portal-contact-email').value.trim();
        if(!/.+@.+\..+/.test(v))throw new Error('E-mail du contact invalide.');
        await create(v);
      },{label:'Créer l’accès'});
    });
    container.querySelectorAll('.portal-revoke').forEach(btn=>btn.addEventListener('click',async()=>{
      // Dialogue de confirmation Aurion (aucun confirm natif) : réversibilité explicitée.
      if(!await askConfirm({title:'Révoquer cet accès portail ?',message:'Le client perdra immédiatement l’accès : le lien devient inutilisable. Vous pourrez recréer un accès à tout moment depuis cette fiche.',confirmLabel:'Révoquer',danger:true}))return;
      try{await api.revokePortalAccess(btn.dataset.id);toast('Accès révoqué.','success');render(await api.portalAccesses().then(x=>x.accesses||[]))}
      catch(x){toast(x.message||'Révocation impossible.','error')}
    }));
    container.querySelector('#portal-share-btn')?.addEventListener('click',async()=>{
      const accessId=container.querySelector('#portal-share-access')?.value;
      const quoteId=container.querySelector('#portal-share-quote')?.value;
      if(!accessId||!quoteId)return toast('Choisissez un accès actif et un devis.','error');
      try{await api.sharePortalQuote(accessId,quoteId);toast('Devis partagé sur le portail du client.','success');render(await api.portalAccesses().then(x=>x.accesses||[]))}
      catch(x){toast(x.message||'Partage impossible.','error')}
    });
  };
  try{render(await api.portalAccesses().then(x=>x.accesses||[]))}
  catch(x){body.innerHTML='<p class="muted">Gestion du portail indisponible : '+e(x?.message||'erreur de chargement')+'</p>'}
}
