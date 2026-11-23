// 15.4.52 (PROMPT B4) — Page PUBLIQUE du portail client invités : consultée par token, SANS
// compte et SANS cookie applicatif. Elle ne consomme QUE les endpoints publics du backend
// (GET /portal/:token, POST /portal/:token/quotes/:quoteId/accept — rate-limités) et les
// documents légaux publics. Aucune donnée personnelle demandée : le seul champ saisi est le
// nom du signataire, horodaté avec l'acceptation (preuve transactionnelle côté serveur).
import{api}from'../core/api.js';

const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const money=v=>`${Number(v||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
const fdate=d=>d?new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';
const fdt=d=>d?new Date(d).toLocaleString('fr-FR',{dateStyle:'long',timeStyle:'short'}):'';
const statusBadge={draft:'Brouillon',sent:'Envoyé',accepted:'Accepté',rejected:'Refusé',expired:'Expiré',canceled:'Annulé',cancelled:'Annulé',issued:'Émis'};

const shell=(title,body)=>`<main class="portal-page"><header class="portal-head"><a class="brand" href="#/">AURION</a></header><section class="glass portal-card"><h1>${e(title)}</h1>${body}</section><footer class="portal-foot"><a href="#/legal/cgv">Conditions générales</a> · <a href="#/legal/privacy">Politique de confidentialité</a> · <a href="#/legal">Documents légaux</a></footer></main>`;

const neutralError=()=>shell('Portail indisponible',`<p class="muted">Ce portail n'existe pas (ou plus), ou le lien est incomplet. Demandez à votre interlocuteur un nouveau lien d'accès.</p>`);
const expiredError=()=>shell('Accès expiré',`<p class="muted">Ce lien d'accès au portail a expiré. Demandez à votre interlocuteur de le renouveler.</p>`);

export async function renderPortal(token){
  const app=document.querySelector('#app');
  if(!token)return void(app.innerHTML=neutralError());
  app.innerHTML=shell('Chargement…','<p class="muted">Ouverture du portail…</p>');
  let view;
  try{view=await api.portalPublic(token)}
  catch(x){
    const code=String(x?.code||x?.error||'');
    app.innerHTML=code==='ACCESS_EXPIRED'?expiredError():neutralError();
    return;
  }
  renderQuotes(token,view);
}

function renderQuotes(token,view){
  const app=document.querySelector('#app');
  const rows=(view.quotes||[]).map(q=>{
    const accepted=!!q.acceptedAt;
    const label=statusBadge[String(q.status||'').toLowerCase()]||q.status||'';
    return `<article class="portal-quote" data-id="${e(q.id)}">
      <div class="portal-quote-head"><b>${e(q.number||'Devis')}</b><span class="pill ${accepted?'ok':''}">${accepted?'Accepté le '+fdate(q.acceptedAt):e(label)}</span></div>
      <div class="portal-quote-body"><span>Montant TTC</span><strong>${money(q.totalTtc)}</strong><span>Émis le ${fdate(q.issuedAt)}${q.dueAt?` · Valable jusqu'au ${fdate(q.dueAt)}`:''}</span></div>
      ${accepted
        ?`<p class="help">Accepté par ${e(q.acceptedByName||'le client')} le ${fdt(q.acceptedAt)} — horodatage conservé par l'entreprise.</p>`
        :`<div class="button-row"><button class="btn primary portal-accept" data-id="${e(q.id)}" data-number="${e(q.number||'')}">Accepter ce devis</button></div><p class="help">L'acceptation est horodatée et vaut accord sur le contenu et le prix du devis. Aucun compte n'est nécessaire.</p>`}
    </article>`;
  }).join('')||'<p class="muted">Aucun devis partagé pour le moment.</p>';
  app.innerHTML=shell(`Portail de ${view.clientName||'votre interlocuteur'}`,`
    <p class="help">Espace sécurisé de suivi de vos devis. Retrouvez ici les documents partagés par votre interlocuteur et validez-les en ligne.</p>
    ${rows}`);
  app.querySelectorAll('.portal-accept').forEach(btn=>{
    btn.addEventListener('click',()=>openAcceptModal(token,btn.dataset.id,btn.dataset.number));
  });
}

function openAcceptModal(token,quoteId,number){
  document.querySelector('#portal-accept-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="portal-accept-modal" role="dialog" aria-modal="true" aria-labelledby="portal-accept-title"><section class="modal glass"><div class="section-title"><h2 id="portal-accept-title">Accepter le devis ${e(number||'')}</h2><button type="button" class="icon-btn" id="portal-accept-close" aria-label="Fermer">×</button></div>
    <p>En acceptant, vous confirmez le contenu et le prix du devis ${e(number||'')}. Votre nom et l'horodatage de l'acceptation sont conservés comme preuve de votre accord.</p>
    <label class="field"><span>Votre nom et prénom (signataire)</span><input id="portal-sign-name" maxlength="160" autocomplete="name" placeholder="Ex. Marie Dupont"></label>
    <p class="error" id="portal-accept-error" hidden></p>
    <div class="button-row"><button type="button" class="btn primary" id="portal-accept-confirm">Confirmer l'acceptation</button><button type="button" class="btn secondary" id="portal-accept-cancel">Annuler</button></div>
  </section></div>`);
  const modal=document.querySelector('#portal-accept-modal');
  const close=()=>modal.remove();
  modal.querySelector('#portal-accept-close').onclick=close;
  modal.querySelector('#portal-accept-cancel').onclick=close;
  modal.addEventListener('click',ev=>{if(ev.target===modal)close()});
  modal.querySelector('#portal-sign-name').focus();
  modal.querySelector('#portal-accept-confirm').onclick=async()=>{
    const name=modal.querySelector('#portal-sign-name').value.trim();
    const err=modal.querySelector('#portal-accept-error');
    if(name.length<2){err.textContent='Indiquez votre nom et prénom (2 caractères minimum) : ils sont horodatés avec votre accord.';err.hidden=false;return}
    const btn=modal.querySelector('#portal-accept-confirm');
    btn.disabled=true;btn.textContent='Validation…';
    try{
      await api.portalAccept(token,quoteId,name);
      close();
      document.querySelector('#app').innerHTML=shell('Merci — votre accord est enregistré',`<p>Votre acceptation du devis ${e(number||'')} a été horodatée le ${fdt(new Date().toISOString())} au nom de « ${e(name)} ». Votre interlocuteur la voit immédiatement.</p><div class="button-row"><button type="button" class="btn primary" id="portal-back">Retour au portail</button></div>`);
      document.querySelector('#portal-back')?.addEventListener('click',()=>renderPortal(token));
    }catch(x){
      btn.disabled=false;btn.textContent='Confirmer l\'acceptation';
      err.textContent=x?.message||'Validation impossible pour le moment — réessayez.';
      err.hidden=false;
    }
  };
}
