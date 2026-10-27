/* Aurion — synchronisation globale du compte + retour visuel des chargements. */
(()=>{
  const key='aurion.accountSyncRevision';
  let requests=0,timer=0,bar=null;
  const busy=()=>document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')||document.querySelector('#view form');
  const ensureBar=()=>{
    if(bar)return bar;
    bar=document.createElement('div');
    bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');bar.innerHTML='<div><i></i></div><span>Chargement…</span>';
    Object.assign(bar.style,{position:'fixed',top:'0',left:'0',right:'0',height:'34px',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:'10000',pointerEvents:'none',opacity:'0',transform:'translateY(-100%)',transition:'opacity .18s ease,transform .18s ease'});
    const track=bar.firstElementChild,fill=track.firstElementChild,label=bar.lastElementChild;
    Object.assign(track.style,{position:'absolute',top:'0',left:'0',right:'0',height:'3px',background:'rgba(255,255,255,.08)',overflow:'hidden'});
    Object.assign(fill.style,{display:'block',width:'34%',height:'100%',background:'linear-gradient(90deg,#477bff,#19bfff,#a45cff)',animation:'aurionLoading 1.15s ease-in-out infinite'});
    Object.assign(label.style,{marginBottom:'4px',padding:'3px 9px',border:'1px solid rgba(104,170,255,.22)',borderRadius:'99px',background:'rgba(5,10,22,.92)',color:'#8fa7bf',fontSize:'.7rem'});
    const style=document.createElement('style');style.textContent='@keyframes aurionLoading{0%{transform:translateX(-120%)}50%{transform:translateX(190%)}100%{transform:translateX(320%)}}';document.head.appendChild(style);
    document.body.appendChild(bar);return bar;
  };
  const show=()=>{const b=ensureBar();b.style.opacity='1';b.style.transform='none'};
  const hide=()=>{if(!bar)return;bar.style.opacity='0';bar.style.transform='translateY(-100%)'};
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{
    requests++;clearTimeout(timer);timer=setTimeout(()=>{if(requests)show()},250);
    try{return await nativeFetch(...args)}finally{requests=Math.max(0,requests-1);if(!requests){clearTimeout(timer);hide()}}
  };
  const poll=async()=>{
    if(document.visibilityState!=='visible'||!location.hash.startsWith('#/dashboard')||busy())return;
    try{
      const r=await nativeFetch('/sync/version',{credentials:'include',cache:'no-store'});
      if(!r.ok)return;
      const d=await r.json(),rev=String(d?.revision??'0'),previous=localStorage.getItem(key);
      if(previous===null){localStorage.setItem(key,rev);return}
      if(previous!==rev){localStorage.setItem(key,rev);location.reload()}
    }catch{}
  };
  window.setInterval(poll,20000);window.addEventListener('online',poll,{passive:true});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll()});
  window.addEventListener('pageshow',()=>window.setTimeout(poll,1200),{passive:true});
})();
