// Encart « Messagerie & agenda » : l'utilisateur saisit son adresse e-mail et son mot de passe UNE SEULE FOIS, ici (jamais dans PowerShell).
import{api}from'../core/api.js';
import{escapeHtml as e,toast}from'../core/ui.js';
import{askConfirm}from'./dash/core.js';

const eye=`<button type="button" class="icon-btn eye" aria-label="Afficher ou masquer le mot de passe">◉</button>`;

export async function renderMailbox(root,{onChange,compact=false,companyName=''}={}){
  root.innerHTML='<div class="mailbox"><p class="muted">Chargement de la messagerie…</p></div>';
  let st;
  try{st=await api.mailStatus()}catch(x){root.innerHTML=`<div class="mailbox"><p class="error">${e(x.message)}</p></div>`;return}
  const ctx={onChange,compact,companyName};
  st.account&&!root.dataset.editing?connected(root,st,ctx):form(root,st,ctx);
}

function head(st,title){
  const ok=st.configured;
  return`<div class="mailbox-head"><div class="mailbox-icon">✉</div><div><span class="eyebrow">MESSAGERIE & AGENDA</span><h2>${e(title)}</h2></div><span class="chip ${ok?'ok':'warn'}">${ok?'Connectée':'À configurer'}</span></div>`;
}

function connected(root,st,ctx){
  const a=st.account,p=st.presets.find(x=>x.id===a.provider);
  root.innerHTML=`<div class="mailbox">${head(st,'Vos devis et factures partent de votre adresse')}
    <div class="mailbox-line"><span class="chip ok">✓ E-mail</span><b>${e(a.email)}</b><small>${e(p?.label||'Messagerie personnalisée')} · ${e(a.host)}:${a.port}</small></div>
    <div class="mailbox-line"><span class="chip ${st.google.connected?'ok':'info'}">${st.google.connected?'✓ Google Agenda':'✓ Agenda'}</span><small>${st.google.connected?'Les rendez-vous sont synchronisés avec Google Agenda.':`Chaque rendez-vous est envoyé en invitation à <b>${e(a.email)}</b> : votre agenda (Google, Outlook, Apple) l’ajoute automatiquement ou en un clic. Les modifications et annulations suivent.`}</small></div>
    <div class="button-row"><button class="btn secondary" id="mb-test">Envoyer un e-mail de test</button><button class="btn secondary" id="mb-edit">Modifier</button><button class="btn danger" id="mb-del">Déconnecter</button></div>
    <p class="help">🔒 Votre mot de passe est chiffré et stocké de manière sécurisée par Aurion.</p>${google(st)}</div>`;
  root.querySelector('#mb-test').onclick=async b=>{b.currentTarget.disabled=true;try{const r=await api.mailTest();toast(`E-mail de test envoyé à ${r.sentTo}`,'success')}catch(x){toast(x.message,'error')}finally{b.currentTarget.disabled=false}};
  root.querySelector('#mb-edit').onclick=()=>{root.dataset.editing='1';renderMailbox(root,ctx)};
  root.querySelector('#mb-del').onclick=async()=>{if(!await askConfirm({title:'Déconnecter la messagerie ?',message:'Les envois de devis et de factures et les invitations agenda seront désactivés jusqu’à une nouvelle connexion.',confirmLabel:'Déconnecter',danger:true}))return;try{await api.mailDelete();toast('Messagerie déconnectée','success');delete root.dataset.editing;await renderMailbox(root,ctx);ctx.onChange?.()}catch(x){toast(x.message,'error')}};
  bindGoogle(root,ctx);
}

function google(st){
  if(!st.google.configured)return'';
  return`<details class="advanced"><summary>Connexion Google avancée (Google Agenda en direct)</summary><div class="button-row"><button class="btn secondary" id="g-connect">${st.google.connected?'Reconnecter Google':'Connecter Google'}</button>${st.google.connected?'<button class="btn danger" id="g-off">Déconnecter Google</button>':''}</div></details>`;
}
function bindGoogle(root,ctx){
  root.querySelector('#g-connect')?.addEventListener('click',async()=>{try{const r=await api.googleStart();if(r.url)window.open(r.url,'_blank');else toast('Connexion Google non configurée.','error')}catch(x){toast(x.message,'error')}});
  root.querySelector('#g-off')?.addEventListener('click',async()=>{await api.googleDisconnect();toast('Compte Google déconnecté','success');await renderMailbox(root,ctx)});
}

