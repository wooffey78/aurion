// Parcours d'accueil Aurion 15.4.0 — pour des entreprises DÉJÀ immatriculées (D2, D5).
// Ordre : Vous → Votre entreprise → Votre activité → Votre logo → Votre messagerie → Votre signature → Vos documents (cloud) → Récapitulatif.
// Chaque étape écrit directement dans les entités lues par Paramètres et « Mon compte » (D7) ; seul l'avancement
// (étape courante, étapes faites ou reportées) est propre au parcours (organizations.configuration_data.onboarding).
// Aucune partie « création administrative », aucun générateur de marque, aucune IA, aucune recherche par nom (D2, D3, D4).
import{api}from'../core/api.js';
import{go,routeQuery}from'../core/router.js';
import{toast,appLogo}from'../core/ui.js';
import{invalidateSession}from'../core/session.js';
import{validateCompanyIdentifier,detectCompany,buildProposals,renderProposals}from'../core/company-detect.js';
import{renderMailbox}from'./mailbox.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=sel=>document.querySelector(sel);
const val=id=>document.getElementById(id)?.value?.trim()||'';

export const STEPS=[
  {key:'you',title:'Vous'},
  {key:'company',title:'Votre entreprise'},
  {key:'activity',title:'Votre activité'},
  {key:'logo',title:'Votre logo'},
  {key:'mail',title:'Votre messagerie'},
  {key:'signature',title:'Votre signature e-mail'},
  {key:'cloud',title:'Vos documents'},
  {key:'recap',title:'Récapitulatif'},
];
const LOGO_TYPES=['image/png','image/jpeg','image/webp'];
const LOGO_MAX=2*1024*1024;

let state={company:{},account:{},activities:[],profiles:[],legalForms:[],signature:null,cloud:null,mail:null,logoUrl:'',step:0,modal:false,onClose:()=>{}};

const progress=()=>({...(state.company.configuration_data?.onboarding||{})});
const field=(id,label,value='',extra='',help='')=>`<label class="field" for="${id}"><span>${label}</span><input id="${id}" name="${id}" value="${esc(value)}" ${extra} aria-describedby="${id}-err${help?` ${id}-help`:''}">${help?`<small class="help" id="${id}-help">${help}</small>`:''}<small class="field-error" id="${id}-err" role="alert"></small></label>`;
function fieldError(id,message){const el=document.getElementById(id),err=document.getElementById(id+'-err');if(err)err.textContent=message||'';if(el){el.setAttribute('aria-invalid',message?'true':'false');if(message)el.focus()}return!message}

/** Corps complet attendu par PATCH /organization (la configuration est fusionnée, jamais écrasée). */
function orgBody(overrides={},configurationPatch={}){
  const c=state.company;
  return{name:c.name||'',activity:c.activity||'À configurer',customActivity:c.custom_activity||'',siren:c.siren||'',siret:c.siret||'',legalForm:c.legal_form||'',address:c.address||'',postalCode:c.postal_code||'',city:c.city||'',website:c.website||'',
    configurationIncomplete:c.configuration_incomplete!==false,...overrides,configurationData:{...(c.configuration_data||{}),...configurationPatch}};
}
async function saveProgress(stepKey,{skipped=false}={}){
  const p=progress();const done=new Set(p.done||[]),later=new Set(p.later||[]);
  if(skipped){later.add(stepKey);done.delete(stepKey)}else{done.add(stepKey);later.delete(stepKey)}
  const next={...p,step:Math.min(STEPS.length-1,STEPS.findIndex(s=>s.key===stepKey)+1),done:[...done],later:[...later],updatedAt:new Date().toISOString()};
  state.company=await api.updateOrganization(orgBody({},{onboarding:next}));
  invalidateSession();
}

