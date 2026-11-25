// Documents légaux consultables SANS compte (avant l'inscription). Contenu versionné côté serveur.
import{api}from'../core/api.js';
import{appLogo,escapeHtml as e}from'../core/ui.js';

// Rendu Markdown minimal et sûr (titres, listes, gras, citations) : tout le texte est échappé avant mise en forme.
function md(src){
  const inline=t=>e(t).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  const out=[];let list=false;
  for(const raw of String(src).split(/\r?\n/)){
    const l=raw.trimEnd();
    const li=/^\s*[-*]\s+(.*)/.exec(l);
    if(li){if(!list){out.push('<ul>');list=true}out.push(`<li>${inline(li[1])}</li>`);continue}
    if(list){out.push('</ul>');list=false}
    const h=/^(#{1,3})\s+(.*)/.exec(l);
    if(h)out.push(`<h${h[1].length+1}>${inline(h[2])}</h${h[1].length+1}>`);
    else if(l.startsWith('>'))out.push(`<blockquote>${inline(l.replace(/^>\s?/,''))}</blockquote>`);
    else if(l.trim())out.push(`<p>${inline(l)}</p>`);
  }
  if(list)out.push('</ul>');
  return out.join('');
}

// Bloc 20 — page publique « Transparence & réversibilité » : sous-traitants réels,
// matrice « Sécurité et contrôles », procédures d'export et de suppression de compte.
export async function renderTransparency(){
  const app=document.querySelector('#app');
  app.innerHTML=`<main id="main" class="legal-shell"><header class="topbar"><a class="brand" href="#/">${appLogo('34')} AURION</a><a class="btn secondary" href="#/auth">Créer mon espace / Se connecter</a></header><div class="legal-layout"><article class="legal-doc glass"><h1>Transparence & réversibilité</h1><p class="muted">Chargement…</p></article></div></main>`;
  let d;
  try{d=await api.transparency()}catch{return}
  const stateBadge=st=>st==='implémentée et testée'?'<span class="pill ok">implémentée et testée</span>':st==='partielle'?'<span class="pill">partielle</span>':st==='absente'?'<span class="pill">absente</span>':'<span class="pill">non vérifiée</span>';
  app.querySelector('.legal-doc').innerHTML=`<h1>Transparence & réversibilité</h1>
    <h2>Sous-traitants techniques réellement utilisés</h2>
    <p class="muted">Liste calculée depuis la configuration effective d'Aurion au ${e(d.generatedAt)} — un prestataire n'est listé « actif » que si sa configuration est réellement présente.</p>
    ${d.subprocessors.map(x=>`<div class="list-row"><div><b>${e(x.name)}${x.active?'':' <em class="tag">inactif</em>'}</b><small>${e(x.role)}</small></div><small>${e(x.active?'actif':'inactif')} · ${e(x.region)}</small></div>`).join('')}
    <h2>Sécurité et contrôles</h2>
    <p class="muted">Chaque contrôle est marqué : implémentée et testée, partielle, absente ou non vérifiée — avec sa preuve et son emplacement dans le code.</p>
    ${d.controls.map(c=>`<div class="list-row"><div><b>${e(c.label)}</b><small>Preuve : ${e(c.proof)} · Emplacement : <code>${e(c.location)}</code></small></div>${stateBadge(c.state)}</div>`).join('')}
    <h2>Reversibilité : partir avec vos données</h2>
    <p>${e(d.reversibility.export)}</p>
    <p>${e(d.reversibility.withdrawal)}</p>
    <p>${e(d.reversibility.deletion)}</p>
    <p>${e(d.reversibility.noSecrets)}</p>
    <p class="notice">${e(d.disclaimer)}</p>
    <p><a class="btn secondary" href="#/legal">Documents légaux</a> <a class="btn secondary" href="#/">Retour</a></p>`;
}

export async function renderLegal(kind){
  const app=document.querySelector('#app');
  app.innerHTML=`<main id="main" class="legal-shell"><header class="topbar"><a class="brand" href="#/">${appLogo('34')} AURION</a><a class="btn secondary" href="#/auth">Créer mon espace / Se connecter</a></header><div class="legal-layout"><nav class="legal-nav" aria-label="Documents légaux"></nav><article class="legal-doc glass"><p class="muted">Chargement…</p></article></div></main>`;
  let docs=[];try{docs=(await api.legalDocs()).documents}catch{}
  const nav=app.querySelector('.legal-nav');
  nav.innerHTML=docs.map(d=>`<a class="${d.kind===kind?'active':''}" href="#/legal/${e(d.kind)}">${e(d.title)}</a>`).join('')+'<a href="#/transparence">Transparence & réversibilité</a><a href="#/withdrawal">Renoncer au contrat ici</a>';
  const target=kind||docs[0]?.kind;const box=app.querySelector('.legal-doc');
  if(!target){box.innerHTML='<p class="muted">Aucun document disponible.</p>';return}
  try{
    const d=await api.legalDoc(target);
    box.innerHTML=`<div class="legal-meta"><span class="pill">Version ${e(d.version)}</span><span class="muted">Publié le ${new Date(d.published_at).toLocaleDateString('fr-FR')}</span></div><h1>${e(d.title)}</h1>${md(d.body)}`;
  }catch(x){box.innerHTML=`<p class="error">${e(x.message)}</p>`}
}

export async function renderWithdrawal(){
  const app=document.querySelector('#app');
  const today=new Date().toISOString().slice(0,10);
  app.innerHTML=`<main id="main" class="legal-shell"><header class="topbar"><a class="brand" href="#/">${appLogo('34')} AURION</a><a class="btn secondary" href="#/legal/cgv">Conditions de vente</a></header><article class="legal-doc glass withdrawal-page"><div class="legal-meta"><span class="pill">Démarche en ligne</span></div><h1>Renoncer au contrat ici</h1><p>Ce formulaire permet au consommateur de notifier sa décision de se rétracter d’un contrat Aurion conclu à distance. Pour identifier le contrat, indiquez l’offre, la date d’achat et une référence de commande, de paiement ou de facture. La demande est enregistrée à la date et à l’heure de son envoi.</p><form id="withdrawal-form" class="stack"><div class="grid-2"><label class="field"><span>Prénom</span><input name="firstName" autocomplete="given-name" maxlength="100" required></label><label class="field"><span>Nom</span><input name="lastName" autocomplete="family-name" maxlength="100" required></label></div><div class="grid-2"><label class="field"><span>E-mail utilisé pour recevoir la réponse</span><input name="email" type="email" autocomplete="email" maxlength="254" required></label><label class="field"><span>Confirmer l’adresse e-mail</span><input name="confirmationEmail" type="email" autocomplete="email" maxlength="254" required></label></div><label class="field"><span>Date de conclusion du contrat</span><input name="contractDate" type="date" max="${today}" required></label><label class="field"><span>Références détaillées du contrat</span><textarea name="contractReference" rows="4" minlength="8" maxlength="1000" placeholder="Offre souscrite, référence de commande ou de paiement, facture concernée…" required></textarea></label><label class="check"><input name="consumerDeclaration" type="checkbox" required><span>Je confirme agir en qualité de consommateur et souhaite notifier ma rétractation du contrat Aurion décrit ci-dessus.</span></label><button id="withdrawal-submit" class="btn primary" type="submit">Confirmer la rétractation</button><p id="withdrawal-message" class="help" aria-live="polite"></p></form><p class="help">La démarche est gratuite. Elle ne remplace pas la vérification de l’éligibilité légale ni le traitement du remboursement. Pour toute difficulté, contactez <a href="mailto:easyfixit.reparation@gmail.com">easyfixit.reparation@gmail.com</a>.</p></article></main>`;
  const form=app.querySelector('#withdrawal-form');
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=app.querySelector('#withdrawal-submit');const note=app.querySelector('#withdrawal-message');
    const fields=new FormData(form);button.disabled=true;note.className='help';note.textContent='Envoi de votre déclaration…';
    try{
      const {requestWithdrawal}=await import('../core/api.js');
      const result=await requestWithdrawal({firstName:fields.get('firstName'),lastName:fields.get('lastName'),email:fields.get('email'),confirmationEmail:fields.get('confirmationEmail'),contractDate:fields.get('contractDate'),contractReference:fields.get('contractReference')});
      form.innerHTML=`<div class="notice ${result.receiptSent?'':'warn-notice'}"><h2>Déclaration enregistrée</h2><p>Référence de suivi : <strong>${e(result.id)}</strong></p><p>Date et heure d’envoi : ${e(new Date(result.submittedAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}))} (heure de Paris).</p><p>${result.receiptSent?'Un accusé de réception contenant le texte de votre déclaration a été envoyé à votre adresse e-mail.':'La déclaration est enregistrée, mais l’accusé de réception e-mail n’a pas pu être envoyé. Écrivez à '+e(result.supportEmail||'l’adresse du support indiquée dans les mentions légales')+' en indiquant la référence ci-dessus afin de recevoir votre copie.'}</p><blockquote>${e(result.declaration)}</blockquote></div><a class="btn secondary" href="#/">Retour à Aurion</a>`;
    }catch(error){note.className='error';note.textContent=error?.message||'Votre déclaration n’a pas pu être envoyée. Réessayez ou contactez le support.';button.disabled=false}
  });
}
