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
try{
  await waitForApp();
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(apiUrl=>{window.AURION_API_URL=apiUrl;try{localStorage.setItem('aurion.biometric.choice','declined')}catch{}},baseUrl);
  const page=await context.newPage();
  page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text())});
  page.on('pageerror',error=>errors.push('pageerror: '+(error.stack||error.message)));
  page.on('dialog',dialog=>dialog.dismiss());
  let registrationResponse=null;
  const onboardingResponses=[];
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
  try{
    await page.locator('#company').waitFor({state:'visible',timeout:20000});
  }catch(error){
    const authError=await page.locator('#error').textContent().catch(()=> '');
    throw new Error('Le parcours d’inscription n’a pas ouvert la configuration entreprise. Erreur UI : '+authError+' ; réponse API : '+JSON.stringify(registrationResponse)+'\n'+serverLog+'\n'+error.message);
  }
  await page.locator('#name').fill('Aurion E2E Entreprise');
  await page.locator('#activity').fill('Maintenance et réparation');
  await page.locator('#company button[type=submit]').click();
  await page.locator('#detect-config').waitFor({state:'visible',timeout:20000});
  await page.locator('#detect-config').click();
  try{
    await page.locator('#finish-config').waitFor({state:'visible',timeout:20000});
  }catch(error){
    const diagnostics={responses:onboardingResponses,toasts:await page.locator('.toast').allTextContents().catch(()=>[]),status:await page.locator('#configuration-detection-status').textContent().catch(()=>''),questionnaire:await page.locator('#onboarding-slot').innerText().catch(()=> '')};
    throw new Error('La personnalisation n’a pas affiché son étape finale : '+JSON.stringify(diagnostics)+'\\n'+serverLog+'\\n'+error.message);
  }
  await page.locator('#finish-config').click();
  try{
    await page.locator('#sidebar').waitFor({state:'visible',timeout:20000});
  }catch(error){
    const diagnostics={url:page.url(),hash:await page.evaluate(()=>location.hash).catch(()=>''),body:await page.locator('#app').innerText().catch(()=>''),html:await page.locator('#app').evaluate(el=>el.innerHTML.slice(0,5000)).catch(()=>''),errors};
    throw new Error('Le tableau de bord ne s’est pas affiché après la configuration : '+JSON.stringify(diagnostics)+'\\n'+serverLog+'\\n'+error.message);
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
    throw new Error('Le formulaire de connexion n’a pas appelé /auth/login : '+JSON.stringify(diagnostics)+'\\n'+serverLog+'\\n'+error.message);
  }
  const loginBody=await loginResponse.text().catch(()=> '');
  if(!loginResponse.ok())throw new Error('Le serveur refuse la reconnexion (HTTP '+loginResponse.status()+') : '+loginBody+'\\n'+serverLog);
  try{
    await page.waitForFunction(()=>location.hash==='#/dashboard'||document.querySelector('#passkey-later'),null,{timeout:20000});
  }catch(error){
    const diagnostics={url:page.url(),hash:await page.evaluate(()=>location.hash).catch(()=>''),body:await page.locator('#app').innerText().catch(()=>''),errors};
    throw new Error('La réponse /auth/login est positive mais Aurion ne passe ni au tableau de bord ni à la proposition de clé d’accès : '+JSON.stringify(diagnostics)+'\\n'+serverLog+'\\n'+error.message);
  }
  if(await page.locator('#passkey-later').isVisible().catch(()=>false))await page.locator('#passkey-later').click();
  try{
    await page.locator('#sidebar').waitFor({state:'visible',timeout:20000});
  }catch(error){
    const diagnostics={url:page.url(),hash:await page.evaluate(()=>location.hash).catch(()=>''),body:await page.locator('#app').innerText().catch(()=>''),html:await page.locator('#app').evaluate(el=>el.innerHTML.slice(0,5000)).catch(()=>''),errors};
    throw new Error('La connexion n’a pas ouvert le tableau de bord après le choix éventuel de clé d’accès : '+JSON.stringify(diagnostics)+'\\n'+serverLog+'\\n'+error.message);
  }
  if(errors.length)throw new Error('Erreurs navigateur détectées:\n'+errors.join('\n'));
  console.log('Frontend Playwright OK: inscription immédiate, navigation entre '+viewIds.length+' vues, déconnexion et connexion; aucune erreur console.');
}finally{
  if(browser)await browser.close().catch(()=>{});
  app.kill('SIGTERM');
  await new Promise(resolve=>{if(app.exitCode!==null)return resolve();app.once('exit',resolve);const timer=setTimeout(()=>{if(app.exitCode===null)app.kill('SIGKILL');resolve()},3000);timer.unref()});
}
}
