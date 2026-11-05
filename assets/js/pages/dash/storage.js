// Paramètres → Stockage (cloud personnel) et Logo de l'entreprise.
// Affiche en permanence : fournisseur, compte autorisé, état de connexion, espace total, utilisé, disponible estimé,
// espace des documents Aurion, date d'actualisation, éléments en attente et échecs, avec les actions
// « Actualiser le quota », « Reconnecter le cloud », « Déconnecter le cloud ».
import{api}from'../../core/api.js';
import{S,e,toast,askConfirm}from'./core.js';
import{queueItems,queueCounts,retryQueueItem,discardQueueItem,processCloudQueue,STATUS_LABELS}from'../../core/cloud-sync.js';

const bytes=n=>{if(n===null||n===undefined||!Number.isFinite(Number(n)))return'—';const u=['o','Ko','Mo','Go','To'];let v=Number(n),i=0;while(v>=1024&&i<u.length-1){v/=1024;i++}return`${v.toLocaleString('fr-FR',{maximumFractionDigits:i?1:0})} ${u[i]}`};
const LEVEL={ok:'Normal',warning:'Avertissement (80 %)',alert:'Alerte importante (90 %)',critical:'Situation critique (95 %)',full:'Stockage saturé',unknown:'Capacité totale non communiquée'};
const CONN={connected:['Connecté','ok'],not_connected:['Non connecté','warn'],disconnected:['Déconnecté','warn'],revoked:['Autorisation expirée ou révoquée','warn'],error:['Erreur','warn']};

export const storageSection=()=>`<section class="panel stack settings-section" id="settings-storage" data-settings-text="stockage cloud google drive quota espace documents synchronisation file d'attente">
  <div class="section-title"><div><h2>Stockage des documents</h2><small>Vos documents sont enregistrés dans votre cloud personnel. Aurion ne facture aucun stockage.</small></div><span class="chip" id="storage-chip">…</span></div>
  <div id="storage-body"><p class="muted" role="status">Chargement de l’état du stockage…</p></div>
</section>
<section class="panel stack settings-section" id="settings-logo" data-settings-text="logo image entreprise documents signature">
  <div class="section-title"><div><h2>Logo de l’entreprise</h2><small>Facultatif : PNG, JPEG ou WebP, 2 Mo au maximum. Le SVG n’est pas accepté.</small></div></div>
  <div class="ob-logo"><div class="ob-logo-preview" id="settings-logo-preview"><span class="muted">${S.company?.has_logo?'Chargement…':'Aucun logo'}</span></div>
  <form id="settings-logo-form" class="stack"><label class="field" for="settings-logo-file"><span>Choisir une image</span><input id="settings-logo-file" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="button-row"><button type="submit" class="btn primary">Enregistrer le logo</button><button type="button" class="btn secondary" id="settings-logo-remove" ${S.company?.has_logo?'':'hidden'}>Supprimer le logo</button></div><p class="help" id="settings-logo-status" role="status" aria-live="polite"></p></form></div>
</section>`;

