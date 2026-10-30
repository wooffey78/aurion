import{passwordScore,suggestPassword}from'../core/security.js';
import{go}from'../core/router.js';
import{toast,appLogo}from'../core/ui.js';
import{api}from'../core/api.js';
import{invalidateSession}from'../core/session.js';
import{isMobileDevice,supportsPlatformPasskeys,supportsConditionalPasskeys}from'../core/device.js';

const b64u=x=>{const b=new Uint8Array(x);let s='';for(const c of b)s+=String.fromCharCode(c);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const dec=x=>{const s=String(x).replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s),c=>c.charCodeAt(0))};
const passkeyChoiceKey=email=>'aurion.passkey.choice:'+String(email||'').trim().toLowerCase();

async function enableMobilePasskey(){
  const o=await api.webauthnRegisterOptions();
  const selection=Object.assign({},o.authenticatorSelection||{},{authenticatorAttachment:'platform',residentKey:'required',userVerification:'required'});
  const cred=await navigator.credentials.create({publicKey:{challenge:dec(o.challenge),rp:o.rp,user:{id:dec(o.user.id),name:o.user.name,displayName:o.user.displayName},pubKeyCredParams:o.pubKeyCredParams,authenticatorSelection:selection,timeout:o.timeout,attestation:o.attestation}});
  if(!cred)throw new Error('La création de la clé d’accès a été annulée.');
  await api.webauthnRegisterVerify({response:{clientDataJSON:b64u(cred.response.clientDataJSON),attestationObject:b64u(cred.response.attestationObject),transports:cred.response.getTransports?.()||[]}});
}

async function finishPasskeyLogin(credential,challenge){
  const d=await api.webauthnAuthVerify({challenge,rawId:b64u(credential.rawId),response:{clientDataJSON:b64u(credential.response.clientDataJSON),authenticatorData:b64u(credential.response.authenticatorData),signature:b64u(credential.response.signature),userHandle:credential.response.userHandle?b64u(credential.response.userHandle):null}});
  localStorage.setItem('aurion.lastEmail',d.user.email);
  localStorage.setItem(passkeyChoiceKey(d.user.email),'enabled');
  invalidateSession();
  go('/dashboard');
}

let conditionalController=null;
function stopConditionalPasskey(){
  if(conditionalController){conditionalController.abort();conditionalController=null}
}
async function startConditionalPasskeyLogin(emailInput,status,error){
  stopConditionalPasskey();
  if(!isMobileDevice()||!await supportsConditionalPasskeys())return;
  const controller=new AbortController();
  conditionalController=controller;
  emailInput.autocomplete='username webauthn';
  try{
    const o=await api.webauthnAuthOptions();
    if(controller.signal.aborted)return;
    const credential=await navigator.credentials.get({publicKey:{challenge:dec(o.challenge),rpId:o.rpId,timeout:o.timeout,userVerification:o.userVerification},mediation:'conditional',signal:controller.signal});
    if(credential&&!controller.signal.aborted)await finishPasskeyLogin(credential,o.challenge);
  }catch(x){
    if(!controller.signal.aborted&&x?.name!=='AbortError'&&x?.name!=='NotAllowedError'){
      status.textContent='La clé d’accès n’a pas pu être utilisée. Vous pouvez vous connecter avec votre mot de passe.';
      if(x?.status===401){error.textContent='La clé d’accès n’a pas été validée. Utilisez le mot de passe ou réessayez.';error.hidden=false}
    }
  }finally{
    if(conditionalController===controller)conditionalController=null;
  }
}

async function shouldOfferPasskey(email){
  if(!supportsPlatformPasskeys())return false;
  const key=passkeyChoiceKey(email);
  if(localStorage.getItem(key))return false;
  try{
    const result=await api.webauthnCredentials();
    const credentials=Array.isArray(result.credentials)?result.credentials:[];
    if(credentials.length){localStorage.setItem(key,'enabled');return false}
    return true;
  }catch{return false}
}

