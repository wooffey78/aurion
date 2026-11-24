/* Aurion — synchronisation globale du compte entre appareils. */
(()=>{
  const storageKey=d=>`aurion.accountSyncRevision:${d?.organizationId||'unknown-org'}:${d?.userId||'unknown-user'}`;
  const busy=()=>document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')||document.querySelector('#view form');
  const nativeFetch=window.fetch.bind(window);
  const activityHeaders=()=>{try{const id=localStorage.getItem('aurion.activeActivityId');return id?{'x-aurion-activity-id':id}:{}}catch{return{}}};
  let lastKey='',etag='';
  const BASE_POLL_MS=1000,MAX_POLL_MS=16000;
  let failureCount=0,pollTimer=0,polling=false;
  async function readVersion(){
    const headers=etag?{'If-None-Match':etag}:{};
    const r=await nativeFetch('/sync/version',{headers,credentials:'include',cache:'no-store'});
    if(r.status===304)return {notModified:true};
    if(!r.ok)throw new Error('SYNC_VERSION_FAILED');
    etag=r.headers.get('ETag')||etag;
    const d=await r.json();lastKey=storageKey(d);
    return {d,key:lastKey,revision:String(d?.revision??'0')};
  }
  const set=(selectors,value)=>{for(const selector of selectors){const n=document.querySelector(selector);if(n){n.textContent=value;return true}}return false};
  const textByLabel=(label,value)=>{const nodes=[...document.querySelectorAll('#view article span,#view .metric span,#view .stat span,#view .kpi span')];const node=nodes.find(n=>n.textContent?.trim().toLowerCase()===label.toLowerCase());const parent=node?.closest('article,.metric,.stat,.kpi');const valueNode=parent?.querySelector('b,strong,.value');if(valueNode)valueNode.textContent=value};
  const euro=n=>Number(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  // 15.4.56 — remplissage systématique des encarts financiers : mise à jour par identifiants
  // (encarts réels de chaque écran) avec repli par libellé. L'ancien mappage visait des libellés
  // qui n'existaient pas dans les pages (« Chiffre d'affaires HT », « Entrées prévues »,
  // « Solde prévisionnel ») : les encarts restaient vides ou figés. force=true bypass le garde
  // « formulaire ouvert » (appel après un rendu de vue, jamais pendant une frappe clavier).
  async function refreshFinancialCards(force=false){
    if(!location.hash.startsWith('#/dashboard')||(!force&&busy()))return;
    try{
      const year=Number(document.querySelector('#acc-year')?.value)||new Date().getFullYear();
      const [dashboard,accounting,treasury]=await Promise.all([
        nativeFetch('/dashboard/summary?forecastMonths=6',{credentials:'include',cache:'no-store',headers:activityHeaders()}).then(r=>r.ok?r.json():null),
        nativeFetch(`/accounting/summary?year=${year}`,{credentials:'include',cache:'no-store',headers:activityHeaders()}).then(r=>r.ok?r.json():null),
        nativeFetch('/treasury/summary',{credentials:'include',cache:'no-store',headers:activityHeaders()}).then(r=>r.ok?r.json():null),
      ]);
      if(!dashboard)return;
      const f=dashboard.forecast||{};
      set(['#home-month-revenue'],euro(f.monthHt??f.month));
      set(['#home-entries-caption'],`${euro(dashboard.forecastEntries||0)} à venir · TTC, SAV déduits`);
      set(['#home-tickets-caption'],`${Number(dashboard.tickets||0)} ticket(s) non traité(s)`);
      textByLabel('Mois',euro(f.monthHt??f.month));textByLabel('3 mois',euro(f.months3));textByLabel('6 mois',euro(f.months6));textByLabel('Année en cours',euro(f.year));textByLabel('À venir',euro(dashboard.forecastEntries));
      if(accounting?.invoices){
        set(['#acc-encaissements'],euro(accounting.invoices.revenue_ht));
        set(['#acc-tva'],euro(accounting.invoices.vat));
        set(['#acc-cotisations'],euro(accounting.invoices.social));
        set(['#acc-km'],euro(accounting.invoices.mileage_total));
        set(['#acc-factures'],String(Number(accounting.invoices.count||0)));
        textByLabel('Encaissements HT',euro(accounting.invoices.revenue_ht));textByLabel('TVA encaissée',euro(accounting.invoices.vat));textByLabel('Cotisations estimées',euro(accounting.invoices.social));textByLabel('Kilométrage sur factures',euro(accounting.invoices.mileage_total));
      }
      if(treasury){
        set(['#trez-committed-in'],euro(treasury.committedIn||0));
        set(['#trez-potential-in'],euro(treasury.potentialIn||0));
        set(['#trez-outputs'],euro(treasury.forecastOutputs||0));
        set(['#trez-committed-net'],euro(treasury.committedNet||0));
        set(['#trez-sav'],euro(treasury.savTotal||0));
        textByLabel('Entrées prévues',euro(treasury.forecastEntries));textByLabel('Sorties prévues',euro(treasury.forecastOutputs));textByLabel('Solde prévisionnel',euro(treasury.forecastNet));
      }
    }catch{}
  }
  window.aurionRefreshFinancialCards=refreshFinancialCards;
  window.aurionSyncAcknowledge=async()=>{try{const result=await readVersion();if(result.notModified)return;localStorage.setItem(result.key,result.revision)}catch{}};
  const poll=async()=>{
    if(polling||document.visibilityState!=='visible'||!location.hash.startsWith('#/dashboard')||busy())return;
    polling=true;
    try{
      const result=await readVersion();
      failureCount=0;
      if(result.notModified)return;
      const {d,key,revision}=result,previous=localStorage.getItem(key);
      if(previous===null){localStorage.setItem(key,revision);await refreshFinancialCards();return}
      if(previous!==revision){localStorage.setItem(key,revision);await refreshFinancialCards();window.dispatchEvent(new CustomEvent('aurion:account-sync-changed',{detail:{revision,updatedAt:d?.updatedAt||null,organizationId:d?.organizationId||null,userId:d?.userId||null}}))}
    }catch{failureCount=Math.min(failureCount+1,4)}
    finally{polling=false}
  };
  const schedule=()=>{window.clearTimeout(pollTimer);const delay=failureCount?Math.min(BASE_POLL_MS*(2**failureCount),MAX_POLL_MS):BASE_POLL_MS;pollTimer=window.setTimeout(async()=>{await poll();schedule()},delay)};
  const pollNow=async()=>{window.clearTimeout(pollTimer);await poll();schedule()};
  schedule();
  window.addEventListener('online',pollNow,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pollNow()});
  window.addEventListener('pageshow',()=>window.setTimeout(pollNow,1200),{passive:true});
})();
