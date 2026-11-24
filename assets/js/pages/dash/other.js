// Accueil, clients, clients, rendez-vous du métier, agenda, comptabilité, archives, modèles, veille, paramètres.
import{api,getActiveActivity,setActiveActivity}from'../../core/api.js';
// Bloc 7 — horizons autorisés et leurs bornes (granularité mensuelle du moteur) :
// '3'→3 derniers mois calendaires ; '6'→6 derniers mois ; 'year'→du 1er janvier à aujourd'hui
// (mois entamés inclus) ; '365'→12 derniers mois (équivalent 365 jours arrondi au mois).
function forecastHorizonMonths(v){if(v==='year')return new Date().getMonth()+1;const n=Number(v);return [3,6,12].includes(n)?n:6}
import{expensesPanel,bindExpenses}from'./expenses.js';
import{S,e,money,toast,modalForm,confirmDelete,openDoc,calendarToast,prof,active,hooks,askConfirm,downloadAuthed}from'./core.js';
import{renderMailbox}from'../mailbox.js';
import{openClientSheet,initials}from'./clientsheet.js';
import{mergeRegistryFields}from'../../core/registry-fill.js';
import{deriveAutomaticForecastAssumptions,calculateForecast}from'../../core/forecast.js';
// 15.4.50 — Analyse visuelle : représentation AU CHOIX de l'utilisateur (barres, courbe,
// bougies, camembert) selon la nature des données — jamais un type mensonger.
import{renderChart,chartToolbar,bindChartToolbar}from'../../core/charts.js';

const F=(id,label,val='',extra='')=>{const value=val==null?'':val;return`<label class="field"><span>${label}</span><input id="${id}" value="${e(value)}" ${extra}${/placeholder=/.test(extra)?'':` placeholder="Saisissez ${e(label.toLowerCase())}…"`}></label>`};
const v=(m,id)=>m.querySelector('#'+id)?.value.trim()??'';
const $$=s=>document.querySelectorAll(s);
const fdate=d=>new Date(d).toLocaleString('fr-FR');
const rowBtns=(cls,id,extra='')=>`<div class="button-row">${extra}<button class="btn secondary small edit-${cls}" data-id="${id}">Modifier</button><button class="btn danger small del-${cls}" data-id="${id}">Supprimer</button></div>`;