function shell(){
  const steps=STEPS.map((s,i)=>`<li class="${i===state.step?'active':''} ${(progress().done||[]).includes(s.key)?'done':''}" ${i===state.step?'aria-current="step"':''}><span>${String(i+1).padStart(2,'0')}</span>${esc(s.title)}</li>`).join('');
  const card=`<section class="glass onboarding-card" ${state.modal?'role="dialog" aria-modal="true" aria-labelledby="ob-title"':''}>
    <div class="auth-brand">${appLogo('48')}<div><strong>AURION</strong><span>Configuration initiale d’Aurion</span></div></div>
    <div class="onboarding-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${state.step+1}" aria-valuetext="Étape ${state.step+1} sur ${STEPS.length} : ${esc(STEPS[state.step].title)}"><i></i></div>
    <ol class="stepper ob-steps" aria-label="Étapes du parcours">${steps}</ol>
    <p class="sr-only" aria-live="polite" id="ob-live">Étape ${state.step+1} sur ${STEPS.length} : ${esc(STEPS[state.step].title)}</p>
    <div id="onboarding-slot"></div></section>`;
  return state.modal?`<div class="modal-backdrop onboarding-backdrop" id="onboarding-modal">${card}</div>`:`<main id="main" class="onboarding">${card}</main>`;
}

function nav({next='Enregistrer et continuer',skip='',back=true}={}){
  return`<div class="button-row ob-nav">${back&&state.step>0?'<button type="button" class="btn secondary" id="ob-back">← Précédent</button>':''}${skip?`<button type="button" class="link-btn" id="ob-skip">${esc(skip)}</button>`:''}<button type="button" class="link-btn" id="ob-later">Enregistrer et finir plus tard</button><button type="submit" class="btn primary" id="ob-next">${esc(next)} <span aria-hidden="true">→</span></button></div><p class="error" id="ob-error" role="alert" hidden></p>`;
}

function show(stepIndex){
  state.step=Math.max(0,Math.min(STEPS.length-1,stepIndex));
  const root=state.target;root.innerHTML=shell();
  const bar=root.querySelector('.onboarding-progress i');if(bar)bar.style.width=`${Math.round((state.step+1)/STEPS.length*100)}%`;
  const slot=$('#onboarding-slot');
  const render=[stepYou,stepCompany,stepActivity,stepLogo,stepMail,stepSignature,stepCloud,stepRecap][state.step];
  render(slot);
  const heading=slot.querySelector('h2');if(heading){heading.id='ob-title';heading.tabIndex=-1;heading.focus({preventScroll:false})}
  slot.querySelector('#ob-back')?.addEventListener('click',()=>show(state.step-1));
  slot.querySelector('#ob-later')?.addEventListener('click',async()=>{try{const form=slot.querySelector('form.ob-form')||slot.querySelector('form');if(form?.dataset.autosave==='1')await form.__save?.(true)}catch{}finish(false)});
}

function bindForm(slot,save,{skip}={}){
  const form=slot.querySelector('form.ob-form')||slot.querySelector('form');const err=slot.querySelector('#ob-error');const next=slot.querySelector('#ob-next');
  form.dataset.autosave='1';
  form.__save=async(quiet=false)=>save(quiet);
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();if(next.disabled)return;
    next.disabled=true;err.hidden=true;
    try{const ok=await save(false);if(ok!==false)show(state.step+1)}
    catch(x){err.textContent=x?.message||'Enregistrement impossible. Vérifiez votre connexion puis réessayez.';err.hidden=false}
    finally{next.disabled=false}
  });
  slot.querySelector('#ob-skip')?.addEventListener('click',async()=>{try{await skip?.();await saveProgress(STEPS[state.step].key,{skipped:true});show(state.step+1)}catch(x){err.textContent=x?.message||'Action impossible.';err.hidden=false}});
}

