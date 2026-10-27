// Catalogue du métier : prestations, pièces / matériel, fournitures et garanties — tout est modifiable et supprimable.
import{api,getActiveActivity}from'../../core/api.js';
import{S,e as escape,money,toast,modalForm,confirmDelete,prof,active,hooks}from'./core.js';
const e=v=>v==null?'':escape(v);

const empty=t=>`<p class="muted">${t}</p>`;
const rowBtns=(cls,id)=>`<div class="button-row"><button class="btn secondary small edit-${cls}" data-id="${id}">Modifier</button><button class="btn danger small del-${cls}" data-id="${id}">Supprimer</button></div>`;

export const view=()=>{
  const p=prof();
  return`<div class="page-head"><div><span class="eyebrow">BASE MÉTIER · ${e(p.title||'')}</span><h1>Catalogue ${e(active()?.name||'')}</h1><p>Ajoutez, modifiez ou supprimez librement vos prestations, ${e((p.itemLabel||'pièces').toLowerCase())}, fournitures et garanties. Tout est propre à cette activité.</p></div><button class="btn secondary" id="seed">Ajouter les éléments proposés pour ce métier</button></div>
  <div class="catalog-grid">
   <details class="panel catalog-section"><summary class="catalog-summary"><span>${e(p.serviceLabel||'Prestations')}</span></summary><div class="section-title"><h2>${e(p.serviceLabel||'Prestations')}</h2><button class="btn secondary" id="add-intervention">+ Ajouter</button></div>${S.interventions.map(i=>`<div class="list-row"><div><b>${e(i.name)}</b><small>${e(i.description||'')}${Number(i.default_price)?` · ${money(i.default_price)} TTC habituel`:''}${i.default_duration_minutes?` · ${i.default_duration_minutes} min`:''}</small></div>${rowBtns('intervention',i.id,`<button class="btn secondary small view-intervention" data-id="${i.id}">Consulter</button>`)}</div>`).join('')||empty('Aucune prestation. Utilisez « Ajouter les éléments proposés » ou créez la vôtre.')}</div></details>
   <details class="panel catalog-section"><summary class="catalog-summary"><span>${e(p.itemLabel||'Pièces')}</span></summary><div class="section-title"><h2>${e(p.itemLabel||'Pièces')}</h2><button class="btn secondary" id="add-part">+ Ajouter</button></div>${S.parts.map(x=>`<div class="list-row catalog-part"><div><b>${e(x.name)}</b><small>${e([x.model,x.variant,x.color,x.quality,x.reference].filter(Boolean).join(' · '))}</small></div><div class="button-row"><button class="btn secondary small view-part" data-id="${x.id}">Consulter</button><button class="btn secondary small price-part" data-id="${x.id}">+ Prix fournisseur</button><button class="btn secondary small edit-part" data-id="${x.id}">Modifier</button><button class="btn danger small del-part" data-id="${x.id}">Supprimer</button></div></div>${(x.suppliers||[]).map(s=>`<div class="supplier-price"><span>${e(s.supplier)}${s.supplierReference?` · ${e(s.supplierReference)}`:''}</span><span><b>${money(s.purchasePrice)}</b> <button class="link-btn del-price" data-part="${x.id}" data-supplier="${s.supplierId}">Retirer</button></span></div>`).join('')}`).join('')||empty('Aucun élément.')}</div></details>
      <details class="panel catalog-section"><summary class="catalog-summary"><span>Fournitures</span></summary><div class="section-title"><h2>Fournitures</h2><button class="btn secondary" id="add-supply">+ Ajouter</button></div>${(S.supplies||[]).map(x=>`<div class="list-row"><div><b>${e(x.name)}</b><small>${e([x.reference,x.supplier_name].filter(Boolean).join(' · '))} · ${money(x.purchase_price)}</small></div>${rowBtns('supply',x.id)}</div>`).join('')||empty('Aucune fourniture.')}</div></details>
   <details class="panel catalog-section"><summary class="catalog-summary"><span>Garanties proposées</span></summary><div class="section-title"><h2>Garanties proposées</h2><button class="btn secondary" id="add-policy">+ Ajouter</button></div>${S.policies.map(g=>`<div class="list-row"><div><b>${e(g.name)}</b><small>${g.duration_months} mois</small></div>${rowBtns('policy',g.id)}</div>`).join('')||empty('Aucune garantie.')}</div></details>
  </div>`;
};

const F=(id,label,val='',extra='')=>`<label class="field"><span>${label}</span><input id="${id}" value="${e(val)}" ${extra}${/placeholder=/.test(extra)?'':` placeholder="Saisissez ${e(label.toLowerCase())}…`}></label>`;
const v=(m,id)=>m.querySelector('#'+id).value.trim();

