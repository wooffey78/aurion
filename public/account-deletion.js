// Page publique « Suppression de compte » (§5.3) : envoi de la demande vers
// /public/account-deletion-requests. Réponse neutre du serveur (anti-énumération).
(function(){
  var form=document.getElementById('f'),msg=document.getElementById('msg'),send=document.getElementById('send');
  if(!form||!msg||!send)return;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var email=form.email.value.trim(),confirm=form.confirm.value.trim();
    if(email.toLowerCase()!==confirm.toLowerCase()){
      msg.className='err';msg.textContent='Les deux adresses e-mail doivent être identiques.';return;
    }
    send.disabled=true;msg.className='';msg.textContent='Envoi de votre demande…';
    fetch('/public/account-deletion-requests',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:email,confirmationEmail:confirm,reason:form.reason.value})})
      .then(function(r){return r.json().then(function(d){return {status:r.status,data:d};}).catch(function(){return {status:r.status,data:{}};});})
      .then(function(res){
        if(res.status===202){msg.className='ok';msg.textContent=res.data.message||'Si un compte correspond à cette adresse, votre demande est enregistrée. Elle sera traitée après vérification d’identité.';form.reset();}
        else{msg.className='err';msg.textContent=(res.data&&res.data.message)||'Votre demande n’a pas pu être envoyée. Réessayez dans quelques minutes ou contactez le support.';send.disabled=false;}
      })
      .catch(function(){msg.className='err';msg.textContent='Serveur injoignable. Vérifiez votre connexion puis réessayez.';send.disabled=false;});
  });
})();