// ---------------------------------------------------------------- 1 · Vous
function stepYou(slot){
  const u=state.account.user||{};const parts=String(u.fullName||'').trim().split(/\s+/);const first=parts.shift()||'';const last=parts.join(' ');
  slot.innerHTML=`<form class="stack" novalidate><h2>Vous</h2>
    <p class="help">Ces informations apparaissent dans « Mon compte » et dans votre signature e-mail. Vous pourrez les modifier à tout moment.</p>
    <div class="notice ob-note"><b>Conseil : une adresse e-mail dédiée à votre entreprise</b><small>Pour séparer votre activité professionnelle de votre vie personnelle, nous vous conseillons de créer ou d’utiliser une adresse e-mail dédiée à votre entreprise. Vous pourrez ainsi mieux organiser vos documents, vos échanges professionnels et votre espace de stockage.</small><small>Adresse de connexion actuelle : <strong>${esc(u.email||'')}</strong></small></div>
    <div class="grid-2">${field('ob-first','Prénom',first,'autocomplete="given-name" required maxlength="80"')}${field('ob-last','Nom',last,'autocomplete="family-name" required maxlength="80"')}</div>
    <div class="grid-2">${field('ob-phone','Téléphone',u.mobilePhone||u.fixedPhone||'','type="tel" autocomplete="tel" maxlength="60" inputmode="tel"','Facultatif')}${field('ob-job','Fonction',u.jobTitle||'','autocomplete="organization-title" maxlength="160"','Facultatif — ex. gérant, artisan')}</div>
    ${nav({back:false})}</form>`;
  bindForm(slot,async()=>{
    const ok=fieldError('ob-first',val('ob-first')?'':'Indiquez votre prénom.')&&fieldError('ob-last',val('ob-last')?'':'Indiquez votre nom.');
    if(!ok)return false;
    await api.updateAccount({fullName:`${val('ob-first')} ${val('ob-last')}`.trim(),mobilePhone:val('ob-phone'),jobTitle:val('ob-job')});
    state.account=await api.account().catch(()=>state.account);
    await saveProgress('you');
  });
}

