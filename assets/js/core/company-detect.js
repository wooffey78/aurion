// Détection d'entreprise par SIRET/SIREN — implémentation unique partagée par le parcours d'accueil et les Paramètres (D4).
// Règles : validation locale avant tout appel, déclenchement au clic uniquement, une seule requête à la fois,
// délai maximal explicite, états annoncés (aria-live), valeurs saisies à la main jamais écrasées
// (chaque complément est proposé champ par champ : « Appliquer » / « Ignorer »).
import{api}from'./api.js';
import{normalizeStreetAddress,normalizeWebsite}from'./registry-fill.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LA_POSTE='356000000';
export const DETECTION_TIMEOUT_MS=10000;

function luhn(digits){let sum=0;const parity=digits.length%2;for(let i=0;i<digits.length;i++){let d=Number(digits[i]);if(i%2===parity){d*=2;if(d>9)d-=9}sum+=d}return sum%10===0}

/** Valide un identifiant saisi (espaces et points tolérés). */
export function validateCompanyIdentifier(value){
  const raw=String(value??'').trim();
  const digits=raw.replace(/[\s.]/g,'');
  if(!digits)return{ok:false,kind:null,digits:'',message:'Saisissez un SIRET (14 chiffres) ou un SIREN (9 chiffres).'};
  if(!/^\d+$/.test(digits))return{ok:false,kind:null,digits,message:'Seuls des chiffres sont attendus (espaces et points acceptés).'};
  if(digits.length===9)return luhn(digits)?{ok:true,kind:'siren',digits,message:''}:{ok:false,kind:'siren',digits,message:'Ce SIREN n’est pas valide : vérifiez les 9 chiffres.'};
  if(digits.length===14){
    const valid=luhn(digits)||(digits.startsWith(LA_POSTE)&&digits.split('').reduce((t,d)=>t+Number(d),0)%5===0);
    return valid?{ok:true,kind:'siret',digits,message:''}:{ok:false,kind:'siret',digits,message:'Ce SIRET n’est pas valide : vérifiez les 14 chiffres.'};
  }
  return{ok:false,kind:null,digits,message:`${digits.length} chiffre(s) saisi(s) : un SIREN en compte 9, un SIRET 14.`};
}

const FIELD_LABELS={name:'Dénomination',siren:'SIREN',siret:'SIRET',legal_form:'Forme juridique',address:'Adresse',postal_code:'Code postal',city:'Ville',activity:'Activité',naf_code:'Code NAF',vat_number:'N° de TVA intracommunautaire',website:'Site internet'};

/** Valeurs proposées par le registre, normalisées dans le vocabulaire des formulaires Aurion. */
export function registryValues(company={}){
  return{
    name:company.legalName||company.name||'',siren:company.siren||'',siret:company.siret||'',legal_form:company.legalForm||'',
    address:normalizeStreetAddress(company.address,company.postalCode,company.city),postal_code:company.postalCode||'',city:company.city||'',
    activity:company.activity||'',naf_code:company.legalActivityCode||'',vat_number:company.vatNumber||'',website:normalizeWebsite(company.website||''),
  };
}

/** Liste des propositions : uniquement les champs où le registre apporte une valeur différente de la saisie actuelle. */
export function buildProposals(current={},company={}){
  const incoming=registryValues(company);
  return Object.entries(incoming).filter(([key,value])=>String(value||'').trim()&&key in FIELD_LABELS&&String(current[key]??'').trim()!==String(value).trim()).map(([key,value])=>({key,label:FIELD_LABELS[key],value:String(value).trim(),current:String(current[key]??'').trim()}));
}

let inFlight=false;
/**
 * Lance UNE détection (au clic). `ui` : {button,status} éléments du DOM.
 * Retour : {status:'found'|'closed'|'establishment_closed'|'not_found'|'invalid'|'unavailable'|'busy', company, message}
 */
