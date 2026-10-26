// Mot de passe oublié + réinitialisation. Aucune donnée sensible dans l'URL hors jeton à usage unique.
import{api}from'../core/api.js';
import{go,routeQuery}from'../core/router.js';
import{toast,appLogo,escapeHtml as e}from'../core/ui.js';
import{passwordScore,suggestPassword}from'../core/security.js';

const shell=inner=>`<main id="main" class="auth-shell single"><section class="auth-card glass"><div class="auth-brand">${appLogo('64')}<div><strong>AURION</strong><span>L’intelligence qui travaille pour vous</span></div></div>${inner}</section></main>`;

export function renderForgot(){
  document.querySelector('#app').innerHTML=shell(`<h1 class="h-md">Mot de passe oublié ?</h1><p class="lede">Saisissez l’adresse e-mail de votre compte. Si elle existe, vous recevrez un lien sécurisé, valable 30 minutes et utilisable une seule fois.</p>
  <form id="forgot" class="stack"><label class="field"><span>E-mail</span><input id="email" type="email" required autocomplete="email" placeholder="vous@entreprise.fr"></label><button class="btn primary" id="send" type="submit">Envoyer le lien <span>→</span></button><p id="msg" class="help" aria-live="polite"></p><p id="err" class="error" hidden></p></form><p class="help"><a class="link-btn" href="#/auth">← Retour à la connexion</a></p>`);
  const f=document.querySelector('#forgot');
  f.onsubmit=async ev=>{ev.preventDefault();const b=document.querySelector('#send'),err=document.querySelector('#err');err.hidden=true;b.disabled=true;
    try{const r=await api.forgotPassword(document.querySelector('#email').value.trim().toLowerCase());document.querySelector('#msg').textContent=r.message;f.querySelector('input').disabled=true}
    catch(x){err.textContent=x.message;err.hidden=false;b.disabled=false}};
}

export async function renderReset(){
  const token=routeQuery().get('token')||'';
  document.querySelector('#app').innerHTML=shell('<p class="muted">Vérification du lien…</p>');
  let valid=false;try{valid=(await api.validateReset(token)).valid}catch{valid=false}
  if(!token||!valid){document.querySelector('#app').innerHTML=shell(`<h1 class="h-md">Lien invalide ou expiré</h1><p class="lede">Ce lien de réinitialisation n’est plus valable (il expire après 30 minutes et ne peut servir qu’une fois).</p><a class="btn primary" href="#/forgot">Refaire une demande</a>`);return}
  document.querySelector('#app').innerHTML=shell(`<h1 class="h-md">Nouveau mot de passe</h1><p class="lede">Choisissez un mot de passe d’au moins 12 caractères. Toutes vos autres sessions seront déconnectées.</p>
  <form id="reset" class="stack"><label class="field"><span>Nouveau mot de passe</span><div class="password-input"><input id="pw" type="password" minlength="12" autocomplete="new-password" required><button type="button" id="eye" class="icon-btn" aria-label="Afficher le mot de passe">◉</button></div><div class="password-meter"><i id="meter"></i></div><div class="password-actions"><button type="button" id="suggest" class="link-btn">Suggérer un mot de passe</button><span id="score" class="help">12 caractères minimum</span></div></label>
  <label class="field"><span>Confirmer</span><input id="pw2" type="password" minlength="12" autocomplete="new-password" required></label><button class="btn primary" id="go" type="submit">Enregistrer <span>→</span></button><p id="err" class="error" hidden></p></form>`);
  const pw=document.querySelector('#pw'),pw2=document.querySelector('#pw2');
  pw.oninput=()=>{const s=passwordScore(pw.value);document.querySelector('#meter').style.width=`${s*20}%`;document.querySelector('#score').textContent=s>=4?'Excellent mot de passe':`${Math.max(0,12-pw.value.length)} caractère(s) à ajouter`};
  document.querySelector('#eye').onclick=()=>{pw.type=pw.type==='password'?'text':'password'};
  document.querySelector('#suggest').onclick=()=>{pw.value=suggestPassword();pw2.value=pw.value;pw.type='text';pw.dispatchEvent(new Event('input'));toast('Mot de passe généré. Enregistrez-le dans votre gestionnaire.','success')};
  document.querySelector('#reset').onsubmit=async ev=>{ev.preventDefault();const err=document.querySelector('#err');err.hidden=true;
    if(pw.value!==pw2.value){err.textContent='Les deux mots de passe ne correspondent pas.';err.hidden=false;return}
    if(passwordScore(pw.value)<4){err.textContent='Choisissez un mot de passe plus robuste.';err.hidden=false;return}
    document.querySelector('#go').disabled=true;
    try{await api.resetPassword(token,pw.value);history.replaceState(null,'','#/auth');toast('Mot de passe mis à jour. Connectez-vous.','success');go('/auth')}
    catch(x){err.textContent=x.message;err.hidden=false;document.querySelector('#go').disabled=false}};
}
void e;
