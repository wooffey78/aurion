// Socle commun du tableau de bord : état, fenêtres modales, ouverture de documents.
import{api,getActiveActivity}from'../../core/api.js';
import{escapeHtml as e,formatMoney as money,toast}from'../../core/ui.js';
export{e,money,toast};

export const S={view:'home',company:null,activities:[],modules:[],clients:[],quotes:[],appointments:[],documents:[],templates:[],suppliers:[],parts:[],sav:[],interventions:[],devices:[],warranties:[],policies:[],accounting:null,treasury:null,profile:null,mail:null,timeMetrics:null,dashboardCounters:{tickets:0,unpaidCount:0,unpaidTotal:0,forecastEntries:0},editing:null,documentType:'quote',docFilter:'all',isPlatformAdmin:false,quoteDraft:null};
export const hooks={refresh:async()=>{},show:()=>{}};
export const active=()=>S.activities.find(a=>a.id===getActiveActivity())||S.activities[0];
export const prof=()=>S.profile||{};

/** Fenêtre modale de formulaire. `submit(modal)` peut lever une erreur : elle s'affiche dans la fenêtre. */
export function modalForm(title,fields,submit,{label='Enregistrer'}={}){
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="generic-modal"><form class="modal glass" id="generic-form"><div class="section-title"><h2>${title}</h2><button type="button" class="icon-btn modal-close" aria-label="Fermer">×</button></div>${fields}<div class="button-row"><button type="button" class="btn secondary modal-close">Annuler</button><button class="btn primary" type="submit">${label}</button></div><div id="generic-error" class="error" hidden></div></form></div>`);
  const m=document.querySelector('#generic-modal');
  m.querySelectorAll('input[type=number]').forEach(x=>{if(String(x.value)==='0'){x.value='';x.placeholder='0'}});
  m.querySelectorAll('.modal-close').forEach(x=>x.onclick=()=>m.remove());
  let submitting=false;
  m.querySelector('#generic-form').onsubmit=async ev=>{
    ev.preventDefault();
    if(submitting)return;
    submitting=true;
    const submitButton=m.querySelector('button[type=submit]');
    const submitLabel=submitButton?.textContent||label;
    if(submitButton){submitButton.disabled=true;submitButton.textContent='Enregistrement…'}
    try{await submit(m);m.remove();toast('Enregistré','success');await hooks.refresh();}
    catch(x){
      if(submitButton){submitButton.disabled=false;submitButton.textContent=submitLabel}
      submitting=false;
      const er=m.querySelector('#generic-error');
      er.innerHTML=e(x.message)+(x.data?.error==='MAIL_NOT_CONFIGURED'?' <button type="button" class="link-btn" id="goto-mail">Configurer la messagerie</button>':'');
      er.hidden=false;
      er.querySelector('#goto-mail')?.addEventListener('click',()=>{m.remove();hooks.show('settings')});
    }
  };
  return m;
}

/** Fenêtre de confirmation au design Aurion (remplace confirm() du navigateur). Renvoie une promesse : true / false. */
export function askConfirm({title='Confirmer',message='',confirmLabel='Confirmer',cancelLabel='Annuler',danger=false}={}){
  return new Promise(resolve=>{
    const root=document.createElement('div');
    root.className='modal-backdrop confirm-backdrop';root.setAttribute('role','alertdialog');root.setAttribute('aria-modal','true');
    root.innerHTML=`<div class="modal glass confirm-modal"><div class="confirm-icon ${danger?'danger':''}" aria-hidden="true">${danger?'!':'?'}</div><h2>${e(title)}</h2><p class="muted">${e(message).replace(/\n/g,'<br>')}</p><div class="button-row confirm-actions"><button type="button" class="btn secondary" data-a="no">${e(cancelLabel)}</button><button type="button" class="btn ${danger?'danger solid':'primary'}" data-a="yes">${e(confirmLabel)}</button></div></div>`;
    const done=v=>{document.removeEventListener('keydown',onKey,true);root.remove();resolve(v)};
    const onKey=ev=>{if(ev.key==='Escape'){ev.stopPropagation();done(false)}};
    document.addEventListener('keydown',onKey,true);
    root.addEventListener('click',ev=>{if(ev.target===root)done(false)});
    root.querySelector('[data-a="no"]').onclick=()=>done(false);root.querySelector('[data-a="yes"]').onclick=()=>done(true);
    document.body.append(root);
    root.querySelector(danger?'[data-a="no"]':'[data-a="yes"]').focus();
  });
}

export async function confirmDelete(message,action,done='Supprimé',{title='Confirmer la suppression',confirmLabel='Supprimer'}={}){
  if(!await askConfirm({title,message,confirmLabel,danger:true}))return;
  try{await action();toast(done,'success');await hooks.refresh()}catch(x){toast(x.message,'error')}
}

/** Ouvre (aperçu PDF) ou télécharge un document généré ; une erreur s'affiche dans Aurion, jamais sur une page blanche du navigateur. */
async function fetchAndOpen(url,mode,fallbackName,extraHeaders={}){
  const w=mode==='view'?window.open('','_blank'):null;
  try{
    const res=await api.authFetch(url.replace(api.baseUrl,''),{headers:extraHeaders});
    if(!res.ok){let msg='Le document n\u2019a pas pu \u00eatre ouvert.';try{msg=(await res.json()).message||msg}catch{}throw new Error(msg)}
    const blob=await res.blob(),name=(res.headers.get('content-disposition')||'').match(/filename="?([^";]+)/)?.[1]||fallbackName;
    const obj=URL.createObjectURL(blob);
    if(w){w.location.href=obj;setTimeout(()=>URL.revokeObjectURL(obj),120000)}
    else{const a=document.createElement('a');a.href=obj;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(obj),10000);toast(`${name} t\u00e9l\u00e9charg\u00e9`,'success')}
  }catch(x){w?.close();toast(x.message,'error')}
}

export function openDoc(kind,id,ext,mode){
  const url=`${api.baseUrl}/documents/${kind}/${id}.${ext}${ext==='pdf'&&mode==='download'?'?download=1':''}`;
  return fetchAndOpen(url,mode,`document.${ext}`);
}

/** Télécharge un fichier servi par l'API (cookie de session inclus). */
export async function downloadAuthed(path,filename){
  try{
    const res=await fetch(`${api.baseUrl}${path}`,{credentials:'include'});
    if(!res.ok){let m='Téléchargement impossible.';try{m=(await res.json()).message||m}catch{}throw new Error(m)}
    const a=document.createElement('a');a.href=URL.createObjectURL(await res.blob());a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    toast(`${filename} téléchargé`,'success');
  }catch(x){toast(x.message,'error')}
}

export function emailToast(status,noun='Document'){
  if(status==='sent')return toast(`${noun} enregistré et envoyé par e-mail.`,'success');
  if(status==='mail_not_configured')return toast(`${noun} enregistré. Configurez votre messagerie (Paramètres) pour l’envoyer.`,'info');
  if(status==='client_email_missing')return toast(`${noun} enregistré. Le client n’a pas d’adresse e-mail.`,'info');
  if(String(status).startsWith('failed'))return toast(`${noun} enregistré, mais l’e-mail n’a pas pu être envoyé : ${String(status).slice(7)}`,'error');
  toast(`${noun} enregistré.`,'success');
}
export function calendarToast(c,verb){
  if(!c)return toast(`Rendez-vous ${verb}.`,'success');
  if(c.ok)return toast(`Rendez-vous ${verb} et agenda mis à jour.`,'success');
  if(c.error==='MAIL_NOT_CONFIGURED')return toast(`Rendez-vous ${verb}. Configurez la messagerie (Paramètres) pour mettre votre agenda à jour.`,'info');
  toast(`Rendez-vous ${verb}, mais l’agenda n’a pas été mis à jour : ${c.error}`,'error');
}
export const itemsText=q=>(q.items||[]).map(i=>`${Number(i.quantity)} × ${i.label}`).join(', ');