// ---------------------------------------------------------------- 2 · Votre entreprise
function stepCompany(slot){
  const c=state.company,cd=c.configuration_data||{};
  const legal=[`<option value="">Votre choix</option>`,...state.legalForms.map(x=>`<option value="${esc(x.label)}" ${c.legal_form===x.label||c.legal_form===x.code?'selected':''}>${esc(x.label)}</option>`),...(c.legal_form&&!state.legalForms.some(x=>x.label===c.legal_form||x.code===c.legal_form)?[`<option value="${esc(c.legal_form)}" selected>${esc(c.legal_form)}</option>`]:[])].join('');
  slot.innerHTML=`<form class="stack" novalidate><h2>Votre entreprise</h2>
    <p class="help">Votre entreprise est déjà immatriculée : saisissez son SIRET ou son SIREN puis cliquez sur « Détecter mon entreprise ». Les informations trouvées vous sont proposées, jamais imposées.</p>
    <div class="ob-detect">${field('ob-identifier','SIRET ou SIREN',c.siret||c.siren||'','inputmode="numeric" autocomplete="off" maxlength="20"','14 chiffres (SIRET) ou 9 chiffres (SIREN) — espaces acceptés')}<button type="button" class="btn secondary" id="ob-detect">Détecter mon entreprise</button></div>
    <p id="ob-detect-status" class="help" role="status" aria-live="polite"></p>
    <div id="ob-proposals" hidden></div>
    <div class="grid-2">${field('ob-name','Dénomination',c.name==='Mon entreprise'||c.name==='Espace VIP Aurion'?'':c.name,'required maxlength="160" autocomplete="organization"')}<label class="field" for="ob-legal"><span>Forme juridique</span><select id="ob-legal">${legal}</select></label></div>
    <div class="grid-2">${field('ob-siret','SIRET',c.siret||'','inputmode="numeric" maxlength="20"')}${field('ob-siren','SIREN',c.siren||'','inputmode="numeric" maxlength="11"')}</div>
    ${field('ob-address','Adresse',c.address||'','autocomplete="street-address" maxlength="500"')}
    <div class="grid-2">${field('ob-postal','Code postal',c.postal_code||'','autocomplete="postal-code" maxlength="20"')}${field('ob-city','Ville',c.city||'','autocomplete="address-level2" maxlength="120"')}</div>
    <div class="grid-2">${field('ob-activity','Activité (registre)',c.activity==='À configurer'?'':c.activity||'','maxlength="160"')}${field('ob-naf','Code NAF',cd.naf_code||'','maxlength="10"')}</div>
    <div class="grid-2">${field('ob-vat','N° de TVA intracommunautaire',cd.vat_number||'','maxlength="20"','Calculé depuis le SIREN : à vérifier selon votre régime de TVA')}${field('ob-website','Site internet',c.website||'','type="url" inputmode="url" maxlength="500"','Facultatif')}</div>
    ${nav()}</form>`;
  const map={name:'ob-name',siren:'ob-siren',siret:'ob-siret',legal_form:'ob-legal',address:'ob-address',postal_code:'ob-postal',city:'ob-city',activity:'ob-activity',naf_code:'ob-naf',vat_number:'ob-vat',website:'ob-website'};
  const current=()=>Object.fromEntries(Object.entries(map).map(([k,id])=>[k,val(id)]));
  const apply=(key,value)=>{const el=document.getElementById(map[key]);if(!el)return;if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===value))el.add(new Option(value,value));el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))};
  slot.querySelector('#ob-detect').addEventListener('click',async()=>{
    const r=await detectCompany(val('ob-identifier'),{button:slot.querySelector('#ob-detect'),status:slot.querySelector('#ob-detect-status')});
    const box=slot.querySelector('#ob-proposals');
    if(r.company)renderProposals(box,buildProposals(current(),r.company),apply);else{box.hidden=true;box.innerHTML=''}
  });
  bindForm(slot,async()=>{
    if(!fieldError('ob-name',val('ob-name')?'':'Indiquez la dénomination de votre entreprise.'))return false;
    const siret=val('ob-siret').replace(/[\s.]/g,''),siren=val('ob-siren').replace(/[\s.]/g,'');
    if(siret){const v=validateCompanyIdentifier(siret);if(!fieldError('ob-siret',v.ok&&v.kind==='siret'?'':'SIRET invalide (14 chiffres, clé de contrôle).'))return false}
    if(siren){const v=validateCompanyIdentifier(siren);if(!fieldError('ob-siren',v.ok&&v.kind==='siren'?'':'SIREN invalide (9 chiffres, clé de contrôle).'))return false}
    if(siret&&siren&&siret.slice(0,9)!==siren){fieldError('ob-siren','Le SIREN doit correspondre aux 9 premiers chiffres du SIRET.');return false}
    state.company=await api.updateOrganization(orgBody({name:val('ob-name'),activity:val('ob-activity')||state.company.activity||'À configurer',siret,siren:siren||(siret?siret.slice(0,9):''),legalForm:val('ob-legal'),address:val('ob-address'),postalCode:val('ob-postal'),city:val('ob-city'),website:val('ob-website')},{naf_code:val('ob-naf'),vat_number:val('ob-vat')}));
    await saveProgress('company');
  });
}

