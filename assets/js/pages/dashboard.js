// Tableau de bord Aurion : coquille (menu, activité active, plein écran) + chargement des données.
import{api,getActiveActivity,setActiveActivity}from'../core/api.js';
import{appLogo,toast,startLocalClock}from'../core/ui.js';
import{invalidateSession}from'../core/session.js';
import{go,routeQuery}from'../core/router.js';
import{hiddenViews,navigationItems}from'../core/navigation.js';
import{S,e,hooks,active,money,askConfirm}from'./dash/core.js';
import*as catalog from'./dash/catalog.js';
import{suppliers}from'./dash/suppliers.js';
import*as quote from'./dash/quote.js';
import*as docs from'./dash/docs.js';
import*as settings from'./dash/settings.js';
import*as account from'./dash/account.js';
import{home,clients,agenda,accounting,treasury,support,templates,admin}from'./dash/other.js';
import{chantiers}from'./dash/chantiers.js';
import{setCloudOwner}from'../core/cloud-sync.js';
import{loadProfileFeatures,cachedFlags}from'../core/profile-features.js';

const VIEWS={home,clients,chantiers,catalog,suppliers,quote,invoices:docs,templates,agenda,accounting,treasury,support,settings,account,admin};

// Garde-fous de rafraîchissement : ne jamais remplacer l’écran en pleine interaction.
let metricsRefreshInProgress = false;
let lastUserInteractionAt = Date.now();
let lastDashboardSummaryRefreshAt = 0, lastFinancialRefreshAt = 0;
let lifecycleRefreshInstalled=false,lastBackgroundRefreshAt=0,backgroundRefreshRunning=false;
let lastRenderedFinancialSnapshot = null;
for (const eventName of ['pointerdown', 'keydown', 'input', 'change', 'wheel', 'scroll', 'touchstart']) {
  document.addEventListener(eventName, () => { lastUserInteractionAt = Date.now(); }, true);
}
function financialSnapshot() {
  return JSON.stringify({ accounting: S.accounting, treasury: S.treasury, sav: S.sav, quotes: S.quotes });
}