async function forecastPanelMarkup(prefix,documents=S.quotes,activity=active()){
 const automatic=deriveAutomaticForecastAssumptions(documents,activity);
 let saved=null,assumptionsReadError=false;
 try{saved=await api.forecastAssumptions()}catch{assumptionsReadError=true}
 const savedFixedCosts=saved?.configured?Number(saved.fixedMonthlyCosts||0):0;
 const a={...automatic,fixedMonthlyCosts:Number.isFinite(savedFixedCosts)?Math.max(0,Math.min(10000000,savedFixedCosts)):0,metadata:{...automatic.metadata,fixedCostsNote:assumptionsReadError?'Impossible de vérifier les charges fixes enregistrées : le prévisionnel affiche 0 € en attendant la synchronisation.':saved?.configured?'Montant fixe enregistré pour cette activité (hypothèse utilisateur).':'Aucune charge fixe enregistrée pour cette activité : 0 € retenu.'}};
 const p=calculateForecast(a);
 const quantity=value=>Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:1});
 const autoValues=[
  ['Factures moyennes / mois',quantity(a.potentialClientsPerMonth),a.metadata.volumeNote],
  ['Ticket moyen TTC',money(a.averageTicketTtc),a.metadata.ticketNote],
  ['Base moyenne de provision HT',money(a.averageTicketHt),a.metadata.ticketHtNote],
  ['Coût direct moyen / facture',money(a.variableCostPerRepair),a.metadata.costNote],
  ['Charges fixes mensuelles suivies',money(a.fixedMonthlyCosts),a.metadata.fixedCostsNote],
  ['Taux de provision',quantity(a.reservePercent)+' %',a.metadata.reserveNote],
 ];
 const cards=autoValues.map(([label,value,help])=>'<article class="forecast-auto-value"><span>'+label+'</span><strong>'+value+'</strong><small>'+help+'</small></article>').join('');
 const rows=p.periods.map(period=>'<tr data-forecast-period="'+period.months+'"><th scope="row">'+(period.months===1?'1 mois':period.months+' mois')+'</th><td data-forecast-cell="repairs">'+quantity(period.repairs)+'</td><td data-forecast-cell="entries">'+money(period.entries)+'</td><td data-forecast-cell="outputs">'+money(period.outputs)+'</td><td data-forecast-cell="net">'+money(period.net)+'</td></tr>').join('');
 const historyControl=prefix==='home'?'<div class="button-row forecast-legacy-controls"><label class="field inline"><span>Période de référence</span><select id="forecast-history">'+[['3','3 mois'],['6','6 mois'],['year','Année en cours'],['365','365 jours']].map(([v,l])=>'<option value="'+v+'" '+(String(S.dashboardCounters?.forecast?.historyMonths||6)===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><button class="link-btn" id="forecast-detail" type="button">Détail</button></div><div id="forecast-more" hidden class="metrics"><article><span>3 mois — projection HT</span><b>'+money(S.dashboardCounters?.forecast?.months3||0)+'</b></article><article><span>6 mois — projection HT</span><b>'+money(S.dashboardCounters?.forecast?.months6||0)+'</b></article><article><span>Année — réalisé HT + projection HT</span><b>'+money(S.dashboardCounters?.forecast?.year||0)+'</b></article></div>':'';
 return '<section class="panel forecast-simulation" data-forecast-panel="'+prefix+'"><div class="section-title forecast-title"><div><span class="eyebrow">SCÉNARIO INDICATIF</span><h2>Prévision de facturation — scénario indicatif</h2>'+historyControl+'<p class="help"><strong>Calcul automatique.</strong> Aurion calcule le volume à partir des factures récentes, le ticket et les coûts directs à partir des documents de l’activité, et la provision sur le CA HT à partir des taux configurés. Le volume et le ticket sont déduits des factures récentes ; les charges fixes peuvent être renseignées séparément.</p></div></div><div class="forecast-input-grid forecast-auto-grid">'+cards+'</div><div class="button-row"><button type="button" class="btn secondary small" data-edit-forecast-fixed-costs>Renseigner les charges fixes</button></div><div class="forecast-table-wrap"><table class="forecast-table"><thead><tr><th>Horizon</th><th>Factures projetées</th><th>Entrées estimées (TTC)</th><th>Sorties estimées (TTC + provision HT)</th><th>Solde estimé (avant TVA à reverser)</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="help">Calcul : entrées = factures estimées × ticket moyen TTC ; sorties = coûts directs TTC + charges fixes TTC + provision de cotisations calculée sur le CA HT. La TVA collectée n’est pas déduite du solde : elle reste à reverser. Les projections 3/6 mois et annuelle combinent le réalisé du mois, la moyenne HT de la période de référence et les devis ouverts HT : elles ne constituent pas un historique ni une promesse d’encaissement. Les créances et devis restent détaillés séparément dans la trésorerie.</p></section>';
}

function bindForecastFixedCosts(root, prefix, documents=S.quotes, activity=active()) {
  const button=root?.querySelector('[data-edit-forecast-fixed-costs]');
  if(!button)return;
  button.addEventListener('click',async()=>{
    let existing=null;
    try{existing=await api.forecastAssumptions()}catch(x){toast(x.message||'Lecture des hypothèses impossible.','error');return;}
    const amount=Number(existing?.configured?existing.fixedMonthlyCosts||0:0);
    modalForm('Charges fixes mensuelles',`<p class="muted">Saisissez le total mensuel des charges fixes récurrentes de l’activité sélectionnée. Ce montant alimente uniquement le scénario prévisionnel ; il ne crée pas d’écriture comptable.</p><label class="field"><span>Charges fixes mensuelles à décaisser (TTC, €)</span><input id="forecastFixedCosts" type="number" min="0" max="10000000" step="0.01" value="${e(amount)}" required></label><p class="help">Saisissez le montant total réellement décaissé chaque mois, TVA comprise le cas échéant. Aurion n’ajoute pas ces montants à la comptabilité réelle.</p>`,async m=>{
      const raw=String(m.querySelector('#forecastFixedCosts')?.value||'').replace(',','.').trim();
      const fixed=Number(raw);
      if(!raw||!Number.isFinite(fixed)||fixed<0||fixed>10000000)throw new Error('Indiquez un montant mensuel valide, compris entre 0 et 10 000 000 €.');
      const automatic=deriveAutomaticForecastAssumptions(documents,activity);
      const payload={
        potentialClientsPerMonth:Math.max(0,Math.min(10000,Math.round(Number(existing?.configured?existing.potentialClientsPerMonth:automatic.potentialClientsPerMonth)||0))),
        averageTicketTtc:Math.max(0,Math.min(1000000,Number(existing?.configured?existing.averageTicketTtc:automatic.averageTicketTtc)||0)),
        variableCostPerRepair:Math.max(0,Math.min(1000000,Number(existing?.configured?existing.variableCostPerRepair:automatic.variableCostPerRepair)||0)),
        fixedMonthlyCosts:fixed,
        reservePercent:Math.max(0,Math.min(100,Number(existing?.configured?existing.reservePercent:automatic.reservePercent)||0))
      };
      await api.saveForecastAssumptions(payload);
      toast('Charges fixes enregistrées pour cette activité. Elles restent séparées de la comptabilité réelle.','success');
      if(prefix==='home')await hooks.refresh('home');else await hooks.refresh('treasury');
    },{label:'Enregistrer'});
  });
}

// ------------------------------------------------------------------ accueil
export const home={view(){
  const p=prof(),inv=S.quotes.filter(q=>q.document_type==='invoice'),now=new Date();
  const revenue=Number(S.dashboardCounters?.forecast?.monthHt??inv.filter(q=>q.payment_status==='paid').filter(q=>{const d=new Date(q.created_at);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).reduce((s,q)=>s+Number(q.total_ht||0),0));
  const trial=Number(S.dashboardCounters?.trialDaysLeft||0);
  const trialAlert=trial>0&&trial<=7?`<div class="notice warn-notice trial-alert">⏳ Votre essai se termine dans <b>${trial} jour${trial>1?'s':''}</b>. <button class="btn primary small" data-go="account">S’abonner</button> <button class="btn secondary small" id="trial-download">Télécharger mes données</button></div>`:'';
  // 15.4.56 (consigne éditeur) : l'encart « Configuration et paramètres » disparaît une fois la
  // configuration achevée (parcours terminé + configuration_incomplete levée) ; tant qu'elle ne
  // l'est pas, il reste affiché en version compacte, plus discrète que l'ancien panneau.
  const onboardingState=S.company?.configuration_data?.onboarding||{};
  const configDone=S.company?.configuration_incomplete===false&&onboardingState.completed===true;
  const configPanel=configDone?'':`<section class="panel onboarding-guide-panel onboarding-guide-panel--compact"><div class="section-title"><div><h2>Configuration et paramètres d’Aurion</h2><p class="help">Finalisez les étapes restantes : identité, activité, messagerie, documents.</p></div><a class="btn secondary" href="#/onboarding">Terminer la configuration</a></div></section>`;
  return`<div class="page-head"><div><span class="eyebrow">ACTIVITÉ ACTIVE</span><h1>${e(p.title||active()?.name||'Activité')}</h1><p>${e(active()?.description||'Pilotez cette activité avec un espace de travail adapté à ses prestations.')}</p></div><div class="button-row"><button class="btn primary" data-go="quote">+ Nouveau devis</button><button class="btn secondary" data-go="clients">+ Nouveau client</button></div></div>${configPanel}<section class="panel journal-board"><div class="section-title"><h2>Journal de bord</h2><span class="pill">À surveiller</span></div><div class="list" role="region" aria-label="Journal de bord">${(S.dashboardCounters?.journal||[]).map(i=>`<div class="list-row journal-${e(i.severity||'yellow')} ${i.isRead?'journal-read':''}"><div><b>${e(i.title)}</b><small>${e(i.detail||'')}</small>${i.action==='settings'?'<button class="link-btn" data-go="settings">Configurer maintenant</button>':''}${i.persisted&&i.internalPath?`<a class="link-btn" href="#${e(String(i.internalPath).replace(/^\//,''))}">${String(i.eventType||'').startsWith('cloud_')?'Ouvrir les paramètres de stockage':'Reprendre l’étape'}</a>`:''}${i.persisted?`<div class="journal-actions"><span>${i.isRead?'Lu':'Nouvelle information'}</span><button type="button" class="link-btn journal-read-action" data-journal-id="${e(i.journalId)}" data-read="${i.isRead?'false':'true'}">${i.isRead?'Marquer non lu':'Marquer lu'}</button><button type="button" class="link-btn journal-resolve-action" data-journal-id="${e(i.journalId)}">${String(i.eventType||'').startsWith('fiscal_deadline')?'Supprimer l’alerte':'Résoudre'}</button></div>`:''}</div><span>${i.severity==='red'?'🔴':i.severity==='yellow'?'🟡':i.severity==='green'?'✅':'ℹ️'}</span></div>`).join('')||'<p class="muted">Aucune action urgente ou en attente.</p>'}</div></section>${trialAlert}
  ${Number(S.dashboardCounters?.fourthReminderCount||0)>0?'<div class="notice warn-notice">⚠ Une 4e relance est nécessaire pour une facture impayée. <button class="link-btn" data-go="invoices">Ouvrir Devis & factures</button></div>':''}
  <div class="metrics"><article><span>Clients</span><b id="home-clients">${S.clients.length}</b><small>dans cette activité</small></article><article><span>Devis en cours</span><b id="home-open-quotes">${S.quotes.filter(q=>q.document_type!=='invoice'&&!['canceled','cancelled','rejected','void','deleted'].includes(String(q.status||'').toLowerCase())).length}</b><small>hors devis annulés ou rejetés</small></article><article><span>Encaissements HT du mois</span><b id="home-month-revenue">${money(revenue)}</b><small>paiements reçus, majorations comprises</small></article><article><span>Rendez-vous à venir</span><b id="home-rdv">${Number(S.dashboardCounters?.upcomingAppointments??S.appointments.filter(a=>new Date(a.starts_at)>now&&!['canceled','cancelled','deleted','completed'].includes(String(a.status||'').toLowerCase())).length)}</b><small>hors rendez-vous passés ou annulés</small></article></div>
  <section class="quick-grid"><button class="action-card" data-go="support"><strong>?</strong><span>Tickets</span><small id="home-tickets-caption">${Number(S.dashboardCounters?.tickets||0)} ticket(s) non traité(s)</small></button><button class="action-card" data-go="treasury"><strong>↗</strong><span>Entrées prévues</span><small id="home-entries-caption">${money(S.dashboardCounters?.forecastEntries||0)} à venir · TTC, SAV déduits</small></button></section><div id="home-forecast-root"></div><section class="panel" id="home-visual-analysis"><div class="section-title"><h2>Analyse visuelle</h2><span class="pill">Représentation au choix</span></div><p class="help">Les mêmes données peuvent être lues sous plusieurs formes — barres, courbe, bougies ou camembert selon leur nature : une série temporelle ne propose jamais le camembert, une répartition jamais la courbe. Choisissez la lecture qui vous parle.</p><div class="section-title"><h3>CA facturé par mois (TTC, 6 derniers mois)</h3></div><div id="toolbar-home-ca"></div><div id="chart-home-ca" class="chart-container"></div><div class="section-title"><h3>Répartition des factures par statut de paiement</h3></div><div id="toolbar-home-status"></div><div id="chart-home-status" class="chart-container"></div></section><section class="panel"><div class="section-title"><div><h2>Temps économisé avec Aurion</h2><span class="pill">Mesure cumulée</span></div><button class="btn secondary small" id="reset-time-metrics">Remettre à zéro</button></div><div class="metrics"><article><span>Temps manuel estimé</span><b>${Number(S.timeMetrics?.manualMinutes||0).toFixed(0)} min</b><small>Sessions terminées uniquement</small></article><article><span>Temps réel avec Aurion</span><b>${Number(S.timeMetrics?.actualMinutes||0).toFixed(0)} min</b><small>Durée cumulée des sessions terminées</small></article><article><span>Temps économisé</span><b>${Number(S.timeMetrics?.savedMinutes||0).toFixed(0)} min</b><small>Manuel − réel</small></article><article><span>Moyenne économisée</span><b>${Number(S.timeMetrics?.averageSavedMinutes||0).toFixed(1)} min</b><small>Par session terminée</small></article></div><p class="help">Pour obtenir une mesure fiable, saisissez au début de chaque prise en charge le temps que vous auriez consacré manuellement, puis démarrez le chronométrage Aurion.</p></section>
  <section class="panel"><div class="section-title"><h2>Derniers documents</h2><button class="link-btn" data-go="invoices">Tout voir</button></div>${S.quotes.slice(0,5).map(q=>`<div class="list-row"><div><b>${e(q.number)}</b><small>${e(q.client_name||'Client')}</small></div><strong>${money(q.total_ttc)}</strong></div>`).join('')||'<p class="muted">Aucun document.</p>'}</section>`},async bind(){
document.querySelector('#trial-download')?.addEventListener('click',()=>api.downloadAll().catch(x=>toast(x.message,'error')));
// 15.4.50 — Analyse visuelle de l'accueil : données réelles des documents, représentation au choix.
{
  const invoices=S.quotes.filter(q=>q.document_type==='invoice');
  const now=new Date();
  const months=[];
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label:d.toLocaleDateString('fr-FR',{month:'short'}).replace('.','')+' '+String(d.getFullYear()).slice(2)})}
  const caSeries=months.map(m=>({label:m.label,value:invoices.filter(q=>{const d=new Date(q.created_at);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`===m.key}).reduce((s,q)=>s+Number(q.total_ttc||0),0)}));
  const caData={title:'CA facturé par mois (TTC)',kind:'timeseries',unit:'€ TTC',series:caSeries};
  const statusLabels={paid:'Payées',partially_paid:'Partiellement payées',unpaid:'Non payées'};
  const statusMap={};
  invoices.forEach(q=>{const k=String(q.payment_status||'unpaid');statusMap[k]=(statusMap[k]||0)+Number(q.total_ttc||0)});
  const statusData={title:'Répartition des factures par statut de paiement',kind:'distribution',unit:'€ TTC',series:Object.entries(statusMap).map(([k,v])=>({label:statusLabels[k]||k,value:v}))};
  const render=(cid,d,type)=>renderChart(cid,d,type);
  const caRoot=document.querySelector('#toolbar-home-ca');
  if(caRoot){caRoot.innerHTML=chartToolbar('chart-home-ca',['bar','line','candle'],'bar');render('chart-home-ca',caData,'bar');bindChartToolbar(document,'chart-home-ca',caData,render)}
  const stRoot=document.querySelector('#toolbar-home-status');
  if(stRoot){stRoot.innerHTML=chartToolbar('chart-home-status',['pie','bar'],'pie');render('chart-home-status',statusData,'pie');bindChartToolbar(document,'chart-home-status',statusData,render)}
}document.querySelectorAll('.journal-read-action').forEach(b=>b.addEventListener('click',async()=>{try{await api.updateJournalEvent(b.dataset.journalId,{isRead:b.dataset.read==='true'});await hooks.refresh('home')}catch(x){toast(x.message||'Mise à jour du journal impossible.','error')}}));document.querySelectorAll('.journal-resolve-action').forEach(b=>b.addEventListener('click',async()=>{try{await api.updateJournalEvent(b.dataset.journalId,{resolved:true});await hooks.refresh('home')}catch(x){toast(x.message||'Mise à jour du journal impossible.','error')}}));const forecastRoot=document.querySelector('#home-forecast-root');if(forecastRoot){try{forecastRoot.innerHTML=await forecastPanelMarkup('home',S.quotes,active());bindForecastFixedCosts(forecastRoot,'home',S.quotes,active())}catch(x){forecastRoot.innerHTML='<section class="panel"><p class="error">'+e(x.message||'Calcul du prévisionnel impossible.')+'</p></section>'}}document.querySelector('#forecast-detail')?.addEventListener('click',()=>{const x=document.querySelector('#forecast-more');if(x)x.hidden=!x.hidden});document.querySelector('#forecast-history')?.addEventListener('change',async ev=>{try{S.forecastMonths=forecastHorizonMonths(ev.target.value);S.dashboardCounters=await api.dashboardSummary(S.forecastMonths);hooks.show('home')}catch(x){toast(x.message,'error')}});document.querySelector('#reset-time-metrics')?.addEventListener('click',async()=>{const current=active()||{};if(!current.id){toast('Sélectionnez d’abord une activité : la remise à zéro ne peut pas porter sur toutes les activités à la fois.','error');return}
    // Portée explicite : SEULES les sessions de l’activité affichée sont supprimées.
    if(!await askConfirm({title:'Remettre à zéro les compteurs ?',message:`Cette action remet à zéro le compteur Temps économisé de l’activité affichée « ${current.name||'activité sélectionnée'} » : les sessions concernées sont exclues du calcul, mais leur historique est conservé pour l’audit, les statistiques et le suivi des chantiers. Les sessions des autres activités sont conservées et restent comptabilisées.`,confirmLabel:'Remettre à zéro cette activité',danger:true}))return;try{await api.resetTimeMetrics(current.id);S.timeMetrics=await api.timeMetrics(current.id);toast(`Compteurs de « ${current.name||'l’activité affichée'} » remis à zéro. L’historique est conservé ; les autres activités sont inchangées.`,'success');await hooks.refresh('home')}catch(x){toast(x.message,'error')}})}};

// ------------------------------------------------------------------ clients
export const clients={view(){
  const stat=id=>{const d=S.quotes.filter(q=>q.client_id===id);return{n:d.length,inv:d.filter(q=>q.document_type==='invoice').reduce((t,q)=>t+Number(q.total_ttc||0),0)}};
  return`<div class="page-head"><div><span class="eyebrow">CRM · ${e(active()?.name||'')}</span><h1>Clients</h1><p>Chaque activité dispose de son propre portefeuille. Ouvrez une fiche pour voir tout l’historique d’un client.</p></div><button class="btn primary" id="new-client">+ Nouveau client</button></div>
  <div class="client-toolbar"><input id="client-search" type="search" placeholder="Rechercher un client (identité, raison sociale, SIRET…)" aria-label="Rechercher un client"><span class="muted" id="client-count">${S.clients.length} client${S.clients.length>1?'s':''}</span></div>
  <div class="client-grid" id="client-grid">${S.clients.map(c=>{const s=stat(c.id);return`<article class="client-card" data-id="${c.id}" data-q="${e([c.name,c.email,c.phone,c.address,c.siret].filter(Boolean).join(' ').toLowerCase())}"><header><div class="avatar-lg">${e(initials(c.name))}</div><div><h3>${e(c.name)}</h3><small>Client depuis le ${new Date(c.created_at).toLocaleDateString('fr-FR')}</small></div></header><ul class="contact-list"><li><i>✉</i><span>${e(c.email||'—')}</span></li><li><i>☎</i><span>${e(c.phone||'—')}</span></li><li><i>⌂</i><span>${e((c.address||'—').replace(/\n/g,', '))}</span></li><li><i>#</i><span>SIRET : ${e(c.siret||'—')}</span></li></ul><div class="client-stats"><div><b>${s.n}</b><span>Document${s.n>1?'s':''}</span></div><div><b>${money(s.inv)}</b><span>Facturé TTC</span></div></div><footer><button class="btn primary small open-client" data-id="${c.id}">Ouvrir la fiche</button><button class="btn secondary small quote-client" data-id="${c.id}">+ Devis</button><button class="btn secondary small edit-client" data-id="${c.id}">Modifier</button><button class="btn secondary small intervention-addresses" data-id="${c.id}">Adresses d’intervention</button><button class="btn secondary small client-pdf" data-id="${c.id}">PDF</button><button class="btn danger small del-client" data-id="${c.id}">Supprimer</button></footer></article>`}).join('')||'<div class="empty">Aucun client dans cette activité.<br><small>Créez votre premier client pour commencer un devis.</small></div>'}</div>`},
bind(){
  const form=(c={})=>`${F('name','Nom / raison sociale',c.name,'required')}<div class="grid-2">${F('email','E-mail',c.email,'type="email" placeholder="client@entreprise.fr"')}${F('phone','Téléphone',c.phone,'placeholder="06 12 34 56 78"')}</div><label class="field"><span>SIRET</span><input id="siret" inputmode="numeric" maxlength="14" placeholder="14 chiffres" value="${e(c.siret||'')}"></label><div class="button-row detection-row"><button type="button" class="btn secondary small" id="lookup-client-siret">Détecter automatiquement</button></div><label class="field"><span>Adresse postale</span><textarea id="address" rows="3" placeholder="12 rue des Lilas, 33000 Bordeaux">${e(c.address||'')}</textarea></label><label class="field"><span>Adresse d’intervention</span><textarea id="interventionAddress" rows="3" placeholder="Adresse du lieu d’intervention, si différente">${e(c.intervention_address||'')}</textarea></label>${F('estimated','Temps manuel estimé (minutes)',c.estimated_minutes==null?'':Number(c.estimated_minutes),'type="number" min="0" step="1"')}<small class="help">Cette estimation sert au calcul automatique du temps économisé. Le chronomètre démarre automatiquement à la validation de la fiche client et reste actif jusqu’à sa facturation.</small>`;
  const body=m=>({name:v(m,'name'),email:v(m,'email'),phone:v(m,'phone'),address:v(m,'address'),interventionAddress:v(m,'interventionAddress'),siret:v(m,'siret').replace(/\D/g,''),estimatedMinutes:Number(v(m,'estimated'))||0});
  const edit=c=>{const m=modalForm('Modifier la fiche client',form(c),m=>api.updateClient(c.id,body(m)));wireClientLookup(m)};
  const manageInterventionAddresses=async c=>{
    document.querySelector('#intervention-address-manager')?.remove();
    document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="intervention-address-manager" role="dialog" aria-modal="true" aria-labelledby="intervention-address-title"><section class="modal glass"><div class="section-title"><div><h2 id="intervention-address-title">Adresses d’intervention · ${e(c.name)}</h2><small>L’adresse de facturation du client reste unique et séparée.</small></div><button type="button" class="icon-btn" data-address-close aria-label="Fermer">×</button></div><form id="intervention-address-form" class="stack"><div class="grid-2"><label class="field"><span>Libellé facultatif</span><input id="ia-label" maxlength="120" placeholder="Maison, chantier, bureau…"></label><label class="field"><span>Nouvelle adresse d’intervention</span><input id="ia-address" maxlength="1000" required placeholder="Numéro, rue, code postal, ville"></label></div><label class="check"><input type="checkbox" id="ia-default"> Définir comme adresse par défaut</label><div class="button-row"><button class="btn primary" type="submit">Ajouter l’adresse</button><button class="btn secondary" type="button" data-address-close>Fermer</button></div><p id="ia-status" class="help" role="status" aria-live="polite"></p></form><div id="intervention-address-list" class="stack" aria-live="polite"><p>Chargement des adresses…</p></div></section></div>`);
    const root=document.querySelector('#intervention-address-manager'),list=root.querySelector('#intervention-address-list'),status=root.querySelector('#ia-status');
    const close=()=>root.remove();root.querySelectorAll('[data-address-close]').forEach(b=>b.addEventListener('click',close));root.addEventListener('click',ev=>{if(ev.target===root)close()});
    let rows=[];
    const reload=async()=>{const result=await api.interventionAddresses(c.id);rows=result.addresses||[];list.innerHTML=rows.map(a=>`<article class="list-row"><div><b>${e(a.label||'Adresse sans libellé')}${a.isDefault?' · Par défaut':''}</b><small>${e(a.address)}</small></div><div class="button-row"><button type="button" class="btn secondary small ia-edit" data-id="${e(a.id||'')}" ${a.legacy?'disabled':''}>Modifier</button><button type="button" class="btn secondary small ia-default" data-id="${e(a.id||'')}" ${a.isDefault||a.legacy?'disabled':''}>Définir par défaut</button><button type="button" class="btn danger small ia-delete" data-id="${e(a.id||'')}" ${a.legacy?'disabled':''}>Supprimer</button></div></article>`).join('')||'<p class="muted">Aucune adresse d’intervention. Le formulaire ci-dessus permet d’en ajouter une.</p>';
      list.querySelectorAll('.ia-edit').forEach(b=>b.addEventListener('click',async()=>{const a=rows.find(x=>String(x.id)===b.dataset.id);if(!a)return;
        // Édition au design Aurion (remplace prompt() du navigateur).
        modalForm('Modifier l’adresse d’intervention',`<label class="field"><span>Libellé (facultatif)</span><input id="ia-edit-label" maxlength="120" value="${e(a.label||'')}" placeholder="Maison, chantier, bureau…"></label><label class="field"><span>Adresse d’intervention complète</span><textarea id="ia-edit-address" rows="3" required placeholder="Numéro, rue, code postal, ville">${e(a.address||'')}</textarea></label>`,async m=>{
          const label=m.querySelector('#ia-edit-label').value.trim(),address=m.querySelector('#ia-edit-address').value.trim();
          if(!address)throw new Error('L’adresse ne peut pas être vide.');
          await api.updateInterventionAddress(c.id,a.id,{label,address,isDefault:a.isDefault});
          status.textContent='Adresse mise à jour sur le serveur.';
          await reload();await hooks.refresh('clients');
        },{label:'Enregistrer l’adresse'});}));
      list.querySelectorAll('.ia-default').forEach(b=>b.addEventListener('click',async()=>{const a=rows.find(x=>String(x.id)===b.dataset.id);if(!a)return;try{await api.updateInterventionAddress(c.id,a.id,{isDefault:true});status.textContent='Adresse par défaut enregistrée.';await reload();await hooks.refresh('clients')}catch(x){toast(x.message||'Mise à jour impossible.','error')}}));
      list.querySelectorAll('.ia-delete').forEach(b=>b.addEventListener('click',async()=>{const a=rows.find(x=>String(x.id)===b.dataset.id);if(!a)return;
        // Confirmation au design Aurion (remplace confirm() du navigateur).
        if(!await askConfirm({title:'Archiver cette adresse ?',message:`Archiver l’adresse « ${a.label||a.address} » ? Les devis et factures déjà émis conservent leur instantané.`,confirmLabel:'Archiver l’adresse',danger:true}))return;
        try{await api.deleteInterventionAddress(c.id,a.id);status.textContent='Adresse archivée. Les documents historiques restent inchangés.';await reload();await hooks.refresh('clients')}catch(x){toast(x.message||'Suppression impossible.','error')}}));
    };
    root.querySelector('#intervention-address-form').addEventListener('submit',async ev=>{ev.preventDefault();const address=root.querySelector('#ia-address').value.trim(),label=root.querySelector('#ia-label').value.trim(),isDefault=root.querySelector('#ia-default').checked;if(!address){status.textContent='Saisissez une adresse complète.';return}try{await api.createInterventionAddress(c.id,{label,address,isDefault:isDefault||rows.length===0});root.querySelector('#ia-address').value='';root.querySelector('#ia-label').value='';root.querySelector('#ia-default').checked=false;status.textContent='Adresse ajoutée et enregistrée.';await reload();await hooks.refresh('clients')}catch(x){status.textContent=x.message||'L’adresse n’a pas pu être enregistrée.'}});
    try{await reload()}catch(x){list.innerHTML=`<p class="error">${e(x.message||'Impossible de charger les adresses.')}</p>`;}
  };
  const del=c=>confirmDelete(`Supprimer ${c.name} ?\nSes devis et factures sont conservés mais ne seront plus rattachés à un client.`,()=>api.deleteClient(c.id),'Client supprimé',{title:`Supprimer ${c.name} ?`});
  const quote=c=>{S.prefillClient=c.id;S.editing=null;S.quoteDraft=null;S.startBlankQuote=true;hooks.refresh('quote',{navigation:true}).catch(x=>toast(x.message,'error'))};
  const get=id=>S.clients.find(x=>x.id===id);
  const wireClientLookup=m=>{let previousDetected={};m.querySelector('#lookup-client-siret')?.addEventListener('click',async()=>{const id=v(m,'siret').replace(/\D/g,'');if(!id||![9,14].includes(id.length))return toast('Saisissez un SIRET ou un SIREN valide.','info');try{const r=await api.supplierLookup(id);const c=r.company;if(!c)return toast('Entreprise introuvable dans le registre public.','info');const merged=mergeRegistryFields({name:v(m,'name'),siret:v(m,'siret'),address:v(m,'address'),postal_code:'',city:''},{...c},previousDetected);m.querySelector('#name').value=merged.name||'';m.querySelector('#siret').value=merged.siret||v(m,'siret');m.querySelector('#address').value=merged.address||'';previousDetected={name:merged.name,siret:merged.siret,address:merged.address};toast('Entreprise détectée et informations client préremplies.','success')}catch(x){toast(x.message,'error')}})};
  document.querySelector('#new-client').onclick=()=>{const m=modalForm('Nouveau client',form(),m=>api.createClient(body(m)));wireClientLookup(m)};
  $$('.open-client').forEach(b=>b.onclick=()=>openClientSheet(b.dataset.id,{onEdit:edit,onQuote:quote,onDelete:del}));
  $$('.client-card header').forEach(h=>h.onclick=()=>openClientSheet(h.closest('.client-card').dataset.id,{onEdit:edit,onQuote:quote,onDelete:del}));
  $$('.quote-client').forEach(b=>b.onclick=()=>quote(get(b.dataset.id)));
  $$('.edit-client').forEach(b=>b.onclick=()=>edit(get(b.dataset.id)));
  $$('.intervention-addresses').forEach(b=>b.onclick=()=>manageInterventionAddresses(get(b.dataset.id)));
  $$('.del-client').forEach(b=>b.onclick=()=>del(get(b.dataset.id)));
  $$('.client-pdf').forEach(b=>b.onclick=()=>openDoc('clients',b.dataset.id,'pdf','view'));
  document.querySelector('#client-search').addEventListener('input',ev=>{
    const q=ev.target.value.trim().toLowerCase();let n=0;
    $$('.client-card').forEach(card=>{const ok=!q||card.dataset.q.includes(q);card.hidden=!ok;if(ok)n++});
    document.querySelector('#client-count').textContent=`${n} client${n>1?'s':''}`;
  });
}};

// ------------------------------------------------------------------ appareils / dossiers (vocabulaire du métier)
// ------------------------------------------------------------------ agenda
export const agenda={view(){return`<div class="page-head"><div><span class="eyebrow">ORGANISATION</span><h1>Agenda</h1><p>${S.mail?.google?.connected?'Google Agenda est connecté : Aurion synchronise directement les rendez-vous.':S.mail?.account?.email?`Les invitations iCalendar sont envoyées à ${e(S.mail.account.email)}. Ajoutez le fichier reçu à votre agenda pour enregistrer le rendez-vous.`:'Connectez Google Agenda ou configurez votre messagerie dans Paramètres pour synchroniser les rendez-vous.'}</p></div><button class="btn primary" id="new-rdv">+ Nouveau rendez-vous</button></div><section class="panel">${S.appointments.map(a=>`<div class="list-row"><div><b>${e(a.title)}</b><small>${fdate(a.starts_at)}${a.client_name?' · '+e(a.client_name):''}${a.quote_number?' · Devis '+e(a.quote_number):''}</small></div><div class="button-row"><button class="btn secondary small view-rdv" data-id="${a.id}">Consulter</button><button class="btn secondary small edit-rdv" data-id="${a.id}">Modifier</button><a class="btn secondary small" href="${api.appointmentPdfUrl(a.id)}" target="_blank" rel="noopener">PDF</a><button class="btn danger small del-rdv" data-id="${a.id}">Supprimer</button></div></div>`).join('')||'<div class="empty">Aucun rendez-vous.</div>'}</section>`},
bind(){
  const local=d=>{const x=new Date(d);return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,16)};
  const clientById=id=>S.clients.find(c=>c.id===id)||null;
  const quotesForClient=id=>S.quotes.filter(q=>q.document_type==='quote'&&q.client_id===id);
  const form=(a={})=>{
    const clientId=a.client_id||'',available=quotesForClient(clientId),selectedQuote=a.quote_id||'';
    return `<label class="field"><span>Client</span><select id="clientId"><option value="">Votre choix</option>${S.clients.map(c=>`<option value="${c.id}" ${c.id===clientId?'selected':''}>${e(c.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Devis associé</span><select id="quoteId"><option value="">Aucun devis</option>${available.map(q=>`<option value="${q.id}" ${q.id===selectedQuote?'selected':''}>${e(q.number)} · ${money(q.total_ttc||0)} TTC</option>`).join('')}</select></label>
    ${F('title','Objet',a.title,'required')}<div class="grid-2">${F('startsAt','Début',a.starts_at?local(a.starts_at):'','type="datetime-local" required')}${F('endsAt','Fin',a.ends_at?local(a.ends_at):'','type="datetime-local"')}</div>
    <div id="rdv-quote-fields" class="stack" ${selectedQuote||a.quote_total_ttc!=null?'':'hidden'}>
      <label class="field"><span>Prix client TTC</span><input id="quoteTotalTtc" type="text" value="${a.quote_total_ttc!=null?e(Number(a.quote_total_ttc).toFixed(2)+' €'):''}" readonly></label>
      <label class="field"><span>Pièces nécessaires</span><textarea id="quoteItems" rows="3" readonly>${e((a.quote_items||[]).map(i=>`${Number(i.quantity||0)} × ${i.label||''}`).join('\n'))}</textarea></label>
    </div>
    <label class="field"><span>Adresse du rendez-vous</span><select id="addressSource"><option value="">Votre choix</option><option value="postal" ${a.address_source==='postal'?'selected':''}>Adresse postale</option><option value="intervention" ${a.address_source==='intervention'?'selected':''}>Adresse d’intervention</option><option value="free" ${a.address_source==='free'||!a.address_source?'selected':''}>Adresse libre</option></select></label>
    <label class="field"><span>Adresse</span><textarea id="locationAddress" rows="2" placeholder="Saisissez l’adresse du rendez-vous…">${e(a.location_address||'')}</textarea></label>`;
  };
  const body=m=>{const start=v(m,'startsAt'),end=v(m,'endsAt');if(end&&new Date(end)<new Date(start))throw new Error('L’heure de fin ne peut pas être antérieure à l’heure de début.');return {clientId:m.querySelector('#clientId').value||null,quoteId:m.querySelector('#quoteId').value||null,addressSource:m.querySelector('#addressSource').value||'free',title:v(m,'title'),startsAt:new Date(start).toISOString(),endsAt:end?new Date(end).toISOString():null,locationAddress:v(m,'locationAddress')}};
  const wire=(m,a={})=>{
    const clientInput=m.querySelector('#clientId'),quoteInput=m.querySelector('#quoteId'),source=m.querySelector('#addressSource'),address=m.querySelector('#locationAddress'),fields=m.querySelector('#rdv-quote-fields'),price=m.querySelector('#quoteTotalTtc'),items=m.querySelector('#quoteItems');
    const sync=()=>{
      const client=clientById(clientInput?.value),quotes=quotesForClient(clientInput?.value),selected=quoteInput?.value;
      if(quoteInput)quoteInput.innerHTML='<option value="">Aucun devis</option>'+quotes.map(q=>`<option value="${q.id}" ${q.id===selected?'selected':''}>${e(q.number)} · ${money(q.total_ttc||0)} TTC</option>`).join('');
      const q=(S.quotes||[]).find(x=>x.id===quoteInput?.value);
      if(fields)fields.hidden=!q;
      if(q){if(price)price.value=`${Number(q.total_ttc||0).toFixed(2)} €`;if(items)items.value=(q.items||[]).map(i=>`${Number(i.quantity||0)} × ${i.label||''}`).join('\n');}
      const sourceValue=source?.value||'free';if(sourceValue!=='free'){const next=sourceValue==='postal'?(client?.address||''):(client?.intervention_address||'');if(address&&!address.dataset.manual)address.value=next;}
      if(address)address.readOnly=false;
    };
    clientInput?.addEventListener('change',()=>{if(quoteInput)quoteInput.value='';sync()});quoteInput?.addEventListener('change',sync);source?.addEventListener('change',()=>{delete address.dataset.manual;sync()});address?.addEventListener('input',()=>{address.dataset.manual='true'});sync();
  };
  document.querySelector('#new-rdv').onclick=()=>{const m=modalForm('Nouveau rendez-vous',form(),async m=>{calendarToast((await api.createAppointment(body(m))).calendar,'créé')});wire(m)};
  $$('.edit-rdv').forEach(b=>b.onclick=()=>{const a=S.appointments.find(x=>x.id===b.dataset.id);const m=modalForm('Modifier le rendez-vous',form(a),async m=>{const bd=body(m);if(!bd.endsAt)bd.endsAt=bd.startsAt;calendarToast((await api.updateAppointment(a.id,bd)).calendar,'modifié')});wire(m,a)});
  $$('.view-rdv').forEach(b=>b.onclick=()=>{const a=S.appointments.find(x=>x.id===b.dataset.id);if(!a)return;modalForm(`Fiche rendez-vous · ${e(a.title)}`,`<div class="preview-grid"><div><span>Client</span><b>${e(a.client_name||'')}</b></div><div><span>Devis</span><b>${e(a.quote_number||'Aucun')}</b></div><div><span>Début</span><b>${e(fdate(a.starts_at))}</b></div><div><span>Fin</span><b>${e(a.ends_at?fdate(a.ends_at):'—')}</b></div><div><span>Prix client TTC</span><b>${a.quote_total_ttc!=null?money(a.quote_total_ttc):'—'}</b></div><div><span>Adresse</span><b>${e(a.location_address||'')}</b></div></div><div class="preview-items"><span>Pièces nécessaires</span>${(a.quote_items||[]).map(i=>`<div class="list-row"><b>${e(i.label)}</b><span>× ${Number(i.quantity||0)}</span></div>`).join('')||'<p class="muted">Aucune pièce renseignée.</p>'}</div><div class="button-row"><a class="btn secondary" href="${api.appointmentPdfUrl(a.id)}" target="_blank" rel="noopener">PDF</a></div>`,async()=>{},{label:'Fermer'});});
  $$('.del-rdv').forEach(b=>b.onclick=async()=>{if(!await askConfirm({title:'Supprimer ce rendez-vous ?',message:'Une annulation sera envoyée à votre agenda.',confirmLabel:'Supprimer',danger:true}))return;try{calendarToast((await api.deleteAppointment(b.dataset.id)).calendar,'supprimé');await hooks.refresh()}catch(x){toast(x.message,'error')}});
}};

// ------------------------------------------------------------------ comptabilité
export const accounting={view(){
  const acc=S.accounting?.invoices||{},savTotal=(S.sav||[]).filter(x=>(x.sav_type||'financial')==='financial').reduce((s,x)=>s+Number(x.amount_ttc||0),0),ca=Number(acc.revenue_ht||0),vat=Number(acc.vat||0),ur=Number(acc.social||0),km=Number(acc.mileage_total||0),invCount=Number(acc.count||0),
  // 15.4.56 (consigne éditeur) : les encarts affichent 0,00 € tant qu'aucune donnée n'est
  // saisie, puis suivent les données réelles dès le premier mouvement — plus jamais de
  // « à renseigner » figé, qui empêchait de voir la valeur évoluer de 0 vers le réel.
  m0=v=>money(Number(v||0));
  const year=S.accountingYear||new Date().getFullYear();
  return`<div class="page-head"><div><span class="eyebrow">PILOTAGE</span><h1>Comptabilité</h1><p>Les mois ne sont jamais remis à zéro : Aurion conserve l’historique annuel.</p></div></div><div class="metrics"><article><span>Encaissements HT</span><b id="acc-encaissements">${m0(ca)}</b><small>activité active · paiements reçus, SAV déduits</small></article><article><span>TVA encaissée</span><b id="acc-tva">${m0(vat)}</b><small>calculée sur les paiements reçus</small></article><article><span>Cotisations estimées</span><b id="acc-cotisations">${m0(ur)}</b><small>selon vos taux · base encaissements HT</small></article><article><span>Factures encaissées</span><b id="acc-factures">${invCount}</b><small>au moins un paiement reçu sur l’année</small></article><article><span>Kilométrage sur factures</span><b id="acc-km">${m0(km)}</b><small>montant figurant sur les factures</small></article></div>
  <section class="panel accounting-treasury-panel"><div class="section-title"><h2>Trésorerie prévisionnelle</h2><span class="pill">Même activité · calculs synchronisés</span></div><div class="metrics"><article><span>Créances restantes à encaisser (engagé)</span><b id="trez-committed-in">${money(S.treasury?.committedIn||0)}</b><small>factures non soldées : reste dû TTC, majorations comprises, paiements reçus déduits</small></article><article><span>Devis ouverts (potentiel)</span><b id="trez-potential-in">${money(S.treasury?.potentialIn||0)}</b><small>non signés — présentés séparément des encaissements certains</small></article><article><span>Sorties prévues</span><b id="trez-outputs">${money(S.treasury?.forecastOutputs||0)}</b><small>coûts directs des documents ouverts${Number(S.treasury?.committedOut||0)>0?` dont ${money(S.treasury?.committedOut)} de notes de frais à rembourser`:''}</small></article><article><span>Solde engagé (hors potentiel)</span><b id="trez-committed-net">${money(S.treasury?.committedNet||0)}</b><small>créances − sorties prévues ; SAV ${money(S.treasury?.savTotal||0)} compté séparément</small></article></div><div class="section-title"><h3>Prévisionnel par document</h3></div>${(S.treasury?.rows||[]).map(q=>`<div class="list-row"><div><b>${e(q.number)}</b><small>Devis · ${e(q.status||'')} · ${new Date(q.created_at).toLocaleDateString('fr-FR')}</small></div><div><b>${money(q.total_ttc)}</b><small>Sortie matériel : ${money(q.purchase_ht||0)} HT</small></div></div>`).join('')||'<p class="muted">Aucun devis prévisionnel.</p>'}</section>
  ${expensesPanel()}
  <section class="panel"><div class="section-title"><h2>Comptabilité</h2><span class="pill">Calculs liés aux paiements</span></div>${!navigator.onLine?`<p class="notice warn-notice" data-freshness>Données locales affichées — calculs fondés sur la dernière réplication${''} ; ils peuvent être incomplets tant que la connexion est absente. Aucun zéro fictif : ce qui n'est pas connu n'est pas affiché.</p>`:''}<div class="section-title"><h3>Export comptable ${year}</h3><div class="button-row"><label class="field inline"><span>Année</span><select id="acc-year">${[0,1,2,3].map(o=>year-o).map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select></label><button class="btn primary" id="acc-csv">Exporter en CSV</button></div></div><p class="muted">Export CSV structuré (encaissements HT, TVA encaissée, cotisations estimées, kilométrage facturé et détail mensuel), à transmettre à votre comptable.</p><div class="section-title"><h3>Historique mensuel</h3></div>${(S.accounting?.months||[]).map(m=>{const hasMovement=Number(m.invoiceCount||0)>0||Number(m.revenueHt||0)!==0||Number(m.purchases||0)!==0||Number(m.social||0)!==0||Number(m.mileage||0)!==0||Number(m.expenseReports||0)!==0;return `<details class="list-row month-history"${hasMovement?'':' data-empty="true"'}><summary><b>${new Date(m.month).toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</b><strong>${money(m.revenueHt||0)}</strong></summary>${hasMovement?`<div class="stack month-detail"><div class="list-row"><small>Encaissements HT</small><b>${money(m.revenueHt||0)}</b></div><div class="list-row"><small>TVA encaissée</small><b>${money(m.vat||0)}</b></div><div class="list-row"><small>Dépenses et coûts directs HT</small><b>${money(m.purchases||0)}</b></div><div class="list-row"><small>TVA déductible</small><b>${money(m.purchaseVat||0)}</b></div><div class="list-row"><small>Cotisations sociales estimées</small><b>${money(m.social||0)}</b></div><div class="list-row"><small>Kilométrage figurant sur factures</small><b>${money(m.mileage||0)}</b></div>${Number(m.expenseReports||0)>0?`<div class="list-row"><small>Notes de frais</small><b>${money(m.expenseReports)}</b></div>`:''}<div class="list-row"><small>Factures avec au moins un encaissement</small><b>${Number(m.invoiceCount||0)}</b></div><div class="list-row"><small>Solde indicatif (encaissé − coûts et frais − cotisations estimées)</small><b>${money(Math.round((Number(m.revenueHt||0)-Number(m.purchases||0)-Number(m.social||0))*100)/100)}</b></div></div>`:'<p class="muted">Aucun mouvement enregistré ce mois-ci.</p>'}</details>`}).join('')||'<p class="muted">Les données mensuelles apparaîtront ici dès votre première facture.</p>'}</section>`},
bind(){
  const $=s=>document.querySelector(s);
  $('#acc-year').addEventListener('change',ev=>{S.accountingYear=Number(ev.target.value);hooks.refresh('accounting')});
  bindExpenses();
  const year=()=>S.accountingYear||new Date().getFullYear();$('#acc-csv').addEventListener('click',async()=>{try{const r=await api.authFetch(`/accounting/report.csv?year=${encodeURIComponent(year())}`,{headers:getActiveActivity()?{'x-aurion-activity-id':getActiveActivity()}: {}});if(!r.ok)throw new Error('Téléchargement comptable impossible.');const a=document.createElement('a');a.href=URL.createObjectURL(await r.blob());a.download=`aurion-comptabilite-${year()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);toast('CSV comptable téléchargé','success')}catch(x){toast(x.message,'error')}});
}};



// ------------------------------------------------------------------ archives de documents
// ------------------------------------------------------------------ modèles de documents
// 15.4.56 — huit modèles natifs présentés en carrousel 3D (défilement horizontal, transformation
// « coverflow » pilotée par le défilement, aperçu visuel par style plutôt qu'un descriptif texte).
// Les PDF d'aperçu de chaque modèle sont générés par le même moteur de mise en page que les
// documents réels : l'aperçu correspond au rendu final.
const TEMPLATE_STYLES=[
 ['aurion-minimal','Minimal','Monochrome encre · filets fins, aucun encart · total aligné à droite'],
 ['aurion-classic','Classique','Cartes claires · en-tête de tableau navy · total dans un bloc bleu marine'],
 ['aurion-signature','Signature','Bandeau foncé chaleureux · typographie serif · encarts crème · total sur fond doré'],
 ['aurion-horizon','Horizon','Émeraude profonde · bandeau d’en-tête foncé · encarts clairs · total sur fond accent'],
 ['aurion-orchidee','Orchidée','Violet raffiné · typographie serif · encarts clairs bordés · total sur fond accent'],
 ['aurion-encre','Encre','Graphite carré · minimal · aucun encart · total sobre aligné à droite'],
 ['aurion-corail','Corail','Chaleur corail · cartes carrées · en-tête de tableau coloré · total dans un bloc accent'],
 ['aurion-glacier','Glacier','Bleu glacier · minimal · filets fins · total sobre sur fond accent'],
];
export const templates={view(){
 const ch=S.templateChoices||{quote:'aurion-classic',invoice:'aurion-classic'};
 const carousel=type=>`<div class="template-carousel" data-carousel="${type}"><button type="button" class="template-carousel-arrow" data-carousel-dir="-1" aria-label="Modèles précédents">‹</button><div class="template-track">${TEMPLATE_STYLES.map(([id,n,d])=>`<article class="template-card ${ch[type]===id?'selected':''}" data-style="${id}"><span class="template-preview ${id}"><b>AURION</b><i>${type==='invoice'?'FACTURE':'DEVIS'}</i><small>${e(n)} · Client · prestation</small><strong>1 250,00 €</strong></span><span class="template-copy"><b>${n}</b><small>${d}</small></span><span class="template-actions"><button type="button" class="btn ${ch[type]===id?'primary':'secondary'} small template-select" data-template-type="${type}" data-template-style="${id}">${ch[type]===id?'Modèle utilisé':'Utiliser ce modèle'}</button><a class="btn secondary small" href="./assets/templates/${type}-${id}.pdf" target="_blank" rel="noopener">Aperçu PDF</a><a class="btn secondary small" href="./assets/templates/${type}-${id}.pdf" download="aurion-${type}-${id}.pdf">Télécharger</a></span></article>`).join('')}</div><button type="button" class="template-carousel-arrow" data-carousel-dir="1" aria-label="Modèles suivants">›</button></div>`;
 return`<div class="page-head"><div><span class="eyebrow">BIBLIOTHÈQUE</span><h1>Modèles de documents</h1><p>Choisissez parmi les huit modèles natifs Aurion pour les devis et les factures — faites défiler le carrousel, visualisez chaque style, puis ouvrez ou téléchargez son aperçu PDF.</p></div></div>
 <section class="panel stack"><div class="section-title"><h2>Devis</h2><span class="pill">Choix indépendant</span></div>${carousel('quote')}
 <div class="section-title"><h2>Factures</h2><span class="pill">Choix indépendant</span></div>${carousel('invoice')}<p id="template-choice-status" class="help">Le choix est appliqué aux prochains documents et peut être modifié à tout moment.<span id="template-conversion-status"></span></p></section>
 <section class="panel template-drop stack"><div class="section-title"><h2>Modèles personnels</h2></div><p class="muted">Vous pouvez toujours importer votre propre modèle Word ou ODT si vous souhaitez conserver votre mise en page. Aurion remplacera les champs pris en charge sans télécharger les modèles natifs Aurion.</p><div class="drop-zone" id="template-drop"><strong>Glissez-déposez votre modèle ici</strong><span>ou sélectionnez un fichier .docx / .odt</span><input id="template-file" type="file" accept=".docx,.odt" hidden></div><div class="grid-2"><label class="field"><span>Type</span><select id="template-type"><option value="">Votre choix</option><option value="quote">Devis</option><option value="invoice">Facture</option></select></label><label class="field"><span>Activité</span><select id="template-activity"><option value="">Votre choix</option><option value="__all__">Toutes les activités</option>${S.activities.map(a=>`<option value="${a.id}">${e(a.name)}</option>`).join('')}</select></label></div><div class="template-help"><b>Champs disponibles</b>${(S.tplFields||[]).map(k=>`<code>{{${k}}}</code>`).join('')}</div></section>
 <section class="panel"><div class="section-title"><h2>Modèles personnels actifs</h2></div>${S.templates.map(t=>`<div class="list-row"><div><b>${e(t.name)}</b><small>${t.document_type==='invoice'?'Facture':'Devis'} · ${e(S.activities.find(a=>a.id===t.activity_id)?.name||'Toutes les activités')}</small></div><div class="button-row"><span class="pill">${t.mime_type.includes('word')?'DOCX':'ODT'}</span><button class="btn danger small delete-template" data-id="${t.id}">Supprimer</button></div></div>`).join('')||'<div class="empty">Aucun modèle personnel : la mise en page native Aurion est utilisée.</div>'}</section>`},
 async bind(){
  $$('.template-select').forEach(b=>b.onclick=async()=>{const type=b.dataset.templateType,style=b.dataset.templateStyle;const next={quote:S.templateChoices?.quote||'aurion-classic',invoice:S.templateChoices?.invoice||'aurion-classic'};next[type]=style;try{S.templateChoices=await api.saveDocumentTemplateChoices(next);toast('Modèle enregistré','success');hooks.show('templates')}catch(x){toast(x.message,'error')}});
  // Carrousel 3D : chaque carte est inclinée (rotateY) et mise en profondeur (translateZ) selon
  // sa distance au centre du rail de défilement ; les flèches font défiler d'une carte.
  const carousels=[...document.querySelectorAll('[data-carousel]')];
  const apply3D=carousel=>{const track=carousel.querySelector('.template-track');if(!track)return;const mid=track.scrollLeft+track.clientWidth/2;track.querySelectorAll('.template-card').forEach(card=>{const c=card.offsetLeft+card.offsetWidth/2;const d=Math.max(-1,Math.min(1,(c-mid)/Math.max(1,track.clientWidth)));card.style.transform=`rotateY(${(-d*26).toFixed(2)}deg) translateZ(${((1-Math.abs(d))*64).toFixed(1)}px) scale(${(1-Math.abs(d)*0.08).toFixed(3)})`;card.style.opacity=String(1-Math.abs(d)*0.3)})};
  carousels.forEach(carousel=>{const track=carousel.querySelector('.template-track');track.addEventListener('scroll',()=>apply3D(carousel),{passive:true});carousel.querySelectorAll('.template-carousel-arrow').forEach(btn=>btn.addEventListener('click',()=>{const card=track.querySelector('.template-card');const step=card?card.offsetWidth+18:280;track.scrollBy({left:step*Number(btn.dataset.carouselDir||1),behavior:'smooth'})}));apply3D(carousel)});
  const onCarouselResize=()=>carousels.forEach(apply3D);window.addEventListener('resize',onCarouselResize);
  const input=document.querySelector('#template-file'),drop=document.querySelector('#template-drop');
  const up=async f=>{if(!f)return;try{const selectedActivity=document.querySelector('#template-activity').value||'';const activityId=selectedActivity==='__all__'?'':selectedActivity;const r=await api.uploadTemplate(f,document.querySelector('#template-type').value,activityId||null);toast(`Modèle enregistré : ${r.fields?.length||0} champ(s) détecté(s).`,r.unknown?.length?'info':'success');if(S.tplStatus&&!S.tplStatus.libreOffice)toast('Conversion PDF indisponible sur ce serveur : votre modèle s’appliquera aux formats Word/ODT ; le PDF reste au modèle natif tant que LibreOffice n’est pas installé.','info');await hooks.refresh('templates',{navigation:true})}catch(x){toast(x.message,'error')}};
  input.addEventListener('change',ev=>up(ev.target.files?.[0]));drop.addEventListener('click',ev=>{if(ev.target===input)return;input.click()});drop.addEventListener('dragover',ev=>{ev.preventDefault();drop.classList.add('dragover')});drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));drop.addEventListener('drop',ev=>{ev.preventDefault();drop.classList.remove('dragover');up(ev.dataTransfer.files?.[0])});
  $$('.delete-template').forEach(b=>b.onclick=()=>confirmDelete('Supprimer ce modèle ? Les prochains documents utiliseront la mise en page native Aurion.',()=>api.deleteTemplate(b.dataset.id),'Modèle supprimé'));
  if(!S.tplStatus){try{const st=await api.templateStatus();S.tplStatus=st;S.tplFields=st.fields}catch{}} if(!S.templateChoices){try{S.templateChoices=await api.documentTemplateChoices();if(S.view==='templates')hooks.show('templates')}catch{}}
  // 15.4.56 — statut de conversion visible : l'utilisateur sait si son modèle téléversé peut
  // devenir le PDF final (LibreOffice présent sur le serveur) ou si le PDF reste natif.
  const convStatus=document.querySelector('#template-conversion-status');
  if(convStatus&&S.tplStatus)convStatus.textContent=S.tplStatus.libreOffice?' Conversion des modèles téléversés en PDF : disponible sur ce serveur.':' Conversion PDF indisponible sur ce serveur : vos modèles téléversés s’appliquent aux documents Word/ODT, le PDF reste au modèle natif tant que LibreOffice n’est pas installé.';
 }};

export const treasury={
 view(){return`<div class="page-head"><div><span class="eyebrow">PILOTAGE</span><h1>Trésorerie prévisionnelle</h1><p>Le scénario de facturation estimée et les flux déjà identifiés sont présentés séparément. Les valeurs sont calculées automatiquement à partir des données de l’activité.</p></div></div><div id="treasury-body"><p class="muted">Chargement…</p></div>`},
 async bind(){const root=document.querySelector('#treasury-body');try{const t=await api.treasury();const rows=(t.rows||[]).map(q=>'<div class="list-row"><div><b>'+e(q.number)+'</b><small>Devis · '+e(q.status||'')+' · '+new Date(q.created_at).toLocaleDateString('fr-FR')+'</small></div><div><b>'+money(q.total_ttc)+'</b><small>Sortie matériel : '+money(q.purchase_ht||0)+' HT</small></div></div>').join('')||'<p class="muted">Aucun devis prévisionnel.</p>';root.innerHTML=await forecastPanelMarkup('treasury',S.quotes,active())+'<section class="panel treasury-known-flows"><div class="section-title"><div><h2>Flux déjà identifiés</h2>'+(!navigator.onLine?'<span class="pill" data-freshness>hors connexion — état local</span>':'')+'<p class="help">Devis ouverts TTC diminués des SAV financiers ; sorties calculées à partir des devis ouverts et factures non soldées. Ces montants ne sont pas ajoutés automatiquement au scénario hypothétique.</p></div></div><div class="metrics"><article><span>Créances restantes (engagé)</span><b id="trez-committed-in">'+money(t.committedIn||0)+'</b><small>reste dû des factures non soldées, TTC, majorations et paiements déduits</small></article><article><span>Devis ouverts (potentiel)</span><b id="trez-potential-in">'+money(t.potentialIn||0)+'</b><small>jamais mélangés aux encaissements certains</small></article><article><span>Sorties prévues</span><b id="trez-outputs">'+money(t.forecastOutputs||0)+'</b><small>coûts directs et provisions'+(Number(t.committedOut||0)>0?', dont '+money(t.committedOut)+' de notes de frais':'')+'</small></article><article><span>Solde engagé (hors potentiel)</span><b id="trez-committed-net">'+money(t.committedNet||0)+'</b><small>créances moins sorties prévues</small></article><article><span>SAV</span><b id="trez-sav">'+money(t.savTotal||0)+'</b><small>compté séparément, jamais ajouté aux créances</small></article></div></section><section class="panel"><div class="section-title"><h2>Devis prévisionnels par document</h2></div>'+rows+'</section>';bindForecastFixedCosts(root,'treasury',S.quotes,active())}catch(x){root.innerHTML='<p class="error">'+e(x.message)+'</p>'}}
};

export const support={
 view(){return`<div class="page-head"><div><span class="eyebrow">ASSISTANCE</span><h1>Support Aurion</h1><p>Créez un ticket, suivez son statut, complétez-le et téléchargez son historique en PDF.</p></div></div><section class="panel stack"><div class="grid-2"><label class="field"><span>Problème / catégorie</span><select id="support-category"><option value="">Votre choix</option></select></label><label class="field"><span>Compte</span><input id="support-email" value="Chargement…" readonly></label></div><label class="field"><span>Décrivez votre problème</span><textarea id="support-message" rows="7" maxlength="10000"></textarea></label><div class="button-row"><button class="btn primary" id="send-support">Créer le ticket →</button></div><p id="support-status" class="help"></p></section><section class="panel"><div class="section-title"><h2>Mes tickets</h2></div><div id="support-tickets"><p class="muted">Chargement…</p></div></section>`},
 async bind(){
  const cat=document.querySelector('#support-category'),status=document.querySelector('#support-status'),list=document.querySelector('#support-tickets');
  const labels={open:'Ouvert',in_progress:'En cours',waiting_user:'En attente utilisateur',waiting_provider:'En attente fournisseur',closed:'Fermé',resolved:'Clos',duplicate:'Doublons',email_failed:'Ouvert'};
  const tone=x=>x==='open'||x==='in_progress'?'ok':x==='resolved'?'muted':x==='waiting_user'?'warn':x==='waiting_provider'?'info':'danger';
  const render=async()=>{const tickets=await api.supportTickets();list.innerHTML=tickets.map(t=>`<article class="support-ticket"><div class="section-title"><div><b>${e(t.number)}</b><small>${e(t.category)} · ${new Date(t.created_at).toLocaleString('fr-FR')}</small></div><span class="pill ${tone(t.status)}">${labels[t.status]||t.status}</span></div><p>${e(t.message)}</p><div class="support-thread">${(t.messages||[]).map(m=>`<div class="support-message ${m.author_type}"><small>${m.author_type==='admin'?'Aurion':m.author_type==='system'?'Système':'Vous'} · ${new Date(m.created_at).toLocaleString('fr-FR')}</small><div>${e(m.message)}</div></div>`).join('')}</div><div class="button-row"><button class="btn secondary small support-edit" data-id="${t.id}">Modifier</button><button class="btn danger small support-delete" data-id="${t.id}">Supprimer</button><a class="btn secondary small" href="${api.supportTicketPdfUrl(t.id)}" target="_blank" rel="noopener">PDF</a>${!['resolved','duplicate'].includes(t.status)?`<input class="support-reply" data-id="${t.id}" placeholder="Ajouter une information…"><button class="btn secondary small support-send" data-id="${t.id}">Répondre</button>`:''}</div></article>`).join('')||'<p class="muted">Aucun ticket.</p>';
    list.querySelectorAll('.support-delete').forEach(b=>b.onclick=async()=>{if(!await askConfirm({title:'Supprimer le ticket ?',message:'Cette action supprime définitivement le ticket et son historique. Cette action est irréversible.',confirmLabel:'Supprimer',danger:true}))return;try{await api.deleteSupportTicket(b.dataset.id);await render();toast('Ticket supprimé','success')}catch(x){status.textContent=x.message}});
    list.querySelectorAll('.support-send').forEach(b=>b.onclick=async()=>{const i=list.querySelector(`.support-reply[data-id="${b.dataset.id}"]`);if(!i.value.trim())return;try{await api.addSupportMessage(b.dataset.id,i.value.trim());i.value='';await render()}catch(x){status.textContent=x.message}});
    list.querySelectorAll('.support-edit').forEach(b=>b.onclick=async()=>{const t=await api.supportTicket(b.dataset.id);const cats=await api.supportCategories();modalForm(`Modifier ${e(t.ticket.number)}`,`<label class="field"><span>Problème / catégorie</span><select id="edit-category" class="support-edit-form-select"><option value="">Votre choix</option>${cats.map(c=>`<option value="${e(c)}" ${c===t.ticket.category?'selected':''}>${e(c==='Compte et connexion'?'Problème détecté':c)}</option>`).join('')}</select></label><label class="field"><span>Demande</span><textarea id="edit-message" rows="8" placeholder="Décrivez votre demande…">${e(t.ticket.message)}</textarea></label>`,async m=>{await api.updateSupportTicket(t.ticket.id,{category:m.querySelector('#edit-category').value,message:m.querySelector('#edit-message').value});await render()},{label:'Enregistrer'});});
  };
  try{const a=await api.account();document.querySelector('#support-email').value=a.user?.email||'';const c=await api.supportCategories();const categories=Array.isArray(c)?c:(c.categories||[]);cat.innerHTML='<option value="">Votre choix</option>'+categories.map(x=>`<option value="${e(x)}">${e(x==='Compte et connexion'?'Problème détecté':x)}</option>`).join('');await render()}catch(x){status.textContent=x.message}
  document.querySelector('#send-support').onclick=async()=>{const category=cat.value,message=document.querySelector('#support-message').value.trim();if(!category||message.length<5){status.textContent='Choisissez un problème et décrivez votre demande.';return}try{const r=await api.createSupportTicket({category,message});status.textContent=r.duplicateOf?`Ticket ${r.number} classé comme doublon de ${r.duplicateOf}.`:`Ticket ${r.number} créé. Un e-mail de confirmation vous a été envoyé.`;document.querySelector('#support-message').value='';await render()}catch(x){status.textContent=x.message}}
 }};

let lastGuestInvite = null;
const adminCache = { values: {}, errors: {}, loadedAt: {} };
const adminLoaders = {
  stats: () => api.adminStats(),
  tickets: () => api.adminTickets(),
  guests: () => api.adminGuests(),
  billing: () => api.adminBillingPending(),
  deletions: () => api.adminAccountDeletions(),
};
function describeAdminError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 401) return 'Session expirée : reconnectez-vous puis réessayez.';
  if (status === 403) return 'Accès refusé : ce compte ne dispose pas des droits administrateur.';
  if (status === 404) return 'Cette section ou cette route est indisponible sur la version du serveur.';
  if (status === 429) return 'Trop de requêtes : patientez un instant puis réessayez.';
  if (status >= 500) return 'Le serveur Aurion a rencontré une erreur. Les autres sections restent disponibles.';
  if (status === 0) return 'Serveur Aurion injoignable : vérifiez la connexion réseau.';
  return String(error?.message || 'Erreur inconnue lors du chargement de cette section.');
}
function adminSectionState(key) {
  const error = adminCache.errors[key];
  const loadedAt = adminCache.loadedAt[key];
  if (!error) return '';
  const stale = loadedAt
    ? `<small class="help">Les dernières données reçues datent du ${new Date(loadedAt).toLocaleString('fr-FR')} ; elles sont conservées.</small>`
    : '<small class="help">Aucune donnée précédente disponible pour cette section.</small>';
  return `<div class="notice warn-notice" role="alert"><b>${e(describeAdminError(error))}</b>${stale}<div class="button-row"><button class="btn secondary small admin-section-retry" type="button" data-section="${key}">Réessayer</button></div></div>`;
}

