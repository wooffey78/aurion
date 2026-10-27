import{route,routeQuery,listen,go}from'./core/router.js';
import{FALLBACK_LOGO,toast,enhanceFormFields}from'./core/ui.js';
import{renderForgot,renderReset}from'./pages/recovery.js';
import{renderLegal}from'./pages/legal.js';
import{api}from'./core/api.js';
import{getCachedSession,setSession,invalidateSession}from'./core/session.js';
import{renderAuth}from'./pages/auth.js';import{renderVipInvite}from'./pages/vip-invite.js';
import{renderDashboard}from'./pages/dashboard.js';

if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});window.__aurionDeferredInstall=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__aurionDeferredInstall=e});


const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

document.addEventListener('error',ev=>{const t=ev.target;if(!(t instanceof HTMLImageElement))return;if(t.dataset.fallback==='logo'&&!t.dataset.done){t.dataset.done='1';t.src=FALLBACK_LOGO}else if(t.hasAttribute('data-hide-on-error'))t.style.display='none'},true);

async function getSession(){
  const cached=getCachedSession();
  if(cached)return cached;
  try{return setSession(await api.me())}catch{return null}
}

function showError(e){
  // Session expiree : retour propre a la connexion (plus d'ecran vide).
  if(e?.status===401||e?.sessionExpired){invalidateSession();if(route()!=='/auth')return go('/auth');return renderAuth()}
  const app=document.querySelector('#app');
  if(app)app.innerHTML=`<main class="center"><div class="glass"><h1>Erreur Aurion</h1><p>${esc(e?.message||e)}</p><a class="btn primary" href="#/auth">Retour à la connexion</a></div></main>`;
}