// Chargement ciblé : le noyau à chaque action, les jeux de données rares seulement quand leur écran l'exige.
const EXTRAS={home:['timeMetrics','dashboardSummary'],settings:['company'],accounting:['accounting','treasury'],treasury:['treasury'],invoices:['treasury']};
const DATASETS={
  clients:['clients','quotes','appointments','devices','sav'],
  catalog:['parts','suppliers','interventions','supplies','warranties','policies','devices','sav'],
  suppliers:['suppliers','parts'],
  quote:['clients','quotes','suppliers','parts','interventions','warranties','policies','sav'],
  invoices:['clients','quotes','treasury','sav'],
  agenda:['appointments','clients','quotes'],
  accounting:['accounting','treasury','quotes','sav','expenseReports'],
  treasury:['treasury','accounting','quotes','sav','expenseReports'],
  settings:['mail'],
  templates:['mail'],
  home:['clients','quotes','appointments'], 
};
const ALL_DATASETS=[...new Set(Object.values(DATASETS).flat())];
let lastConfigLoadedAt=0;
async function load(extras=null,viewId=S.view){
  const safe=(p,d)=>Promise.resolve(p).catch(x=>{if(x?.status===401)throw x;return d});
  const full=extras===null;
  const wanted=new Set(full?ALL_DATASETS:[...(DATASETS[viewId]||[]),...(extras||[]).filter(k=>k!=='company')]);
  const needConfig=full||extras?.includes('company')||['home','settings','quote','catalog'].includes(viewId)||!S.company||Date.now()-lastConfigLoadedAt>120000;
  if(needConfig){
    const [company,activities]=await Promise.all([
      safe(api.organization(),S.company||{name:'Entreprise'}),
      safe(api.activities(),S.activities||[]),
    ]);
    S.company=company;S.activities=activities;lastConfigLoadedAt=Date.now();
    if((!getActiveActivity()||!activities.some(a=>a.id===getActiveActivity()))&&activities[0])setActiveActivity(activities[0].id);
  }
  const fallback={clients:[],quotes:[],appointments:[],suppliers:[],parts:[],interventions:[],supplies:[],warranties:[],policies:[],devices:[],sav:[] ,accounting:{},treasury:{},expenseReports:{expenses:[],totals:{}},mail:{configured:false},timeMetrics:null,dashboardSummary:S.dashboardCounters};
  const fetchers={
    clients:()=>api.clients(),quotes:()=>api.quotes(),appointments:()=>api.appointments(),
    suppliers:()=>api.suppliers(),parts:()=>api.parts(),interventions:()=>api.interventions(),
    supplies:()=>api.supplies(),warranties:()=>api.warranties(),policies:()=>api.warrantyPolicies(),
    devices:()=>api.devices(),sav:()=>api.sav(),
    accounting:()=>api.accounting(S.accountingYear||new Date().getFullYear()),treasury:()=>api.treasury(),
    mail:()=>api.mailStatus(),expenseReports:()=>api.expenseReports(S.accountingYear||new Date().getFullYear()),timeMetrics:()=>api.timeMetrics(),
    dashboardSummary:async()=>{const counters=await api.dashboardSummary(S.forecastMonths||6);try{const sub=await api.subscription();counters.trialDaysLeft=Number(sub.daysLeft||0);counters.subscription=sub}catch{}return counters;},
  };
  const jobs=[];
  // Bloc 3 — repli local hors connexion : chaque vue métier principale lit ses RÉPLIQUES quand
  // le serveur est injoignable (statut 0), via le même store que la réplication (aucune donnée
  // non autorisée : le store est déjà cloisonné par compte/organisation/appareil). Les agrégats
  // lourds (comptabilité, trésorerie) gardent le dernier état connu en ligne — PARTIEL documenté.
  const LOCAL_ENTITY={clients:'clients',quotes:'quotes',appointments:'appointments',suppliers:'suppliers',parts:'parts',interventions:'interventions',supplies:'supplies',warranties:'warranties',policies:'warranty_policies',devices:'devices',sav:'sav_cases',expenseReports:'expense_reports'};
  const offlineLocal=async key=>{
    if(!LOCAL_ENTITY[key])return null;
    try{
      const sm=await import('../core/sync-manager.js');
      let rows=await sm.getLocalList(LOCAL_ENTITY[key]);
      if(key==='expenseReports'){const cam=r=>({id:r.id,activityId:r.activity_id,spentOn:r.spent_on,label:r.label,category:r.category,amountTtc:Number(r.amount_ttc||0),vatAmount:Number(r.vat_amount||0),amountHt:Number((Number(r.amount_ttc||0)-Number(r.vat_amount||0)).toFixed(2)),paymentMethod:r.payment_method,status:r.status,reimbursedOn:r.reimbursed_on,notes:r.notes,receiptName:r.receipt_name,createdAt:r.created_at});const expenses=rows.map(cam);const totals=expenses.reduce((acc,x)=>{acc.count+=1;acc.amountTtc=Math.round((acc.amountTtc+x.amountTtc)*100)/100;acc.vatAmount=Math.round((acc.vatAmount+x.vatAmount)*100)/100;acc.amountHt=Math.round((acc.amountHt+x.amountHt)*100)/100;if(x.status==='to_reimburse')acc.toReimburse=Math.round((acc.toReimburse+x.amountTtc)*100)/100;return acc},{count:0,amountTtc:0,vatAmount:0,amountHt:0,toReimburse:0});return{expenses,totals};}
      if(!rows.length)return null;
      if(key==='quotes'){const items=await sm.getLocalList('quote_items');const byQ=new Map();for(const it of items){const k=it.quote_id;if(!byQ.has(k))byQ.set(k,[]);byQ.get(k).push(it);}rows=rows.map(q=>({...q,items:(byQ.get(q.id)||[]).slice().sort((a,b)=>(a.position||0)-(b.position||0)).map(i=>({id:i.id,label:i.label,quantity:i.quantity,unitCost:i.unit_cost,unitPrice:i.unit_price,partId:i.part_id}))}));}
      if(key==='quotes'||key==='sav'){const cl=await sm.getLocalList('clients');const cm=new Map(cl.map(c=>[c.id,c]));rows=rows.map(r=>({...r,client_name:r.client_name||cm.get(r.client_id)?.name||'',client_email:r.client_email||cm.get(r.client_id)?.email||''}));}
      window.dispatchEvent(new CustomEvent('aurion:offline-view',{detail:{dataset:key,count:rows.length}}));
      return rows;
    }catch{return null}
  };
  for(const key of wanted){
    if(!fetchers[key])continue;
    jobs.push((async()=>{
      try{const value=await fetchers[key]();if(key==='dashboardSummary'){S.dashboardCounters=value;lastDashboardSummaryRefreshAt=Date.now();}else S[key]=value;if(key==='suppliers')S.suppliersError=null;}
      catch(x){if(x?.status===401)throw x;if(x?.status===0){const local=await offlineLocal(key);if(local){S[key]=local;if(key==='suppliers')S.suppliersError=null;return;}}if(key==='suppliers')S.suppliersError=x?.message||'Impossible de charger les fournisseurs. Vérifiez la connexion puis réessayez.';const stateKey=key==='dashboardSummary'?'dashboardCounters':key;if(S[stateKey]===undefined||S[stateKey]===null)S[stateKey]=fallback[key];}
    })());
  }
  if(full||viewId==='admin'||!S.adminChecked){jobs.push((async()=>{try{S.isPlatformAdmin=!!(await api.adminMe()).admin}catch(x){if(x?.status===401)throw x;S.isPlatformAdmin=false}finally{S.adminChecked=true}})());}
  await Promise.all(jobs);
  // 15.4.50 — modularité métier : les fonctionnalités proposées dépendent du profil actif
  // (un seul appel par chargement, cache de session, repli conservateur hors connexion).
  if(full||!cachedFlags())await loadProfileFeatures(Boolean(full));
  if(full||needConfig||!S.profile)S.profile=await safe(api.activityProfile(getActiveActivity()),S.profile||{});
}

