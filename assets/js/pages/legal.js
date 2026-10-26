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

export async function renderLegal(kind){
  const app=document.querySelector('#app');
  app.innerHTML=`<main id="main" class="legal-shell"><header class="topbar"><a class="brand" href="#/">${appLogo('34')} AURION</a><a class="btn secondary" href="#/auth">Créer mon espace / Se connecter</a></header><div class="legal-layout"><nav class="legal-nav" aria-label="Documents légaux"></nav><article class="legal-doc glass"><p class="muted">Chargement…</p></article></div></main>`;
  let docs=[];try{docs=(await api.legalDocs()).documents}catch{}
  const nav=app.querySelector('.legal-nav');
  nav.innerHTML=docs.map(d=>`<a class="${d.kind===kind?'active':''}" href="#/legal/${e(d.kind)}">${e(d.title)}</a>`).join('');
  const target=kind||docs[0]?.kind;const box=app.querySelector('.legal-doc');
  if(!target){box.innerHTML='<p class="muted">Aucun document disponible.</p>';return}
  try{
    const d=await api.legalDoc(target);
    box.innerHTML=`<div class="legal-meta"><span class="pill">Version ${e(d.version)}</span>${d.is_draft?'<span class="pill warn">Brouillon : non validé juridiquement</span>':''}<span class="muted">Publié le ${new Date(d.published_at).toLocaleDateString('fr-FR')}</span></div><h1>${e(d.title)}</h1>${md(d.body)}`;
  }catch(x){box.innerHTML=`<p class="error">${e(x.message)}</p>`}
}