async function paint(status){
  const root=document.querySelector('#storage-body'),chip=document.querySelector('#storage-chip');if(!root)return;
  const local=await queueCounts();const items=(await queueItems()).filter(x=>x.status!=='synced').slice(0,30);
  const st=status||{status:'not_connected',setup:{configured:false},quota:null,server:{pending:0,errors:0,conflicts:0}};
  const [label,tone]=CONN[st.status]||[st.status,'warn'];
  if(chip){chip.textContent=label;chip.className=`chip ${tone}`}
  const q=st.quota;const pct=q?.percentUsed;
  root.innerHTML=`<div class="storage-grid">
    <article><span>Fournisseur</span><b>${e(st.providerLabel||'Google Drive (non connecté)')}</b></article>
    <article><span>Compte autorisé</span><b>${e(st.accountEmail||'—')}</b></article>
    <article><span>État de connexion</span><b>${e(label)}</b></article>
    <article><span>Espace total</span><b>${q?.totalKnown?bytes(q.limitBytes):'Capacité totale non communiquée'}</b></article>
    <article><span>Utilisé sur le compte</span><b>${bytes(q?.usageBytes)}</b>${q?.usageInDriveBytes!=null?`<small class="help">dont Drive : ${bytes(q.usageInDriveBytes)}${q.trashBytes!=null?` · corbeille : ${bytes(q.trashBytes)}`:''}</small>`:''}</article>
    <article><span>Disponible (estimé)</span><b>${q?.availableBytes!=null?bytes(q.availableBytes):'—'}</b></article>
    <article><span>Documents envoyés par Aurion</span><b>${bytes(q?.aurionBytes)}</b><small class="help">selon les métadonnées Aurion</small></article>
    <article><span>Dernière actualisation</span><b>${q?.checkedAt?e(new Date(q.checkedAt).toLocaleString('fr-FR')):'Jamais'}</b>${q?.stale&&q?.checkedAt?'<small class="warn-text">Valeur potentiellement obsolète</small>':''}</article>
    <article><span>En attente sur cet appareil</span><b>${local.pending}</b><small class="help">${bytes(local.localBytes)} conservés localement</small></article>
    <article><span>Échecs de synchronisation</span><b>${local.errors+Number(st.server?.errors||0)}</b>${local.conflicts+Number(st.server?.conflicts||0)?`<small class="warn-text">${local.conflicts+Number(st.server?.conflicts||0)} conflit(s), versions conservées</small>`:''}</article>
  </div>
  <div class="stack"><div class="storage-meter" role="meter" aria-label="Espace utilisé sur le compte cloud" aria-valuemin="0" aria-valuemax="100" ${pct!=null?`aria-valuenow="${pct}" aria-valuetext="${pct} % utilisés"`:'aria-valuetext="Capacité totale non communiquée"'} data-level="${e(q?.level||'unknown')}"><i></i></div>
  <small class="help">${e(LEVEL[q?.level||'unknown']||'')}${pct!=null?` · ${pct.toLocaleString('fr-FR')} % utilisés`:''}${q?.error?' · dernière actualisation en échec, valeur précédente conservée':''}</small></div>
  ${st.setup?.configured===false?`<div class="notice warn-notice"><b>Connexion Google Drive non configurée sur ce serveur</b><small>Variables manquantes : ${(st.setup.missingConfiguration||[]).map(e).join(', ')}. Voir docs/CLOUD-STOCKAGE-15.4.0.md.</small></div>`:''}
  <div class="button-row"><button type="button" class="btn secondary" id="storage-refresh" ${st.status==='connected'?'':'disabled'}>Actualiser le quota</button><button type="button" class="btn secondary" id="storage-connect" ${st.setup?.configured===false?'disabled':''}>${st.status==='connected'?'Reconnecter le cloud':'Connecter Google Drive'}</button><button type="button" class="btn danger" id="storage-disconnect" ${['connected','revoked','error'].includes(st.status)?'':'disabled'}>Déconnecter le cloud</button><button type="button" class="btn secondary" id="storage-sync">Synchroniser maintenant</button></div>
  <div class="section-title"><h3>File d’attente de cet appareil</h3></div>
  <div class="queue-list" aria-live="polite">${items.map(x=>`<div class="queue-row"><div><b>${e(x.fileName)}</b><small>${e(STATUS_LABELS[x.status]||x.status)} · ${bytes(x.size)}${x.lastError?` · ${e(x.lastError)}`:''}</small></div><div class="button-row">${['error','pending'].includes(x.status)&&x.blob?`<button type="button" class="btn secondary small" data-retry="${e(x.clientRef)}">Relancer</button>`:''}${x.status!=='syncing'?`<button type="button" class="link-btn" data-discard="${e(x.clientRef)}">Retirer</button>`:''}</div></div>`).join('')||'<p class="muted">Aucun document en attente sur cet appareil.</p>'}</div>
  <p class="help">Un document n’est indiqué « Synchronisé » qu’après confirmation de Google Drive. La déconnexion supprime les autorisations stockées par Aurion sans effacer les fichiers déjà présents dans votre Drive.</p>`;
  const meter=root.querySelector('.storage-meter i');if(meter)meter.style.width=`${pct??0}%`;
  root.querySelector('#storage-refresh')?.addEventListener('click',async ev=>{ev.currentTarget.disabled=true;try{paint(await api.cloudRefreshQuota(true));toast('Quota actualisé.','success')}catch(x){toast(x.message,'error');ev.currentTarget.disabled=false}});
  root.querySelector('#storage-connect')?.addEventListener('click',async()=>{try{const r=await api.cloudStart('/dashboard');location.assign(r.url)}catch(x){toast(x.message,'error')}});
  root.querySelector('#storage-disconnect')?.addEventListener('click',async()=>{if(!await askConfirm({title:'Déconnecter le cloud ?',message:'Aurion supprimera ses autorisations d’accès à Google Drive. Les fichiers déjà présents dans votre Drive ne seront pas supprimés. Les documents en attente resteront sur cet appareil.',confirmLabel:'Déconnecter',danger:true}))return;try{await api.cloudDisconnect();toast('Cloud déconnecté.','success');paint(await api.cloudStatus())}catch(x){toast(x.message,'error')}});
  root.querySelector('#storage-sync')?.addEventListener('click',async()=>{await processCloudQueue({force:true});paint(await api.cloudStatus().catch(()=>st))});
  root.querySelectorAll('[data-retry]').forEach(b=>b.addEventListener('click',async()=>{await retryQueueItem(b.dataset.retry);paint(await api.cloudStatus().catch(()=>st))}));
  root.querySelectorAll('[data-discard]').forEach(b=>b.addEventListener('click',async()=>{if(!await askConfirm({title:'Retirer ce document de la file ?',message:'S’il n’a pas été synchronisé, la copie présente sur cet appareil sera définitivement perdue.',confirmLabel:'Retirer',danger:true}))return;await discardQueueItem(b.dataset.discard);paint(await api.cloudStatus().catch(()=>st))}));
}

