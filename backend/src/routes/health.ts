import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { query, adminQuery } from "../db.js";
import { BACKEND_ROOT } from "../services/storage.js";
import { config } from "../config.js";

function readVersion(){
  try{return readFileSync(path.join(BACKEND_ROOT,"..","VERSION.txt"),"utf8").trim()}catch{return "unknown"}
}
const version=readVersion();

// 15.4.51 (PROMPT A6) — enrichissement du health applicatif : uptime, compteur de lettres
// mortes de l'outbox et horodatage de la dernière sauvegarde (journal backup-nightly).
// Aucune donnée personnelle : compteurs et horodatages uniquement. Chaque lecture est
// tolérante aux pannes — un enrichissement indisponible ne fait JAMAIS échouer /health.
function readLastBackup(): { lastBackupAt: string | null } {
  try{
    if(!config.AURION_BACKUP_LOG_PATH)return { lastBackupAt: null };
    const raw=JSON.parse(readFileSync(config.AURION_BACKUP_LOG_PATH,"utf8"));
    return { lastBackupAt: raw?.lastSuccessAt ?? raw?.lastAttemptAt ?? null };
  }catch{return { lastBackupAt: null }}
}
async function outboxDeadLettered(): Promise<number | null> {
  try{
    if(!config.AURION_ADMIN_DATABASE_URL)return null; // console inter-entreprises non configurée : pas de faux zéro
    const r=await adminQuery(`select count(*)::int as c from business_events_outbox where status='dead_lettered'`);
    return Number(r.rows?.[0]?.c ?? 0);
  }catch{return null}
}

export async function healthRoutes(app:FastifyInstance){
  // /health : le processus répond (ne prouve PAS que la base est joignable)
  app.get("/health",async()=>{
    const [dead]=await Promise.all([outboxDeadLettered()]);
    return {ok:true,service:"aurion-api",version,uptimeSeconds:Math.round(process.uptime()),outboxDeadLettered:dead,...readLastBackup()};
  });
  // /health/db : la base PostgreSQL répond réellement. C'est ce test que le lanceur attend.
  app.get("/health/db",async(_req,reply)=>{
    try{
      await query("select 1");
      return {ok:true,service:"aurion-api",version,database:"reachable"};
    }catch(e:any){
      // Never disclose driver errors, hostnames, role names, or connection details on a public health endpoint.
      app.log.warn({err:e}, 'Database health check failed');
      return reply.code(503).send({ok:false,database:"unreachable",error:"DATABASE_UNAVAILABLE"});
    }
  });
}