export const admin = {
  view() {
    return `<div class="page-head"><div><span class="eyebrow">ADMINISTRATION</span><h1>Pilotage Aurion</h1><p>Accès réservé au compte administrateur.</p></div></div><div id="admin-body" aria-live="polite"><p class="muted">Chargement…</p></div>`;
  },
  async bind(retrySection = null) {
    const root = document.querySelector('#admin-body');
    if (!root) return;
    const keys = retrySection === 'withdrawals'
      ? []
      : retrySection === 'failed'
        ? Object.keys(adminLoaders).filter(key => adminCache.errors[key])
        : (retrySection && adminLoaders[retrySection] ? [retrySection] : Object.keys(adminLoaders));
    await Promise.all(keys.map(async key => {
      try {
        const value = await adminLoaders[key]();
        adminCache.values[key] = value;
        adminCache.errors[key] = null;
        adminCache.loadedAt[key] = Date.now();
      } catch (error) {
        adminCache.errors[key] = error;
      }
    }));

    const s = adminCache.values.stats || {};
    const tickets = Array.isArray(adminCache.values.tickets) ? adminCache.values.tickets : [];
    const guests = adminCache.values.guests || { guests: [], invites: [] };
    const billing = adminCache.values.billing || { requests: [] };
    const deletions = adminCache.values.deletions || { requests: [], history: [], pending: 0, total: 0 };
    const label = { open: 'Ouvert', in_progress: 'En cours', waiting_user: 'En attente utilisateur', waiting_provider: 'En attente fournisseur', closed: 'Fermé', resolved: 'Clos', duplicate: 'Doublons', email_failed: 'Ouvert' };
    const statsReady = !!adminCache.values.stats;
    const ticketsReady = Array.isArray(adminCache.values.tickets);
    const guestsReady = !!adminCache.values.guests;
    const billingReady = !!adminCache.values.billing;
    const deletionsReady = !!adminCache.values.deletions;
    const delStatus = { pending: 'En attente', processing: 'En cours', processed: 'Traitée', cancelled: 'Annulée', rejected: 'Rejetée' };
    const formatAverage = value => Number(value || 0).toFixed(1);

    root.innerHTML = `
      <section class="panel" data-admin-section="stats">
        ${adminSectionState('stats')}
        ${statsReady ? `<div class="metrics">
          <article><span>Entreprises / organisations</span><b>${Number(s.organizations || 0)}</b></article>
          <article><span>Comptes utilisateurs</span><b>${Number(s.users || 0)}</b></article>
          <article><span>Accès gratuits (admin / VIP)</span><b>${Number(s.free || 0)}</b><small>${Number(s.freeBreakdown?.adminOnly || 0)} admin · ${Number(s.freeBreakdown?.vipOnly || 0)} VIP · ${Number(s.freeBreakdown?.adminAndVip || 0)} mixtes</small></article>
          <article><span>Sans facturation (accès libre)</span><b>${Number(s.noBilling || 0)}</b><small>aucun abonnement ni essai</small></article>
          <article><span>Essais en cours</span><b>${Number(s.trial || 0)}</b></article>
          <article><span>Abonnements mensuels actifs</span><b>${Number(s.monthly || 0)}</b></article>
          <article><span>Abonnements annuels actifs</span><b>${Number(s.yearly || 0)}</b></article>
          <article><span>Résiliations programmées</span><b>${Number(s.cancelScheduled || 0)}</b></article>
          <article><span>Accès expirés</span><b>${Number(s.expired || 0)}</b></article>
          <article><span>Entreprises sans statut classé</span><b>${Number(s.other || 0)}</b></article>
          <article><span>Conversion des essais terminés</span><b>${Number(s.conversionRate || 0)} %</b><small>${Number(s.conversionCohort?.converted || 0)} / ${Number(s.conversionCohort?.completed || 0)} essais terminés</small></article>
          <article><span>Créations d’entreprises / mois</span><b>${formatAverage(s.averages?.month)}</b></article>
          <article><span>Créations d’entreprises / semaine</span><b>${formatAverage(s.averages?.week)}</b></article>
          <article><span>Créations d’entreprises / jour</span><b>${formatAverage(s.averages?.day)}</b></article>
        </div><div class="section-title"><h2>Estimation des créations d’entreprises</h2></div>
        <p>À partir des deux derniers mois complets : <b>${Number(s.predictions?.nextMonth || 0)}</b> créations estimées le mois prochain et <b>${Number(s.predictions?.nextYear || 0)}</b> sur douze mois. Cette estimation est indicative.</p>
        <small class="muted">${e(s.note || '')}</small>` : '<p class="muted">Les indicateurs ne sont pas disponibles.</p>'}
      </section>

      <section class="panel" data-admin-section="tickets">
        ${adminSectionState('tickets')}
        <h2>Tickets</h2>
        ${ticketsReady ? (tickets.map(x => `<article class="support-ticket">
          <div class="section-title"><div><b>${e(x.number)}</b><small>${e(x.user_email)} · ${e(x.category)} · ${new Date(x.created_at).toLocaleString('fr-FR')}</small></div>
          <select class="admin-status status-${e(x.status)}" data-id="${e(x.id)}"><option value="">Votre choix</option>${['open', 'in_progress', 'waiting_user', 'waiting_provider', 'closed', 'resolved', 'duplicate'].map(k => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${label[k]}</option>`).join('')}</select></div>
          <p>${e(x.message)}</p><div class="support-thread">${(x.messages || []).map(m => `<div class="support-message ${e(m.author_type)}"><small>${m.author_type === 'admin' ? 'Vous (admin)' : m.author_type === 'system' ? 'Système' : 'Utilisateur'} · ${new Date(m.created_at).toLocaleString('fr-FR')}</small><div>${e(m.message)}</div></div>`).join('')}</div>
          <div class="button-row"><input class="admin-reply" data-id="${e(x.id)}" placeholder="Répondre au ticket…"><button class="btn secondary small admin-send" data-id="${e(x.id)}">Envoyer</button><button class="btn danger small admin-delete" data-id="${e(x.id)}">Supprimer</button></div>
        </article>`).join('') || '<p class="muted">Aucun ticket.</p>') : '<p class="muted">Les tickets ne sont pas disponibles.</p>'}
      </section>

      <section class="panel" data-admin-section="billing">
        ${adminSectionState('billing')}
        <div class="section-title"><h2>Virements à confirmer</h2><span class="muted">Activation manuelle après réception bancaire</span></div>
        ${billingReady ? ((billing.requests || []).map(x => `<div class="list-row"><div><b>${e(x.reference)}</b><small>${e(x.organization_name)} · ${e(x.plan_code)} · ${(Number(x.amount_ttc_cents) / 100).toFixed(2).replace('.', ',')} € TTC</small></div><button class="btn primary small admin-billing-confirm" data-id="${e(x.id)}">Confirmer le paiement</button></div>`).join('') || '<p class="muted">Aucun virement en attente.</p>') : '<p class="muted">Les informations de cette section ne sont pas disponibles.</p>'}
      </section>

      <section class="panel" data-admin-section="guests">
        ${adminSectionState('guests')}
        <div class="section-title"><div><h2>Invités VIP</h2><small>Création gratuite et sans limite de durée · réservé à l’administrateur</small></div><button class="btn secondary small" id="guest-pdf">Télécharger la liste PDF</button></div>
        ${guestsReady ? `<div class="button-row"><input id="guest-email" type="email" placeholder="email@invite.fr"><button class="btn primary small" id="guest-invite">Inviter</button></div>
          ${lastGuestInvite ? `<div class="notice warn-notice" id="guest-invite-link"><b>L’e-mail n’a pas été confirmé comme envoyé.</b><p class="help">L’invitation reste enregistrée. Copiez et transmettez ce lien à son destinataire avant son expiration.</p><input id="guest-invite-url" value="${e(lastGuestInvite)}" readonly aria-label="Lien d’invitation VIP"><button class="btn secondary small" id="guest-copy-link" type="button">Copier le lien</button></div>` : ''}
          <div class="list">${(guests.guests || []).map(x => `<div class="list-row"><div><b>${e(x.full_name || 'Invité VIP')}</b><small>${e(x.email)} · depuis ${new Date(x.vip_created_at || x.created_at).toLocaleDateString('fr-FR')}</small></div><span class="pill">VIP gratuit</span></div>`).join('') || '<p class="muted">Aucun compte VIP invité.</p>'}</div>
          <div class="list"><h3>Invitations</h3>${(guests.invites || []).map(x => `<div class="list-row"><div><b>${e(x.email)}</b><small>${x.accepted_at ? `Compte créé le ${new Date(x.accepted_at).toLocaleString('fr-FR')}` : `Créée le ${new Date(x.created_at).toLocaleString('fr-FR')} · expire le ${new Date(x.expires_at).toLocaleDateString('fr-FR')}`} · ${x.email_sent_at ? 'e-mail envoyé' : x.email_error_code ? `e-mail non envoyé (${e(x.email_error_code)})` : 'envoi non confirmé'}</small></div><span class="pill">${x.accepted_at ? 'Acceptée' : 'En attente'}</span></div>`).join('') || '<p class="muted">Aucune invitation.</p>'}</div>` : '<p class="muted">Les invitations VIP ne sont pas disponibles.</p>'}
      </section>

      <section class="panel" data-admin-section="deletions">
        ${adminSectionState('deletions')}
        <div class="section-title"><div><h2>Demandes de suppression de compte</h2><small>Traitement réservé à l’administrateur · chaque décision est journalisée avec une référence d’audit</small></div><span class="pill">${Number(deletions.pending || 0)} en attente</span></div>
        ${deletionsReady ? `<p class="help">« Traiter » exécute réellement la suppression : sessions révoquées, secrets d’intégration supprimés, espaces mono-utilisateur fermés, compte effacé. Traitement idempotent et relançable en cas d’échec technique. « Rejeter » exige un motif communiqué à l’utilisateur.</p>
        ${(deletions.requests || []).map(x => `<article class="support-ticket">
          <div class="section-title"><div><b>${e(x.email || 'Compte effacé')}</b><small>${e(x.organizationName || '—')} · source ${e(x.source || 'app')} · demandée le ${new Date(x.requestedAt).toLocaleString('fr-FR')} · ${Number(x.organizationCount || 0)} espace(s)</small></div>
          <span class="pill">${delStatus[x.status] || x.status}</span></div>
          ${x.reason ? `<p class="muted">Motif : ${e(x.reason)}</p>` : ''}
          ${(x.attempts || x.lastError || x.processingStartedAt) ? `<p class="help" role="status">Tentatives : ${Number(x.attempts || 0)}${x.processingStartedAt ? ` · traitement réservé depuis le ${new Date(x.processingStartedAt).toLocaleString('fr-FR')}` : ''}${x.lastStep ? ` · dernière étape : ${e(x.lastStep)}` : ''}${x.lastError ? ` · dernière erreur : ${e(String(x.lastError).slice(0, 200))}` : ''}</p>` : ''}
          ${(x.status === 'processed' || x.status === 'rejected') ? `<p class="muted">Décision du ${new Date(x.processedAt).toLocaleString('fr-FR')} · référence d’audit ${e(x.auditReference || '—')}${x.rejectionReason ? ` · motif du rejet : ${e(x.rejectionReason)}` : ''}</p>` : ''}
          ${x.status === 'pending' ? `<div class="button-row"><button class="btn primary small admin-del-process" data-id="${e(x.id)}">Traiter la suppression</button><button class="btn secondary small admin-del-reject" data-id="${e(x.id)}">Rejeter (motif requis)</button></div>` : ''}
        </article>`).join('') || '<p class="muted">Aucune demande de suppression.</p>'}
        ${(deletions.history || []).length ? `<h3>Historique des traitements (trace minimale, aucune donnée personnelle en clair)</h3>
        <div class="list">${deletions.history.map(h => `<div class="list-row"><div><b>${e(h.auditReference)}</b><small>${h.finalStatus === 'processed' ? 'Suppression traitée' : 'Demande rejetée'} · ${h.processedAt ? new Date(h.processedAt).toLocaleString('fr-FR') : '—'} · ${Number(h.organizationsClosed || 0)} espace(s) fermé(s) · ${Number(h.sessionsRevoked || 0)} session(s) révoquée(s)</small></div><span class="pill">${h.finalStatus === 'processed' ? 'Traitée' : 'Rejetée'}</span></div>`).join('')}</div>` : ''}` : '<p class="muted">Les demandes de suppression ne sont pas disponibles.</p>'}
      </section>`;

    root.querySelectorAll('.admin-section-retry').forEach(button => {
      button.onclick = () => admin.bind(button.dataset.section);
    });
    root.querySelectorAll('.admin-billing-confirm').forEach(button => button.onclick = async () => {
      if (!await askConfirm({ title: 'Confirmer le virement ?', message: 'Confirmer la réception de ce virement et activer l’abonnement ?', confirmLabel: 'Confirmer le paiement' })) return;
      try { await api.adminConfirmBilling(button.dataset.id); toast('Paiement confirmé', 'success'); await admin.bind(); }
      catch (error) { toast(error.message, 'error'); }
    });
    root.querySelectorAll('.admin-del-process').forEach(button => button.onclick = async () => {
      if (!await askConfirm({ title: 'Traiter la suppression de ce compte ?', message: 'La suppression réelle sera exécutée : sessions révoquées, secrets supprimés, espaces mono-utilisateur fermés, compte effacé. Action idempotente et journalisée, avec trace d’audit.', confirmLabel: 'Traiter la suppression', danger: true })) return;
      button.disabled = true; button.textContent = 'Traitement…';
      try { const r = await api.adminProcessAccountDeletion(button.dataset.id); toast(r.alreadyProcessed ? 'Demande déjà traitée.' : `Suppression traitée. Référence d’audit : ${r.auditReference || '—'}.`, 'success'); await admin.bind(); }
      catch (error) { button.disabled = false; button.textContent = 'Traiter la suppression'; toast(error.message || 'Traitement impossible.', 'error'); }
    });
    root.querySelectorAll('.admin-del-reject').forEach(button => button.onclick = () => {
      const m = modalForm('Rejeter la demande de suppression',
        `<label class="field"><span>Motif du rejet (communiqué à l’utilisateur)</span><textarea name="rejectReason" rows="3" minlength="3" maxlength="2000" required></textarea></label>`,
        async modal => {
          const f = new FormData(modal.querySelector('#generic-form'));
          try { const r = await api.adminRejectAccountDeletion(button.dataset.id, String(f.get('rejectReason') || '').trim()); m.remove(); toast(`Demande rejetée. Référence d’audit : ${r.auditReference || '—'}.`, 'success'); await admin.bind(); }
          catch (error) { const err = modal.querySelector('#generic-error'); if (err) { err.hidden = false; err.textContent = error.message || 'Rejet impossible.'; } }
        }, { label: 'Rejeter la demande', done: 'Demande rejetée' });
      m.querySelector('textarea[name="rejectReason"]')?.focus();
    });
    root.querySelectorAll('.admin-status').forEach(select => select.onchange = async () => {
      try { await api.adminTicketStatus(select.dataset.id, select.value); select.className = `admin-status status-${select.value}`; toast('Statut mis à jour', 'success'); }
      catch (error) { toast(error.message, 'error'); }
    });
    root.querySelectorAll('.admin-delete').forEach(button => button.onclick = async () => {
      if (!await askConfirm({ title: 'Supprimer ce ticket ?', message: 'Supprimer définitivement ce ticket et sa discussion ? Cette action est irréversible.', confirmLabel: 'Supprimer le ticket', danger: true })) return;
      try { await api.adminDeleteTicket(button.dataset.id); toast('Ticket supprimé', 'success'); await admin.bind(); }
      catch (error) { toast(error.message, 'error'); }
    });
    root.querySelectorAll('.admin-send').forEach(button => button.onclick = async () => {
      const input = root.querySelector(`.admin-reply[data-id="${button.dataset.id}"]`);
      if (!input?.value.trim()) return;
      try { await api.adminTicketMessage(button.dataset.id, input.value.trim()); input.value = ''; toast('Réponse envoyée', 'success'); await admin.bind(); }
      catch (error) { toast(error.message, 'error'); }
    });
    root.querySelector('#guest-invite')?.addEventListener('click', async () => {
      const input = root.querySelector('#guest-email');
      if (!input?.value.trim()) return;
      try {
        const result = await api.adminInviteGuest(input.value.trim());
        lastGuestInvite = result.emailSent ? null : (result.inviteUrl || null);
        input.value = '';
        if (result.existingAccount) toast('Accès VIP gratuit accordé au compte existant.', 'success');
        else if (result.emailSent) toast('Invitation VIP envoyée par e-mail.', 'success');
        else toast('E-mail non envoyé : invitation conservée. Le lien est affiché pour transmission manuelle.', 'warning');
        await admin.bind();
      } catch (error) { toast(error.message, 'error'); }
    });
    root.querySelector('#guest-copy-link')?.addEventListener('click', async () => {
      const input = root.querySelector('#guest-invite-url');
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(input?.value || lastGuestInvite || '');
        else { input?.focus(); input?.select(); document.execCommand('copy'); }
        toast('Lien d’invitation copié.', 'success');
      } catch { toast('Copie impossible : sélectionnez le lien et copiez-le manuellement.', 'warning'); }
    });
    root.querySelector('#guest-pdf')?.addEventListener('click', async () => {
      try {
        const response = await api.adminGuestsPdf();
        if (!response.ok) throw new Error('Téléchargement impossible.');
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(await response.blob());
        anchor.download = 'aurion-invites-vip.pdf';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(anchor.href), 10000);
      } catch (error) { toast(error.message, 'error'); }
    });

    if (root._adminOnlineRetry) window.removeEventListener('online', root._adminOnlineRetry);
    root._adminOnlineRetry = () => { if (root.isConnected) admin.bind(); };
    window.addEventListener('online', root._adminOnlineRetry, { once: true });
  },
};

const bindAdminBase = admin.bind.bind(admin);
const adminWithdrawalsCache = { requests: null, error: null, loadedAt: null };
function renderAdminRetryAll(root) {
  root.querySelector('[data-admin-retry-all]')?.remove();
  const failed = Object.keys(adminLoaders).filter(key => adminCache.errors[key]);
  if (adminWithdrawalsCache.error) failed.push('withdrawals');
  if (!failed.length) return;
  const labels = {
    stats: 'Statistiques', tickets: 'Tickets', guests: 'Invités VIP',
    billing: 'Virements en attente', withdrawals: 'Demandes de rétractation',
  };
  const notice = document.createElement('div');
  notice.className = 'notice warn-notice admin-retry-all-notice';
  notice.dataset.adminRetryAll = '';
  notice.innerHTML = `<b>${failed.length} section${failed.length > 1 ? 's' : ''} en échec.</b><p class="help">${failed.map(key => e(labels[key] || key)).join(' · ')}</p><button class="btn secondary small admin-retry-all" type="button">Tout réessayer</button>`;
  notice.querySelector('.admin-retry-all')?.addEventListener('click', () => admin.bind('failed'));
  root.prepend(notice);
}
admin.bind = async (retrySection = null) => {
  await bindAdminBase(retrySection);
  const root = document.querySelector('#admin-body');
  if (!root) return;

  if (!retrySection || retrySection === 'withdrawals' || (retrySection === 'failed' && adminWithdrawalsCache.error)) {
    try {
      const { requests = [] } = await api.adminWithdrawals();
      adminWithdrawalsCache.requests = requests;
      adminWithdrawalsCache.error = null;
      adminWithdrawalsCache.loadedAt = Date.now();
    } catch (error) {
      adminWithdrawalsCache.error = error;
    }
  }

  const previous = root.querySelector('[data-admin-withdrawals]');
  previous?.remove();
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.dataset.adminWithdrawals = '';
  if (adminWithdrawalsCache.error) {
    const stale = adminWithdrawalsCache.loadedAt
      ? `<small class="help">Les dernières demandes reçues datent du ${new Date(adminWithdrawalsCache.loadedAt).toLocaleString('fr-FR')} ; elles sont conservées.</small>`
      : '<small class="help">Aucune donnée précédente disponible pour cette section.</small>';
    panel.innerHTML = `<div class="section-title"><h2>Demandes de rétractation</h2></div><p class="error" role="alert">${e(describeAdminError(adminWithdrawalsCache.error))}</p>${stale}<button class="btn secondary small admin-withdrawals-retry" type="button">Réessayer</button>`;
  } else {
    const requests = adminWithdrawalsCache.requests || [];
    panel.innerHTML = `<div class="section-title"><div><h2>Demandes de rétractation</h2><p class="help">Traitement réservé à l’administrateur. Accusé envoyé : statut e-mail uniquement, le remboursement doit être contrôlé séparément.</p><small class="muted">Chargé à ${adminWithdrawalsCache.loadedAt ? new Date(adminWithdrawalsCache.loadedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}</small></div><span class="pill">${requests.length}</span></div>${requests.map(r => `<article class="support-ticket"><div class="section-title"><div><b>${e(r.first_name)} ${e(r.last_name)}</b><small>${e(r.email)} · reçue le ${new Date(r.submitted_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} · contrat du ${String(r.contract_date).slice(0, 10).split('-').reverse().join('/')}</small></div><select class="withdrawal-status" data-id="${e(r.id)}"><option value="received" ${r.status === 'received' ? 'selected' : ''}>Reçue</option><option value="reviewing" ${r.status === 'reviewing' ? 'selected' : ''}>À instruire</option><option value="processed" ${r.status === 'processed' ? 'selected' : ''}>Traitée</option><option value="rejected" ${r.status === 'rejected' ? 'selected' : ''}>Refusée — réponse à envoyer</option></select></div><p><b>Référence du contrat :</b> ${e(r.contract_reference)}</p><blockquote>${e(r.declaration_text)}</blockquote><small>Accusé e-mail : ${e(r.receipt_delivery_status)}${r.receipt_sent_at ? ` · envoyé le ${new Date(r.receipt_sent_at).toLocaleString('fr-FR')}` : r.receipt_error_code ? ` · ${e(r.receipt_error_code)}` : ''}</small>${r.receipt_delivery_status !== 'sent' ? `<div class="button-row"><button class="btn secondary small withdrawal-resend" data-id="${e(r.id)}">Renvoyer l’accusé</button></div>` : ''}</article>`).join('') || '<p class="muted">Aucune demande.</p>'}`;
  }
  root.append(panel);
  panel.querySelectorAll('.withdrawal-status').forEach(select => select.addEventListener('change', async () => {
    try { await api.adminWithdrawalStatus(select.dataset.id, select.value); toast('Statut de rétractation mis à jour.', 'success'); }
    catch (error) { toast(error.message, 'error'); }
  }));
  panel.querySelectorAll('.withdrawal-resend').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { await api.adminResendWithdrawalReceipt(button.dataset.id); toast('Accusé de réception envoyé.', 'success'); await admin.bind('withdrawals'); }
    catch (error) { toast(error.message || 'Envoi impossible.', 'error'); button.disabled = false; }
  }));
  panel.querySelector('.admin-withdrawals-retry')?.addEventListener('click', () => admin.bind('withdrawals'));
  renderAdminRetryAll(root);
};
