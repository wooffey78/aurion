// Espace compte sécurisé (avatar) : profil, sécurité, abonnement, documents légaux acceptés.
import{api}from'../../core/api.js';
import{invalidateSession}from'../../core/session.js';
import{go}from'../../core/router.js';
import{passwordScore,suggestPassword}from'../../core/security.js';
import{isMobileDevice,supportsPlatformPasskeys}from'../../core/device.js';
import{S,e,toast,askConfirm,modalForm,hooks}from'./core.js';

let acc=null;
let avatarObjectUrl='';
const eur=c=>(c/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const fdate=d=>d?new Date(d).toLocaleDateString('fr-FR'):'—';
const STATUS={admin:['Accès administrateur','ok'],vip:['Accès gratuit','ok'],trialing:['Essai gratuit','ok'],active:['Actif','ok'],no_billing:['Sans abonnement',''],past_due:['Paiement en retard','warn'],canceled:['Résilié','warn'],expired:['Essai terminé','warn']};

export const view=()=>`<div class="page-head"><div><span class="eyebrow">MON COMPTE</span><h1>Compte & sécurité</h1><p>Vos informations personnelles, votre mot de passe et votre abonnement.</p></div></div><div id="account-body" class="account-grid"><p class="muted">Chargement…</p></div>`;

export async function bind(){
  const root=document.querySelector('#account-body');
  try{acc=await api.account()}catch(x){root.innerHTML=`<p class="error">${e(x.message)}</p>`;return}
  const u=acc.user,s=acc.subscription,[label,tone]=STATUS[s.status]||[s.status,''];
  // Sans moyen de paiement configuré, aucun abonnement ne peut être souscrit : on n'affiche ni
  // tarifs ni bouton « Souscrire » qui ne pourraient rien faire.
  const canSubscribe=!!s.paymentEnabled;
  const expiredAccess=`Votre accès est en lecture seule. Téléchargez vos données avant le ${fdate(s.dataReadOnlyUntil)}.`;
  // Ne jamais promettre une souscription quand aucun moyen de paiement n'est configuré :
  // les offres et le bouton sont alors masqués, et l'avis doit le dire explicitement.
  const expiredNotice=canSubscribe
    ?`${expiredAccess} Vous pouvez souscrire à tout moment.`
    :`${expiredAccess} Aucun moyen de paiement n’est configuré sur cette installation : aucun abonnement ne peut être souscrit. Contactez l’éditeur si vous souhaitez rétablir votre accès.`;
  const subscriptionNotice=s.status==='admin'
    ?'<div class="notice"><b>Accès administrateur.</b> Votre espace bénéficie d’un accès complet sans abonnement ni période d’essai.</div>'
    :s.status==='vip'
    ?'<div class="notice"><b>Accès gratuit.</b> Votre espace bénéficie d’un accès complet sans abonnement ni période d’essai.</div>'
    :s.status==='no_billing'
    ?'<div class="notice"><b>Sans abonnement.</b> La facturation n’est pas configurée sur cette installation : votre accès est complet, sans paiement, sans essai et sans échéance.</div>'
    :`<div class="notice ${s.readOnly?'warn-notice':''}">${s.status==='expired'?expiredNotice:'Statut de votre abonnement.'}</div>`;
  // 15.4.62 — avatar jamais vide : les initiales sont TOUJOURS rendues sous l'image ; l'image
  // téléversée les recouvre quand elle charge réellement, et disparaît (onerror/échec du
  // chargement) au profit des initiales — plus aucun « rond vide ».
  const avatarMarkup=`<div class="account-avatar-stack"><div class="avatar-lg" aria-hidden="true">${e((u.fullName||u.email||'A')[0].toUpperCase())}</div>${u.avatarUrl?`<img class="account-avatar-image" id="avatar-preview" alt="Avatar du compte">`:''}</div>`;
  root.innerHTML=`
   <section class="panel stack"><h2>Profil</h2>
    <div class="account-id"><div class="account-avatar">${avatarMarkup}</div><div><b>${e(u.email)}</b><small class="muted">${e(acc.organization?.name||'')} · rôle ${e(acc.role)} · compte créé le ${fdate(u.createdAt)}</small></div></div>
    <form id="acc-form" class="stack"><div class="grid-2"><label class="field"><span>Nom complet</span><input id="fullName" value="${e(u.fullName)}" placeholder="Prénom Nom" maxlength="160" autocomplete="name"></label><label class="field"><span>Fonction</span><input id="jobTitle" value="${e(u.jobTitle||'')}" placeholder="Ex. gérant" maxlength="160" autocomplete="organization-title"></label></div><div class="grid-2"><label class="field"><span>Téléphone mobile</span><input id="mobilePhone" type="tel" autocomplete="tel" value="${e(u.mobilePhone||'')}" placeholder="06 00 00 00 00" maxlength="60"></label><label class="field"><span>Téléphone fixe</span><input id="fixedPhone" type="tel" value="${e(u.fixedPhone||'')}" placeholder="01 00 00 00 00" maxlength="60"></label></div><small class="help">Ces coordonnées sont reprises dans le parcours et préremplissent la signature professionnelle lorsqu’elle est configurée.</small><button class="btn primary" type="submit">Enregistrer</button></form>
    <form id="avatar-form" class="stack"><label class="field"><span>Avatar personnalisé</span><input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp"></label><small class="help">PNG, JPEG ou WebP · 3 Mo maximum.</small><button class="btn secondary" type="submit">${u.avatarUrl?'Remplacer l’avatar':'Téléverser un avatar'}</button></form>
   </section>
   <section class="panel stack"><h2>Sécurité</h2>
    <form id="pw-form" class="stack"><label class="field"><span>Mot de passe actuel</span><input id="cur" type="password" autocomplete="current-password" required></label>
     <label class="field"><span>Nouveau mot de passe</span><div class="password-input"><input id="new" type="password" minlength="12" autocomplete="new-password" required><button type="button" id="eye" class="icon-btn" aria-label="Afficher le mot de passe">◉</button></div><div class="password-meter"><i id="meter"></i></div><div class="password-actions"><button type="button" id="suggest" class="link-btn">Suggérer un mot de passe</button><span id="score" class="help">12 caractères minimum</span></div></label>
     <button class="btn primary" type="submit">Changer le mot de passe</button><p id="pw-err" class="error" hidden></p></form>
    <p class="help">${u.passwordChangedAt?`Dernier changement : ${fdate(u.passwordChangedAt)}.`:'Mot de passe jamais modifié depuis la création du compte.'} Un changement déconnecte vos autres appareils.</p>
    <section class="account-passkeys stack" aria-labelledby="passkeys-title">
     <div class="section-title"><div><h3 id="passkeys-title">Clés d’accès</h3><p class="help">Sur mobile, une clé d’accès peut être déverrouillée par empreinte, visage ou code de l’appareil.</p></div><button class="btn secondary small" id="passkey-add" type="button">Ajouter une clé sur ce téléphone</button></div>
     <div id="passkey-list" class="passkey-list" aria-live="polite"><p class="muted">Chargement des clés d’accès…</p></div>
     <p class="help">La vérification locale peut utiliser une empreinte, la reconnaissance faciale ou le code de l’appareil selon le système configuré. Votre authentifiant n’envoie pas vos données biométriques à Aurion.</p>
    </section>
    <div class="button-row"><button class="btn danger" id="logout-all">Me déconnecter de tous les appareils</button></div>
   </section>
   <section class="panel stack wide-panel"><div class="section-title"><h2>Abonnement</h2><span class="chip ${tone}">${e(label)}</span></div>
    ${s.status==='trialing'?`<div class="trial-card"><div class="trial-days"><b>${s.daysLeft}</b><span>jour${s.daysLeft>1?'s':''} d’essai restant${s.daysLeft>1?'s':''}</span></div><div class="trial-info"><p>Essai gratuit de 60 jours : <b>aucune carte bancaire requise</b> et <b>aucun prélèvement automatique</b> à la fin de l’essai.</p><small class="muted">Début : ${fdate(s.trialStartedAt)} · Fin : ${fdate(s.trialEndsAt)}</small>${s.daysLeft<=7?'<div class="button-row"><button class="btn primary" id="sub-alert">S’abonner</button><button class="btn secondary" id="sub-export-alert">Télécharger mes données</button></div>':''}</div></div>`:subscriptionNotice}
    ${s.cancelAtPeriodEnd?'<div class="notice warn-notice">Vous avez demandé à ne pas poursuivre après l’essai. <button class="link-btn" id="sub-resume">Annuler cette demande</button></div>':''}
    ${canSubscribe?`<div class="plan-grid">${s.plans.map(p=>`<div class="plan-card"><span class="eyebrow">${p.billing_interval==='year'?'ANNUEL':'MENSUEL'}</span><b>${eur(Number(p.price_ttc_cents??p.price_ht_cents))} <small>TTC / ${p.billing_interval==='year'?'an':'mois'}</small></b><small class="muted">${p.billing_interval==='year'?'Tarif TTC annuel calculé selon la configuration fiscale.':'Tarif TTC mensuel calculé selon la configuration fiscale.'} Paiement ponctuel, sans renouvellement automatique.</small><div class="button-row"><button class="btn primary small sub-card" data-plan="${e(p.code)}">Souscrire</button></div></div>`).join('')}</div>`:'<div class="notice"><b>Aucun moyen de paiement configuré.</b> Aucun abonnement ne peut être souscrit depuis cette installation. Votre accès reste complet, sans paiement et sans échéance.</div>'}
    <div class="button-row">${canSubscribe?'<button class="btn secondary" id="sub-info">Souscrire</button>':''}<button class="btn secondary" id="account-download">Télécharger mes données</button>${!s.cancelAtPeriodEnd&&['trialing','active'].includes(s.status)?'<button class="btn danger" id="sub-cancel">Ne pas poursuivre / résilier</button>':''}</div>
    ${canSubscribe?'<p class="help">Paiement par carte via une page sécurisée du prestataire ou par virement bancaire. Chaque période est payée séparément : aucun prélèvement et aucun renouvellement automatique.</p>':''}
   </section>
   <section class="panel stack wide-panel" id="account-company"><div class="section-title"><h2>Mon entreprise</h2><button type="button" class="btn secondary small" data-go-settings>Modifier dans Paramètres</button></div><div class="storage-grid"><article><span>Dénomination</span><b>${e(S.company?.name||'—')}</b></article><article><span>SIRET / SIREN</span><b>${e(S.company?.siret||S.company?.siren||'—')}</b></article><article><span>Forme juridique</span><b>${e(S.company?.legal_form||'—')}</b></article><article><span>Adresse</span><b>${e([S.company?.address,[S.company?.postal_code,S.company?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')||'—')}</b></article><article><span>Activité</span><b>${e(S.company?.custom_activity||S.company?.activity||'—')}</b></article><article><span>N° de TVA</span><b>${e(S.company?.configuration_data?.vat_number||'—')}</b></article></div><small class="help">Ces informations proviennent de la même fiche que Paramètres et le parcours d’accueil.</small></section>
   <section class="panel stack wide-panel" id="account-withdrawal"><div class="section-title"><h2>Rétractation</h2><span class="pill">Contrat Aurion</span></div>
    <p class="help">Si vous êtes consommateur et souhaitez vous rétracter de votre contrat Aurion conclu à distance, utilisez ce formulaire. Un accusé de réception est envoyé à l’adresse indiquée.</p>
    <form id="withdrawal-account-form" class="stack" novalidate><div class="grid-2"><label class="field"><span>Prénom</span><input name="firstName" required maxlength="100" value="${e(String(u.fullName||'').trim().split(/\s+/)[0]||'')}"></label><label class="field"><span>Nom</span><input name="lastName" required maxlength="100" value="${e(String(u.fullName||'').trim().split(/\s+/).slice(1).join(' '))}"></label></div>
     <div class="grid-2"><label class="field"><span>Adresse e-mail de réponse</span><input name="email" type="email" required maxlength="254" value="${e(u.email)}"></label><label class="field"><span>Confirmez l’adresse e-mail</span><input name="confirmationEmail" type="email" required maxlength="254" value="${e(u.email)}"></label></div>
     <div class="grid-2"><label class="field"><span>Date de conclusion du contrat</span><input name="contractDate" type="date" required max="${new Date().toISOString().slice(0,10)}" value="${e(String(u.createdAt||'').slice(0,10))}"></label><label class="field"><span>Références du contrat</span><input name="contractReference" required minlength="8" maxlength="1000" value="${e(`Abonnement Aurion — compte ${u.email}${s?.status?` — ${label}`:''}`)}"></label></div>
     <div class="button-row"><button type="submit" class="btn danger" id="withdrawal-account-submit">Envoyer ma déclaration de rétractation</button></div><p class="help" id="withdrawal-account-status" role="status" aria-live="polite"></p></form>
    <div class="section-title"><h3>Mes demandes</h3></div><div class="withdrawal-list" id="withdrawal-history"><p class="muted">Chargement…</p></div>
   </section>
   <section class="panel stack wide-panel" id="account-deletion"><div class="section-title"><h2>Suppression du compte</h2><span class="pill">Données personnelles</span></div>
    <p class="help">Vous pouvez demander la suppression de votre compte et des données associées. La demande est enregistrée immédiatement ; les factures et pièces comptables que la loi impose de conserver restent archivées, le reste est supprimé. <a class="link-btn" href="/legal/suppression-compte" target="_blank" rel="noopener">Consulter la page publique</a></p>
    <div id="deletion-status" role="status" aria-live="polite"><p class="muted">Chargement…</p></div>
    <div class="button-row"><button class="btn danger" type="button" id="deletion-request">Demander la suppression de mon compte</button></div>
   </section>
   <section class="panel wide-panel"><div class="section-title"><h2>Mes données</h2><button class="btn primary" id="download-all">Télécharger toutes mes données (.zip)</button></div><p class="muted">Aurion génère un dossier compressé contenant les fiches clients, devis, factures et le document comptable en PDF séparés.</p></section><section class="panel wide-panel"><h2>Documents légaux acceptés</h2>${acc.legalAcceptances.map(a=>`<div class="list-row"><div><b>${e(a.title)}</b><small>Version ${e(a.version)}${a.is_draft?' (brouillon)':''} · acceptée le ${fdate(a.accepted_at)}</small></div><a class="link-btn" href="#/legal/${e(a.kind)}" target="_blank" rel="noopener">Consulter</a></div>`).join('')||'<p class="muted">Aucune acceptation enregistrée.</p>'}</section>`;

  const $=s=>root.querySelector(s);
  const b64u=x=>{const bytes=new Uint8Array(x);let out='';for(const b of bytes)out+=String.fromCharCode(b);return btoa(out).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
  const dec=x=>{const text=String(x).replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(text),c=>c.charCodeAt(0))};
  const browserPasskeysAvailable=()=>Boolean(window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials?.create&&navigator.credentials?.get);
  const passkeyAllowed=()=>supportsPlatformPasskeys();
  const passkeyDate=value=>value?new Date(value).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'}):'Jamais utilisée';
  const loadPasskeys=async()=>{
    const list=$('#passkey-list'),button=$('#passkey-add');if(!list)return;
    button.hidden=!isMobileDevice();
    button.disabled=!passkeyAllowed();
    if(!browserPasskeysAvailable()){list.innerHTML='<p class="muted">La gestion des clés d’accès nécessite un navigateur compatible et une connexion sécurisée (HTTPS).</p>';return}
    try{
      const result=await api.webauthnCredentials(),items=Array.isArray(result.credentials)?result.credentials:[];
      list.innerHTML=items.length?items.map(item=>`<article class="passkey-row"><div><strong>Clé d’accès</strong><small>Ajoutée le ${e(passkeyDate(item.createdAt))} · Dernière utilisation : ${e(passkeyDate(item.lastUsedAt))}</small><small>Type : ${e((item.transports||[]).join(', ')||'Authentificateur de l’appareil ou synchronisé')}</small></div><button class="btn danger small" type="button" data-passkey-delete="${e(item.id)}">Retirer</button></article>`).join(''):'<p class="muted">Aucune clé d’accès n’est enregistrée pour ce compte.</p>';
      list.querySelectorAll('[data-passkey-delete]').forEach(button=>button.addEventListener('click',async()=>{
        const id=button.dataset.passkeyDelete;
        if(!await askConfirm({title:'Retirer cette clé d’accès ?',message:'Cette clé ne permettra plus de se connecter à Aurion. Les autres méthodes de connexion et les autres clés restent disponibles.',confirmLabel:'Retirer la clé',danger:true}))return;
        button.disabled=true;
        try{await api.deleteWebauthnCredential(id);toast('Clé d’accès retirée.','success');await loadPasskeys()}
        catch(error){toast(error.message||'Impossible de retirer cette clé.','error');button.disabled=false}
      }));
    }catch(error){list.innerHTML='<p class="error">Impossible de charger les clés d’accès. Réessayez plus tard.</p>'}
  };
  $('#passkey-add')?.addEventListener('click',async()=>{
    const button=$('#passkey-add');if(!passkeyAllowed())return toast('Votre navigateur ne prend pas en charge les clés d’accès sur cette connexion.','error');
    button.disabled=true;
    try{
      const options=await api.webauthnRegisterOptions();
      const selection=Object.assign({},options.authenticatorSelection||{},{authenticatorAttachment:'platform',residentKey:'required',userVerification:'required'});
      const credential=await navigator.credentials.create({publicKey:{challenge:dec(options.challenge),rp:options.rp,user:{id:dec(options.user.id),name:options.user.name,displayName:options.user.displayName},pubKeyCredParams:options.pubKeyCredParams,authenticatorSelection:selection,timeout:options.timeout,attestation:options.attestation}});
      if(!credential)throw new Error('Création de clé d’accès annulée.');
      await api.webauthnRegisterVerify({response:{clientDataJSON:b64u(credential.response.clientDataJSON),attestationObject:b64u(credential.response.attestationObject),transports:credential.response.getTransports?.()||[]}});
      toast('Clé d’accès enregistrée.','success');await loadPasskeys();
    }catch(error){toast(error?.message||'Impossible d’enregistrer la clé d’accès.','error')}
    finally{button.disabled=false}
  });
  // Suppression du compte : statut, demande avec confirmation forte, annulation.
  const loadDeletion=async()=>{
    const box=$('#deletion-status'),btn=$('#deletion-request');if(!box)return;
    try{
      const r=await api.accountDeletionRequest();
      if(r.request){
        box.innerHTML=`<div class="notice warn-notice"><b>Demande enregistrée</b><br>Envoyée le ${e(new Date(r.request.requestedAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}))} · référence ${e(r.request.id)}.<br>Suppression réalisée sous 30 jours. Vous pouvez annuler tant que la demande n’est pas traitée.</div><div class="button-row"><button class="btn secondary" type="button" id="deletion-cancel">Annuler ma demande</button></div>`;
        btn.hidden=true;
        $('#deletion-cancel').onclick=async()=>{
          if(!await askConfirm({title:'Annuler la suppression du compte ?',message:'Votre compte reste actif et la demande de suppression est retirée.',confirmLabel:'Annuler la demande'}))return;
          try{await api.cancelAccountDeletion();toast('Demande de suppression annulée.','success');await loadDeletion()}catch(x){toast(x.message,'error')}
        };
      }else{box.innerHTML='<p class="muted">Aucune demande de suppression en cours.</p>';btn.hidden=false}
    }catch(x){box.innerHTML=`<p class="error">${e(x.message)}</p>`}
  };
  void loadDeletion();
  $('#deletion-request')?.addEventListener('click',async()=>{
    if(!await askConfirm({title:'Demander la suppression de votre compte ?',message:'Le compte et les données associées seront supprimés. Les factures et pièces comptables obligatoires restent archivées. La demande peut être annulée tant qu’elle n’est pas traitée.',confirmLabel:'Continuer',danger:true}))return;
    // Confirmation forte : le mot de passe actuel est demandé et revérifié côté serveur.
    const m=modalForm('Confirmer la suppression du compte',`<label class="field"><span>Mot de passe actuel (confirmation forte)</span><input name="deletionPassword" type="password" autocomplete="current-password" required></label><p class="help">Votre mot de passe est revérifié côté serveur avant l’enregistrement de la demande. La demande peut être annulée tant qu’elle n’est pas traitée.</p>`,async m=>{
      const f=new FormData(m.querySelector('#generic-form'));
      try{await api.requestAccountDeletion('',String(f.get('deletionPassword')||''));m.remove();toast('Demande de suppression enregistrée.','success');await loadDeletion()}
      catch(x){const err=m.querySelector('#generic-error');if(err){err.hidden=false;err.textContent=x.message||'Confirmation impossible.'}}
    },{label:'Confirmer la demande',done:'Demande enregistrée'});
    m.querySelector('input[name="deletionPassword"]')?.focus();
  });
  void loadPasskeys();
  if(avatarObjectUrl){URL.revokeObjectURL(avatarObjectUrl);avatarObjectUrl='';}
  // 15.4.62 — l'image ne s'applique que si elle existe et n'est pas vide (blob de 0 octet =
  // rond vide garanti) ; sinon les initiales restent affichées.
  if(u.avatarUrl){try{const response=await api.accountAvatar();if(response.ok){const blob=await response.blob();if(blob&&blob.size>0){avatarObjectUrl=URL.createObjectURL(blob);const img=$('#avatar-preview');if(img){img.onerror=()=>img.remove();img.src=avatarObjectUrl}else{URL.revokeObjectURL(avatarObjectUrl);avatarObjectUrl=''}}}}catch{}}
  else{const img=$('#avatar-preview');if(img)img.remove();}
  $('#download-all').onclick=()=>api.downloadAll();
  $('#acc-form').onsubmit=async ev=>{ev.preventDefault();try{await api.updateAccount({fullName:$('#fullName').value.trim(),jobTitle:$('#jobTitle').value.trim(),mobilePhone:$('#mobilePhone').value.trim(),fixedPhone:$('#fixedPhone').value.trim()});toast('Profil enregistré','success');await hooks.refresh('account')}catch(x){toast(x.message,'error')}};
  $('#avatar-form').onsubmit=async ev=>{ev.preventDefault();const file=$('#avatar-file').files?.[0];if(!file){toast('Choisissez une image.','error');return}try{
      await api.uploadAvatar(file);
      // 15.4.66 — vérification que l'avatar est bien disponible après enregistrement ; plus
      // d'événement coquille : la barre supérieure affiche désormais un lien « Mon compte ».
      const response=await api.accountAvatar();
      if(!response.ok)throw new Error('Avatar indisponible après enregistrement');
      toast('Avatar enregistré','success');
      // 15.4.70 — la bulle du header écoute cet événement : sans lui, l'avatar téléversé
      // n'apparaissait qu'après un rechargement complet de la page.
      window.dispatchEvent(new Event('aurion:avatar-updated'));
      await hooks.refresh('account');
    }catch(x){toast(x.message,'error')}};
  const pw=$('#new');
  pw.oninput=()=>{const sc=passwordScore(pw.value);$('#meter').style.width=`${sc*20}%`;$('#score').textContent=sc>=4?'Excellent mot de passe':`${Math.max(0,12-pw.value.length)} caractère(s) à ajouter`};
  $('#eye').onclick=()=>{pw.type=pw.type==='password'?'text':'password'};
  $('#suggest').onclick=()=>{pw.value=suggestPassword();pw.type='text';pw.dispatchEvent(new Event('input'));toast('Mot de passe généré. Enregistrez-le dans votre gestionnaire.','success')};
  $('#pw-form').onsubmit=async ev=>{ev.preventDefault();const err=$('#pw-err');err.hidden=true;
    if(passwordScore(pw.value)<4){err.textContent='Choisissez un mot de passe plus robuste.';err.hidden=false;return}
    try{await api.changePassword($('#cur').value,pw.value);$('#cur').value='';pw.value='';toast('Mot de passe modifié. Vos autres sessions ont été déconnectées.','success')}catch(x){err.textContent=x.message;err.hidden=false}};
  $('#logout-all').onclick=async()=>{if(!await askConfirm({title:'Se déconnecter partout ?',message:'Toutes vos sessions, y compris celle-ci, seront fermées. Vous devrez vous reconnecter.',confirmLabel:'Me déconnecter partout',danger:true}))return;try{await api.logoutAll();invalidateSession();go('/auth')}catch(x){toast(x.message,'error')}};
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
    const amountTtc=Number(plan.price_ttc_cents??plan.price_ht_cents??0);
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
  root.querySelector('[data-go-settings]')?.addEventListener('click',()=>hooks.show('settings'));
  const WSTATUS={received:'Reçue',reviewing:'En cours d’examen',processed:'Traitée',rejected:'Non recevable'};
  const loadWithdrawals=async()=>{const box=$('#withdrawal-history');if(!box)return;try{const r=await api.accountWithdrawals();box.innerHTML=(r.withdrawals||[]).map(w=>`<div class="withdrawal-row"><div><b>${e(WSTATUS[w.status]||w.status)}</b><small>Envoyée le ${e(new Date(w.submittedAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}))} · référence ${e(w.id)}</small><small>Accusé de réception : ${w.receiptStatus==='sent'?'envoyé':w.receiptStatus==='failed'?'non délivré (contactez le support)':'en attente'}</small></div></div>`).join('')||'<p class="muted">Aucune demande de rétractation.</p>'}catch(x){box.innerHTML=`<p class="error">${e(x.message)}</p>`}};
  void loadWithdrawals();
  $('#withdrawal-account-form')?.addEventListener('submit',async ev=>{
    ev.preventDefault();const form=ev.currentTarget,btn=$('#withdrawal-account-submit'),note=$('#withdrawal-account-status');
    if(!form.reportValidity())return;
    if(!await askConfirm({title:'Envoyer votre déclaration de rétractation ?',message:'Cette déclaration sera enregistrée et un accusé de réception vous sera envoyé.',confirmLabel:'Envoyer',danger:true}))return;
    const f=new FormData(form);btn.disabled=true;note.className='help';note.textContent='Envoi de votre déclaration…';
    try{const r=await api.accountWithdrawal({firstName:f.get('firstName'),lastName:f.get('lastName'),email:f.get('email'),confirmationEmail:f.get('confirmationEmail'),contractDate:f.get('contractDate'),contractReference:f.get('contractReference')});note.textContent=`Déclaration enregistrée (référence ${r.id}). ${r.receiptSent?'Accusé de réception envoyé.':'L’accusé de réception n’a pas pu être envoyé : contactez '+(r.supportEmail||'le support')+'.'}`;toast('Déclaration de rétractation enregistrée.','success');await loadWithdrawals()}
    catch(x){note.className='error';note.textContent=x.message||'Envoi impossible.'}finally{btn.disabled=false}
  });
}
void S;void hooks;