// ---------------------------------------------------------------- 3 · Votre activité
const QUESTIONS=[['parts','Utilisez-vous des pièces ou fournitures dans vos devis ?'],['stock','Souhaitez-vous suivre vos stocks ?'],['support','Souhaitez-vous afficher les fonctions SAV ?'],['agenda','Souhaitez-vous utiliser l’agenda ?'],['accounting','Souhaitez-vous utiliser la comptabilité, la trésorerie et les notes de frais ?']];
function stepActivity(slot){
  const c=state.company,q=c.configuration_data?.questionnaire||{};const a=state.activities[0]||{};
  slot.innerHTML=`<form class="stack" novalidate><h2>Votre activité</h2>
    <p class="help">Le métier adapte le catalogue, les calculs et le vocabulaire des documents. Les modules peuvent être modifiés plus tard dans Paramètres.</p>
    <label class="field" for="ob-profile"><span>Métier</span><select id="ob-profile"><option value="">Votre choix</option>${state.profiles.map(p=>`<option value="${esc(p.code)}" ${a.profile_code===p.code?'selected':''}>${esc(p.title)}</option>`).join('')}</select><small class="help" id="ob-profile-help" aria-live="polite"></small></label>
    ${field('ob-custom','Activité précise',c.custom_activity||'','maxlength="240"','Ex. réparation de smartphones, plomberie, création de sites web')}
    <fieldset class="ob-modules"><legend>Modules Aurion</legend>${QUESTIONS.map(([k,l])=>`<label class="field" for="ob-q-${k}"><span>${esc(l)}</span><select id="ob-q-${k}"><option value="">Votre choix</option><option ${q[k]==='Oui'?'selected':''}>Oui</option><option ${q[k]==='Non'?'selected':''}>Non</option></select></label>`).join('')}</fieldset>
    ${nav()}</form>`;
  // Préremplissage déterministe du métier à partir de l'activité (aucune IA) : proposé, jamais imposé.
  if(!a.profile_code)api.detectProfile({name:c.activity||c.name||'',description:c.custom_activity||c.activity||''}).then(r=>{const sel=slot.querySelector('#ob-profile');if(sel&&!sel.value&&r?.code&&[...sel.options].some(o=>o.value===r.code)){sel.value=r.code;slot.querySelector('#ob-profile-help').textContent=`Métier proposé : ${r.title}. Vous pouvez le modifier.`}}).catch(()=>{});
  bindForm(slot,async()=>{
    const answers=Object.fromEntries(QUESTIONS.map(([k])=>[k,val(`ob-q-${k}`)]));
    state.company=await api.updateOrganization(orgBody({customActivity:val('ob-custom')},{questionnaire:{...(state.company.configuration_data?.questionnaire||{}),...answers},completed:true}));
    const modules={support:'support',agenda:'agenda',accounting:'accounting',parts:'easyfixit',stock:'stock'};
    for(const [k,v] of Object.entries(answers))if(v&&modules[k]){try{await api.setModule(modules[k],v==='Oui')}catch{}}
    const profileCode=val('ob-profile');
    if(a.id&&profileCode&&profileCode!==a.profile_code){
      const updated=await api.updateActivity(a.id,{name:a.name,description:a.description||val('ob-custom')||'',profileCode,legalForm:state.company.legal_form||a.legal_form||undefined,autoFiscalDetect:true});
      state.activities=state.activities.map(x=>x.id===a.id?{...x,...updated}:x);
    }
    await saveProgress('activity');
  });
}

// ---------------------------------------------------------------- 4 · Votre logo (facultatif, jamais bloquant)
function stepLogo(slot){
  slot.innerHTML=`<form class="stack" novalidate><h2>Votre logo</h2>
    <p class="help">Facultatif. Il apparaîtra sur vos documents et votre signature e-mail. Formats PNG, JPEG ou WebP, 2 Mo au maximum.</p>
    <div class="ob-logo"><div class="ob-logo-preview" id="ob-logo-preview" aria-live="polite">${state.logoUrl?`<img src="${esc(state.logoUrl)}" alt="Logo actuel de l’entreprise">`:'<span class="muted">Aucun logo</span>'}</div>
    <div class="stack"><label class="field" for="ob-logo-file"><span>Choisir une image</span><input id="ob-logo-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <div class="button-row"><button type="button" class="btn secondary" id="ob-logo-remove" ${state.company.has_logo?'':'hidden'}>Supprimer le logo</button></div><p class="help" id="ob-logo-status" role="status" aria-live="polite"></p></div></div>
    ${nav({skip:'Passer cette étape'})}</form>`;
  let chosen=null;
  const status=slot.querySelector('#ob-logo-status'),preview=slot.querySelector('#ob-logo-preview');
  slot.querySelector('#ob-logo-file').addEventListener('change',ev=>{
    const f=ev.target.files?.[0];chosen=null;if(!f)return;
    if(!LOGO_TYPES.includes(f.type)){status.textContent='Format refusé : choisissez une image PNG, JPEG ou WebP.';status.className='error';ev.target.value='';return}
    if(f.size>LOGO_MAX){status.textContent='Le logo dépasse 2 Mo.';status.className='error';ev.target.value='';return}
    chosen=f;const url=URL.createObjectURL(f);preview.innerHTML=`<img src="${url}" alt="Aperçu du logo sélectionné">`;status.className='help';status.textContent='Aperçu prêt. Le logo sera enregistré à l’étape suivante.';
  });
  slot.querySelector('#ob-logo-remove').addEventListener('click',async()=>{try{await api.deleteOrganizationLogo();state.company.has_logo=false;if(state.logoUrl)URL.revokeObjectURL(state.logoUrl);state.logoUrl='';preview.innerHTML='<span class="muted">Aucun logo</span>';slot.querySelector('#ob-logo-remove').hidden=true;status.className='help';status.textContent='Logo supprimé.'}catch(x){status.className='error';status.textContent=x.message}});
  bindForm(slot,async()=>{
    if(chosen){status.textContent='Enregistrement du logo…';await api.uploadOrganizationLogo(chosen);state.company.has_logo=true;if(state.logoUrl)URL.revokeObjectURL(state.logoUrl);state.logoUrl=URL.createObjectURL(chosen)}
    await saveProgress('logo',{skipped:!chosen&&!state.company.has_logo});
  });
}

