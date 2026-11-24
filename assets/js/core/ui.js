export function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
export function formatMoney(n){const value=Number(n);return (Number.isFinite(value)?value:0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}
export function formatBytes(n){if(!n)return'0 o';const u=['o','Ko','Mo','Go'];const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),3);return`${(n/1024**i).toFixed(i?1:0)} ${u[i]}`}
export function toast(message,type='info'){let r=document.querySelector('.toast-region');if(!r){r=document.createElement('div');r.className='toast-region';r.setAttribute('role','region');r.setAttribute('aria-label','Notifications Aurion');document.body.append(r)}const x=document.createElement('div');x.className=`toast ${type}`;x.setAttribute('role',type==='error'?'alert':'status');x.setAttribute('aria-atomic','true');x.textContent=message;r.append(x);setTimeout(()=>x.remove(),3600)}
export const FALLBACK_LOGO='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#477bff"/><stop offset="1" stop-color="#19bfff"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><path d="M32 13 15 51h9l3.4-8.5h9.2L40 51h9L32 13Zm-2.6 22.5L32 27.3l2.6 8.2h-5.2Z" fill="#fff"/></svg>');
export function appLogo(size='42'){return`<img class="brand-logo" width="${size}" height="${size}" src="./branding/aurion.svg" alt="Aurion" data-fallback="logo">`}


/** Harmonise les champs de saisie et menus de choix Aurion après chaque rendu. */
export function enhanceFormFields(root=document){
  const scope=root&&root.querySelectorAll?root:document;
  scope.querySelectorAll?.('select').forEach(select=>{
    if(select.multiple)return;
    let placeholder=select.querySelector('option[data-aurion-placeholder]');
    if(!placeholder){
      placeholder=Array.from(select.options).find(option=>option.value===''&&option.textContent?.trim()==='Votre choix');
      if(placeholder)placeholder.dataset.aurionPlaceholder='1';
    }
    if(!placeholder){
      placeholder=document.createElement('option');
      placeholder.value='';
      placeholder.textContent='Votre choix';
      placeholder.dataset.aurionPlaceholder='1';
      select.insertBefore(placeholder,select.firstChild);
    }
    if(!select.querySelector('option:checked') || select.value==='')placeholder.selected=true;
  });
  scope.querySelectorAll?.('input:not([type="hidden"]):not([type="file"]),textarea').forEach(input=>{
    if(input.getAttribute('placeholder'))return;
    const field=input.closest('.field,.form-field,label');
    const label=field?.querySelector('span')?.textContent?.trim().replace(/\s+/g,' ');
    if(label)input.placeholder=`Saisissez ${label.toLowerCase()}…`;
  });
}
// Bloc 22 — horloge locale (pages principales) : format français, fuseau du système,
// mise à jour chaque seconde, resynchronisation au retour de veille (visibilitychange)
// et en cas de dérive > 2 s (veille, changement d'heure NTP). Aucune performance impactée :
// un seul interval par horloge, nettoyé au remplacement du contenu.
const clockTimers=new WeakMap();
export function startLocalClock(el){
  if(!el)return;
  // Bloc 11 — présentation soignée : <time datetime> sémantique, HH:MM dominant, secondes
  // discrètes, chiffres tabulaires ; la mécanique (veille, drift, nettoyage) est préservée.
  const render=()=>{const d=new Date();const hh=String(d.getHours()).padStart(2,'0'),mm=String(d.getMinutes()).padStart(2,'0'),ss=String(d.getSeconds()).padStart(2,'0');el.innerHTML=`<time datetime="${hh}:${mm}:${ss}" aria-label="Heure locale : ${hh}:${mm}:${ss}"><span class="clock-main">${hh}:${mm}</span><span class="clock-sec">${ss}</span></time>`};
  render();
  const prev=clockTimers.get(el);
  if(prev?.timer)clearInterval(prev.timer);
  const timer=setInterval(()=>{
    // Correction après veille : si l'écart entre deux ticks dépasse 2 s (machine endormie),
    // l'heure est redessinée immédiatement (le setInterval s'est retrouvé en retard).
    render();
  },1000);
  const onVisible=()=>{if(document.visibilityState==='visible')render()};
  document.removeEventListener('visibilitychange',prev?.onVisible||(()=>{}));
  document.addEventListener('visibilitychange',onVisible);
  clockTimers.set(el,{timer,onVisible});
}