function showPasskeySetupOffer(email){
  const overlay=document.createElement('div');
  overlay.className='modal-backdrop';
  overlay.innerHTML='<section class="modal glass passkey-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="passkey-offer-title"><span class="eyebrow">CONNEXION SUR MOBILE</span><h2 id="passkey-offer-title">Activer la connexion biométrique ?</h2><p>Créez une clé d’accès sur ce téléphone. Elle pourra être validée par empreinte, reconnaissance faciale ou code de l’appareil, selon ses réglages.</p><p class="help">Aurion ne reçoit ni votre empreinte ni votre visage. Votre mot de passe reste disponible.</p><p id="passkey-offer-status" class="help" aria-live="polite"></p><div class="button-row"><button class="btn secondary" id="passkey-later" type="button">Pas maintenant</button><button class="btn primary" id="passkey-enable" type="button">Activer sur ce téléphone</button></div></section>';
  document.querySelector('#app').appendChild(overlay);
  const status=overlay.querySelector('#passkey-offer-status');
  const later=overlay.querySelector('#passkey-later');
  const enable=overlay.querySelector('#passkey-enable');
  later.onclick=()=>{localStorage.setItem(passkeyChoiceKey(email),'declined');overlay.remove();go('/dashboard')};
  enable.onclick=async()=>{
    if(!supportsPlatformPasskeys()){status.textContent='Cette fonction est disponible depuis un navigateur mobile compatible en HTTPS.';return}
    enable.disabled=true;
    status.textContent='Validation par le téléphone…';
    try{
      await enableMobilePasskey();
      localStorage.setItem(passkeyChoiceKey(email),'enabled');
      overlay.remove();
      toast('Clé d’accès enregistrée sur ce téléphone.','success');
      go('/dashboard');
    }catch(x){
      status.textContent=x?.message||'La clé d’accès n’a pas pu être créée. Vous pouvez réessayer ou continuer sans elle.';
      enable.disabled=false;
    }
  };
}

