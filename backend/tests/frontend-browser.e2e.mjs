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
if(!process.env.DATABASE_URL){
  throw new Error('AURION_BROWSER_E2E=1 exige DATABASE_URL vers une base PostgreSQL de test migrée.');
}
const require=createRequire(new URL('../package.json',import.meta.url));
let chromium,SMTPServer;
try{
  ({chromium}=require('playwright'));
  ({SMTPServer}=require('smtp-server'));
}catch(error){
  throw new Error('Playwright et smtp-server sont nécessaires. Installez Playwright dans backend avant le test navigateur. '+error.message);
}
const emailMessages=[];
const smtp=new SMTPServer({
  authOptional:true,
  disabledCommands:['STARTTLS'],
  onData(stream,_session,callback){
    let raw='';
    stream.on('data',chunk=>{raw+=chunk.toString('utf8')});
    stream.on('end',()=>{emailMessages.push(raw);callback(null,'Message accepté pour test E2E')});
  }
});
const listen=(server,port=0,host='127.0.0.1')=>new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(port,host,()=>{server.removeListener('error',reject);resolve(server.address().port)});
});
const freePort=async()=>{const server=net.createServer();const port=await listen(server);await new Promise(resolve=>server.close(resolve));return port};
const port=await freePort(),smtpPort=await listen(smtp);
const baseUrl=`http://127.0.0.1:${port}`;
const env={
  ...process.env,
  NODE_ENV:'test',
  HOST:'127.0.0.1',
  PORT:String(port),
  APP_BASE_URL:baseUrl,
  CORS_ORIGIN:baseUrl,
  COOKIE_SECURE:'false',
  PLATFORM_SMTP_HOST:'127.0.0.1',
  PLATFORM_SMTP_PORT:String(smtpPort),
  PLATFORM_SMTP_SECURITY:'none',
  PLATFORM_SMTP_USER:'',
  PLATFORM_SMTP_PASS:'',
  PLATFORM_SMTP_FROM:'no-reply@aurion.test'
};
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
async function waitForMail(){
  const end=Date.now()+15000;
  while(Date.now()<end){if(emailMessages.length)return emailMessages[emailMessages.length-1];await delay(100)}
  throw new Error('Aucun e-mail de vérification reçu par le SMTP de test.\n'+serverLog);
}
try{
  await waitForApp();
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{try{localStorage.setItem('aurion.biometric.choice','declined')}catch{}});
  const page=await context.newPage();
  page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text())});
  page.on('pageerror',error=>errors.push('pageerror: '+(error.stack||error.message)));
  page.on('dialog',dialog=>dialog.dismiss());

  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  await page.getByRole('link',{name:/Commencer/}).click();
  await page.locator('#auth').waitFor({state:'visible'});
  const email=`aurion-e2e-${Date.now()}@example.test`;
  const password='Aurion-Test-2026!xY';
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#terms input').check();
  await page.locator('#submit').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.toLowerCase().includes('vérification'));
  const rawEmail=await waitForMail();
  const decodedEmail=rawEmail.replace(/=\r?\n/g,'').replace(/=([a-f0-9]{2})/gi,(_match,hex)=>String.fromCharCode(parseInt(hex,16)));
  const match=decodedEmail.match(/https?:\/\/[^\s<>"']*#\/verify-email\?token=[A-Za-z0-9_-]+/);
  if(!match)throw new Error('Le message reçu ne contient pas de lien de vérification Aurion.\n'+decodedEmail.slice(0,2500));

  // Password authentication must fail until the e-mail link is confirmed.
  await page.locator('#login').click();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#submit').click();
  await page.getByText(/adresse e-mail n’est pas encore vérifiée/i).waitFor({timeout:10000});
  await page.locator('#resend-verification').waitFor({state:'visible'});

  await page.goto(match[0],{waitUntil:'domcontentloaded'});
  await page.locator('#verify-email-confirm').click();
  await page.getByText(/adresse e-mail confirmée/i).waitFor({timeout:10000});

  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  await page.getByRole('link',{name:'Se connecter'}).click();
  await page.locator('#auth').waitFor({state:'visible'});
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#submit').click();
  await page.locator('#sidebar').waitFor({state:'visible',timeout:20000});
  const viewIds=await page.locator('.nav [data-view]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.getAttribute('data-view')).filter(Boolean))]);
  if(!viewIds.length)throw new Error('Aucune vue de tableau de bord n’a été rendue dans la navigation.');
  for(const viewId of viewIds){
    await page.locator('.nav [data-view]').evaluateAll((nodes,id)=>nodes.find(node=>node.getAttribute('data-view')===id)?.click(),viewId);
    await page.waitForTimeout(300);
    if(!(await page.locator('#view').count()))throw new Error('Racine #view absente après la navigation vers '+viewId);
  }
  if(errors.length)throw new Error('Erreurs navigateur détectées:\n'+errors.join('\n'));
  console.log('Frontend Playwright OK: landing, inscription, refus avant vérification, confirmation e-mail, connexion et '+viewIds.length+' vues du tableau de bord; aucune erreur console.');
}finally{
  if(browser)await browser.close().catch(()=>{});
  app.kill('SIGTERM');
  await new Promise(resolve=>{if(app.exitCode!==null)return resolve();app.once('exit',resolve);const timer=setTimeout(()=>{if(app.exitCode===null)app.kill('SIGKILL');resolve()},3000);timer.unref()});
  await new Promise(resolve=>smtp.close(()=>resolve())).catch(()=>{});
}

}
