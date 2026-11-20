import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { query } from "../db.js";
import { BACKEND_ROOT } from "../services/storage.js";

function readVersion(){
  try{return readFileSync(path.join(BACKEND_ROOT,"..","VERSION.txt"),"utf8").trim()}catch{return "unknown"}
}
const version=readVersion();

export async function healthRoutes(app:FastifyInstance){
  // /health : le processus répond (ne prouve PAS que la base est joignable)
  app.get("/health",async()=>({ok:true,service:"aurion-api",version}));
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