async function bindLogo(){
  const preview=document.querySelector('#settings-logo-preview'),status=document.querySelector('#settings-logo-status'),remove=document.querySelector('#settings-logo-remove');
  if(!preview)return;
  const show=async()=>{try{const r=await api.organizationLogo();if(!r.ok)throw 0;preview.innerHTML=`<img alt="Logo de l’entreprise" src="${URL.createObjectURL(await r.blob())}">`;remove.hidden=false}catch{preview.innerHTML='<span class="muted">Aucun logo</span>';remove.hidden=true}};
  if(S.company?.has_logo)show();
  document.querySelector('#settings-logo-form')?.addEventListener('submit',async ev=>{ev.preventDefault();const f=document.querySelector('#settings-logo-file').files?.[0];if(!f){status.textContent='Choisissez une image.';return}if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>2*1024*1024){status.textContent='Image PNG, JPEG ou WebP de 2 Mo maximum.';return}try{await api.uploadOrganizationLogo(f);S.company={...S.company,has_logo:true};status.textContent='Logo enregistré.';toast('Logo enregistré.','success');show()}catch(x){status.textContent=x.message}});
  remove?.addEventListener('click',async()=>{try{await api.deleteOrganizationLogo();S.company={...S.company,has_logo:false};status.textContent='Logo supprimé.';show()}catch(x){status.textContent=x.message}});
}

export async function bindStorage(){
  bindLogo();
  let status=null;
  try{status=await api.cloudStatus()}catch{}
  await paint(status);
  // Actualisation du quota à l'ouverture des paramètres de stockage (limitée côté serveur à une lecture par minute).
  if(status?.status==='connected'){try{paint(await api.cloudRefreshQuota(false))}catch{}}
  const onQueue=()=>{if(document.querySelector('#storage-body'))api.cloudStatus().then(paint).catch(()=>paint(status))};
  window.removeEventListener('aurion:cloud-queue-changed',window.__aurionStorageListener||(()=>{}));
  window.__aurionStorageListener=onQueue;window.addEventListener('aurion:cloud-queue-changed',onQueue);
  if(location.hash.includes('cloud=connected')){toast('Google Drive connecté.','success');document.querySelector('#settings-storage')?.scrollIntoView({block:'start'})}
  if(location.hash.includes('cloud=refused'))toast('Autorisation Google Drive refusée : rien n’a été modifié.','info');
}
