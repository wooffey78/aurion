/* Aurion — synchronisation globale du compte entre appareils. */
(()=>{
  const storageKey=d=>`aurion.accountSyncRevision:${d?.organizationId||'unknown-org'}:${d?.userId||'unknown-user'}`;
  const busy=()=>document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')||document.querySelector('#view form');
  const nativeFetch=window.fetch.bind(window);
  let lastKey='';
  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input?.url||'';
    const method=String(init?.method||'GET').toUpperCase();
    if(method==='POST'&&/\/invoices\/[^/]+\/payments(?:\?|$)/.test(url)&&typeof init.body==='string'){
      try{const body=JSON.parse(init.body);for(const key of ['paidAt','reference','note'])if(body[key]===null)delete body[key];init={...init,body:JSON.stringify(body)}}catch{}
    }
    return nativeFetch(input,init);
  };
  async function readVersion(){const r=await nativeFetch('/sync/version',{credentials:'include',cache:'no-store'});if(!r.ok)throw new Error('SYNC_VERSION_FAILED');const d=await r.json();lastKey=storageKey(d);return {d,key:lastKey,revision:String(d?.revision??'0')}}
  const set=(selectors,value)=>{for(const selector of selectors){const n=document.querySelector(selector);if(n){n.textContent=value;return true}}return false};
  const textByLabel=(label,value)=>{const nodes=[...document.querySelectorAll('#view article span,#view .metric span,#view .stat span,#view .kpi span')];const node=nodes.find(n=>n.textContent?.trim().toLowerCase()===label.toLowerCase());const parent=node?.closest('article,.metric,.stat,.kpi');const valueNode=parent?.querySelector('b,strong,.value');if(valueNode)valueNode.textContent=value};
  const euro=n=>Number(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  async function refreshFinancialCards(){if(!location.hash.startsWith('#/dashboard')||busy())return;try{const [dashboard,accounting,treasury]=await Promise.all([nativeFetch('/dashboard/summary?forecastMonths=6',{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():null),nativeFetch(`/accounting/summary?year=${new Date().getFullYear()}`,{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():null),nativeFetch('/treasury/summary',{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():null)]);if(!dashboard)return;const f=dashboard.forecast||{};set(['#home-month-revenue'],euro(f.monthHt??f.month));set(['#home-forecast-3m'],euro(f.months3));set(['#home-forecast-6m'],euro(f.months6));set(['#home-forecast-year'],euro(f.year));set(['#home-forecast-entries'],euro(dashboard.forecastEntries));textByLabel('Mois',euro(f.monthHt??f.month));textByLabel('3 mois',euro(f.months3));textByLabel('6 mois',euro(f.months6));textByLabel('Année en cours',euro(f.year));textByLabel('À venir',euro(dashboard.forecastEntries));if(accounting?.invoices){textByLabel("Chiffre d’affaires HT",euro(accounting.invoices.revenue_ht));textByLabel('Achats',euro(accounting.invoices.purchases));textByLabel('Cotisations',euro(accounting.invoices.social))}if(treasury){textByLabel('Entrées prévues',euro(treasury.forecastEntries));textByLabel('Sorties prévues',euro(treasury.forecastOutputs));textByLabel('Solde prévisionnel',euro(treasury.forecastNet))}}catch{}}
  window.aurionSyncAcknowledge=async()=>{try{const {key,revision}=await readVersion();localStorage.setItem(key,revision)}catch{}};
  const poll=async()=>{if(document.visibilityState!=='visible'||!location.hash.startsWith('#/dashboard')||busy())return;try{const {d,key,revision}=await readVersion(),previous=localStorage.getItem(key);if(previous===null){localStorage.setItem(key,revision);await refreshFinancialCards();return}if(previous!==revision){localStorage.setItem(key,revision);await refreshFinancialCards();window.dispatchEvent(new CustomEvent('aurion:account-sync-changed',{detail:{revision,updatedAt:d?.updatedAt||null,organizationId:d?.organizationId||null,userId:d?.userId||null}}))}}catch{}};
  window.setInterval(poll,1000);window.addEventListener('online',poll,{passive:true});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll()});window.addEventListener('pageshow',()=>window.setTimeout(poll,1200),{passive:true});
})();
