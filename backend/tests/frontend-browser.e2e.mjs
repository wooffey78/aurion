import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

if(process.env.AURION_BROWSER_E2E!=='1'){
  console.log('[frontend-e2e] Ignoré hors du contrôle navigateur explicite.');
}else{
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(!process.env.DATABASE_URL)throw new Error('AURION_BROWSER_E2E=1 exige DATABASE_URL vers une base PostgreSQL de test migrée.');
const require=createRequire(new URL('../package.json',import.meta.url));
const {chromium}=require('playwright');
const listen=(server,port=0,host='127.0.0.1')=>new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(port,host,()=>{server.removeListener('error',reject);resolve(server.address().port)});
});
const freePort=async()=>{const server=net.createServer();const port=await listen(server);await new Promise(resolve=>server.close(resolve));return port};
const port=await freePort(),baseUrl=`http://127.0.0.1:${port}`;
const env={...process.env,NODE_ENV:'test',AURION_LOCAL_EVALUATION_MODE:'true',HOST:'127.0.0.1',PORT:String(port),APP_BASE_URL:baseUrl,CORS_ORIGIN:baseUrl,COOKIE_SECURE:'false'};
let serverLog='';
const app=spawn(process.execPath,['backend/dist/server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
app.stdout.on('data',chunk=>{serverLog+=chunk.toString();if(serverLog.length>12000)serverLog=serverLog.slice(-12000)});
app.stderr.on('data',chunk=>{serverLog+=chunk.toString();if(serverLog.length>12000)serverLog=serverLog.slice(-12000)});
let browser;
const errors=[];
async function waitForApp(){
  const end=Date.now()+45000;
  while(Date.now()<end){
    if(app.exitCode!==null)throw new Error('Serveur de test arrêté avant le démarrage.\n'+serverLog);
    try{const response=await fetch(baseUrl+'/health/db');if(response.ok)return}catch{}
    await delay(300);
  }
  throw new Error('Serveur de test non disponible après 45 secondes.\n'+serverLog);
}
// Récapitule le contexte utile en cas d'échec d'une étape du parcours 15.4.0 (8 étapes, D7).
const stepDiagnostics=async page=>JSON.stringify({
  responses:onboardingResponses,
  toasts:await page.locator('.toast').allTextContents().catch(()=>[]),
  onboarding:await page.locator('#onboarding-slot').innerText().catch(()=> ''),
  url:page.url(),
  errors
});
let onboardingResponses=[];
try{
  await waitForApp();
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(apiUrl=>{window.AURION_API_URL=apiUrl;try{localStorage.setItem('aurion.biometric.choice','declined')}catch{}},baseUrl);
  const page=await context.newPage();
  page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text())});
  page.on('response',response=>{if(response.status()>=500)errors.push('server-5xx: '+response.status()+' '+new URL(response.url()).pathname+' '+response.request().method());});
  page.on('pageerror',error=>errors.push('pageerror: '+(error.stack||error.message)));
  page.on('dialog',dialog=>dialog.dismiss());
  let registrationResponse=null;
  onboardingResponses=[];
  page.on('response',async response=>{
    const pathname=new URL(response.url()).pathname;
    if(pathname==='/auth/register'){
      registrationResponse={status:response.status(),body:await response.text().catch(()=> '')};
    }
    if(pathname==='/organization'||pathname==='/activities/detect-profile'||pathname.startsWith('/modules/')){
      onboardingResponses.push({path:pathname,status:response.status(),body:(await response.text().catch(()=> '')).slice(0,1800)});
    }
  });

  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  const registrationStatusPromise=page.waitForResponse(response=>{try{return new URL(response.url()).pathname==='/auth/registration-status'}catch{return false}},{timeout:15000});
  await page.getByRole('link',{name:/Commencer/}).click();
  await page.locator('#auth').waitFor({state:'visible'});
  const statusResponse=await registrationStatusPromise;
  const registrationStatus={httpStatus:statusResponse.status(),...await statusResponse.json()};
  if(registrationStatus.available!==true||registrationStatus.localEvaluation!==true){
    throw new Error('Le mode évaluation local doit être disponible pour le test navigateur. Réponse : '+JSON.stringify(registrationStatus)+'\n'+serverLog);
  }
  try{
    await page.waitForFunction(()=>document.querySelector('#terms')?.textContent?.includes('installation locale')&&!document.querySelector('#submit')?.disabled,null,{timeout:10000});
  }catch(error){
    const ui={terms:await page.locator('#terms').textContent().catch(()=>''),submitDisabled:await page.locator('#submit').isDisabled().catch(()=>null)};
    throw new Error('Le formulaire n’a pas répercuté le mode local malgré /auth/registration-status : '+JSON.stringify(registrationStatus)+' ; état UI : '+JSON.stringify(ui)+'\n'+serverLog+'\n'+error.message);
  }
  const email=`aurion-e2e-${Date.now()}@example.test`;
  const password='Aurion-Test-2026!xY';
  await page.locator('#full-name').fill('Aurion Test');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#terms input').check();
  await page.locator('#submit').click();

  // Parcours d'accueil 15.4.0 — 8 étapes (Vous → Entreprise → Activité → Logo → Messagerie → Signature → Documents → Récapitulatif).
  // Contrat : docs/PARCOURS-15.4.0.md. Seuls prénom/nom (étape 1) et dénomination (étape 2) sont exigés.
  const step=async(label,action)=>{
    try{
      await action();
    }catch(error){
      throw new Error('Étape « '+label+' » du parcours d’accueil : '+error.message+'\n'+await stepDiagnostics(page)+'\n'+serverLog);
    }
  };

  await step('1 · Vous',async()=>{
    await page.locator('#ob-first').waitFor({state:'visible',timeout:20000});
    await page.locator('#ob-first').fill('Aurion');
    await page.locator('#ob-last').fill('Test');
    await page.locator('#ob-next').click();
  });
  await step('2 · Votre entreprise',async()=>{
    await page.locator('#ob-name').waitFor({state:'visible',timeout:20000});
    await page.locator('#ob-name').fill('Aurion E2E Entreprise');
    await page.locator('#ob-next').click();
  });
  await step('3 · Votre activité',async()=>{
    await page.locator('#ob-custom').waitFor({state:'visible',timeout:20000});
    await page.locator('#ob-custom').fill('Maintenance et réparation');
    await page.locator('#ob-next').click();
  });
  await step('4 · Votre logo (facultatif) — correctif 078 : WebP refusé, la sélection survit à « Précédent »',async()=>{
    await page.locator('#ob-logo-file').waitFor({state:'visible',timeout:20000});
    const webp='UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
    await page.locator('#ob-logo-file').setInputFiles({name:'logo.webp',mimeType:'image/webp',buffer:Buffer.from(webp,'base64')});
    await page.waitForFunction(()=>/WebP/.test(document.querySelector('#ob-logo-status')?.textContent||''),null,{timeout:5000});
    // Reproduction corrigée : un aller-retour « Précédent » ne perd plus la sélection PNG.
    const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.locator('#ob-logo-file').setInputFiles({name:'logo-e2e.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.locator('#ob-logo-preview img').waitFor({state:'visible',timeout:5000});
    await page.locator('#ob-back').click();
    await page.locator('#ob-custom').waitFor({state:'visible',timeout:20000});
    await page.locator('#ob-next').click();
    await page.locator('#ob-logo-file').waitFor({state:'visible',timeout:20000});
    await page.waitForFunction(()=>/sélectionné à l'étape précédente/.test(document.querySelector('#ob-logo-status')?.textContent||''),null,{timeout:5000});
    await page.locator('#ob-next').click(); // enregistre le logo puis passe à la messagerie
    await page.waitForFunction(()=>/Logo enregistré/.test(document.querySelector('#ob-logo-status')?.textContent||''),null,{timeout:15000}).catch(()=>{});
  });
  await step('5 · Votre messagerie (reportée)',async()=>{
    await page.locator('#ob-mailbox').waitFor({state:'visible',timeout:20000});
    await page.locator('#ob-skip').click(); // « Configurer plus tard »
  });
  await step('6 · Votre signature e-mail',async()=>{
    await page.locator('#ob-sig-first').waitFor({state:'visible',timeout:20000});
    await page.locator('#ob-next').click(); // champs préremplis conservés
  });
  await step('7 · Vos documents (cloud reporté)',async()=>{
    await page.locator('#onboarding-slot h2').filter({hasText:'Vos documents'}).waitFor({state:'visible',timeout:20000});
    const skip=page.locator('#ob-skip');
    if(await skip.count())await skip.click();else await page.locator('#ob-next').click();
  });
  await step('8 · Récapitulatif',async()=>{
    await page.locator('.ob-recap').waitFor({state:'visible',timeout:20000});
    await page.locator('#ob-next').click(); // « Accéder au tableau de bord »
  });

  try{
    await page.locator('#sidebar').waitFor({state:'visible',timeout:20000});
  }catch(error){
    const diagnostics={url:page.url(),hash:await page.evaluate(()=>location.hash).catch(()=>''),body:await page.locator('#app').innerText().catch(()=>''),html:await page.locator('#app').evaluate(el=>el.innerHTML.slice(0,5000)).catch(()=>''),errors};
    throw new Error('Le tableau de bord ne s’est pas affiché après le parcours : '+JSON.stringify(diagnostics)+'\n'+serverLog+'\n'+error.message);
  }
  const viewIds=await page.locator('.nav [data-view]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.getAttribute('data-view')).filter(Boolean))]);
  if(!viewIds.length)throw new Error('Aucune vue de tableau de bord n’a été rendue dans la navigation.');
  for(const viewId of viewIds){
    await page.locator('.nav [data-view]').evaluateAll((nodes,id)=>nodes.find(node=>node.getAttribute('data-view')===id)?.click(),viewId);
    await page.waitForTimeout(250);
    if(!(await page.locator('#view').count()))throw new Error('Racine #view absente après la navigation vers '+viewId);
  }
  await page.evaluate(()=>fetch('/auth/logout',{method:'POST',credentials:'include'}));
  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  await page.getByRole('link',{name:'Se connecter'}).click();
  await page.locator('#auth').waitFor({state:'visible'});
  const landingLoginState=await page.evaluate(()=>({fullNameHidden:document.querySelector('#full-name-field')?.hidden,fullNameRequired:document.querySelector('#full-name')?.required,termsHidden:document.querySelector('#terms')?.hidden,termsRequired:document.querySelector('#terms input')?.required}));
  if(!landingLoginState.fullNameHidden||landingLoginState.fullNameRequired||!landingLoginState.termsHidden||landingLoginState.termsRequired){
    throw new Error('Le lien « Se connecter » de la page d’accueil n’ouvre pas le mode connexion : '+JSON.stringify(landingLoginState)+' ; URL : '+page.url());
  }
  const loginFormState=await page.evaluate(()=>({fullNameHidden:document.querySelector('#full-name-field')?.hidden,fullNameRequired:document.querySelector('#full-name')?.required,termsHidden:document.querySelector('#terms')?.hidden,termsRequired:document.querySelector('#terms input')?.required}));
  if(!loginFormState.fullNameHidden||loginFormState.fullNameRequired||!loginFormState.termsHidden||loginFormState.termsRequired){
    throw new Error('Le formulaire n’est pas réellement passé en mode connexion : '+JSON.stringify(loginFormState));
  }
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  const loginResponsePromise=page.waitForResponse(response=>{try{return new URL(response.url()).pathname==='/auth/login'}catch{return false}},{timeout:15000});
  await page.locator('#submit').click();
  let loginResponse;
  try{loginResponse=await loginResponsePromise}catch(error){
    const diagnostics={url:page.url(),hash:await page.evaluate(()=>location.hash).catch(()=>''),body:await page.locator('#app').innerText().catch(()=>''),errors};
    throw new Error('Le formulaire de connexion n’a pas appelé /auth/login : '+JSON.stringify(diagnostics)+'\n'+serverLog+'\n'+error.message);
  }
  const loginBody=await loginResponse.text().catch(()=> '');
  if(!loginResponse.ok())throw new Error('Le serveur refuse la reconnexion (HTTP '+loginResponse.status()+') : '+loginBody+'\n'+serverLog);
  try{
    await page.waitForFunction(()=>location.hash==='#/dashboard'||document.querySelector('#passkey-later'),null,{timeout:20000});
  }catch(error){
    const diagnostics={url:page.url(),hash:await page.evaluate(()=>location.hash).catch(()=>''),body:await page.locator('#app').innerText().catch(()=>''),errors};
    throw new Error('La réponse /auth/login est positive mais Aurion ne passe ni au tableau de bord ni à la proposition de clé d’accès : '+JSON.stringify(diagnostics)+'\n'+serverLog+'\n'+error.message);
  }
  if(await page.locator('#passkey-later').isVisible().catch(()=>false))await page.locator('#passkey-later').click();
  try{
    await page.locator('#sidebar').waitFor({state:'visible',timeout:20000});
  }catch(error){
    const diagnostics={url:page.url(),hash:await page.evaluate(()=>location.hash).catch(()=>''),body:await page.locator('#app').innerText().catch(()=>''),html:await page.locator('#app').evaluate(el=>el.innerHTML.slice(0,5000)).catch(()=>''),errors};
    throw new Error('La connexion n’a pas ouvert le tableau de bord après le choix éventuel de clé d’accès : '+JSON.stringify(diagnostics)+'\n'+serverLog+'\n'+error.message);
  }
  // Blocs 3-5 — scénario hors connexion de bout en bout : décision enregistrée durablement
  // AVANT toute autre action, consultable, puis rejeu automatique SANS seconde confirmation,
  // sans doublon, et données à jour. Preuve navigateur exigée par le prompt maître (§4-BLOC 1).
  {
    const offlineClientName='Client hors connexion '+Date.now();
    // Le bootstrap hors connexion (identité + file + réplication) est terminé quand l'indicateur
    // du Bloc 7 est installé — on ne coupe le réseau qu'après, comme un vrai utilisateur.
    await page.locator('#sync-status-pill').waitFor({state:'visible',timeout:20000});
    await context.setOffline(true);
    await page.locator('.nav [data-view]').evaluateAll(nodes=>{nodes.find(n=>n.getAttribute('data-view')==='clients')?.click()});
    try { await page.locator('#new-client').waitFor({state:'visible',timeout:15000}); }
    catch(e){
      const body=await page.locator('#app').innerText().catch(()=>'');
      const hash=await page.evaluate(()=>location.hash).catch(()=>'');
      const navIds=await page.locator('.nav [data-view]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-view')));
      await page.screenshot({path:'/tmp/e2e-fail.png',fullPage:true}).catch(()=>{});
      throw new Error('Vue clients non affichée hors connexion : hash='+hash+' nav='+JSON.stringify(navIds)+' body='+String(body).slice(0,500)+'\n'+serverLog);
    }
    await page.locator('#new-client').click();
    await page.locator('#generic-modal #name').fill(offlineClientName);
    await page.locator('#generic-form button[type=submit]').click();
    // Le modal se ferme SANS erreur et SANS seconde confirmation ; statut « en attente » affiché.
    try { await page.waitForFunction(()=>!document.querySelector('#generic-modal'),null,{timeout:8000}); }
    catch(e){
      await page.screenshot({path:'/tmp/e2e-modal.png',fullPage:false}).catch(()=>{});
      const err=await page.locator('#generic-error').innerText().catch(()=>'(aucune)');
      const toasts=await page.locator('.toast').allTextContents().catch(()=>[]);
      const state=await page.evaluate(async()=>{const src=document.querySelector('script[type="module"]')?.src||'';const base=src.slice(0,src.lastIndexOf('/')+1);const m=await import(base+'core/outbox.js');try{const r=await m.outboxReady(300);const s=await m.outboxSnapshot();return {ready:r,counts:s.counts};}catch(x){return {error:String(x&&x.message||x)};}}).catch(()=>({evalFailed:true}));
      throw new Error('Modale non fermée après création hors connexion : erreur='+err+' toasts='+JSON.stringify(toasts)+' outbox='+JSON.stringify(state)+'\n'+serverLog);
    }
    const toasts=await page.locator('.toast').allTextContents().catch(()=>[]);
    if(!toasts.some(t=>/en attente de synchronisation/.test(t)))throw new Error('Statut « enregistré localement — en attente de synchronisation » absent après création hors connexion : '+JSON.stringify(toasts));
    const outboxState=await page.evaluate(async()=>{
      const src=document.querySelector('script[type="module"]')?.src||'';const base=src.slice(0,src.lastIndexOf('/')+1);
      const m=await import(base+'core/outbox.js');const s=await m.outboxSnapshot();
      return {pending:s.counts.pending,ops:s.ops.length};
    });
    if(outboxState.pending!==1)throw new Error('La décision hors connexion n\'a pas été enregistrée dans la file persistante : '+JSON.stringify(outboxState)+'\n'+serverLog);
    const pillText=await page.locator('#sync-status-pill').innerText().catch(()=>'');
    if(!/Hors connexion/.test(pillText))throw new Error('L\'indicateur de synchronisation n\'affiche pas l\'état hors connexion : « '+pillText+' »');
    // Retour du réseau : rejeu AUTOMATIQUE (aucun clic), numéro/identifiants serveur, sans doublon.
    await context.setOffline(false);
    const {Client}=require('pg');
    const dbClient=new Client({connectionString:process.env.DATABASE_URL});
    await dbClient.connect();
    try{
      const orgRow=(await dbClient.query('select m.organization_id as id from organizations om join organization_members m on m.organization_id=om.id join users u on u.id=m.user_id where u.email=$1 limit 1',[email])).rows[0];
      if(!orgRow?.id)throw new Error('Organisation de test introuvable pour '+email);
      let replayed=false;
      for(let i=0;i<60&&!replayed;i++){
        await delay(500);
        // RLS 074 : la lecture hors du contexte tenant ne voit RIEN (comportement voulu) —
        // le sondage pose le contexte tenant dans une transaction avant de compter.
        await dbClient.query('begin');
        await dbClient.query("select set_config('app.current_organization',$1,true)",[orgRow.id]);
        const rows=(await dbClient.query('select count(*)::int as n from clients where organization_id=$1 and name=$2',[orgRow.id,offlineClientName])).rows;
        await dbClient.query('commit');
        replayed=rows[0]?.n===1;
      }
      if(!replayed){const post=await page.evaluate(async()=>{const src=document.querySelector('script[type="module"]')?.src||'';const base=src.slice(0,src.lastIndexOf('/')+1);const m=await import(base+'core/outbox.js');const sn=await m.outboxSnapshot();const probe=await fetch(location.origin+'/health',{credentials:'include'}).then(r=>r.status).catch(e=>String(e));const probeOps=await fetch(location.origin+'/sync/cursor',{credentials:'include'}).then(r=>r.status).catch(e=>String(e));const apiMod=await import(base+'core/api.js');const opsProbe=await apiMod.api.authFetch('/sync/ops',{method:'POST',body:JSON.stringify({ops:[]})}).then(async r=>({status:r.status,body:(await r.text()).slice(0,160)})).catch(e=>({threw:String(e&&e.message||e)}));const pendingOp=sn.ops.find(o=>o.status==='pending');const realOp=sn._raw?null:null;const clientsViaApi=await apiMod.api.clients().then(r=>Array.isArray(r)?r:(r?.clients||[])).catch(e=>({threw:String(e&&e.message||e)}));const match=Array.isArray(clientsViaApi)?clientsViaApi.filter(c=>c.name&&c.name.indexOf('Client hors connexion')===0):clientsViaApi;return {netProbe:probe,cursorProbe:probeOps,opsProbe,clientsViaApi:Array.isArray(clientsViaApi)?clientsViaApi.length:clientsViaApi,offlineClientsSeen:match,counts:sn.counts,ops:sn.ops.map(o=>({status:o.status,err:o.lastError,method:o.method,path:o.path}))};}).catch(x=>({evalError:String(x)}));throw new Error('La décision hors connexion n\'a pas été rejouée automatiquement au retour du réseau. outbox='+JSON.stringify(post)+'\n'+serverLog);}
    }finally{await dbClient.end().catch(()=>{})}
    // La vue clients, de retour en ligne, montre le client créé hors connexion (vérité serveur).
    await page.locator('.nav [data-view]').evaluateAll(nodes=>{nodes.find(n=>n.getAttribute('data-view')==='clients')?.click()});
    await page.waitForFunction(name=>document.querySelector('#client-grid')?.textContent?.includes(name),offlineClientName,{timeout:15000});
  }
  // Bruit console attendu, retiré après coup : le tableau de bord interroge /admin/me pour proposer le menu
  // admin ; un 403 pour un compte non administrateur est le contrat d'autorisation voulu (plugins/auth.ts),
  // géré par le front (S.isPlatformAdmin=false). Le navigateur journalise malgré tout l'échec réseau.
  const unexpectedErrors=errors.filter(text=>!/Failed to load resource.*403/.test(text)&&!/Failed to load resource.*(ERR_INTERNET_DISCONNECTED|net::)/.test(text));
  if(unexpectedErrors.length)throw new Error('Erreurs navigateur détectées:\n'+unexpectedErrors.join('\n'));
  console.log('Frontend Playwright OK: inscription, parcours d’accueil 8 étapes, navigation entre '+viewIds.length+' vues, déconnexion/reconnexion, PLUS scénario hors connexion complet (création conservée → rejeu automatique sans seconde confirmation, sans doublon); aucune erreur console.');
}finally{
  if(browser)await browser.close().catch(()=>{});
  app.kill('SIGTERM');
  await new Promise(resolve=>{if(app.exitCode!==null)return resolve();app.once('exit',resolve);const timer=setTimeout(()=>{if(app.exitCode===null)app.kill('SIGKILL');resolve()},3000);timer.unref()});
}
}