function show(id){
  const previous=S.view;
  if(id!=='quote')S.editing=null;
  const q=S.company?.configuration_data?.questionnaire||{};
  const profileModules=Array.isArray(S.profile?.modules)?S.profile.modules.map(x=>String(x).toLowerCase()):[];
  if(hiddenViews(q,profileModules).has(id))id='home';
  S.view=id;hooks.closeMenu?.();
  // 15.4.63 — fin de prise en charge client : quitter la fiche client arrête automatiquement le
  // compteur temps du client (la facturation l'arrête aussi côté serveur ; le badge de la fiche
  // reste disponible pour la mise en pause manuelle).
  if(previous==='clients'&&id!=='clients'&&S.timeMetrics?.active?.id){
    const sid=S.timeMetrics.active.id,clientName=S.timeMetrics.active.client_name||'';
    api.stopTimeSession(sid).then(()=>{S.timeMetrics.active=null;toast(`Compteur temps arrêté automatiquement${clientName?` (${clientName})`:''} : vous avez quitté la fiche client.`,'info')}).catch(()=>{});
  }
  const nav=navigationItems({questionnaire:q,modules:profileModules,isAdmin:S.isPlatformAdmin,features:cachedFlags()}).map(item=>`<button type="button" data-view="${item.id}" class="${item.id===id?'active':''}" aria-current="${item.id===id?'page':'false'}" title="${item.label}"><i aria-hidden="true">${item.icon}</i>${item.label}</button>`).join('');
  const navRoot=document.querySelector('.nav');
  navRoot.innerHTML=nav;
  navRoot.onclick=ev=>{
    const b=ev.target.closest('button[data-view]');
    if(b)navigate(b.dataset.view);
  };
  const view=document.querySelector('#view');
  view.innerHTML=VIEWS[id].view();
  // Une erreur d'initialisation d'un écran ne doit jamais empêcher la navigation suivante :
  // la coquille et le menu restent utilisables, l'incident est signalé sans bloquer la vue.
  try{VIEWS[id].bind?.()}catch(error){toast(error?.message||'Certaines actions de cet écran n’ont pas pu être initialisées.','error')}
  // 15.4.56 — après chaque rendu, les encarts financiers sont actualisés immédiatement :
  // les valeurs affichées suivent les données réelles même si la vue a été rendue avec un état local.
  if(['home','accounting','treasury'].includes(id))window.aurionRefreshFinancialCards?.(true);
  if(id==='accounting'||id==='treasury')lastRenderedFinancialSnapshot=financialSnapshot();
  if(previous!==id){window.requestAnimationFrame(()=>{window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0;const main=document.querySelector('#main');if(main)main.scrollTop=0;const heading=view.querySelector('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}});}
}

// Navigation unique de la coquille : le menu, les cartes d'action et les boutons injectés
// après le rendu passent tous par ici. Un échec de chargement ne laisse jamais la sidebar
// bloquée sur un écran mort : la vue cible est rendue avec les données déjà disponibles.
function navigate(id){
  if(!id||!VIEWS[id])return;
  // refresh() fixe lui-même la vue demandée : aucun état à dupliquer ici.
  hooks.refresh(id,{navigation:true}).catch(x=>{
    toast(x?.message||'Chargement incomplet.','error');
    // Une navigation plus récente a pu aboutir entre-temps : ne jamais réafficher l'ancienne.
    if(x?.status!==401&&S.pendingView===id)show(id);
  });
}

let dataGoDelegated=false;
function installDataGoDelegation(){
  if(dataGoDelegated)return;dataGoDelegated=true;
  document.addEventListener('click',ev=>{
    const b=ev.target instanceof Element?ev.target.closest('[data-go]'):null;
    if(!b)return;
    ev.preventDefault();
    const target=b.dataset.go;
    if(target==='quote'){S.editing=null;S.quoteDraft=null;S.startBlankQuote=true;S.prefillClient=null;S.documentType='quote'
    }
    navigate(target);
  });
}

export async function refresh(id=S.view,opts={navigation:false}){
  // Appel multi-jeux de données (hooks.refresh(['invoices','accounting',…])) : recharge ces
  // jeux pour la vue COURANTE puis re-rend — ce cas ne navigue jamais vers une autre vue.
  if(Array.isArray(id)){
    await load(id,S.view);
    if(S.pendingView===S.view)show(S.view);
    return;
  }
  // Bloc 8 règle 10 — une course entre deux navigations/rafraîchissements ne doit jamais
  // ramener l'utilisateur en arrière : seul le DERNIER affichage demandé rend la vue.
  if(opts.navigation)S.pendingView=id;
  if(id==='quote'&&!S.editing){
    let savedDraft=null;
    try{const saved=await api.getDraft();if(saved?.draft&&typeof saved.draft==='object'&&!Array.isArray(saved.draft))savedDraft=saved.draft}catch{}
    if(S.startBlankQuote){
      S.startBlankQuote=false;
      // Fenêtre de confirmation au design Aurion (remplace window.confirm).
      const replaceExisting=savedDraft&&await askConfirm({title:'Reprendre le brouillon existant ?',message:'Un brouillon de devis/facture est déjà synchronisé avec votre compte. Voulez-vous le remplacer par un nouveau document ? Choisissez « Annuler » pour reprendre le brouillon existant.',confirmLabel:'Remplacer par un nouveau document',cancelLabel:'Reprendre le brouillon'});
      if(savedDraft&&!replaceExisting){S.quoteDraft=savedDraft;if(savedDraft.documentType==='invoice')S.documentType='invoice';else if(savedDraft.documentType==='quote')S.documentType='quote';}
      else{S.quoteDraft=null;if(savedDraft){try{await api.deleteDraft()}catch{}}}
    }else if(savedDraft){S.quoteDraft=savedDraft;if(savedDraft.documentType==='invoice')S.documentType='invoice';else if(savedDraft.documentType==='quote')S.documentType='quote';}
  }
  await load([...(EXTRAS[id]||[])],id);if(id==='accounting'||id==='treasury')lastFinancialRefreshAt=Date.now();paintShell();
  /* Bloc 8 règle 10 — si l'utilisateur a navigué pendant le chargement, il n'est jamais ramené
  en arrière : la vue demandée ne re-rend que si elle est toujours courante. Correctif 15.4.40 :
  un appel qui nomme une AUTRE vue (bouton « + Nouveau devis » des documents, retour à la liste
  après enregistrement) demande explicitement un changement d'écran — il est toujours rendu,
  sinon les boutons semblaient inertes (pendingView restait sur la vue courante). */
  if(opts.navigation||S.pendingView===id)show(id)
}
hooks.refresh=refresh;hooks.show=show;

function paintShell(){
  const a=active();
  // 15.4.63 — barre supérieure jamais bloquée par une donnée absente : chaque champ tolère
  // l'absence de société/activité.
  // 15.4.67 (consigne éditeur) : la bulle d'activité de la barre supérieure (« Réparation
  // smartphone / tablette ») disparaît ; le lien « Mon compte » devient un lien-image arrondi
  // qui reprend l'avatar téléversé dans « Mon compte » (repli : initiales du compte).
  document.querySelector('#shell-company').textContent=`ENTREPRISE · ${S.company?.name||'Entreprise'}`;
  document.querySelector('#shell-activity').textContent=a?.name||'Activité';
}

// 15.4.67 — lien-image arrondi de la barre supérieure : l'avatar téléversé dans « Mon compte »
// (fetch authentifié → blob) remplace les initiales ; la page Mon compte signale toute mise à
// jour par l'événement « aurion:avatar-updated ». Aucun échec n'empêche jamais la navigation.
let shellAvatarToken=0;
async function refreshShellAvatar(){
  const el=document.getElementById('shell-avatar');if(!el)return;
  const token=++shellAvatarToken;
  try{
    const acc=await api.account();
    if(token!==shellAvatarToken)return;
    const name=String(acc?.user?.fullName||acc?.user?.email||'');
    const init=name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('')||'·';
    el.textContent=init;el.dataset.initials=init;el.classList.remove('has-photo');
    if(!acc?.user?.avatarUrl)return;
    const res=await api.authFetch('/account/avatar');
    if(token!==shellAvatarToken)return;
    if(res.ok){
      const b=await res.blob();
      if(b&&b.size>0&&b.type.startsWith('image/')){
        el.innerHTML='';
        const img=document.createElement('img');img.alt='';img.src=URL.createObjectURL(b);
        img.onerror=()=>{img.remove();el.textContent=el.dataset.initials||'·';el.classList.remove('has-photo')};
        el.append(img);el.classList.add('has-photo');
      }
    }
  }catch{/* initiales conservées */}
}
window.addEventListener('aurion:avatar-updated',()=>{refreshShellAvatar()});

function installBackgroundRefresh(){
  if(lifecycleRefreshInstalled)return;lifecycleRefreshInstalled=true;
  const maybeRefresh=async(force=false)=>{
    if(document.visibilityState!=='visible'||!location.hash.startsWith('#/dashboard')||backgroundRefreshRunning)return;
    const now=Date.now();if(now-lastBackgroundRefreshAt<(force?30000:60000))return;
    if(Date.now()-lastUserInteractionAt<12000||document.querySelector('#view form'))return;
    const focused=document.activeElement;
    if(focused instanceof HTMLElement&&focused.matches('input,textarea,select,[contenteditable="true"]'))return;
    backgroundRefreshRunning=true;
    try{await refresh(S.view);lastBackgroundRefreshAt=Date.now()}catch(e){if(e?.status===401)invalidateSession()}finally{backgroundRefreshRunning=false}
  };
  window.addEventListener('aurion:account-sync-changed',()=>{
    if(document.visibilityState!=='visible'||!location.hash.startsWith('#/dashboard')||backgroundRefreshRunning)return;
    if(Date.now()-lastUserInteractionAt<12000||document.querySelector('#view form'))return;
    const focused=document.activeElement;
    if(focused instanceof HTMLElement&&focused.matches('input,textarea,select,[contenteditable="true"]'))return;
    backgroundRefreshRunning=true;
    refresh(S.view).then(()=>{lastBackgroundRefreshAt=Date.now()}).catch(e=>{if(e?.status===401)invalidateSession()}).finally(()=>{backgroundRefreshRunning=false});
  });
  window.addEventListener('focus',()=>maybeRefresh(true),{passive:true});
  window.addEventListener('online',()=>maybeRefresh(true),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){maybeRefresh(true)}});
  window.setInterval(()=>maybeRefresh(false),45000);
}

export async function renderDashboard(){
  // Liens internes (journal, retour de connexion cloud) : #/dashboard?view=settings&section=settings-storage
  const query=routeQuery();const requestedView=query.get('view')||(query.get('cloud')?'settings':'');
  if(requestedView&&VIEWS[requestedView]&&requestedView!=='admin')S.view=requestedView;
  const requestedSection=query.get('section')||(query.get('cloud')?'settings-storage':'');
  const initialView=S.view==='quote'?'home':S.view;
  S.pendingView=initialView;
  await load([...(EXTRAS[initialView]||[])],initialView);
  if(initialView==='accounting'||initialView==='treasury')lastFinancialRefreshAt=Date.now();
  lastBackgroundRefreshAt=Date.now();installBackgroundRefresh();installDataGoDelegation();
  document.querySelector('#app').innerHTML=`<div class="dashboard-shell"><aside class="sidebar" id="sidebar"><a class="brand" href="#/dashboard" aria-label="Aurion — retour au tableau de bord" title="Retour au tableau de bord">${appLogo('42')}<span>AURION<small>PRO</small></span></a><button class="burger" id="burger" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="sidebar"><span></span><span></span><span></span></button><nav class="nav" aria-label="Navigation principale"></nav><div class="sidebar-bottom"><button id="logout" class="nav-logout">Quitter</button><div class="status-dot"><i></i> Système opérationnel</div></div></aside><section class="workspace"><header class="dashboard-top"><div class="activity-switch"><span class="eyebrow" id="shell-company"></span><button id="activity-picker" class="activity-picker"><span>ACTIVITÉ ACTIVE</span><strong id="shell-activity"></strong><small>▾</small></button></div><div class="top-actions"><span class="pill shell-clock" id="local-clock" aria-label="Heure locale" title="Heure locale de votre appareil"></span><button class="btn secondary small" id="fs-toggle" type="button" title="Activer le plein écran" aria-label="Activer le plein écran" aria-pressed="false"><span class="fs-icon" aria-hidden="true">⛶</span><span class="fs-label">Plein écran</span></button><a class="account-link account-avatar-link" href="#/dashboard?view=account" title="Mon compte" aria-label="Mon compte"><span class="account-avatar-bubble" id="shell-avatar">···</span></a></div></header><main id="main" class="content"><div id="view"></div></main></section></div><div id="activity-modal-root"></div>`;
  // Horloge unique de la coquille : visible sur toute la navigation, jamais dupliquée par vue.
  startLocalClock(document.getElementById('local-clock'));
  // File locale des documents cloud : liée à l'entreprise de la session (jamais d'envoi pour un autre compte de l'appareil).
  setCloudOwner(S.company?.id||'');
  // Bloc 1 — bootstrap hors connexion ATTENDU avant toute écriture possible : identité résolue
  // une seule fois (/auth/me, promesse partagée), puis file outbox + réplication + documents
  // récents ouverts dans le MÊME espace de noms. Bloc 7 — interface de synchronisation branchée.
  // L'indicateur de synchronisation n'apparaît qu'une fois le bootstrap TERMINÉ (identité
  // résolue, file + réplication + documents ouverts) : il garantit visuellement la readiness.
  try{import('../core/offline-bootstrap.js').then(bo=>bo.bootstrapOffline()).then(id=>{window.__aurionIdentity=id;return import('../core/sync-ui.js').then(su=>su.initSyncUi());}).catch(()=>{});}catch{}
  const side=document.querySelector('#sidebar'),burger=document.querySelector('#burger');
  const setMenu=open=>{side.classList.toggle('open',open);burger.setAttribute('aria-expanded',String(open));burger.setAttribute('aria-label',open?'Fermer le menu':'Ouvrir le menu')};
  burger.onclick=()=>setMenu(!side.classList.contains('open'));
  hooks.closeMenu=()=>setMenu(false);
  document.querySelector('#activity-picker').onclick=openActivityPicker;
  // 15.4.66 — le lien « Mon compte » navigue par hachage (#/dashboard?view=account) : la
  // navigation reste réelle (clic droit, copier le lien), aucun gestionnaire d'image à syncroniser.
  document.querySelector('#logout').onclick=()=>api.logout().finally(()=>{import('../core/session-identity.js').then(m=>m.resetIdentity()).catch(()=>{});import('../core/outbox.js').then(m=>m.clearOutboxOwner()).catch(()=>{});import('../core/sync-manager.js').then(m=>m.clearSyncOwner()).catch(()=>{});invalidateSession();go('/')});
  const fullscreenButton=document.querySelector('#fs-toggle');
  const syncFullscreenButton=()=>{
    const enabled=Boolean(document.fullscreenElement);
    fullscreenButton.classList.toggle('is-fullscreen',enabled);
    fullscreenButton.setAttribute('aria-pressed',String(enabled));
    fullscreenButton.setAttribute('aria-label',enabled?'Quitter le plein écran':'Activer le plein écran');
    fullscreenButton.title=enabled?'Quitter le plein écran':'Activer le plein écran';
    const label=fullscreenButton.querySelector('.fs-label');
    if(label)label.textContent=enabled?'Quitter le plein écran':'Plein écran';
  };
  document.addEventListener('fullscreenchange',syncFullscreenButton);
  const isNativeShell=new URLSearchParams(location.search).has('native')||window.AURION_NATIVE===true;
  if(isNativeShell){
    // Bloc 10 — en mode application Windows, la fenêtre est déjà maximisée et la barre des
    // tâches doit rester accessible : le Fullscreen API n'est jamais déclenché.
    fullscreenButton.classList.add('is-native');
    fullscreenButton.title='Mode application Windows : fenêtre maximisée, barre des tâches disponible';
    fullscreenButton.onclick=()=>toast('Mode application Windows : la fenêtre est maximisée et la barre des tâches reste accessible.','info');
  }
  else fullscreenButton.onclick=async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}
    catch{toast('Plein écran indisponible : utilisez F11.','info')}
    finally{syncFullscreenButton()}
  };
  syncFullscreenButton();
  paintShell();refreshShellAvatar();show(initialView);
  // 15.4.54 (PROMPT D2) — bannière de re-acceptation contractuelle : à chaque montée de version
  // des documents (CGU / confidentialité / DPA), le compte est invité à accepter les documents
  // à jour. Les documents en brouillon ne déclenchent jamais la bannière (jamais bloquants) et
  // l'échec de la vérification n'empêche jamais le tableau de bord de fonctionner.
  try{
    const legalStatus=await api.legalAcceptanceStatus();
    if(legalStatus&&legalStatus.upToDate===false&&Array.isArray(legalStatus.missing)&&legalStatus.missing.length&&!document.querySelector('.legal-accept-bar')){
      const bar=document.createElement('div');
      bar.className='notice warn-notice legal-accept-bar';
      bar.setAttribute('role','status');
      bar.innerHTML=`Nos conditions contractuelles ont été mises à jour (${e(legalStatus.missing.map(m=>m.title).join(' · '))}). <button class="btn primary small" id="legal-accept-btn">J’accepte les documents à jour</button> <a class="link-btn" href="#/legal/cgv">Les consulter</a>`;
      document.querySelector('.workspace')?.prepend(bar);
      bar.querySelector('#legal-accept-btn')?.addEventListener('click',async()=>{
        const btn=bar.querySelector('#legal-accept-btn');
        try{btn.disabled=true;await api.acceptLegalDocuments();bar.remove();toast('Merci : vos documents contractuels sont à jour.','success')}
        catch(x){btn.disabled=false;toast(x.message||'Enregistrement de l\u2019acceptation impossible.','error')}
      });
    }
  }catch{}
  if(requestedSection&&/^[a-z-]+$/.test(requestedSection))window.setTimeout(()=>document.getElementById(requestedSection)?.scrollIntoView({block:'start'}),250);
  window.__aurionMetricsTimer&&clearInterval(window.__aurionMetricsTimer);
  window.__aurionMetricsTimer=setInterval(async()=>{
    if(metricsRefreshInProgress)return;
    metricsRefreshInProgress=true;
    const viewAtStart=S.view;
    try{
      if(viewAtStart==='home'&&Date.now()-lastDashboardSummaryRefreshAt>=30000){
        S.dashboardCounters=await api.dashboardSummary(S.forecastMonths||6);
        lastDashboardSummaryRefreshAt=Date.now();
      }
      if(viewAtStart==='home'&&S.view==='home'){
        // 15.4.56 — chaque encart d'accueil est mis à jour par son identifiant : plus aucune
        // dépendance au nombre exact de cartes d'action (le compteur restait figé si la grille
        // changeait) ni aux libellés trouvés par balayage.
        const homeRevenue=document.querySelector('#home-month-revenue');if(homeRevenue)homeRevenue.textContent=money(S.dashboardCounters?.forecast?.monthHt||0);
        const homeRdv=document.querySelector('#home-rdv');if(homeRdv)homeRdv.textContent=String(Number(S.dashboardCounters?.upcomingAppointments??0));
        const ticketCaption=document.querySelector('#home-tickets-caption');if(ticketCaption)ticketCaption.textContent=`${Number(S.dashboardCounters?.tickets||0)} ticket(s) non traité(s)`;
        // 15.4.67 — les encarts « Clients », « Devis en cours » et « Entrées prévues » sont
        // supprimés (consigne éditeur) : leurs mises à jour périodiques disparaissent avec eux.
        S.timeMetrics=await api.timeMetrics();
        if(S.view==='home'){
          // 15.4.67 — mise à jour par identifiants dédiés du panneau « Temps économisé »
          // (temps manuel FIXE par client, compté une fois quel que soit le nombre de sessions).
          const tmSet=(id,val)=>{const el=document.querySelector(id);if(el)el.textContent=val};
          tmSet('#tm-manual',`${Number(S.timeMetrics?.manualMinutes||0).toFixed(0)} min`);
          tmSet('#tm-actual',`${Number(S.timeMetrics?.actualMinutes||0).toFixed(0)} min`);
          tmSet('#tm-saved',`${Number(S.timeMetrics?.savedMinutes||0).toFixed(0)} min`);
          tmSet('#tm-average',`${Number(S.timeMetrics?.averageSavedMinutes||0).toFixed(1)} min`);
        }
      }else if((viewAtStart==='accounting'||viewAtStart==='treasury')&&S.view===viewAtStart&&Date.now()-lastFinancialRefreshAt>=30000){
        await load(['accounting','treasury']);
        lastFinancialRefreshAt=Date.now();
        if(S.view===viewAtStart&&financialSnapshot()!==lastRenderedFinancialSnapshot){
          const viewRoot=document.querySelector('#view');
          const focused=document.activeElement;
          const editing=!!(viewRoot&&focused&&viewRoot.contains(focused)&&focused.matches('input,textarea,select,[contenteditable="true"]'));
          const modalOpen=!!document.querySelector('.modal-backdrop,.confirm-backdrop');
          // 15.4.65 — même garde de 12 s que le rafraîchissement d'arrière-plan : un clic ou un
          // scroll suffit à suspendre le re-rendu ; et le snapshot est resynchronisé après le
          // re-rendu pour qu'aucune boucle d'affichage ne puisse se répéter.
          const recentInteraction=Date.now()-lastUserInteractionAt<12000;
          if(!editing&&!modalOpen&&!recentInteraction){show(viewAtStart);lastRenderedFinancialSnapshot=financialSnapshot()}
        }
      }
    }catch{}finally{metricsRefreshInProgress=false;}
  },5000);
}

function openActivityPicker(){
  const root=document.querySelector('#activity-modal-root');
  root.innerHTML=`<div class="modal-backdrop" id="activity-modal"><div class="modal glass"><div class="section-title"><h2>Changer d’activité</h2><button class="icon-btn modal-close">×</button></div><p class="muted">Vous restez connecté au même compte Aurion.</p>${S.activities.map(a=>`<button class="activity-choice ${a.id===getActiveActivity()?'selected':''}" data-id="${a.id}"><span>${a.id===getActiveActivity()?'✓':'○'}</span><div><b>${e(a.name)}</b><small>${e(a.description||'')}</small></div></button>`).join('')}<button class="btn secondary" id="manage-activities">⚙ Gérer les activités</button></div></div>`;
  const m=root.querySelector('#activity-modal');
  m.querySelector('.modal-close').onclick=()=>m.remove();
  m.querySelectorAll('.activity-choice').forEach(x=>x.onclick=async()=>{setActiveActivity(x.dataset.id);m.remove();S.editing=null;await loadProfileFeatures(true).catch(()=>{});await refresh('home')});
  m.querySelector('#manage-activities').onclick=()=>{m.remove();show('settings')};
}
