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
let lastRenderedFinancialSnapshot = null;
for (const eventName of ['pointerdown', 'keydown', 'input', 'change']) {
  document.addEventListener(eventName, () => { lastUserInteractionAt = Date.now(); }, true);
}
function financialSnapshot() {
  return JSON.stringify({ accounting: S.accounting, treasury: S.treasury, sav: S.sav, quotes: S.quotes });
}


// Chargement ciblé : le noyau à chaque action, les jeux de données rares seulement quand leur écran l'exige.
const EXTRAS={home:['accounting','timeMetrics','dashboardSummary'],settings:['company'],accounting:['accounting','treasury'],treasury:['treasury'],invoices:['treasury'],};
async function load(extras=null){
  const safe=(p,d)=>Promise.resolve(p).catch(x=>{if(x?.status===401)throw x;return d});
  const want=k=>extras===null||extras.includes(k);
  // Toujours synchroniser l'organisation AVANT les activités : la détection et le remplissage
  // automatique de l'entreprise doivent être visibles immédiatement dans l'activité principale
  // et dans toutes les sections qui consomment ces données.
  const company=await safe(api.organization(),S.company||{name:'Entreprise'});
  const activities=await safe(api.activities(),[]);
  if((!getActiveActivity()||!activities.some(a=>a.id===getActiveActivity()))&&activities[0])setActiveActivity(activities[0].id);
  const [clients,quotes,appointments,suppliers,parts,interventions,supplies,warranties,policies,mail,templates,accounting,treasury,sav]=await Promise.all([
    safe(api.clients(),[]),safe(api.quotes(),[]),safe(api.appointments(),[]),safe(api.suppliers(),[]),safe(api.parts(),[]),safe(api.interventions(),[]),safe(api.supplies(),[]),safe(api.warranties(),[]),safe(api.warrantyPolicies(),[]),safe(api.mailStatus(),{configured:false}),
    want('templates')?safe(api.documentTemplates(),[]):S.templates,want('accounting')?safe(api.accounting(S.accountingYear||new Date().getFullYear()),{}):S.accounting,want('treasury')?safe(api.treasury(),{}):S.treasury,safe(api.sav(),[])]);
  Object.assign(S,{company,activities,clients,quotes,appointments,templates,suppliers,parts,interventions,supplies,warranties,policies,accounting,treasury,mail,sav}); try{S.isPlatformAdmin=!!(await api.adminMe()).admin}catch{}
  if(want('timeMetrics')) S.timeMetrics=await safe(api.timeMetrics(),null);
  if(want('dashboardSummary')) { S.dashboardCounters=await safe(api.dashboardSummary(S.forecastMonths||6),S.dashboardCounters); try { const sub=await api.subscription(); S.dashboardCounters.trialDaysLeft=Number(sub.daysLeft||0); S.dashboardCounters.subscription=sub; } catch {} }
  S.profile=await safe(api.activityProfile(getActiveActivity()),{});
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
  navRoot.onclick=ev=>{const b=ev.target.closest('button[data-view]');if(!b||!navRoot.contains(b))return;if(b.dataset.view==='quote'){S.editing=null;S.quoteDraft=null;S.prefillClient=null;S.documentType='quote'}show(b.dataset.view)};
  const supplierNav=navRoot.querySelector('button[data-view=\"suppliers\"]');
  if(supplierNav){supplierNav.onclick=ev=>{ev.preventDefault();ev.stopPropagation();hooks.refresh('suppliers').catch(x=>toast(x.message,'error'))};}
  const view=document.querySelector('#view');
  view.innerHTML=VIEWS[id].view();
  VIEWS[id].bind?.();
  if(id==='accounting'||id==='treasury')lastRenderedFinancialSnapshot=financialSnapshot();
  if(previous!==id){window.requestAnimationFrame(()=>{window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0;const main=document.querySelector('#main');if(main)main.scrollTop=0;});}
  view.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{if(b.dataset.go==='quote'){S.editing=null;S.quoteDraft=null;S.prefillClient=null;S.documentType='quote'}hooks.refresh(b.dataset.go).catch(x=>toast(x.message,'error'))});
}

export async function refresh(id=S.view){await load([...(EXTRAS[id]||[]),...(id==='home'?[]:[])]);paintShell();show(id)}
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

export async function renderDashboard(){
  await load(null);
  document.querySelector('#app').innerHTML=`<div class="dashboard-shell"><aside class="sidebar" id="sidebar"><a class="brand" href="#/dashboard" aria-label="Aurion — retour au tableau de bord" title="Retour au tableau de bord">${appLogo('42')}<span>AURION<small>PRO</small></span></a><button class="burger" id="burger" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="sidebar"><span></span><span></span><span></span></button><nav class="nav"></nav><div class="sidebar-bottom"><button id="logout" class="nav-logout">Quitter</button><div class="status-dot"><i></i> Système opérationnel</div></div></aside><section class="workspace"><header class="dashboard-top"><div class="activity-switch"><span class="eyebrow" id="shell-company"></span><button id="activity-picker" class="activity-picker"><span>ACTIVITÉ ACTIVE</span><strong id="shell-activity"></strong><small>▾</small></button></div><div class="top-actions"><span class="pill" id="shell-pill"></span><button class="btn secondary small" id="fs-toggle" title="Plein écran (F11)">⛶ Plein écran</button><button class="avatar" id="shell-avatar" title="Mon compte" aria-label="Mon compte"></button></div></header><main id="main" class="content"><div id="view"></div></main></section></div><div id="activity-modal-root"></div>`;
  await syncShellAvatar();
  const side=document.querySelector('#sidebar'),burger=document.querySelector('#burger');
  const setMenu=open=>{side.classList.toggle('open',open);burger.setAttribute('aria-expanded',String(open));burger.setAttribute('aria-label',open?'Fermer le menu':'Ouvrir le menu')};
  burger.onclick=()=>setMenu(!side.classList.contains('open'));
  hooks.closeMenu=()=>setMenu(false);
  document.querySelector('#activity-picker').onclick=openActivityPicker;
  document.querySelector('#shell-avatar').onclick=()=>show('account');
  window.addEventListener('aurion-avatar-updated',ev=>applyShellAvatar(ev.detail?.url));
  document.querySelector('#logout').onclick=()=>api.logout().finally(()=>{invalidateSession();go('/')});
  document.querySelector('#fs-toggle').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>toast('Plein écran indisponible : utilisez F11.','info'))};
  paintShell();show(S.view==='quote'?'home':S.view);
  window.__aurionMetricsTimer&&clearInterval(window.__aurionMetricsTimer);
  window.__aurionMetricsTimer=setInterval(async()=>{
    if(metricsRefreshInProgress)return;
    metricsRefreshInProgress=true;
    const viewAtStart=S.view;
    try{
      S.dashboardCounters=await api.dashboardSummary(S.forecastMonths||6);
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
      }else if((viewAtStart==='accounting'||viewAtStart==='treasury')&&S.view===viewAtStart){
        await load(['accounting','treasury']);
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