export function renderAuth(initialMode='register'){
  document.querySelector('#app').innerHTML='<main id="main" class="auth-shell"><section class="auth-card glass"><div class="auth-brand">'+appLogo('72')+'<div><strong>AURION</strong><span>L’intelligence qui travaille pour vous</span></div></div><h1>Votre activité, sous contrôle.</h1><p class="lede">Clients, devis, factures, agenda et automatisations dans un espace professionnel.</p><div class="auth-tabs"><button class="tab active" id="reg" type="button">Créer mon espace</button><button class="tab" id="login" type="button">Se connecter</button></div><form id="auth" class="stack"><label class="field"><span>E-mail</span><div class="password-actions"><input id="email" type="email" autocomplete="email" required placeholder="vous@entreprise.fr"><button type="button" id="suggest-email" class="link-btn">Utiliser l’e-mail enregistré</button></div><small id="mobile-auth-hint" class="help" hidden>Sur mobile, le gestionnaire de mots de passe peut remplir vos identifiants ; une clé d’accès peut aussi vous connecter avec la biométrie du téléphone.</small></label><label class="field"><span>Mot de passe</span><div class="password-input"><input id="password" type="password" autocomplete="new-password" required><button type="button" id="showpass" class="icon-btn" aria-label="Afficher le mot de passe">◉</button></div><div id="register-password-tools"><div class="password-meter"><i id="meter"></i></div><div class="password-actions"><button type="button" id="suggest" class="link-btn">Suggérer un mot de passe</button><span id="score" class="help">12 caractères minimum</span></div></div></label><label id="terms" class="check"><input type="checkbox" required> J’ai lu et j’accepte les <a href="#/legal/cgv" target="_blank" rel="noopener">CGV</a> et la <a href="#/legal/privacy" target="_blank" rel="noopener">politique de confidentialité</a>.</label><button id="submit" class="btn primary" type="submit">Créer mon espace <span>→</span></button><button id="google-signin" class="btn secondary auth-google-button" type="button" hidden>Continuer avec Google</button><p class="help auth-method-note">La clé d’accès est proposée dans le champ e-mail sur mobile lorsqu’elle est disponible. Les identifiants restent également accessibles par autofill.</p><p class="forgot-line"><a id="forgot" class="link-btn" href="#/forgot" hidden>Mot de passe oublié ?</a></p><p id="error" class="error" hidden aria-live="polite"></p><p id="status" class="help" aria-live="polite"></p></form><p class="legal-links"><a href="#/legal/cgv" target="_blank" rel="noopener">CGV</a> · <a href="#/legal/privacy" target="_blank" rel="noopener">Confidentialité</a> · <a href="#/legal/cookies" target="_blank" rel="noopener">Cookies</a> · <a href="#/legal/legal-notice" target="_blank" rel="noopener">Mentions légales</a></p><div class="security-note">Mot de passe haché côté serveur · session sécurisée · biométrie protégée par WebAuthn</div></section><aside class="auth-visual"><img src="./assets/aurion-overview.svg?v=15.3.14" alt="Aperçu du tableau de bord Aurion : journal de bord, clients, devis, agenda et trésorerie" data-hide-on-error></aside></main>';
  let mode=initialMode==='login'?'login':'register';
  const form=document.querySelector('#auth');
  const status=document.querySelector('#status');
  const pass=document.querySelector('#password');
  const email=document.querySelector('#email');
  const meter=document.querySelector('#meter');
  const score=document.querySelector('#score');
  const error=document.querySelector('#error');
  const terms=document.querySelector('#terms');
  const submit=document.querySelector('#submit');
  const mobileHint=document.querySelector('#mobile-auth-hint');
  const passwordTools=document.querySelector('#register-password-tools');
  const suggestEmail=document.querySelector('#suggest-email');
  let googleConfigured=false;
  const google=document.querySelector('#google-signin');
  const savedEmail=()=>localStorage.getItem('aurion.lastEmail')||'';
  const showGoogle=()=>{google.hidden=mode!=='login'||!googleConfigured};
  api.googleAuthStatus().then(result=>{googleConfigured=result?.configured===true;showGoogle()}).catch(()=>{googleConfigured=false;showGoogle()});
  google.onclick=()=>{if(!google.hidden)window.location.assign(api.baseUrl+'/auth/google/start')};
  const setMode=m=>{
    stopConditionalPasskey();
    mode=m;
    const registration=m==='register';
    document.querySelector('#reg').classList.toggle('active',registration);
    document.querySelector('#login').classList.toggle('active',!registration);
    terms.hidden=!registration;
    terms.querySelector('input').required=registration;
    document.querySelector('#forgot').hidden=registration;
    email.autocomplete=registration?'email':'username';
    pass.autocomplete=registration?'new-password':'current-password';
    if(registration)pass.setAttribute('minlength','12');else pass.removeAttribute('minlength');
    passwordTools.hidden=!registration;
    suggestEmail.hidden=!registration;
    mobileHint.hidden=registration||!isMobileDevice();
    submit.innerHTML=registration?'Créer mon espace <span>→</span>':'Se connecter <span>→</span>';
    error.hidden=true;
    status.textContent='';
    showGoogle();
    if(!registration&&isMobileDevice())void startConditionalPasskeyLogin(email,status,error);
  };
  setMode(mode);
  suggestEmail.onclick=()=>{const value=savedEmail();if(value){email.value=value;toast('E-mail enregistré proposé.','success')}else toast('Aucun e-mail enregistré sur cet appareil.','info')};
  document.querySelector('#reg').onclick=()=>setMode('register');
  document.querySelector('#login').onclick=()=>{setMode('login');if(savedEmail())email.value=savedEmail()};
  document.querySelector('#showpass').onclick=()=>{pass.type=pass.type==='password'?'text':'password'};
  pass.oninput=()=>{const value=passwordScore(pass.value);meter.style.width=(value*20)+'%';score.textContent=value>=4?'Excellent mot de passe':Math.max(0,12-pass.value.length)+' caractère(s) à ajouter'};
  document.querySelector('#suggest').onclick=()=>{pass.value=suggestPassword();pass.type='text';pass.dispatchEvent(new Event('input'));toast('Mot de passe généré. Enregistrez-le dans votre gestionnaire.','success')};
  form.onsubmit=async event=>{
    event.preventDefault();
    stopConditionalPasskey();
    error.hidden=true;
    status.textContent='Connexion au serveur Aurion…';
    const emailValue=email.value.trim().toLowerCase(),password=pass.value;
    if(mode==='register'&&passwordScore(password)<4){error.textContent='Choisissez un mot de passe plus robuste.';error.hidden=false;return}
    submit.disabled=true;
    try{
      if(mode==='register'){
        await api.register(emailValue,password,true);
        localStorage.setItem('aurion.lastEmail',emailValue);
        status.textContent='Connexion réussie. Ouverture de votre parcours de configuration…';
        invalidateSession();
        go('/onboarding');
      }else{
        await api.login(emailValue,password);
        localStorage.setItem('aurion.lastEmail',emailValue);
        status.textContent='Connexion réussie. Ouverture de votre espace…';
        if(await shouldOfferPasskey(emailValue)){
          invalidateSession();
          showPasskeySetupOffer(emailValue);
        }else{
          invalidateSession();
          go('/dashboard');
        }
      }
    }catch(x){error.textContent=x.message;error.hidden=false;status.textContent=''}
    finally{submit.disabled=false}
  };
}
