// Fournisseurs : fiches autonomes, hors catalogue métier.
import{api,getActiveActivity}from'../../core/api.js';
import{mergeRegistryFields}from'../../core/registry-fill.js';
import{S,e as escape,toast,modalForm,confirmDelete,hooks}from'./core.js';
const e=v=>v==null?'':escape(v);const empty=t=>`<p class="muted">${e(t)}</p>`;

const websiteLink=v=>v?`<a href="${/^https?:\/\//i.test(v)?e(v):`https://${e(v)}`}" target="_blank" rel="noopener noreferrer" class="link-btn">${e(v)} ↗</a>`:'<em>Non renseigné</em>';

export function openSupplierSheet(s,{onEdit,onDelete}={}){
  const root=document.createElement('div');
  root.className='modal-backdrop';
  root.innerHTML=`<div class="modal glass sheet">
    <div class="sheet-head"><div class="avatar-xl">${e(String(s.name||'?').trim().slice(0,1).toUpperCase()||'?')}</div><div class="sheet-id"><span class="eyebrow">FICHE FOURNISSEUR</span><h2>${e(s.name)}</h2><small class="muted">${e(s.legal_name||'')}</small></div><button class="icon-btn modal-close" aria-label="Fermer">×</button></div>
    <div class="sheet-contact">
      <div class="contact-tile"><span>SIRET</span>${s.siret?e(s.siret):'<em>Non renseigné</em>'}</div>
      <div class="contact-tile"><span>SIREN</span>${s.siren?e(s.siren):'<em>Non renseigné</em>'}</div>
      <div class="contact-tile"><span>E-mail</span>${s.email?`<a href="mailto:${e(s.email)}">${e(s.email)}</a>`:'<em>Non renseigné</em>'}</div>
      <div class="contact-tile"><span>Téléphone</span>${s.phone?`<a href="tel:${e(String(s.phone).replace(/\s/g,''))}">${e(s.phone)}</a>`:'<em>Non renseigné</em>'}</div>
      <div class="contact-tile wide"><span>Adresse</span>${s.address?e(s.address).replace(/\n/g,'<br>'):'<em>Non renseignée</em>'}</div>
      <div class="contact-tile"><span>Code postal</span>${e(s.postal_code||'Non renseigné')}</div>
      <div class="contact-tile"><span>Ville</span>${e(s.city||'Non renseignée')}</div>
      <div class="contact-tile"><span>Forme juridique</span>${e(s.legal_form||'Non renseignée')}</div>
      <div class="contact-tile wide"><span>Site internet</span>${websiteLink(s.website)}</div>
    </div>
    <div class="button-row sheet-actions"><button class="btn secondary" id="supplier-pdf">Fiche PDF</button><button class="btn primary" id="supplier-edit">Modifier</button><button class="btn danger" id="supplier-del">Supprimer</button></div>
  </div>`;
  document.body.append(root);
  const close=()=>root.remove();root.querySelector('.modal-close').onclick=close;root.addEventListener('click',ev=>{if(ev.target===root)close()});
  root.querySelector('#supplier-pdf').onclick=async()=>{const w=window.open('','_blank','noopener');try{const res=await api.authFetch(`/suppliers/${encodeURIComponent(s.id)}.pdf`);if(!res.ok)throw new Error('La fiche fournisseur PDF n’a pas pu être ouverte.');const blob=await res.blob();const url=URL.createObjectURL(blob);if(w)w.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),120000)}catch(err){w?.close();toast(err.message,'error')}};
  root.querySelector('#supplier-edit').onclick=()=>{close();onEdit?.(s)};
  root.querySelector('#supplier-del').onclick=()=>{close();onDelete?.(s)};
  return root;
}