export async function detectCompany(identifier,ui={}){
  const {button,status}=ui;
  const say=(text,tone='help')=>{if(status){status.textContent=text;status.className=tone;status.setAttribute('role','status');status.setAttribute('aria-live','polite')}};
  if(inFlight)return{status:'busy',company:null,message:'Une détection est déjà en cours.'};
  const check=validateCompanyIdentifier(identifier);
  if(!check.ok){say(check.message,'error');return{status:'invalid',company:null,message:check.message}}
  inFlight=true;if(button){button.disabled=true;button.setAttribute('aria-busy','true')}
  say(`Recherche de l’entreprise (${check.kind==='siret'?'SIRET':'SIREN'} ${check.digits})…`);
  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('timeout'),{timeout:true})),DETECTION_TIMEOUT_MS));
  try{
    const r=await Promise.race([api.supplierLookup(check.digits),timeout]);
    if(!r?.company){const m='Aucune entreprise ne correspond à cet identifiant. Vous pouvez saisir les informations manuellement.';say(m,'help');return{status:'not_found',company:null,message:m}}
    const st=r.status||'found';
    const m=st==='closed'?`Entreprise trouvée : ${r.company.legalName}. Attention : cette unité légale est indiquée comme cessée au registre.`:st==='establishment_closed'?`Entreprise trouvée : ${r.company.legalName}. Attention : cet établissement est indiqué comme fermé.`:`Entreprise trouvée : ${r.company.legalName}. Choisissez les informations à reprendre.`;
    say(m,st==='found'?'success-text':'warn-text');
    return{status:st,company:r.company,message:m};
  }catch(error){
    const m=error?.timeout?'Le registre public ne répond pas dans le délai prévu. Réessayez ou saisissez les informations manuellement.':error?.status===400?(error.message||'Identifiant invalide.'):(error?.message||'Le registre public est momentanément indisponible. Vous pouvez saisir les informations manuellement.');
    say(m,'error');return{status:error?.status===400?'invalid':'unavailable',company:null,message:m};
  }finally{inFlight=false;if(button){button.disabled=false;button.removeAttribute('aria-busy')}}
}

/**
 * Affiche les propositions champ par champ. `apply(key,value)` écrit dans le formulaire appelant.
 * Le bouton « Tout appliquer aux champs vides » ne remplit jamais un champ déjà saisi.
 */
export function renderProposals(container,proposals,apply){
  if(!container)return;
  if(!proposals.length){container.hidden=false;container.innerHTML='<p class="help">Les informations du registre correspondent déjà à votre saisie.</p>';return}
  container.hidden=false;
  container.innerHTML=`<div class="registry-proposals" role="group" aria-label="Informations proposées par le registre public"><p class="help">Les valeurs déjà saisies ne sont jamais remplacées sans votre accord.</p>${proposals.map((p,i)=>`<div class="registry-proposal" data-i="${i}"><div><b>${esc(p.label)}</b><small>Proposé : <strong>${esc(p.value)}</strong>${p.current?` · actuel : ${esc(p.current)}`:' · champ vide'}</small></div><div class="button-row"><button type="button" class="btn secondary small" data-apply="${i}">Appliquer</button><button type="button" class="link-btn" data-ignore="${i}">Ignorer</button></div></div>`).join('')}<div class="button-row"><button type="button" class="btn primary small" data-apply-empty>Tout appliquer aux champs vides</button></div></div>`;
  const done=i=>{const row=container.querySelector(`[data-i="${i}"]`);row?.remove();if(!container.querySelector('.registry-proposal')){container.innerHTML='<p class="help">Toutes les propositions ont été traitées.</p>'}};
  container.querySelectorAll('[data-apply]').forEach(b=>b.addEventListener('click',()=>{const p=proposals[Number(b.dataset.apply)];apply(p.key,p.value);done(b.dataset.apply)}));
  container.querySelectorAll('[data-ignore]').forEach(b=>b.addEventListener('click',()=>done(b.dataset.ignore)));
  container.querySelector('[data-apply-empty]')?.addEventListener('click',()=>{proposals.forEach((p,i)=>{if(!p.current){apply(p.key,p.value);done(i)}})});
}
