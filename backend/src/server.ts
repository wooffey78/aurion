import {buildApp} from './app.js';
import {config} from './config.js';
import {query,db} from './db.js';
import {startReminderWorker} from './services/scheduler.js';
import {ensureLegalDocuments} from './services/account.js';

async function waitForDatabase(){
  const max=20;
  for(let i=1;i<=max;i++){
    try{await query('select 1');console.log('[AURION] PostgreSQL joignable.');return}
    catch(e:any){
      console.error(`[AURION] PostgreSQL injoignable (tentative ${i}/${max}) : ${e?.message||e}`);
      if(i===max)throw new Error('PostgreSQL injoignable. Verifiez DATABASE_URL dans backend/.env et que le service PostgreSQL est demarre.');
      await new Promise(r=>setTimeout(r,1500));
    }
  }
}

try{
  await waitForDatabase();
  await ensureLegalDocuments().catch(e=>console.error('[AURION] documents légaux non initialisés :',e?.message||e));
  const app=await buildApp();
  await app.listen({host:config.HOST,port:config.PORT});
  startReminderWorker(app.log);
  const stop=async()=>{try{await app.close();await db.end()}finally{process.exit(0)}};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}catch(e:any){
  console.error('[AURION] Demarrage impossible :',e?.message||e);
  process.exit(1);
}
