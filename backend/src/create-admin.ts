import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { db, query } from './db.js';
import { hashPassword } from './services/passwords.js';

const rl=readline.createInterface({input,output});
try{
 const email=(process.argv[2]||'').trim().toLowerCase();
 if(!email)throw new Error('Adresse e-mail administrateur obligatoire en argument.');
 const password=process.argv[3]||await rl.question('Mot de passe (12+ caractères) : ');
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||password.length<12)throw new Error('E-mail ou mot de passe invalide.');
 const existing=(await query('select id from users where lower(email)=lower($1)',[email])).rows[0];
 if(existing){
   await query('insert into platform_admins(user_id) values($1) on conflict do nothing',[existing.id]);
   console.log(`Administrateur activé pour ${email}.`);
 }else{
   const userId=crypto.randomUUID(),orgId=crypto.randomUUID(),client=await db.connect();
   try{
     await client.query('begin');
     await client.query('insert into organizations(id,name,activity) values($1,$2,$3)',[orgId,'Administration Aurion','Administration']);
     await client.query('insert into users(id,email,password_hash,full_name) values($1,$2,$3,$4)',[userId,email,await hashPassword(password),'Administrateur Aurion']);
     await client.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')",[orgId,userId]);
     await client.query("insert into activities(organization_id,code,name,description,urssaf_rate,vat_rate) values($1,'admin','Administration Aurion','Compte administrateur',0,0)",[orgId]);
     await client.query('insert into platform_admins(user_id) values($1)',[userId]);
     await client.query('commit');
   }catch(e){await client.query('rollback');throw e}finally{client.release()}
   console.log(`Compte administrateur créé : ${email}`);
 }
}finally{await rl.close();await db.end()}
