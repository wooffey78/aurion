/* Aurion — synchronisation globale du compte entre appareils. */
(()=>{
  const storageKey=d=>`aurion.accountSyncRevision:${d?.organizationId||'unknown-org'}:${d?.userId||'unknown-user'}`;
  const busy=()=>document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')||document.querySelector('#view form');
  const nativeFetch=window.fetch.bind(window);
  let lastKey='';
  async function readVersion(){
    const r=await nativeFetch('/sync/version',{credentials:'include',cache:'no-store'});
    if(!r.ok)throw new Error('SYNC_VERSION_FAILED');
    const d=await r.json();
    lastKey=storageKey(d);
    return {d,key:lastKey,revision:String(d?.revision??'0')};
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
      if(previous===null){localStorage.setItem(key,revision);return}
      if(previous!==revision){
        localStorage.setItem(key,revision);
        window.dispatchEvent(new CustomEvent('aurion:account-sync-changed',{detail:{revision,updatedAt:d?.updatedAt||null,organizationId:d?.organizationId||null,userId:d?.userId||null}}));
      }
    }catch{}
  };
  // Synchronisation inter-appareils quasi instantanée, sans rechargement de page.
  window.setInterval(poll,1000);
  window.addEventListener('online',poll,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll()});
  window.addEventListener('pageshow',()=>window.setTimeout(poll,1200),{passive:true});
})();
