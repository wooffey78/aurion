import{api}from'../core/api.js';

export function renderEmailVerification(token=''){
  document.querySelector('#app').innerHTML=`<main id="main" class="center"><section class="glass stack"><h1>Confirmer votre adresse e-mail</h1><p id="verification-message" class="help" aria-live="polite">Le lien est à usage unique et expire après 30 minutes. Confirmez-le pour activer votre compte Aurion.</p><button id="verify-email-confirm" class="btn primary" type="button">Confirmer mon adresse e-mail <span>→</span></button><p class="help"><a href="/?auth=login">Retour à la connexion</a></p></section></main>`;
  const button=document.querySelector('#verify-email-confirm');
  const message=document.querySelector('#verification-message');
  if(!token||token.length<32){button.disabled=true;message.textContent='Le lien de vérification est absent, invalide ou incomplet. Demandez un nouvel e-mail depuis la connexion.';return}
  button.onclick=async()=>{
    button.disabled=true;message.textContent='Vérification en cours…';
    try{const result=await api.verifyEmail(token);message.textContent=result?.message||'Adresse confirmée. Vous pouvez vous connecter.';button.hidden=true}
    catch(error){message.textContent=error?.message||'Ce lien est invalide ou a expiré. Demandez un nouvel e-mail depuis la connexion.';button.disabled=false}
  };
}
