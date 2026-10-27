// Tableau de bord Aurion : coquille (menu, activité active, plein écran) + chargement des données.
import{api,getActiveActivity,setActiveActivity}from'../core/api.js';
import{appLogo,toast}from'../core/ui.js';
import{invalidateSession}from'../core/session.js';
import{go}from'../core/router.js';
import{S,e,hooks,active,prof,money}from'./dash/core.js';
import*as catalog from'./dash/catalog.js';
import{suppliers}from'./dash/suppliers.js';
import*as quote from'./dash/quote.js';
import*as docs from'./dash/docs.js';
import*as settings from'./dash/settings.js';
import*as account from'./dash/account.js';
import{home,clients,agenda,accounting,treasury,support,admin}from'./dash/other.js';

const VIEWS={home,clients,catalog,suppliers,quote,invoices:docs,agenda,accounting,treasury,support,settings,account,admin};
const NAV=[['home','Tableau de bord','⌂'],['clients','Clients','♙'],['catalog','Catalogue métier','◈'],['suppliers','Fournisseurs','▱'],['invoices','Devis & factures','▧'],['agenda','Agenda','◷'],['accounting','Comptabilité & trésorerie','∑'],['support','Support Aurion','?'],['settings','Paramètres','⚙']];

// Garde-fous de rafraîchissement : ne jamais remplacer l’écran en pleine interaction.
let metricsRefreshInProgress = false;
let lastUserInteractionAt = Date.now();
let lastDashboardSummaryRefreshAt = 0, lastFinancialRefreshAt = 0;
let lifecycleRefreshInstalled=false,lastBackgroundRefreshAt=0,backgroundRefreshRunning=false;
let lastRenderedFinancialSnapshot = null;
for (const eventName of ['pointerdown', 'keydown', 'input', 'change']) {
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
  accounting:['accounting','treasury','quotes','sav'],
  treasury:['treasury','accounting','quotes','sav'],
  settings:['templates','mail'],
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
  const fallback={clients:[],quotes:[],appointments:[],suppliers:[],parts:[],interventions:[],supplies:[],warranties:[],policies:[],devices:[],sav:[],templates:[],accounting:{},treasury:{},mail:{configured:false},timeMetrics:null,dashboardSummary:S.dashboardCounters};
  const fetchers={
    clients:()=>api.clients(),quotes:()=>api.quotes(),appointments:()=>api.appointments(),
    suppliers:()=>api.suppliers(),parts:()=>api.parts(),interventions:()=>api.interventions(),
    supplies:()=>api.supplies(),warranties:()=>api.warranties(),policies:()=>api.warrantyPolicies(),
    devices:()=>api.devices(),sav:()=>api.sav(),templates:()=>api.documentTemplates(),
    accounting:()=>api.accounting(S.accountingYear||new Date().getFullYear()),treasury:()=>api.treasury(),
    mail:()=>api.mailStatus(),timeMetrics:()=>api.timeMetrics(),
    dashboardSummary:async()=>{const counters=await api.dashboardSummary(S.forecastMonths||6);try{const sub=await api.subscription();counters.trialDaysLeft=Number(sub.daysLeft||0);counters.subscription=sub}catch{}return counters;},
  };
  const jobs=[];
  for(const key of wanted){
    if(!fetchers[key])continue;
    jobs.push((async()=>{
      try{const value=await fetchers[key]();if(key==='dashboardSummary'){S.dashboardCounters=value;lastDashboardSummaryRefreshAt=Date.now();}else S[key]=value;if(key==='suppliers')S.suppliersError=null;}
      catch(x){if(x?.status===401)throw x;if(key==='suppliers')S.suppliersError=x?.message||'Impossible de charger les fournisseurs. Vérifiez la connexion puis réessayez.';const stateKey=key==='dashboardSummary'?'dashboardCounters':key;if(S[stateKey]===undefined||S[stateKey]===null)S[stateKey]=fallback[key];}
    })());
  }
  if(full||viewId==='admin'||!S.adminChecked){jobs.push((async()=>{try{S.isPlatformAdmin=!!(await api.adminMe()).admin}catch(x){if(x?.status===401)throw x;S.isPlatformAdmin=false}finally{S.adminChecked=true}})());}
  await Promise.all(jobs);
  if(full||needConfig||!S.profile)S.profile=await safe(api.activityProfile(getActiveActivity()),S.profile||{});
}