// ---------------------------------------------------------------- 5 · Votre messagerie (peut être reportée, D10)
function stepMail(slot){
  // Le composant messagerie possède son propre formulaire : il est placé hors du formulaire de navigation (pas de formulaires imbriqués).
  slot.innerHTML=`<section class="stack"><h2>Votre messagerie</h2>
    <p class="help">Connectez l’adresse qui enverra vos devis, factures et relances. Vous pouvez aussi la configurer plus tard : un rappel restera visible dans votre tableau de bord.</p>
    <div id="ob-mailbox"></div>
    <p class="help">Si un test SMTP expire, certains hébergements bloquent les ports SMTP sortants : essayez le port proposé par votre fournisseur ou la connexion Google.</p>
    <form class="ob-form" novalidate>${nav({skip:'Configurer plus tard'})}</form></section>`;
  renderMailbox(slot.querySelector('#ob-mailbox'),{compact:true,companyName:state.company.name||'',onSkip:()=>slot.querySelector('#ob-skip')?.click(),onChange:async()=>{state.mail=await api.mailStatus().catch(()=>state.mail)}});
  bindForm(slot,async()=>{state.mail=await api.mailStatus().catch(()=>state.mail);await saveProgress('mail',{skipped:!state.mail?.configured})});
}

// ---------------------------------------------------------------- 6 · Votre signature e-mail
function stepSignature(slot){
  const u=state.account.user||{},c=state.company,s=state.signature||{};const parts=String(u.fullName||'').trim().split(/\s+/);
  const v={firstName:s.firstName||parts.shift()||'',lastName:s.lastName||parts.join(' '),jobTitle:s.jobTitle||u.jobTitle||'',company:s.company||c.name||'',phone:s.phone||u.mobilePhone||u.fixedPhone||'',website:s.website||c.website||'',address:s.address||[c.address,[c.postal_code,c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')};
  slot.innerHTML=`<form class="stack" novalidate><h2>Votre signature e-mail</h2>
    <p class="help">Préremplie avec vos informations. Elle s’ajoute aux e-mails de devis, de factures et aux e-mails professionnels (jamais aux messages de sécurité).</p>
    <label class="check"><input id="ob-sig-enabled" type="checkbox" ${s.enabled===false?'':'checked'}> Activer la signature</label>
    <div class="grid-2">${field('ob-sig-first','Prénom',v.firstName,'maxlength="80"')}${field('ob-sig-last','Nom',v.lastName,'maxlength="80"')}</div>
    <div class="grid-2">${field('ob-sig-role','Fonction',v.jobTitle,'maxlength="160"')}${field('ob-sig-company','Entreprise',v.company,'maxlength="160"')}</div>
    <div class="grid-2">${field('ob-sig-phone','Téléphone',v.phone,'type="tel" maxlength="60"')}${field('ob-sig-website','Site web',v.website,'maxlength="500"')}</div>
    ${field('ob-sig-address','Adresse',v.address,'maxlength="500"')}
    <div class="notice ob-signature-preview"><b>Aperçu${state.company.has_logo?' (votre logo est joint aux e-mails)':''}</b><pre id="ob-sig-preview" aria-live="polite"></pre></div>
    ${nav({skip:'Passer cette étape'})}</form>`;
  const payload=()=>({enabled:slot.querySelector('#ob-sig-enabled').checked,firstName:val('ob-sig-first'),lastName:val('ob-sig-last'),jobTitle:val('ob-sig-role'),company:val('ob-sig-company'),phone:val('ob-sig-phone'),website:val('ob-sig-website'),address:val('ob-sig-address'),extra:s.extra||'',includeQuotes:s.includeQuotes!==false,includeInvoices:s.includeInvoices!==false,includeProfessional:s.includeProfessional!==false});
  const paint=()=>{const p=payload();slot.querySelector('#ob-sig-preview').textContent=p.enabled?['--',[p.firstName,p.lastName].filter(Boolean).join(' '),[p.jobTitle,p.company].filter(Boolean).join(' · '),p.phone,p.website,p.address].filter(Boolean).join('\n'):'Signature désactivée.'};
  slot.querySelectorAll('input').forEach(i=>i.addEventListener('input',paint));slot.querySelector('#ob-sig-enabled').addEventListener('change',paint);paint();
  bindForm(slot,async()=>{const r=await api.saveEmailSignature(payload());state.signature=r.signature||payload();await saveProgress('signature')});
}

// ---------------------------------------------------------------- 7 · Vos documents : cloud personnel (cahier des charges §3)
function stepCloud(slot){
  const st=state.cloud||{};const connected=st.status==='connected';const configured=st.setup?.configured!==false;
  slot.innerHTML=`<form class="stack" novalidate><h2>Vos documents</h2>
    <p class="help">Aurion range vos devis, factures, justificatifs et notes de frais dans <b>votre propre Google Drive</b>, dans un dossier « Aurion — Mon entreprise ». Le stockage n’est pas facturé par Aurion : la capacité dépend de votre compte Google.</p>
    <div class="notice"><b>${connected?'Google Drive connecté':'Google Drive non connecté'}</b><small>${connected?`Compte : ${esc(st.accountEmail||'non communiqué')}`:configured?'Aurion demandera uniquement l’accès aux fichiers qu’il crée (autorisation « drive.file »). Votre mot de passe Google n’est jamais demandé ni conservé.':'La connexion Google Drive n’est pas encore activée sur ce serveur. Vous pourrez la faire plus tard dans Paramètres → Stockage.'}</small>${routeQuery().get('cloud')==='refused'?'<small class="warn-text">Autorisation refusée : rien n’a été modifié.</small>':''}</div>
    <div class="button-row">${configured?`<button type="button" class="btn secondary" id="ob-cloud-connect">${connected?'Reconnecter Google Drive':'Connecter Google Drive'}</button>`:''}</div>
    <p class="help">Hors connexion, les documents restent en attente sur l’appareil et sont envoyés automatiquement dès que possible.</p>
    ${nav({skip:connected?'':'Plus tard'})}</form>`;
  slot.querySelector('#ob-cloud-connect')?.addEventListener('click',async ev=>{ev.currentTarget.disabled=true;try{await saveProgress('cloud',{skipped:!connected});const r=await api.cloudStart('/onboarding');location.assign(r.url)}catch(x){toast(x.message,'error');ev.currentTarget.disabled=false}});
  bindForm(slot,async()=>{await saveProgress('cloud',{skipped:!connected})});
}

// ---------------------------------------------------------------- 8 · Récapitulatif
function stepRecap(slot){
  const c=state.company,u=state.account.user||{},q=c.configuration_data?.questionnaire||{};
  const items=[
    ['Vous',Boolean(u.fullName),u.fullName||'Prénom et nom à compléter','account'],
    ['Votre entreprise',Boolean(c.name&&c.name!=='Mon entreprise'&&(c.siret||c.siren)),[c.name,c.siret||c.siren].filter(Boolean).join(' · ')||'Identité à compléter','settings'],
    ['Votre activité',Object.values(q).some(Boolean),c.custom_activity||c.activity||'Modules à choisir','settings'],
    ['Votre logo',Boolean(c.has_logo),c.has_logo?'Logo enregistré':'Facultatif — aucun logo','settings'],
    ['Votre messagerie',Boolean(state.mail?.configured),state.mail?.configured?'Messagerie connectée':'À configurer plus tard (rappel dans le tableau de bord)','settings'],
    ['Votre signature',Boolean(state.signature&&state.signature.enabled!==false&&(state.signature.firstName||state.signature.company)),state.signature?.enabled===false?'Désactivée':'Signature enregistrée','settings'],
    ['Vos documents (cloud)',state.cloud?.status==='connected',state.cloud?.status==='connected'?`Google Drive · ${state.cloud.accountEmail||''}`:'Cloud non connecté','settings'],
  ];
  slot.innerHTML=`<form class="stack" novalidate><h2>Récapitulatif</h2>
    <ul class="ob-recap">${items.map(([t,ok,d,target])=>`<li class="${ok?'ok':'todo'}"><span class="chip ${ok?'ok':'warn'}">${ok?'Configuré':'À compléter'}</span><div><b>${esc(t)}</b><small>${esc(d)}</small></div><small class="muted">${target==='account'?'Mon compte':'Paramètres'}</small></li>`).join('')}</ul>
    <p class="help">Tout reste modifiable dans <b>Paramètres</b> et <b>Mon compte</b>, qui affichent ces mêmes informations.</p>
    ${nav({next:'Accéder au tableau de bord'})}</form>`;
  bindForm(slot,async()=>{
    const p=progress();
    state.company=await api.updateOrganization(orgBody({configurationIncomplete:false},{onboarding:{...p,step:STEPS.length-1,completed:true,completedAt:new Date().toISOString()}}));
    finish(true);return false;
  });
}

function finish(completed){
  if(completed)toast('Configuration enregistrée. Bienvenue dans Aurion.','success');
  if(state.modal){state.target.innerHTML='';state.onClose()}else go('/dashboard');
}

export async function renderOnboarding(target=document.querySelector('#app'),{modal=false,onClose=()=>{}}={}){
  if(!target)return;
  state={...state,target,modal,onClose};
  target.innerHTML='<main class="center"><p class="muted" role="status">Chargement de votre configuration…</p></main>';
  const safe=(p,d)=>Promise.resolve(p).catch(()=>d);
  const [company,account,activities,profiles,legalForms,signature,cloud,mail]=await Promise.all([
    safe(api.organization(),{}),safe(api.account(),{user:{}}),safe(api.activities(),[]),safe(api.profiles(),[]),safe(api.legalForms(),[]),
    safe(api.getEmailSignature().then(r=>r.signature||null),null),safe(api.cloudStatus(),null),safe(api.mailStatus(),null),
  ]);
  Object.assign(state,{company:company||{},account:account||{user:{}},activities:Array.isArray(activities)?activities:[],profiles:Array.isArray(profiles)?profiles:(profiles?.profiles||[]),legalForms:legalForms||[],signature,cloud,mail});
  // Un utilisateur déjà configuré n'est pas renvoyé dans le parcours (sauf retour explicite de la connexion cloud).
  const q=routeQuery();
  if(!modal&&state.company.configuration_incomplete===false&&!q.get('cloud')&&q.get('edit')!=='1'){go('/dashboard');return}
  if(state.company.has_logo){try{const r=await api.organizationLogo();if(r.ok)state.logoUrl=URL.createObjectURL(await r.blob())}catch{}}
  const saved=Number(state.company.configuration_data?.onboarding?.step||0);
  show(q.get('cloud')?STEPS.findIndex(s=>s.key==='cloud'):Math.max(0,Math.min(STEPS.length-1,saved)));
}
