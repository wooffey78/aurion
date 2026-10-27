/* Aurion — synchronisation globale du compte entre appareils. */
(()=>{
  const key='aurion.accountSyncRevision';
  const busy=()=>document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')||document.querySelector('#view form');
  const nativeFetch=window.fetch.bind(window);
  const poll=async()=>{
    if(document.visibilityState!=='visible'||!location.hash.startsWith('#/dashboard')||busy())return;
    try{
      const r=await nativeFetch('/sync/version',{credentials:'include',cache:'no-store'});
      if(!r.ok)return;
      const d=await r.json(),rev=String(d?.revision??'0'),previous=localStorage.getItem(key);
      if(previous===null){localStorage.setItem(key,rev);return}
      if(previous!==rev){localStorage.setItem(key,rev);window.dispatchEvent(new CustomEvent('aurion:account-sync-changed',{detail:{revision:rev,updatedAt:d?.updatedAt||null}}))}
    }catch{}
  };
  window.setInterval(poll,20000);window.addEventListener('online',poll,{passive:true});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll()});
  window.addEventListener('pageshow',()=>window.setTimeout(poll,1200),{passive:true});
})();