const viewCatalogItem=(title,body)=>{
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="catalog-view-modal"><div class="modal glass" role="dialog" aria-modal="true"><div class="section-title"><h2>${e(title)}</h2><button type="button" class="icon-btn modal-close" aria-label="Fermer">×</button></div><div class="catalog-view-body">${body}</div><div class="button-row"><button type="button" class="btn primary modal-close">Fermer</button></div></div></div>`);
  const m=document.querySelector('#catalog-view-modal');m.querySelectorAll('.modal-close').forEach(x=>x.onclick=()=>m.remove());
};
const viewField=(label,value)=>`<div class="list-row"><span>${e(label)}</span><strong>${e(value||'—')}</strong></div>`;

export function bind(){
  const $=s=>document.querySelector(s),all=s=>document.querySelectorAll(s),by=(arr,id)=>arr.find(x=>x.id===id);

  const p=prof();
  all('.view-intervention').forEach(b=>b.onclick=()=>{
    const i=by(S.interventions,b.dataset.id);
    if(!i)return;
    viewCatalogItem(i.name,viewField('Nom',i.name)+viewField('Description',i.description)+viewField('Prix client habituel TTC',Number(i.default_price)?money(i.default_price):'—')+viewField('Durée',i.default_duration_minutes?`${i.default_duration_minutes} min`:'—')+viewField('Fournisseurs','—'));
  });
  all('.view-part').forEach(b=>b.onclick=()=>{
    const x=by(S.parts,b.dataset.id);
    if(!x)return;
    const suppliers=(x.suppliers||[]).map(s=>[s.supplier,s.supplierReference,s.purchasePrice!=null?money(s.purchasePrice):''].filter(Boolean).join(' · ')).join(' | ')||'—';
    const photo=x.photo_key?`<div class="field"><span>Photo</span><img src="${api.partPhotoUrl(x.id)}" alt="${e(x.name)}" class="part-photo-image" data-hide-on-error></div>`:'';
    viewCatalogItem(x.name,viewField('Nom',x.name)+viewField('Description',[x.model,x.variant,x.color,x.quality,x.reference].filter(Boolean).join(' · '))+viewField('Prix de vente HT',Number(x.selling_price)?money(x.selling_price):'—')+viewField('Fournisseurs',suppliers)+photo);
  });

  $('#seed').onclick=async()=>{try{const r=await api.seedCatalog(getActiveActivity());toast(`${r.added.services} prestation(s) et ${r.added.parts} élément(s) ajoutés.`,'success');await hooks.refresh()}catch(x){toast(x.message,'error')}};

  const interventionForm=(i={})=>`${F('name','Nom de la prestation',i.name,'required')}<label class="field"><span>Description</span><textarea id="description" rows="2">${e(i.description||'')}</textarea></label><div class="grid-2">${F('duration','Durée (minutes)',i.default_duration_minutes??'','type="number" min="1"')}${F('price','Prix client habituel TTC (facultatif)',i.default_price??'','type="number" min="0" step="0.01"')}</div>`;
  const interventionBody=m=>({name:v(m,'name'),description:v(m,'description'),durationMinutes:Number(v(m,'duration'))||null,defaultPrice:Number(v(m,'price'))||0});
  $('#add-intervention').onclick=()=>modalForm('Nouvelle prestation',interventionForm(),m=>api.createIntervention(interventionBody(m)));
  const supplyForm=(x={})=>`${F('name','Nom de la fourniture',x.name,'required')}<div class="grid-2">${F('reference','Référence',x.reference)}${F('purchase','Prix d’achat HT',x.purchase_price??'', 'type="number" min="0" step="0.01"')}</div><label class="field"><span>Fournisseur <em class="tag">facultatif</em></span><select id="supplier"><option value="">Votre choix</option>${S.suppliers.map(s=>`<option value="${e(s.id)}" ${s.id===x.supplier_id?'selected':''}>${e(s.name)}</option>`).join('')}</select></label>`;
  const supplyBody=m=>({activityId:getActiveActivity(),name:v(m,'name'),reference:v(m,'reference'),purchasePrice:Math.max(0,Number(String(v(m,'purchase')).replace(',','.'))||0),supplierId:m.querySelector('#supplier').value||null});
  $('#add-supply').onclick=()=>modalForm('Nouvelle fourniture',supplyForm(),m=>api.createSupply(supplyBody(m)));
  all('.edit-supply').forEach(b=>{b.onclick=()=>{const x=by(S.supplies||[],b.dataset.id);if(!x)return;modalForm('Modifier la fourniture',supplyForm(x),m=>api.updateSupply(x.id,supplyBody(m)))}});
  all('.del-supply').forEach(b=>b.onclick=()=>confirmDelete('Supprimer cette fourniture ?',()=>api.deleteSupply(b.dataset.id),'Fourniture supprimée'));
  all('.edit-intervention').forEach(b=>b.onclick=()=>{const i=by(S.interventions,b.dataset.id);modalForm('Modifier la prestation',interventionForm(i),m=>api.updateIntervention(i.id,interventionBody(m)))});
  all('.del-intervention').forEach(b=>b.onclick=()=>confirmDelete('Supprimer cette prestation ? Les devis déjà créés ne sont pas modifiés.',()=>api.deleteIntervention(b.dataset.id)));

  const partForm=(x={})=>`${F('name',`Nom (${e(p.itemLabel||'pièce')})`,x.name,'required')}<div class="grid-2">${F('model','Modèle',x.model)}${F('variant','Variante',x.variant)}</div><div class="grid-2">${F('color','Couleur',x.color)}${F('quality','Qualité',x.quality,'placeholder="OEM, compatible…"')}</div><div class="grid-2">${F('reference','Référence',x.reference)}${F('sell','Prix de vente HT (indicatif)',x.selling_price??'','type="number" min="0" step="0.01"')}</div><div class="grid-2">${F('coef','Coefficient de vente %',x.sale_coefficient_percent??'','type="number" min="0" step="0.01"')}<label class="field"><span>Photo de la pièce</span><input id="photo" type="file" accept="image/png,image/jpeg,image/webp"><small class="help">Facultative · conservée avec la pièce.</small></label></div>`;
  const partBody=(m,x={})=>({name:v(m,'name'),category:x.category||prof().itemLabel||null,model:v(m,'model'),variant:v(m,'variant'),color:v(m,'color'),quality:v(m,'quality'),reference:v(m,'reference'),stock:x.stock||0,sellingPrice:Number(v(m,'sell'))||0,saleCoefficientPercent:Math.max(0,Number(v(m,'coef')||0)),notes:x.notes||null});
  const savePart=async(m,x)=>{const r=x?await api.updatePart(x.id,partBody(m,x)):await api.createPart(partBody(m));const f=m.querySelector('#photo')?.files?.[0];if(f)await api.uploadPartPhoto(r.id||x.id,f);return r};
  $('#add-part').onclick=()=>modalForm('Nouvel élément',partForm(),m=>savePart(m),{label:'Valider la pièce'});
  all('.edit-part').forEach(b=>b.onclick=()=>{const x=by(S.parts,b.dataset.id);modalForm('Modifier l’élément',partForm(x),m=>savePart(m,x),{label:'Valider la pièce'})});
  all('.del-part').forEach(b=>b.onclick=()=>confirmDelete('Supprimer cet élément du catalogue ? Les devis déjà créés ne sont pas modifiés.',()=>api.deletePart(b.dataset.id)));
  all('.price-part').forEach(b=>b.onclick=()=>{
    if(!S.suppliers.length)return toast('Ajoutez d’abord un fournisseur.','info');
    modalForm('Prix fournisseur',`<label class="field"><span>Fournisseur</span><select id="sup"><option value="">Votre choix</option>${S.suppliers.map(s=>`<option value="${s.id}">${e(s.name)}</option>`).join('')}</select></label><div class="grid-2">${F('ref','Référence fournisseur')}${F('pp','Prix d’achat HT','0','type="number" min="0" step="0.01" required')}</div>`,
      m=>api.setPartPrice(b.dataset.id,{supplierId:m.querySelector('#sup').value,supplierReference:v(m,'ref'),purchasePrice:Number(v(m,'pp'))||0}));
  });
  all('.del-price').forEach(b=>b.onclick=()=>confirmDelete('Retirer ce prix fournisseur ?',()=>api.deletePartPrice(b.dataset.part,b.dataset.supplier),'Prix retiré'));

  const polForm=(g={})=>`${F('name','Intitulé de la garantie',g.name,'required')}${F('months','Durée (mois)',g.duration_months??'','type="number" min="1" required')}<label class="field"><span>Garantie portant sur</span><select id="scope"><option value="">Votre choix</option><option value="parts" ${g.scope_type==='parts'?'selected':''}>Pièces uniquement</option><option value="labor" ${g.scope_type==='labor'?'selected':''}>Main-d’œuvre uniquement</option><option value="both" ${g.scope_type==='both'?'selected':''}>Pièces et main-d’œuvre</option><option value="activity" ${!g.scope_type||g.scope_type==='activity'?'selected':''}>Activité entière</option></select></label>`;
  $('#add-policy').onclick=()=>modalForm('Nouvelle garantie',polForm(),m=>api.createWarrantyPolicy({name:v(m,'name'),durationMonths:Number(v(m,'months')),scopeType:m.querySelector('#scope').value||'activity'}));
  all('.edit-policy').forEach(b=>b.onclick=()=>{const g=by(S.policies,b.dataset.id);modalForm('Modifier la garantie',polForm(g),m=>api.updateWarrantyPolicy(g.id,{name:v(m,'name'),durationMonths:Number(v(m,'months')),scopeType:m.querySelector('#scope').value||'activity'}))});
  all('.del-policy').forEach(b=>b.onclick=()=>confirmDelete('Supprimer cette garantie ?',()=>api.deleteWarrantyPolicy(b.dataset.id)));
}