function show(id){
  const previous=S.view;
  if(id!=='quote')S.editing=null;
  S.view=id;hooks.closeMenu?.();
  const q=S.company?.configuration_data?.questionnaire||{};
  const profileModules=Array.isArray(S.profile?.modules)?S.profile.modules.map(x=>String(x).toLowerCase()):[];
  const hidden=new Set();
  if(q.support==='Non') hidden.add('support');
  if(q.agenda==='Non') hidden.add('agenda');
  if(q.accounting==='Non') hidden.add('accounting');
  if(q.parts==='Non'&&q.stock==='Non') hidden.add('catalog');
  if(profileModules.length && !profileModules.some(x=>x.includes('agenda')) && q.agenda!=='Oui') hidden.add('agenda');
  if(hidden.has(id))id='home';
  const nav=NAV.filter(([k])=>!hidden.has(k)).map(([k,l,i])=>`<button type="button" data-view="${k}" class="${k===id?'active':''}" title="${l}"><i>${i}</i>${k==='catalog'?'Catalogue métier':l}</button>`).join('');
  const navRoot=document.querySelector('.nav');
  navRoot.innerHTML=nav+(S.isPlatformAdmin?`<button type="button" data-view="admin" class="${id==='admin'?'active':''}" title="Administration" aria-label="Administration"><i>⚙</i>Administration</button>`:'');
  navRoot.onclick=ev=>{
    const b=ev.target.closest('button[data-view]');
    if(!b||!navRoot.contains(b))return;
    // Chaque navigation recharge uniquement les jeux de données utiles à l'écran ciblé.
    // Les listes reflètent ainsi les changements d'un autre appareil sans recharger toute l'application.
    hooks.refresh(b.dataset.view).catch(x=>toast(x.message,'error'));
  };
  const view=document.querySelector('#view');
  view.innerHTML=VIEWS[id].view();
  VIEWS[id].bind?.();
  if(id==='accounting'||id==='treasury')lastRenderedFinancialSnapshot=financialSnapshot();
  if(previous!==id){window.requestAnimationFrame(()=>{window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0;const main=document.querySelector('#main');if(main)main.scrollTop=0;});}
  view.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{if(b.dataset.go==='quote'){S.editing=null;S.quoteDraft=null;S.startBlankQuote=true;S.prefillClient=null;S.documentType='quote'}hooks.refresh(b.dataset.go).catch(x=>toast(x.message,'error'))});
}

export async function refresh(id=S.view){
  if(id==='quote'&&!S.editing){
    let savedDraft=null;
    try{const saved=await api.getDraft();if(saved?.draft&&typeof saved.draft==='object'&&!Array.isArray(saved.draft))savedDraft=saved.draft}catch{}
    if(S.startBlankQuote){
      S.startBlankQuote=false;
      const replaceExisting=savedDraft&&window.confirm('Un brouillon de devis/facture est déjà synchronisé avec votre compte. Voulez-vous le remplacer par un nouveau document ? Choisissez « Annuler » pour reprendre le brouillon existant.');
      if(savedDraft&&!replaceExisting){S.quoteDraft=savedDraft;if(savedDraft.documentType==='invoice')S.documentType='invoice';else if(savedDraft.documentType==='quote')S.documentType='quote';}
      else{S.quoteDraft=null;if(savedDraft){try{await api.deleteDraft()}catch{}}}
    }else if(savedDraft){S.quoteDraft=savedDraft;if(savedDraft.documentType==='invoice')S.documentType='invoice';else if(savedDraft.documentType==='quote')S.documentType='quote';}
  }
  await load([...(EXTRAS[id]||[])],id);if(id==='accounting'||id==='treasury')lastFinancialRefreshAt=Date.now();paintShell();show(id)
}
hooks.refresh=refresh;hooks.show=show;