function form(root,st,ctx){
  const a=st.account,editing=!!a;
  const opts=st.presets.map(p=>`<option value="${p.id}" ${a&&a.provider===p.id?'selected':''}>${e(p.label)}</option>`).join('');
  root.innerHTML=`<form class="mailbox" id="mb-form" autocomplete="off">${head(st,editing?'Modifier la messagerie':'Connectez votre messagerie une seule fois')}
    <p class="muted">Aurion enverra vos devis et factures depuis votre adresse et mettra votre agenda à jour. Aucune saisie n’est demandée ailleurs.</p>
    <div class="grid-2"><label class="field"><span>Adresse e-mail</span><input id="mb-email" type="email" required placeholder="vous@gmail.com" value="${e(a?.email||'')}"></label>
    <label class="field"><span>Fournisseur</span><select id="mb-provider"><option value="auto" ${(!a||a.provider==='auto')?'selected':''}>Détection automatique</option>${opts}</select></label></div>
    <label class="field"><span id="mb-pwlabel">Mot de passe</span><div class="password-input"><input id="mb-password" type="password" ${editing?'':'required'} placeholder="${editing?'•••••••• (inchangé si vide)':''}">${eye}</div></label>
    <div id="mb-guide"></div>
    <label class="field"><span>Nom affiché comme expéditeur</span><input id="mb-name" placeholder="Nom de votre entreprise" value="${e(a?.fromName||ctx.companyName||'')}"></label>
    <details class="advanced" id="mb-adv"><summary>Paramètres avancés (serveur d’envoi)</summary><div class="grid-2"><label class="field"><span>Serveur SMTP</span><input id="mb-host" placeholder="smtp.exemple.fr" value="${e(a?.host||'')}"></label><label class="field"><span>Port</span><input id="mb-port" type="number" min="1" max="65535" value="${a?.port||''}"></label></div><label class="field"><span>Sécurité</span><select id="mb-security"><option value="">Votre choix</option><option value="ssl">SSL / TLS (port 465)</option><option value="starttls">STARTTLS (port 587)</option></select></label></details>
    <p id="mb-error" class="error" hidden></p>
    <div class="button-row"><button class="btn primary" id="mb-save" type="submit">Vérifier et enregistrer</button>${editing?'<button class="btn secondary" type="button" id="mb-cancel">Annuler</button>':''}<button class="link-btn" type="button" id="mb-skip" ${ctx.compact?'':'hidden'}>Configurer plus tard</button></div>
    <p class="help">🔒 Chiffré et conservé uniquement sur cet ordinateur. Aurion se connecte à votre fournisseur pour vérifier ces informations avant d’enregistrer.</p></form>`;
  const q=s=>root.querySelector(s);
  const preset=()=>{const sel=q('#mb-provider').value;if(sel!=='auto')return st.presets.find(p=>p.id===sel);const d=(q('#mb-email').value.split('@')[1]||'').toLowerCase();return st.presets.find(p=>p.domains.includes(d))};
  const sync=()=>{
    const p=preset();
    q('#mb-pwlabel').textContent=p?.appPassword?'Mot de passe d’application':'Mot de passe de la messagerie';
    q('#mb-guide').innerHTML=p?.appPassword?`<div class="guide"><b>${e(p.label)} n’accepte pas votre mot de passe habituel pour les applications.</b><ol><li>Activez la <em>validation en 2 étapes</em> sur votre compte.</li><li>Créez un <em>mot de passe d’application</em> nommé « Aurion » (16 caractères).</li><li>Collez-le ci-dessus : à faire une seule fois.</li></ol><a class="btn secondary" href="${e(p.appPasswordUrl||'#')}" target="_blank" rel="noreferrer">Ouvrir la page ${e(p.label.split(' ')[0])} ↗</a>${p.note?`<p class="help">${e(p.note)}</p>`:''}</div>`:(p?.note?`<p class="help">${e(p.note)}</p>`:'');
    if(p&&p.id!=='custom'){if(!q('#mb-host').value||!editing)q('#mb-host').value=p.host;if(!q('#mb-port').value||!editing)q('#mb-port').value=p.port;q('#mb-security').value=p.security}
    if(!p||p.id==='custom')q('#mb-adv').open=true;
  };
  q('#mb-email').addEventListener('input',sync);q('#mb-provider').addEventListener('change',()=>{q('#mb-host').value='';q('#mb-port').value='';sync()});
  q('.eye').onclick=()=>{const i=q('#mb-password');i.type=i.type==='password'?'text':'password'};
  if(editing)q('#mb-security').value=a.security==='none'?'ssl':a.security;
  sync();
  q('#mb-cancel')?.addEventListener('click',()=>{delete root.dataset.editing;renderMailbox(root,ctx)});
  q('#mb-skip')?.addEventListener('click',()=>ctx.onSkip?.());
  q('#mb-form').onsubmit=async ev=>{
    ev.preventDefault();const err=q('#mb-error'),btn=q('#mb-save');err.hidden=true;btn.disabled=true;btn.textContent='Vérification en cours…';
    try{
      const sel=q('#mb-provider').value;
      await api.mailSave({email:q('#mb-email').value.trim(),password:q('#mb-password').value,provider:sel,host:q('#mb-host').value.trim(),port:Number(q('#mb-port').value)||undefined,security:q('#mb-security').value,fromName:q('#mb-name').value.trim()});
      toast('Messagerie connectée','success');delete root.dataset.editing;await renderMailbox(root,ctx);ctx.onChange?.();ctx.onSaved?.();
    }catch(x){err.textContent=x.message;err.hidden=false}
    finally{btn.disabled=false;btn.textContent='Vérifier et enregistrer'}
  };
}