export const suppliers={
  view(){
    return `<div class="page-head"><div><span class="eyebrow">PARTENAIRES</span><h1>Fournisseurs</h1><p>Consultez, détectez, modifiez et supprimez les fournisseurs de l’activité active.</p></div><button class="btn primary" id="add-supplier">+ Nouveau fournisseur</button></div>
    <section class="panel"><div class="section-title"><h2>Vos fournisseurs</h2><span class="pill">${S.suppliers.length}</span></div>
    ${S.suppliersError?`<div class="error supplier-load-error" role="alert"><p>${e(S.suppliersError)}</p><button class="btn secondary small" id="retry-suppliers" type="button">Réessayer</button></div>`:''}<div class="stack" id="supplier-list">${S.suppliers.map(s=>`<article class="list-row supplier-row"><div class="supplier-main"><span class="supplier-logo-fallback" aria-hidden="true">${e(String(s.name||'?').trim().slice(0,1).toUpperCase()||'?')}</span><div><b>${e(s.name)}</b><small>${e([s.siret,s.email,s.phone].filter(Boolean).join(' · '))}${s.website?` · ${websiteLink(s.website)}`:''}</small></div></div><div class="button-row"><button class="btn secondary small view-supplier" data-id="${s.id}">Consulter</button><button class="btn secondary small edit-supplier" data-id="${s.id}">Modifier</button><a class="btn secondary small" href="${api.supplierPdfUrl(s.id)}" target="_blank" rel="noopener">Fiche PDF</a><button class="btn danger small del-supplier" data-id="${s.id}">Supprimer</button></div></article>`).join('')||empty('Aucun fournisseur.')}</div></section>`;
  },
  bind(){
    document.querySelector('#retry-suppliers')?.addEventListener('click',()=>hooks.refresh('suppliers').catch(x=>toast(x.message,'error')));
    const F=(id,label,val='',extra='',type='text')=>`<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${e(val)}" ${extra}${/placeholder=/.test(extra)?'':` placeholder="Saisissez ${e(label.toLowerCase())}…"`}></label>`;
    const v=(m,id)=>m.querySelector('#'+id)?.value.trim()||'';
    const supForm=(s={})=>`${F('name','Nom',s.name,'required')}<div class="grid-2">${F('legalName','Raison sociale',s.legal_name)}${F('legalForm','Forme juridique',s.legal_form)}</div><div class="grid-2">${F('siret','SIRET',s.siret)}${F('siren','SIREN',s.siren)}</div><div class="button-row"><button type="button" class="btn secondary small" id="lookup-supplier">Détecter par SIRET / SIREN</button><button type="button" class="btn secondary small" id="lookup-supplier-name">Détecter par nom</button></div><div id="registry-result" class="help">${e([s.legal_name,s.address,s.postal_code,s.city,s.legal_form].filter(Boolean).join(' · '))}</div><label class="field"><span>Adresse</span><textarea id="address" rows="3" placeholder="Saisissez l’adresse…">${e(s.address||'')}</textarea></label><div class="grid-2">${F('postalCode','Code postal',s.postal_code)}${F('city','Ville',s.city)}</div><div class="grid-2">${F('email','E-mail',s.email,'','email')}${F('phone','Téléphone',s.phone)}</div>${F('website','Site web',s.website)}`;
    const supBody=m=>({activityId:getActiveActivity(),name:v(m,'name'),legalName:v(m,'legalName'),email:v(m,'email'),phone:v(m,'phone'),website:v(m,'website'),siret:v(m,'siret').replace(/\D/g,''),siren:v(m,'siren').replace(/\D/g,''),legalForm:v(m,'legalForm'),address:v(m,'address'),postalCode:v(m,'postalCode'),city:v(m,'city'),registrySource:m.dataset.registrySource||null});
    const fillSupplier=(m,c)=>{const previous={name:m.dataset.detectedName||'',siret:m.dataset.detectedSiret||'',siren:m.dataset.detectedSiren||'',address:m.dataset.detectedAddress||'',postal_code:m.dataset.detectedPostalCode||'',city:m.dataset.detectedCity||'',legal_form:m.dataset.detectedLegalForm||'',website:m.dataset.detectedWebsite||''};const merged=mergeRegistryFields({name:v(m,'name'),siret:v(m,'siret'),siren:v(m,'siren'),address:v(m,'address'),postal_code:v(m,'postalCode'),city:v(m,'city'),legal_form:v(m,'legalForm'),website:v(m,'website')},{...c,legal_form:c.legalForm||c.legal_form||''},previous);m.querySelector('#name').value=merged.name||'';m.querySelector('#legalName').value=c.legalName||merged.name||'';m.querySelector('#siret').value=merged.siret||'';m.querySelector('#siren').value=merged.siren||'';m.querySelector('#address').value=merged.address||'';m.querySelector('#postalCode').value=merged.postal_code||'';m.querySelector('#city').value=merged.city||'';m.querySelector('#legalForm').value=merged.legal_form||'';m.querySelector('#website').value=merged.website||'';m.dataset.detectedName=merged.name||'';m.dataset.detectedSiret=merged.siret||'';m.dataset.detectedSiren=merged.siren||'';m.dataset.detectedAddress=merged.address||'';m.dataset.detectedPostalCode=merged.postal_code||'';m.dataset.detectedCity=merged.city||'';m.dataset.detectedLegalForm=merged.legal_form||'';m.dataset.detectedWebsite=merged.website||'';m.dataset.registrySource=c.source||'';m.querySelector('#registry-result').textContent=[c.legalName||merged.name,merged.legal_form].filter(Boolean).join(' · ');};
    const wireLookup=m=>{m.querySelector('#lookup-supplier').onclick=async()=>{const id=v(m,'siret')||v(m,'siren');if(!id)return toast('Saisissez un SIRET ou SIREN.','info');try{const r=await api.supplierLookup(id);if(!r.company)return toast('Entreprise introuvable dans le registre public.','info');fillSupplier(m,r.company);toast('Entreprise identifiée.','success')}catch(x){toast(x.message,'error')}};m.querySelector('#lookup-supplier-name').onclick=async()=>{const name=v(m,'name');if(name.length<2)return toast('Saisissez le nom du fournisseur.','info');try{const r=await api.supplierSearch(name);const c=r.companies?.[0];if(!c)return toast('Aucune entreprise correspondante.','info');fillSupplier(m,c);toast('Entreprise identifiée par son nom.','success')}catch(x){toast(x.message,'error')}}};
    const openEdit=s=>{const m=modalForm('Modifier le fournisseur',supForm(s),m=>api.updateSupplier(s.id,supBody(m)));m.dataset.registrySource=s.registry_source||'';wireLookup(m)};
    document.querySelector('#add-supplier').onclick=()=>{const m=modalForm('Nouveau fournisseur',supForm(),m=>api.createSupplier(supBody(m)));wireLookup(m)};
    document.querySelectorAll('.view-supplier').forEach(b=>b.onclick=()=>{const s=S.suppliers.find(x=>x.id===b.dataset.id);if(s)openSupplierSheet(s,{onEdit:openEdit,onDelete:s=>confirmDelete('Supprimer ce fournisseur et ses prix ?',()=>api.deleteSupplier(s.id),'Fournisseur supprimé')})});
    document.querySelectorAll('.edit-supplier').forEach(b=>b.onclick=()=>{const s=S.suppliers.find(x=>x.id===b.dataset.id);if(s)openEdit(s)});
    document.querySelectorAll('.del-supplier').forEach(b=>b.onclick=()=>confirmDelete('Supprimer ce fournisseur et ses prix ?',()=>api.deleteSupplier(b.dataset.id),'Fournisseur supprimé'));
  }
};
