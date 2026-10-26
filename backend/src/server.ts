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
      const code = typeof e?.code === 'string' ? e.code : 'UNKNOWN';
      console.error(`[AURION] PostgreSQL injoignable (tentative ${i}/${max}, code=${code}).`);
      if(i===max)throw new Error('PostgreSQL injoignable. Vérifiez DATABASE_URL et la disponibilité de la base, sans afficher la chaîne de connexion.');
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
  const code = typeof e?.code === 'string' ? e.code : 'STARTUP_FAILED';
  console.error(`[AURION] Demarrage impossible (code=${code}). Vérifiez la configuration et les journaux du serveur.`);
  process.exit(1);
}