function paintShell(){
  const a=active();
  document.querySelector('#shell-company').textContent=`ENTREPRISE · ${S.company.name}`;
  document.querySelector('#shell-activity').textContent=a?.name||'Activité';
  document.querySelector('#shell-pill').textContent=prof().title||a?.name||'';
  const avatar=document.querySelector('#shell-avatar');
  if(avatar&&!avatar.style.backgroundImage) avatar.textContent=(S.company.name||'A')[0].toUpperCase();
}

let shellAvatarObjectUrl='';
async function syncShellAvatar(){
  const avatar=document.querySelector('#shell-avatar');
  if(!avatar)return;
  try{
    const account=await api.account();
    if(!account?.user?.avatarUrl){
      if(shellAvatarObjectUrl){URL.revokeObjectURL(shellAvatarObjectUrl);shellAvatarObjectUrl='';}
      avatar.textContent=(S.company.name||'A')[0].toUpperCase();
      avatar.style.backgroundImage='';
      return;
    }
    const response=await api.accountAvatar();
    if(!response.ok)throw new Error('Avatar indisponible');
    const blob=await response.blob();
    if(shellAvatarObjectUrl)URL.revokeObjectURL(shellAvatarObjectUrl);
    shellAvatarObjectUrl=URL.createObjectURL(blob);
    avatar.textContent='';
    avatar.style.backgroundImage=`url("${shellAvatarObjectUrl}")`;
    avatar.style.backgroundSize='cover';
    avatar.style.backgroundPosition='center';
  }catch{
    avatar.textContent=(S.company.name||'A')[0].toUpperCase();
  }
}

function applyShellAvatar(url){
  const avatar=document.querySelector('#shell-avatar');
  if(!avatar||!url)return;
  if(shellAvatarObjectUrl)URL.revokeObjectURL(shellAvatarObjectUrl);
  shellAvatarObjectUrl=url;
  avatar.textContent='';
  avatar.style.backgroundImage=`url("${url}")`;
  avatar.style.backgroundSize='cover';
  avatar.style.backgroundPosition='center';
}

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
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')maybeRefresh(true)});
  window.setInterval(()=>maybeRefresh(false),45000);
}

