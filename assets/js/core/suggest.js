// Suggestions au design Aurion (remplace les listes déroulantes natives du navigateur).
import{escapeHtml as e}from'./ui.js';
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

/** items : () => [{value,hint?}] ; onPick(item) facultatif. Retourne { destroy }. */
export function attachSuggest(input,getItems,{onPick,max=100,title='Votre choix'}={}){
  if(!input||input.dataset.suggest)return{destroy(){}};
  input.dataset.suggest='1';input.setAttribute('autocomplete','off');
  const wrap=document.createElement('div');wrap.className='suggest-wrap';
  input.parentNode.insertBefore(wrap,input);wrap.append(input);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='suggest-toggle';toggle.setAttribute('aria-label','Ouvrir les suggestions');toggle.setAttribute('title','Ouvrir les suggestions');toggle.textContent='▾';wrap.append(toggle);const box=document.createElement('div');box.className='suggest-list';box.hidden=true;box.setAttribute('role','listbox');wrap.append(box);
  let shown=[],idx=-1,lastPicked='';
  const render=()=>{
    const current=String(input.value||'').trim();
    const isPicked=lastPicked&&norm(current)===norm(lastPicked);
    const q=isPicked?'':norm(current);
    shown=(getItems()||[]).filter(it=>it&&it.value&&(!q||norm(it.value).includes(q))).slice(0,max);
    idx=isPicked?shown.findIndex(it=>norm(it.value)===norm(current)):-1;
    if(!shown.length){box.hidden=true;toggle.setAttribute('aria-expanded','false');return}
    box.innerHTML=`<div class="suggest-title">${e(title)}</div>`+shown.map((it,i)=>`<div class="suggest-item${isPicked&&norm(it.value)===norm(current)?' active':''}" role="option" data-i="${i}" aria-selected="${isPicked&&norm(it.value)===norm(current)?'true':'false'}"><span>${e(it.value)}</span>${it.hint?`<small>${e(it.hint)}</small>`:''}</div>`).join('');
    box.hidden=false;toggle.setAttribute('aria-expanded','true');
    if(isPicked&&idx>=0){const active=box.querySelector('.suggest-item.active');active?.scrollIntoView({block:'nearest'})}
  };
  const mark=()=>[...box.querySelectorAll('.suggest-item')].forEach((n,i)=>n.classList.toggle('active',i===idx));
  const pick=i=>{const it=shown[i];if(!it)return;input.value=it.value;lastPicked=it.value;box.hidden=true;toggle.setAttribute('aria-expanded','false');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));onPick?.(it);box.hidden=true;toggle.setAttribute('aria-expanded','false')};
  toggle.setAttribute('aria-expanded','false');
  input.addEventListener('focus',()=>{if(box.hidden)render()});
  toggle.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(box.hidden){lastPicked='';render();input.focus()}else{box.hidden=true;toggle.setAttribute('aria-expanded','false')}});
  input.addEventListener('click',ev=>{ev.stopPropagation();if(box.hidden){lastPicked='';render()}});
  input.addEventListener('input',()=>{if(norm(input.value)!==norm(lastPicked)){lastPicked='';render()}});
  const outside=ev=>{if(!wrap.contains(ev.target)){box.hidden=true;toggle.setAttribute('aria-expanded','false')}};
  document.addEventListener('pointerdown',outside);
  input.addEventListener('keydown',ev=>{
    if(box.hidden)return;
    if(ev.key==='ArrowDown'){ev.preventDefault();idx=Math.min(shown.length-1,idx+1);mark()}
    else if(ev.key==='ArrowUp'){ev.preventDefault();idx=Math.max(0,idx-1);mark()}
    else if(ev.key==='Enter'&&idx>=0){ev.preventDefault();pick(idx)}
    else if(ev.key==='Escape'){box.hidden=true;toggle.setAttribute('aria-expanded','false')}
  });
  // Ne pas sélectionner au pointerdown : sur tactile, cela empêche le scroll de la liste.
  // La sélection ne se fait qu'au relâchement si le geste n'était pas un défilement.
  let gesture=null;
  box.addEventListener('pointerdown',ev=>{
    const n=ev.target.closest('.suggest-item');
    gesture=n?{pointerId:ev.pointerId,item:n,startX:ev.clientX,startY:ev.clientY,moved:false}:null;
  });
  box.addEventListener('pointermove',ev=>{
    if(!gesture||gesture.pointerId!==ev.pointerId)return;
    if(Math.abs(ev.clientX-gesture.startX)>8||Math.abs(ev.clientY-gesture.startY)>8)gesture.moved=true;
  },{passive:true});
  box.addEventListener('pointerup',ev=>{
    if(!gesture||gesture.pointerId!==ev.pointerId)return;
    const g=gesture;gesture=null;
    if(!g.moved&&g.item.isConnected){ev.preventDefault();pick(Number(g.item.dataset.i))}
  });
  box.addEventListener('pointercancel',()=>{gesture=null});
  return{destroy(){document.removeEventListener('pointerdown',outside);toggle.remove();box.remove()}};
}