async function render(){
  const r=route();
  if(r==='/auth')return renderAuth('register');
  if(r==='/login')return renderAuth('login');
  if(r==='/forgot')return renderForgot();
  if(r==='/reset')return renderReset();
  if(r==='/invite'){return renderVipInvite(routeQuery().get('token')||'');}
  if(r==='/legal'||r.startsWith('/legal/'))return renderLegal(r.split('/')[2]||'');
  if(r==='/dashboard'){if(!await getSession())return go('/auth');const q=routeQuery();if(q.get('billing')==='success'&&q.get('session_id')){try{await api.completeCheckout(q.get('session_id'));toast('Paiement confirmé. Votre abonnement est actif.','success')}catch(x){toast(x.message,'error')}location.hash='#/dashboard';return}return renderDashboard()}
  if(r==='/'){
    document.querySelector('#app').innerHTML=`<main class="landing"><header class="topbar"><a class="brand" href="#/">AURION</a></header><section class="install-grid" id="install-grid" aria-label="Installer Aurion"><figure class="platform-download-card"><button class="install-card" data-platform="macos" type="button" aria-label="Installer Aurion sur macOS"><img src="./assets/platforms/macos.svg" alt="Illustration de la plateforme macOS"><span class="sr-only">Installer Aurion sur macOS</span></button><figcaption class="platform-download-copy"><strong>macOS</strong></figcaption></figure><figure class="platform-download-card"><button class="install-card" data-platform="ios" type="button" aria-label="Installer Aurion sur iOS"><img src="./assets/platforms/ios.svg" alt="Illustration de la plateforme iOS"><span class="sr-only">Installer Aurion sur iOS</span></button><figcaption class="platform-download-copy"><strong>iOS</strong></figcaption></figure><figure class="platform-download-card"><button class="install-card" data-platform="windows" type="button" aria-label="Installer Aurion sur Windows"><img src="./assets/platforms/windows.svg" alt="Illustration de la plateforme Windows"><span class="sr-only">Installer Aurion sur Windows</span></button><figcaption class="platform-download-copy"><strong>Windows</strong></figcaption></figure><figure class="platform-download-card"><button class="install-card" data-platform="android" type="button" aria-label="Installer Aurion sur Android"><img src="./assets/platforms/android.svg" alt="Illustration de la plateforme Android"><span class="sr-only">Installer Aurion sur Android</span></button><figcaption class="platform-download-copy"><strong>Android</strong></figcaption></figure></section><section class="landing-hero"><div><span class="eyebrow">LOGICIEL DE GESTION PROFESSIONNELLE</span><h1>Votre activité, <em>simplement gérée.</em></h1><p>Aurion centralise clients, catalogue, fournisseurs, interventions, devis, factures, agenda, comptabilité et trésorerie dans une seule application.</p><div class="button-row"><a class="btn primary" href="#/auth">Commencer <span>→</span></a><a class="btn secondary" href="#/login">Se connecter</a></div></div><img src="./assets/aurion-presentation.png" alt="Aperçu de l’interface Aurion de gestion d’activité" data-hide-on-error></section></main>`;
    const bindLandingNavigation=(selector,destination)=>document.querySelectorAll(selector).forEach(link=>link.addEventListener('click',event=>{event.preventDefault();if(route()===destination){renderAuth(destination==='/login'?'login':'register');return}go(destination)}));
    bindLandingNavigation('.landing-hero .button-row a[href="#/auth"]','/auth');
    bindLandingNavigation('.landing-hero .button-row a[href="#/login"]','/login');
    if(new URLSearchParams(location.search).get('native')==='1'||location.protocol==='file:'||window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone)document.querySelector('#install-grid')?.remove();
    const installationHelp={ios:'Sur iPhone ou iPad : ouvrez le menu Partager de Safari, puis choisissez « Sur l’écran d’accueil » et confirmez.',android:'Dans Chrome : ouvrez le menu ⋮, puis choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».',macos:'Dans Safari compatible : menu Fichier > Ajouter au Dock. Dans Chrome ou Edge : utilisez l’icône Installer de la barre d’adresse ou le menu du navigateur.',windows:'Dans Edge ou Chrome : utilisez l’icône Installer de la barre d’adresse ou le menu du navigateur pour installer Aurion.'};
    const showInstallHelp=platform=>{document.querySelector('#aurion-install-help')?.remove();document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="aurion-install-help" role="dialog" aria-modal="true" aria-labelledby="aurion-install-title"><section class="modal glass"><div class="section-title"><h2 id="aurion-install-title">Installer Aurion sur ${esc(platform==='ios'?'iOS':platform==='macos'?'macOS':platform==='android'?'Android':'Windows')}</h2><button type="button" class="icon-btn" id="aurion-install-close" aria-label="Fermer">×</button></div><p>${esc(installationHelp[platform]||'Utilisez le menu d’installation de votre navigateur.')}</p><p class="help">Aurion s’installe comme application web progressive. Aucun fichier natif .exe ou .apk séparé n’est inclus dans ce projet.</p><div class="button-row"><button type="button" class="btn primary" id="aurion-install-understood">Compris</button></div></section></div>`);const m=document.querySelector('#aurion-install-help');const close=()=>m?.remove();m?.querySelector('#aurion-install-close')?.addEventListener('click',close);m?.querySelector('#aurion-install-understood')?.addEventListener('click',close);m?.addEventListener('click',ev=>{if(ev.target===m)close()});};
    document.querySelectorAll('.install-card').forEach(b=>b.onclick=async()=>{const platform=b.dataset.platform;const isNative=window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone;if(isNative)return;if(window.__aurionDeferredInstall&&['windows','android','macos'].includes(platform)){try{window.__aurionDeferredInstall.prompt();const choice=await window.__aurionDeferredInstall.userChoice;if(choice?.outcome==='accepted'){window.__aurionDeferredInstall=null;return}}catch{}window.__aurionDeferredInstall=null;}showInstallHelp(platform);});
    return;
    return;
  }
  document.querySelector('#app').innerHTML='<main class="center"><div class="glass"><h1>Page introuvable</h1><a class="btn primary" href="#/">Retour</a></div></main>';
}

// Mobile keyboard/viewport management: keep focused fields and form actions visible on iOS/Android.
const editableTarget = el => el instanceof HTMLElement && el.matches('input:not([type="hidden"]),textarea,select,[contenteditable="true"]');
let viewportRaf = 0;
function syncVisualViewport() {
  if (viewportRaf) cancelAnimationFrame(viewportRaf);
  viewportRaf = requestAnimationFrame(() => {
    const vv = window.visualViewport;
    const height = Math.max(240, vv?.height || window.innerHeight);
    const inset = Math.max(0, window.innerHeight - height - (vv?.offsetTop || 0));
    document.documentElement.style.setProperty('--aurion-viewport-height', `${height}px`);
    document.documentElement.style.setProperty('--aurion-keyboard-inset', `${inset}px`);
    const keyboardOpen = matchMedia('(max-width: 900px)').matches && editableTarget(document.activeElement) && inset > 100;
    document.body.classList.toggle('keyboard-open', Boolean(keyboardOpen));
  });
}
window.addEventListener('resize', syncVisualViewport, { passive: true });
window.visualViewport?.addEventListener('resize', syncVisualViewport, { passive: true });
window.visualViewport?.addEventListener('scroll', syncVisualViewport, { passive: true });
document.addEventListener('focusin', event => {
  syncVisualViewport();
  const el = event.target;
  if (!editableTarget(el) || !matchMedia('(max-width: 900px)').matches) return;
  window.setTimeout(() => {
    if (document.activeElement === el) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    syncVisualViewport();
  }, 180);
});
document.addEventListener('focusout', () => window.setTimeout(syncVisualViewport, 220));
window.addEventListener('orientationchange', () => window.setTimeout(syncVisualViewport, 250));
syncVisualViewport();

const formObserver=new MutationObserver(()=>enhanceFormFields(document));
formObserver.observe(document.body,{childList:true,subtree:true});
listen(()=>render().then(()=>enhanceFormFields(document)).catch(showError));
render().then(()=>enhanceFormFields(document)).catch(showError);