export async function renderDashboard(){
  const initialView=S.view==='quote'?'home':S.view;
  await load([...(EXTRAS[initialView]||[])],initialView);
  if(initialView==='accounting'||initialView==='treasury')lastFinancialRefreshAt=Date.now();
  lastBackgroundRefreshAt=Date.now();installBackgroundRefresh();
  document.querySelector('#app').innerHTML=`<div class="dashboard-shell"><aside class="sidebar" id="sidebar"><a class="brand" href="#/dashboard" aria-label="Aurion — retour au tableau de bord" title="Retour au tableau de bord">${appLogo('42')}<span>AURION<small>PRO</small></span></a><button class="burger" id="burger" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="sidebar"><span></span><span></span><span></span></button><nav class="nav"></nav><div class="sidebar-bottom"><button id="logout" class="nav-logout">Quitter</button><div class="status-dot"><i></i> Système opérationnel</div></div></aside><section class="workspace"><header class="dashboard-top"><div class="activity-switch"><span class="eyebrow" id="shell-company"></span><button id="activity-picker" class="activity-picker"><span>ACTIVITÉ ACTIVE</span><strong id="shell-activity"></strong><small>▾</small></button></div><div class="top-actions"><span class="pill" id="shell-pill"></span><button class="btn secondary small" id="fs-toggle" type="button" title="Activer le plein écran" aria-label="Activer le plein écran" aria-pressed="false"><span class="fs-icon" aria-hidden="true">⛶</span><span class="fs-label">Plein écran</span></button><button class="avatar" id="shell-avatar" title="Mon compte" aria-label="Mon compte"></button></div></header><main id="main" class="content"><div id="view"></div></main></section></div><div id="activity-modal-root"></div>`;
  await syncShellAvatar();
  const side=document.querySelector('#sidebar'),burger=document.querySelector('#burger');
  const setMenu=open=>{side.classList.toggle('open',open);burger.setAttribute('aria-expanded',String(open));burger.setAttribute('aria-label',open?'Fermer le menu':'Ouvrir le menu')};
  burger.onclick=()=>setMenu(!side.classList.contains('open'));
  hooks.closeMenu=()=>setMenu(false);
  document.querySelector('#activity-picker').onclick=openActivityPicker;
  document.querySelector('#shell-avatar').onclick=()=>show('account');
  window.addEventListener('aurion-avatar-updated',ev=>applyShellAvatar(ev.detail?.url));
  document.querySelector('#logout').onclick=()=>api.logout().finally(()=>{invalidateSession();go('/')});
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
  fullscreenButton.onclick=async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}
    catch{toast('Plein écran indisponible : utilisez F11.','info')}
    finally{syncFullscreenButton()}
  };
  syncFullscreenButton();
  paintShell();show(initialView);
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
        const cards=[...document.querySelectorAll('#view .quick-grid .action-card')];
        if(cards.length===2){
          const ticketCaption=cards[0].querySelector('small');
          const entriesCaption=cards[1].querySelector('small');
          if(ticketCaption)ticketCaption.textContent=`${Number(S.dashboardCounters?.tickets||0)} ticket(s) non traité(s)`;
          if(entriesCaption)entriesCaption.textContent=`${money(S.dashboardCounters?.forecastEntries||0)} à venir`;
        const homeRevenue=document.querySelector('#home-month-revenue');if(homeRevenue)homeRevenue.textContent=money(S.dashboardCounters?.forecast?.monthHt||0);
        }
        S.timeMetrics=await api.timeMetrics();
        if(S.view==='home'){
          const map={manualMinutes:Number(S.timeMetrics?.manualMinutes||0).toFixed(0),actualMinutes:Number(S.timeMetrics?.actualMinutes||0).toFixed(0),savedMinutes:Number(S.timeMetrics?.savedMinutes||0).toFixed(0),averageSavedMinutes:Number(S.timeMetrics?.averageSavedMinutes||0).toFixed(1)};
          const metricCards=[...document.querySelectorAll('#view .metrics article')].slice(-4);
          if(metricCards.length===4){
            const values=[map.manualMinutes+' min',map.actualMinutes+' min',map.savedMinutes+' min',map.averageSavedMinutes+' min'];
            metricCards.forEach((card,index)=>{const value=card.querySelector('b');if(value)value.textContent=values[index]});
          }
        }
      }else if((viewAtStart==='accounting'||viewAtStart==='treasury')&&S.view===viewAtStart&&Date.now()-lastFinancialRefreshAt>=30000){
        await load(['accounting','treasury']);
        lastFinancialRefreshAt=Date.now();
        if(S.view===viewAtStart&&financialSnapshot()!==lastRenderedFinancialSnapshot){
          const viewRoot=document.querySelector('#view');
          const focused=document.activeElement;
          const editing=!!(viewRoot&&focused&&viewRoot.contains(focused)&&focused.matches('input,textarea,select,[contenteditable="true"]'));
          const modalOpen=!!document.querySelector('.modal-backdrop,.confirm-backdrop');
          const recentInteraction=Date.now()-lastUserInteractionAt<1200;
          if(!editing&&!modalOpen&&!recentInteraction)show(viewAtStart);
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
  m.querySelectorAll('.activity-choice').forEach(x=>x.onclick=async()=>{setActiveActivity(x.dataset.id);m.remove();S.editing=null;await refresh('home')});
  m.querySelector('#manage-activities').onclick=()=>{m.remove();show('settings')};
}
