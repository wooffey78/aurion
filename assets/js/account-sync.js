/* Aurion — synchronisation globale du compte entre appareils. */
(()=>{
  const storageKey=d=>`aurion.accountSyncRevision:${d?.organizationId||'unknown-org'}:${d?.userId||'unknown-user'}`;
  const busy=()=>document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')||document.querySelector('#view form');
  const nativeFetch=window.fetch.bind(window);
  let lastKey='';

  // Compatibilité ciblée avec les formulaires historiques : les champs facultatifs
  // envoyés à null étaient rejetés par Zod, et l'édition d'une pièce sans champ stock
  // pouvait remettre son stock à zéro. Rien d'autre n'est modifié dans les requêtes.
  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input?.url||'';
    const method=String(init?.method||'GET').toUpperCase();
    if(method==='POST'&&/\/invoices\/[^/]+\/payments(?:\?|$)/.test(url)&&typeof init.body==='string'){
      try{
        const body=JSON.parse(init.body);
        for(const key of ['paidAt','reference','note'])if(body[key]===null)delete body[key];
        init={...init,body:JSON.stringify(body)};
      }catch{}
    }
    if(method==='PATCH'&&/\/parts\/[^/]+(?:\?|$)/.test(url)&&typeof init.body==='string'){
      try{
        const body=JSON.parse(init.body);
        if(Object.prototype.hasOwnProperty.call(body,'stock')&&Number(body.stock)===0){
          const current=await nativeFetch('/parts',{credentials:'include',cache:'no-store'});
          if(current.ok){const rows=await current.json();const id=url.match(/\/parts\/([^/?]+)/)?.[1];const part=Array.isArray(rows)&&rows.find(x=>String(x.id)===String(id));if(part&&Number(part.stock)>0){body.stock=part.stock;init={...init,body:JSON.stringify(body)}}}
        }
      }catch{}
    }
    return nativeFetch(input,init);
  };

  async function readVersion(){
    const r=await nativeFetch('/sync/version',{credentials:'include',cache:'no-store'});
    if(!r.ok)throw new Error('SYNC_VERSION_FAILED');
    const d=await r.json();
    lastKey=storageKey(d);
    return {d,key:lastKey,revision:String(d?.revision??'0')};
  }
  const textByLabel=(label,value)=>{
    const nodes=[...document.querySelectorAll('#view article span,#view .metric span,#view .stat span,#view .kpi span')];
    const node=nodes.find(n=>n.textContent?.trim().toLowerCase()===label.toLowerCase());
    const parent=node?.closest('article,.metric,.stat,.kpi');
    const valueNode=parent?.querySelector('b,strong,.value');
    if(valueNode)valueNode.textContent=value;
  };
  async function refreshFinancialCards(){
    if(!location.hash.startsWith('#/dashboard')||busy())return;
    try{
      const [dashboard,accounting,treasury]=await Promise.all([
        nativeFetch('/dashboard/summary?forecastMonths=6',{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():null),
        nativeFetch(`/accounting/summary?year=${new Date().getFullYear()}`,{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():null),
        nativeFetch('/treasury/summary',{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():null),
      ]);
      if(!dashboard)return;
      const f=dashboard.forecast||{};
      textByLabel('Mois',Number(f.monthHt??f.month??0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
      textByLabel('3 mois',Number(f.months3||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
      textByLabel('6 mois',Number(f.months6||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
      textByLabel('Année en cours',Number(f.year||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
      textByLabel('À venir',Number(dashboard.forecastEntries||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
      if(accounting?.invoices){
        textByLabel('Chiffre d’affaires HT',Number(accounting.invoices.revenue_ht||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
        textByLabel('Achats',Number(accounting.invoices.purchases||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
        textByLabel('Cotisations',Number(accounting.invoices.social||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
      }
      if(treasury){
        textByLabel('Entrées prévues',Number(treasury.forecastEntries||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
        textByLabel('Sorties prévues',Number(treasury.forecastOutputs||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
        textByLabel('Solde prévisionnel',Number(treasury.forecastNet||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
      }
    }catch{}
  }
  window.aurionSyncAcknowledge=async()=>{
    try{
      const {key,revision}=await readVersion();
      localStorage.setItem(key,revision);
    }catch{}
  };
  const poll=async()=>{
    if(document.visibilityState!=='visible'||!location.hash.startsWith('#/dashboard')||busy())return;
    try{
      const {d,key,revision}=await readVersion(),previous=localStorage.getItem(key);
      if(previous===null){localStorage.setItem(key,revision);await refreshFinancialCards();return}
      if(previous!==revision){
        localStorage.setItem(key,revision);
        await refreshFinancialCards();
        window.dispatchEvent(new CustomEvent('aurion:account-sync-changed',{detail:{revision,updatedAt:d?.updatedAt||null,organizationId:d?.organizationId||null,userId:d?.userId||null}}));
      }
    }catch{}
  };
  window.setInterval(poll,1000);
  window.addEventListener('online',poll,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll()});
  window.addEventListener('pageshow',()=>window.setTimeout(poll,1200),{passive:true});
})();
