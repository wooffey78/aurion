// Espace compte sécurisé (avatar) : profil, sécurité, abonnement, documents légaux acceptés.
import{api}from'../../core/api.js';
import{passwordScore,suggestPassword}from'../../core/security.js';
import{S,e,toast,askConfirm,hooks}from'./core.js';

let acc=null;
let avatarObjectUrl='';
const eur=c=>(c/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const fdate=d=>d?new Date(d).toLocaleDateString('fr-FR'):'—';
const STATUS={trialing:['Essai gratuit','ok'],active:['Actif','ok'],past_due:['Paiement en retard','warn'],canceled:['Résilié','warn'],expired:['Essai terminé','warn']};

export const view=()=>`<div class="page-head"><div><span class="eyebrow">MON COMPTE</span><h1>Compte & sécurité</h1><p>Vos informations personnelles, votre mot de passe et votre abonnement.</p></div></div><div id="account-body" class="account-grid"><p class="muted">Chargement…</p></div>`;

export async function bind(){
  const root=document.querySelector('#account-body');
  try{acc=await api.account()}catch(x){root.innerHTML=`<p class="error">${e(x.message)}</p>`;return}
  const u=acc.user,s=acc.subscription,[label,tone]=STATUS[s.status]||[s.status,''];
  const avatarMarkup=u.avatarUrl?`<img class="account-avatar-image" id="avatar-preview" alt="Avatar du compte">`:`<div class="avatar-lg" id="avatar-preview">${e((u.fullName||u.email)[0].toUpperCase())}</div>`;
  root.innerHTML=`
   <section class="panel stack"><h2>Profil</h2>
    <div class="account-id"><div class="account-avatar">${avatarMarkup}</div><div><b>${e(u.email)}</b><small class="muted">${e(acc.organization?.name||'')} · rôle ${e(acc.role)} · compte créé le ${fdate(u.createdAt)}</small></div></div>
    <form id="acc-form" class="stack"><label class="field"><span>Nom complet</span><input id="fullName" value="${e(u.fullName)}" placeholder="Prénom Nom" maxlength="160"></label><button class="btn primary" type="submit">Enregistrer</button></form>
    <form id="avatar-form" class="stack"><label class="field"><span>Avatar personnalisé</span><input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp"></label><small class="help">PNG, JPEG ou WebP · 3 Mo maximum.</small><button class="btn secondary" type="submit">${u.avatarUrl?'Remplacer l’avatar':'Téléverser un avatar'}</button></form>
   </section>
   <section class="panel stack"><h2>Sécurité</h2>
    <form id="pw-form" class="stack"><label class="field"><span>Mot de passe actuel</span><input id="cur" type="password" autocomplete="current-password" required></label>
     <label class="field"><span>Nouveau mot de passe</span><div class="password-input"><input id="new" type="password" minlength="12" autocomplete="new-password" required><button type="button" id="eye" class="icon-btn" aria-label="Afficher le mot de passe">◉</button></div><div class="password-meter"><i id="meter"></i></div><div class="password-actions"><button type="button" id="suggest" class="link-btn">Suggérer un mot de passe</button><span id="score" class="help">12 caractères minimum</span></div></label>
     <button class="btn primary" type="submit">Changer le mot de passe</button><p id="pw-err" class="error" hidden></p></form>
    <p class="help">${u.passwordChangedAt?`Dernier changement : ${fdate(u.passwordChangedAt)}.`:'Mot de passe jamais modifié depuis la création du compte.'} Un changement déconnecte vos autres appareils.</p>
    <div class="button-row"><button class="btn danger" id="logout-all">Me déconnecter de tous les appareils</button></div>
   </section>
   <section class="panel stack wide-panel"><div class="section-title"><h2>Abonnement</h2><span class="chip ${tone}">${e(label)}</span></div>
    ${s.status==='trialing'?`<div class="trial-card"><div class="trial-days"><b>${s.daysLeft}</b><span>jour${s.daysLeft>1?'s':''} d’essai restant${s.daysLeft>1?'s':''}</span></div><div class="trial-info"><p>Essai gratuit de 60 jours : <b>aucune carte bancaire requise</b> et <b>aucun prélèvement automatique</b> à la fin de l’essai.</p><small class="muted">Début : ${fdate(s.trialStartedAt)} · Fin : ${fdate(s.trialEndsAt)}</small>${s.daysLeft<=7?'<div class="button-row"><button class="btn primary" id="sub-alert">S’abonner</button><button class="btn secondary" id="sub-export-alert">Télécharger mes données</button></div>':''}</div></div>`:`<div class="notice ${s.readOnly?'warn-notice':''}">${s.status==='expired'?`Votre accès est en lecture seule. Téléchargez vos données avant le ${fdate(s.dataReadOnlyUntil)}. Vous pouvez souscrire à tout moment.`:'Statut de votre abonnement.'}</div>`}
    ${s.cancelAtPeriodEnd?'<div class="notice warn-notice">Vous avez demandé à ne pas poursuivre après l’essai. <button class="link-btn" id="sub-resume">Annuler cette demande</button></div>':''}
    <div class="plan-grid">${s.plans.map(p=>`<div class="plan-card"><span class="eyebrow">${p.billing_interval==='year'?'ANNUEL':'MENSUEL'}</span><b>${eur(Math.round(Number(p.price_ht_cents)*1.2))} <small>TTC / ${p.billing_interval==='year'?'an':'mois'}</small></b><small class="muted">${p.billing_interval==='year'?'151,20 € TTC/an · remise de 10 % (économie de 16,80 € par an).':'14,00 € TTC/mois.'} Paiement ponctuel, sans renouvellement automatique.</small><div class="button-row"><button class="btn primary small sub-card" data-plan="${e(p.code)}">Souscrire</button></div></div>`).join('')}</div>
    <div class="button-row"><button class="btn secondary" id="sub-info">Souscrire</button><button class="btn secondary" id="account-download">Télécharger mes données</button>${!s.cancelAtPeriodEnd&&['trialing','active'].includes(s.status)?'<button class="btn danger" id="sub-cancel">Ne pas poursuivre / résilier</button>':''}</div>
    <p class="help">Paiement par carte via une page sécurisée du prestataire ou par virement bancaire. Chaque période est payée séparément : aucun prélèvement et aucun renouvellement automatique.</p>
   </section>
   <section class="panel wide-panel"><div class="section-title"><h2>Mes données</h2><button class="btn primary" id="download-all">Télécharger toutes mes données (.zip)</button></div><p class="muted">Aurion génère un dossier compressé contenant les fiches clients, devis, factures et le document comptable en PDF séparés.</p></section><section class="panel wide-panel"><h2>Documents légaux acceptés</h2>${acc.legalAcceptances.map(a=>`<div class="list-row"><div><b>${e(a.title)}</b><small>Version ${e(a.version)}${a.is_draft?' (brouillon)':''} · acceptée le ${fdate(a.accepted_at)}</small></div><a class="link-btn" href="#/legal/${e(a.kind)}" target="_blank" rel="noopener">Consulter</a></div>`).join('')||'<p class="muted">Aucune acceptation enregistrée.</p>'}</section>`;

  const $=s=>root.querySelector(s);
  if(avatarObjectUrl){URL.revokeObjectURL(avatarObjectUrl);avatarObjectUrl='';}
  if(u.avatarUrl){try{const response=await api.accountAvatar();if(response.ok){const blob=await response.blob();avatarObjectUrl=URL.createObjectURL(blob);const img=$('#avatar-preview');if(img)img.src=avatarObjectUrl;}}catch{}}
  $('#download-all').onclick=()=>api.downloadAll();
  $('#acc-form').onsubmit=async ev=>{ev.preventDefault();try{await api.updateAccount({fullName:$('#fullName').value.trim()});toast('Profil enregistré','success');await hooks.refresh('account')}catch(x){toast(x.message,'error')}};
  $('#avatar-form').onsubmit=async ev=>{ev.preventDefault();const file=$('#avatar-file').files?.[0];if(!file){toast('Choisissez une image.','error');return}try{
      await api.uploadAvatar(file);
      const response=await api.accountAvatar();
      if(!response.ok)throw new Error('Avatar indisponible après enregistrement');
      const blob=await response.blob();
      const shellAvatarUrl=URL.createObjectURL(blob);
      window.dispatchEvent(new CustomEvent('aurion-avatar-updated',{detail:{url:shellAvatarUrl}}));
      toast('Avatar enregistré','success');
      await hooks.refresh('account');
    }catch(x){toast(x.message,'error')}};
  const pw=$('#new');
  pw.oninput=()=>{const sc=passwordScore(pw.value);$('#meter').style.width=`${sc*20}%`;$('#score').textContent=sc>=4?'Excellent mot de passe':`${Math.max(0,12-pw.value.length)} caractère(s) à ajouter`};
  $('#eye').onclick=()=>{pw.type=pw.type==='password'?'text':'password'};
  $('#suggest').onclick=()=>{pw.value=suggestPassword();pw.type='text';pw.dispatchEvent(new Event('input'));toast('Mot de passe généré. Enregistrez-le dans votre gestionnaire.','success')};
  $('#pw-form').onsubmit=async ev=>{ev.preventDefault();const err=$('#pw-err');err.hidden=true;
    if(passwordScore(pw.value)<4){err.textContent='Choisissez un mot de passe plus robuste.';err.hidden=false;return}
    try{await api.changePassword($('#cur').value,pw.value);$('#cur').value='';pw.value='';toast('Mot de passe modifié. Vos autres sessions ont été déconnectées.','success')}catch(x){err.textContent=x.message;err.hidden=false}};
  $('#logout-all').onclick=async()=>{if(!await askConfirm({title:'Se déconnecter partout ?',message:'Toutes vos sessions, y compris celle-ci, seront fermées. Vous devrez vous reconnecter.',confirmLabel:'Me déconnecter partout',danger:true}))return;try{await api.logoutAll();location.hash='#/auth';location.reload()}catch(x){toast(x.message,'error')}};
  $('#account-download')?.addEventListener('click',()=>api.downloadAll().catch(x=>toast(x.message,'error')));
  $('#sub-cancel')?.addEventListener('click',async()=>{if(!await askConfirm({title:'Ne pas poursuivre après l’essai ?',message:'Aucun prélèvement n’aura lieu. Vos données restent conservées. Vous pourrez reprendre à tout moment.',confirmLabel:'Confirmer',danger:true}))return;try{await api.cancelSubscription();toast('Demande enregistrée','success');bind()}catch(x){toast(x.message,'error')}});
  $('#sub-resume')?.addEventListener('click',async()=>{try{await api.resumeSubscription();toast('Demande annulée','success');bind()}catch(x){toast(x.message,'error')}});
  $('#sub-info').onclick=()=>root.querySelector('.plan-card .sub-card')?.scrollIntoView({behavior:'smooth',block:'center'});
  const closeSubscriptionChoice=()=>document.querySelector('#subscription-choice-modal')?.remove();
  const openSubscriptionChoice=(plan)=>{
    const methods=s.paymentMethods||{card:!!s.paymentEnabled,bankTransfer:false};
    const cardAvailable=methods.card===true;
    const bankAvailable=methods.bankTransfer===true;
    if(!cardAvailable&&!bankAvailable){toast('Aucun moyen de paiement n’est encore configuré.','error');return;}
    const amountTtc=Math.round(Number(plan.price_ht_cents||0)*1.2);
    document.querySelector('#subscription-choice-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop confirm-backdrop" id="subscription-choice-modal" role="dialog" aria-modal="true"><div class="modal glass confirm-modal"><div class="confirm-icon" aria-hidden="true">€</div><h2>Choisissez votre mode de paiement</h2><p class="muted"><b>${e(plan.name)}</b> · ${eur(amountTtc)} TTC / ${plan.billing_interval==='year'?'an':'mois'}</p><div class="button-row confirm-actions">${cardAvailable?'<button type="button" class="btn primary" data-pay="card">Payer par carte</button>':''}${bankAvailable?'<button type="button" class="btn secondary" data-pay="bank_transfer">Payer par virement</button>':''}<button type="button" class="btn secondary" data-pay="cancel">Annuler</button></div></div></div>`);
    const modal=document.querySelector('#subscription-choice-modal');
    modal.querySelectorAll('[data-pay]').forEach(btn=>btn.onclick=async()=>{
      const method=btn.dataset.pay;
      if(method==='cancel'){closeSubscriptionChoice();return;}
      closeSubscriptionChoice();
      try{
        const r=await api.subscribe({planCode:plan.code,method});
        if(r.checkoutUrl){location.href=r.checkoutUrl;return;}
        if(r.bankTransfer){
          document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop confirm-backdrop" id="subscription-bank-modal" role="dialog" aria-modal="true"><div class="modal glass confirm-modal"><div class="confirm-icon" aria-hidden="true">€</div><h2>Virement bancaire</h2><p class="muted">Effectuez le virement avec les informations ci-dessous.</p><div class="notice"><b>Titulaire :</b> ${e(r.bankTransfer.holder)}<br><b>IBAN :</b> ${e(r.bankTransfer.iban)}<br><b>BIC :</b> ${e(r.bankTransfer.bic)}<br><b>Référence :</b> ${e(r.reference)}<br><b>Montant TTC :</b> ${e(eur(r.amountTtcCents))}</div><div class="button-row"><button type="button" class="btn primary" data-bank-close>Fermer</button></div></div></div>`);
          document.querySelector('[data-bank-close]')?.addEventListener('click',()=>document.querySelector('#subscription-bank-modal')?.remove());
        }else{toast('Demande de souscription enregistrée','success');bind();}
      }catch(x){toast(x.message,'error');}
    });
  };
  root.querySelectorAll('.sub-card,#sub-alert').forEach(b=>b.onclick=async()=>{const planCode=b.dataset.plan||s.plans[0]?.code;const plan=s.plans.find(p=>p.code===planCode);if(!plan)return;openSubscriptionChoice(plan)});
  $('#sub-export-alert')?.addEventListener('click',()=>api.downloadAll().catch(x=>toast(x.message,'error')));
  const sessionId=new URLSearchParams(location.hash.split('?')[1]||'').get('session_id')||new URLSearchParams(location.search).get('session_id');if(sessionId&&location.hash.includes('billing=success'))api.completeCheckout(sessionId).then(()=>{toast('Paiement confirmé. Abonnement activé.','success');bind()}).catch(x=>toast(x.message,'error'));
}
void S;void hooks;
